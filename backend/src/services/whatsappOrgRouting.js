// Which WhatsApp Business number an outbound message goes out from.
//
// ── The rule ─────────────────────────────────────────────────────────────────
//
// A donor's message leaves from THEIR organisation's configured number:
// MANN from MANN's number, AFLF from AFLF's, BSCT from BSCT's. Never from
// another NGO's number, never from a default, never from an unconfigured one.
//
// ── Why this module had to exist ────────────────────────────────────────────
//
// Every outbound path resolved its Meta credentials independently, and every
// one of them ended in a hardcoded 'bsct':
//
//   sendFroReply         froWhatsAppService.js:260  project = project || 'bsct'
//   sendDirectMessage    froWhatsAppService.js:546  projectOverride || project || 'bsct'
//   account lookup       froWhatsAppService.js:267  account?.access_token || config.accessToken
//   webhook routing      whatsappWebhookController.js:359  contact.project || 'bsct'
//
// So a MANN donor with no `conversations.project` set -- which is the normal
// state for a thread an agent opened from the donor list, because
// findOrCreateConversation stored NULL whenever contact.project was NULL -- was
// silently messaged from the Being Sevak number. The donor sees a BSCT message
// about a MANN donation, replies to it, and the reply lands in a BSCT thread
// against the wrong organisation's records.
//
// ── Why the fallback rows are gone, not just reordered ───────────────────────
//
// 'bsct' was never a neutral default. whatsapp_accounts.project is UNIQUE and
// `bsct` names the Being Sevak business number with its own Meta credentials, so
// falling through to it is not "send with no account" -- it is "send from
// another NGO's number", which is the specific outcome that must not happen. A
// donor whose organisation cannot be resolved is therefore REFUSED with a
// message naming the cause, and nothing is sent.
//
// ── Why `projectCodeFromNgoId` and not a new alias table ──────────────────────
//
// The CRM already has one authoritative NGO -> project mapping, and three call
// sites depend on it for receipt numbering: models/bankAuditModel.js.
// projectCodeFromNgoId() resolves through fro_assignments.ngo_id -> ngos.name,
// which is the per-lead truth (donor_profiles.project_supported is frequently
// unset or stale -- the exact defect that once gave Ashray money the next BSCT
// receipt number). Reusing it is what keeps the WhatsApp number and the receipt
// sequence in agreement; a second alias table here would be free to drift.

import db from '../config/db.js';
import { canonicalProject, projectCodeFromNgoId } from '../models/bankAuditModel.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';
import { phoneVariantsFor } from './whatsappScope.js';

// A send that cannot be attributed to an organisation. Carries the HTTP status
// so controllers can surface it verbatim instead of flattening it to a 500 with
// "Meta API error" -- which is what made this invisible from the inbox.
export class OrgRoutingError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'OrgRoutingError';
    this.status = status;
  }
}

// ── Pure helpers (exported for tests) ───────────────────────────────────

/**
 * Does this stored project value name an organisation we can route through?
 *
 * Rejects the three values that would otherwise slip past as "some project":
 * the empty string, the literal 'unknown' the webhook writes when a
 * `phone_number_id` matches no configured account, and 'null'/'undefined' as
 * strings from a CSV import. All three previously reached
 * getAccountByProject() and produced "no active account configured" -- an error
 * that blamed configuration when the real fault was an unresolvable donor.
 */
export function isRoutableProject(project) {
  if (project == null) return false;
  const p = String(project).trim().toLowerCase();
  if (!p) return false;
  if (p === 'unknown' || p === 'null' || p === 'undefined') return false;
  return true;
}

/** Digits-only, tolerant of the stored spellings on both sides. */
export function phoneKeys(phone) {
  return [...phoneVariantsFor([phone])];
}

// ── Donor -> organisation ───────────────────────────────────────────────

/**
 * The canonical project code for a donor, from the assignment's NGO.
 *
 * Returns { project, source, candidates }. `candidates` is non-empty when more
 * than one active assignment disagrees, which the caller must treat as
 * ambiguous rather than picking one.
 *
 * `contacts` lookup is deliberately NOT consulted here -- it is the weakest
 * signal (the webhook writes it from whichever number happened to receive the
 * message) and mixing it in here would make the donor and the contact paths
 * disagree about the same person.
 */
export async function resolveDonorProject(phone, { preferDonorIds = null } = {}) {
  const keys = phoneKeys(phone);
  if (keys.length === 0) {
    return { project: null, source: 'no-phone', candidates: [] };
  }

  // donor_profiles.mobile_number is hand-authored off imported spreadsheets, so
  // it carries the 10-digit, 91+10 and punctuated spellings. contacts is
  // digits-only. Both are queried through the same expanded key set.
  const { data: donors, error: donorErr } = await db
    .from('donor_profiles')
    .select('id, name, mobile_number, project_supported')
    .in('mobile_number', keys);
  if (donorErr) {
    if (donorErr.code === '42P01' || /does not exist/.test(donorErr.message || '')) {
      return { project: null, source: 'no-donor', candidates: [] };
    }
    throw donorErr;
  }

  let list = donors || [];
  if (list.length === 0) {
    return { project: null, source: 'no-donor', candidates: [] };
  }

  // ── Why the caller's own allotment narrows this ─────────────────────────
  //
  // A household number, a shared business line and the placeholder
  // '9999999999' are each carried by SEVERAL donor_profiles rows -- and in
  // live data those rows are assigned to different NGOs. Resolved from the
  // phone alone, five of one agent's 27 donors are therefore genuinely
  // ambiguous and would be blocked for everyone.
  //
  // But the caller's allotment already answers the question the CRM asks
  // everywhere else: WHO AM I WORKING. Of the donors behind this number, the
  // ones in the caller's fro_assignments are the ones this message is about,
  // so narrowing to those is using the existing assignment logic, not inventing
  // a rule. A number whose remaining candidates still disagree stays
  // ambiguous and is still blocked -- the guard is narrowed, never removed.
  if (Array.isArray(preferDonorIds) && preferDonorIds.length > 0) {
    const mine = new Set(preferDonorIds.map(String));
    const narrowed = list.filter(d => mine.has(String(d.id)));
    if (narrowed.length > 0) list = narrowed;
    // If NONE of the matching donors is the caller's, the number is not theirs
    // at all -- assertPhoneAllotted / assertConversationAccess has already
    // refused the send, so the org is moot. Keep the full set rather than
    // reporting a false "unmapped".
  }

  const candidates = [];
  const sources = [];
  for (const donor of list) {
    // The authoritative field, in the CRM's own order of preference.
    const { data: assignments } = await db
      .from('fro_assignments')
      .select('ngo_id, status')
      .eq('donor_id', donor.id)
      .not('status', 'eq', 'reassigned');

    for (const a of assignments || []) {
      let code = null;
      try {
        code = await projectCodeFromNgoId(a.ngo_id);
      } catch (err) {
        console.error('[orgRouting] ngo project lookup failed:', err.message);
      }
      if (isRoutableProject(code)) {
        candidates.push(canonicalProject(code));
        sources.push('assignment-ngo');
      }
    }

    // Fallback the CRM already uses everywhere else (accountsController.js:342).
    // Only consulted when the donor has NO active assignment naming an NGO,
    // because project_supported is documented as often unset or stale.
    if ((assignments || []).length === 0 && isRoutableProject(donor.project_supported)) {
      candidates.push(canonicalProject(donor.project_supported));
      sources.push('project-supported');
    }
  }

  const unique = [...new Set(candidates.filter(isRoutableProject))];
  if (unique.length === 0) {
    return { project: null, source: 'unmapped', candidates: [] };
  }
  if (unique.length > 1) {
    return { project: null, source: 'ambiguous', candidates: unique };
  }
  return { project: unique[0], source: sources[0] || 'unknown', candidates: unique };
}

// ── Account selection ───────────────────────────────────────────────────

/**
 * The active whatsapp_accounts row for a project, or a refusal.
 *
 * No default, no fallback, no substitution. The caller already decided the
 * donor's organisation; this only asks whether that organisation has a usable
 * number configured, and says which one is missing when it does not.
 */
export async function requireAccountForProject(project) {
  if (!isRoutableProject(project)) {
    throw new OrgRoutingError(
      'This donor has no recognisable organisation on file, so no WhatsApp number '
      + 'can be selected for them. Set the donor\'s project, or have an admin configure '
      + 'the WhatsApp account, and try again.',
      422,
    );
  }

  const code = canonicalProject(project);
  let account = null;
  try {
    account = await getAccountByProject(code);
  } catch (err) {
    throw new OrgRoutingError(
      `Could not read the WhatsApp account for "${code}": ${err.message}`,
      500,
    );
  }

  if (!account) {
    // `project` is UNIQUE in whatsapp_accounts, so this is a missing
    // configuration rather than an ambiguous one -- and the fix is an admin
    // action, not a guess. Saying so is the whole point: the previous message
    // was "Meta API error" on the bubble and "no active account configured" in
    // the log, which named neither the donor nor the number.
    throw new OrgRoutingError(
      `No active WhatsApp Business number is configured for "${code.toUpperCase()}". `
      + `An admin must add it under Accounts > WhatsApp before donors of this project can be messaged. `
      + `The message was not sent, and it was NOT sent from another organisation's number.`,
      422,
    );
  }

  // Step 4 of the routing requirement: verify the selected account really is
  // this organisation's before anything is sent from it. getAccountByProject
  // filters on `project`, so a mismatch can only mean the lookup returned
  // something unexpected -- which must never be dialled.
  if (canonicalProject(account.project) !== code) {
    throw new OrgRoutingError(
      `WhatsApp account mismatch: expected the "${code}" number but resolved "${account.project}". `
      + 'The message was not sent.',
      500,
    );
  }

  if (!account.access_token || !account.phone_number_id) {
    throw new OrgRoutingError(
      `The WhatsApp Business number for "${code.toUpperCase()}" is missing its Meta credentials. `
      + `An admin must complete it under Accounts > WhatsApp. The message was not sent.`,
      422,
    );
  }

  return { account, project: code };
}

/**
 * Pick the account for an outbound message, given who it is going to.
 *
 * Order of decision:
 *
 *   1. The thread's own `project`, when it still resolves to a configured
 *      account. An inbound that arrived on the MANN number creates its thread
 *      with project='mann'; continuing from that number is what makes Meta route
 *      the donor's REPLY back into the same thread. Changing the number
 *      mid-thread would break the reply chain.
 *   2. Otherwise the donor's organisation (resolveDonorProject).
 *   3. Otherwise a refusal. Never a default.
 *
 * A thread whose `project` is set but UNCONFIGURED is refused rather than
 * re-derived, because silently rerouting an existing thread to a different
 * number is worse than telling the sender the account is missing.
 */
export async function resolveOutboundAccount({ conversation = null, contact = null, phone = null, requestedProject = null, preferDonorIds = null } = {}) {
  const threadProject = conversation?.project;

  if (isRoutableProject(threadProject)) {
    return { ...(await requireAccountForProject(threadProject)), source: 'conversation-project' };
  }

  const donor = await resolveDonorProject(
    phone || contact?.phone_normalized || contact?.phone || null,
    { preferDonorIds },
  );

  if (donor.source === 'ambiguous') {
    throw new OrgRoutingError(
      `This donor is allotted to more than one organisation (${donor.candidates.map(c => c.toUpperCase()).join(', ')}), `
      + 'so the WhatsApp number to use is ambiguous. An admin must correct the donor\'s assignment first. '
      + 'The message was not sent.',
      422,
    );
  }

  // `requestedProject` is the project the caller already validated against the
  // caller's own account grants (whatsappScope.assertProjectAllowed). It is
  // only allowed to decide when the donor themselves says nothing -- it never
  // overrides a resolved donor organisation.
  const resolved = donor.project || (isRoutableProject(requestedProject) ? canonicalProject(requestedProject) : null);

  if (!resolved) {
    throw new OrgRoutingError(
      'No organisation could be determined for this number, so no WhatsApp Business number '
      + 'was selected. The message was NOT sent from another organisation\'s number. '
      + 'Ask an admin to set the donor\'s project or assignment.',
      422,
    );
  }

  const account = await requireAccountForProject(resolved);
  return { ...account, source: donor.project ? donor.source : 'requested-project' };
}
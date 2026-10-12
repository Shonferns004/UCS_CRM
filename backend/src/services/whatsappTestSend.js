// The controlled WhatsApp send test.
//
// ── Scope, and why it is so narrow ──────────────────────────────────────────
//
// One recipient, one caller class, two verbs. Everything else about normal
// sending is unchanged: this file does not weaken resolveOutboundAccount, it
// never touches the donor allotment, and it cannot be reached by a non-admin.
//
// The three properties that make it safe, each of which is a separate gate
// rather than a flag on a general-purpose endpoint:
//
//   1. RECIPIENT. Only the numbers in ALLOWED_TEST_RECIPIENTS, matched on
//      digits. Any other number is refused before a Meta request is built, so
//      this can never become a general-purpose send with an allow-list bolted
//      on the front -- the list IS the feature.
//   2. NO DONOR ASSOCIATION. resolveDonorProject() is deliberately NOT used.
//      A test number that happens to exist in donor_profiles would otherwise be
//      routed by that donor's organisation and would create a conversation
//      indistinguishable from a real one. The caller names the project instead,
//      and if the number already matches a real donor the preview says so and
//      the send refuses.
//   3. NO AUTOMATION. Nothing here schedules, retries or broadcasts. One call,
//      one message. There is no loop and no recipient list to loop over.
//
// ── Why the send needs an explicit confirmation token ───────────────────────
//
// The preview verb exists so the operator can read back WHICH business number
// will send, under WHICH organisation's name, with WHICH credentials, BEFORE
// anything leaves. `confirm: true` is the acknowledgement of that read-back; it
// is not a safety mechanism on its own, which is why the two verbs are separate
// routes rather than a `dryRun` boolean.

import db from '../config/db.js';
import config from '../config/whatsappConfig.js';
import { requireAccountForProject } from './whatsappOrgRouting.js';
import { normalizeDonorPhone, phoneVariantsFor } from './whatsappScope.js';

// The single authorised test recipient. Stored in digits-only form; the
// comparison below expands whatever spelling the caller sends.
const ALLOWED_TEST_RECIPIENTS = ['917054996353'];

// How long the CRM considers a test thread live. Long enough to read a reply,
// short enough that it cannot be mistaken for a donor relationship a month
// later. Not enforced by a cron -- the webhook does not read it -- it exists so
// the thread is auditable and so a later reader can tell what it was.
const TEST_THREAD_LABEL = 'whatsapp-test';

export class TestSendError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'TestSendError';
    this.status = status;
  }
}

/**
 * Digits for the allow-list comparison. Pure, exported for tests.
 *
 * Accepts a string or a finite number -- a JSON body may legitimately carry the
 * recipient as a number, and rejecting that would be a confusing failure rather
 * than a safety property. Everything else (arrays, objects, booleans, NaN,
 * Infinity) is refused BEFORE normalisation, because `String(['7054996353'])`
 * is the allowed number and coercing it would mean the comparison is running on
 * a value the caller did not actually name.
 */
export function testRecipientKeys(phone) {
  const type = typeof phone;
  if (type !== 'string' && type !== 'number') return [];
  if (type === 'number' && !Number.isFinite(phone)) return [];
  return [...phoneVariantsFor([normalizeDonorPhone(phone)])];
}

/** Is this number one of the authorised test recipients? Pure, exported. */
export function isAllowedTestRecipient(phone) {
  const keys = testRecipientKeys(phone);
  return keys.some(k => ALLOWED_TEST_RECIPIENTS.includes(k));
}

/**
 * Refuse anything that is not the authorised test number.
 *
 * Deliberately fails CLOSED on a missing recipient too: `undefined` normalises
 * to '' which matches nothing, so a body that forgot the field is a refusal and
 * not an accidental send to the CRM's default.
 */
export function assertTestRecipient(phone) {
  if (!isAllowedTestRecipient(phone)) {
    throw new TestSendError(
      'This test endpoint may only send to the authorised test recipient. '
      + 'No message was sent.',
      403,
    );
  }
  return normalizeDonorPhone(phone);
}

/**
 * Does this number belong to a real donor?
 *
 * Reported by the preview and refused by the send. The requirement is that the
 * test number is not associated with any NGO or donor record; if one day the
 * test number IS a donor's number, that has to be surfaced rather than quietly
 * producing a conversation that the org-routing rules will then treat as real.
 */
export async function findMatchingDonor(phone) {
  const keys = [...phoneVariantsFor([normalizeDonorPhone(phone ?? '')])];
  if (keys.length === 0) return null;
  const { data, error } = await db
    .from('donor_profiles')
    .select('id, name, mobile_number, project_supported')
    .in('mobile_number', keys)
    .limit(1);
  if (error) {
    if (error.code === '42P01' || /does not exist/.test(error.message || '')) return null;
    throw error;
  }
  return (data || [])[0] || null;
}

/** APPROVED templates on this account's own WABA, straight from Meta. */
async function liveApprovedTemplates(account) {
  if (!account.waba_id || !account.access_token) return [];
  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${account.waba_id}`
      + '/message_templates?fields=name,language,status',
      { headers: { Authorization: `Bearer ${account.access_token}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data || [])
      .filter(t => String(t.status || '').toUpperCase() === 'APPROVED')
      .map(t => ({ name: t.name, language: t.language, status: t.status }));
  } catch (err) {
    console.error('[testSend] template lookup failed:', err.message);
    return [];
  }
}

/**
 * Everything the operator needs to read back before approving a send, and
 * nothing that sends.
 *
 * The point of this verb is that `from_number` is the number Meta will actually
 * dial, and `organisation` is the name it will appear under on the recipient's
 * phone. Those must be confirmed by a human, which is why the send is a
 * separate request.
 */
export async function previewTestSend({ project, phone, kind = 'text' }) {
  const recipient = assertTestRecipient(phone);

  const donor = await findMatchingDonor(recipient);

  // The account comes from the project the caller NAMED, never from the donor
  // record and never from a default. requireAccountForProject refuses a project
  // with no configured account rather than substituting one.
  const { account, project: resolvedProject } = await requireAccountForProject(project);

  const templates = kind === 'template' ? await liveApprovedTemplates(account) : [];

  // The visible number, not the internal phone_number_id. This is what the
  // donor actually sees as the sender, so it is what has to be confirmed.
  let displayNumber = null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${account.phone_number_id}`,
      { headers: { Authorization: `Bearer ${account.access_token}` } },
    );
    if (res.ok) {
      const data = await res.json();
      displayNumber = data?.display_phone_number || data?.verified_name || null;
    }
  } catch (err) {
    console.error('[testSend] number lookup failed:', err.message);
  }

  return {
    // The read-back an operator must be satisfied with.
    organisation: resolvedProject.toUpperCase(),
    account_name: account.name,
    from_number_id: account.phone_number_id,
    from_number: displayNumber,
    waba_id: account.waba_id,

    recipient,
    recipient_is_real_donor: Boolean(donor),
    // A real donor match is a refusal for the SEND, so surface it up front.
    matched_donor: donor ? { name: donor.name, project_supported: donor.project_supported } : null,

    kind,
    approved_templates: templates,

    // Meta's rules, stated rather than assumed. A free-text message is only
    // accepted inside the 24h customer-service window; outside it the send must
    // be an APPROVED template. There is no API to query "is the window open",
    // because it depends on the last inbound from THIS recipient, so this is
    // the honest statement of the constraint rather than a fabricated answer.
    rules: {
      free_text_requires: 'a customer-service window opened by an inbound message from this number within the last 24 hours',
      outside_window: 'the send must use an APPROVED template for this number',
      broadcast: 'not supported here; this endpoint sends one message to one recipient',
    },

    // Never silently proceeds. The caller must have read the above.
    will_send: false,
  };
}

/**
 * Send the single test message.
 *
 * `confirmed` is the operator's acknowledgement of the preview above. It is
 * refused rather than defaulted: a default of `true` would make the gate
 * meaningless.
 */
export async function sendTestMessage({ project, phone, text, templateName, templateLanguage, parameters }) {
  const recipient = assertTestRecipient(phone);

  if (!text && !templateName) {
    throw new TestSendError('Either message text or an approved templateName is required.');
  }

  const donor = await findMatchingDonor(recipient);
  if (donor) {
    throw new TestSendError(
      `The test number matches a real donor record (${donor.name}). Refusing to send, so the test `
      + 'cannot be associated with an NGO or a donor. Choose a different test number.',
      409,
    );
  }

  const { account, project: resolvedProject } = await requireAccountForProject(project);

  const body = templateName
    ? {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage || account.template_language || 'en' },
        ...(Array.isArray(parameters) && parameters.length
          ? { components: [{ type: 'body', parameters: parameters.map(p => ({ type: 'text', text: String(p) })) }] }
          : {}),
      },
    }
    : { messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body: text } };

  const res = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${account.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.messages?.[0]?.id) {
    // Meta's own error text, verbatim. It names the code (e.g. 131049 for a
    // message outside the service window, 132000 for a template parameter
    // count mismatch), and paraphrasing it is what made these impossible to
    // diagnose from the panel.
    const err = data?.error;
    throw new TestSendError(
      `Meta rejected the message${err?.code ? ` (${err.code})` : ''}: `
      + `${err?.message || `HTTP ${res.status}`}. Sent from ${resolvedProject.toUpperCase()} `
      + `(${account.name}).`,
      502,
    );
  }

  // Recorded as a conversation so an inbound REPLY has somewhere to land --
  // that is the receive half of the test. Deliberately flagged, and never
  // assigned to the testing agent, so it does not enter anyone's donor queue.
  const stored = await recordTestThread({ recipient, project: resolvedProject, account }).catch(err => {
    console.error('[testSend] could not record the test thread:', err.message);
    return null;
  });

  if (stored?.conversationId) {
    await db
      .from('messages')
      .insert({
        conversation_id: stored.conversationId,
        contact_id: stored.contactId,
        user_id: 'whatsapp-test',
        direction: 'outbound',
        message_type: templateName ? 'template' : 'text',
        body_text: text || `[template:${templateName}]`,
        template_id: templateName || null,
        template_params: Array.isArray(parameters) && parameters.length ? { parameters } : null,
        wa_message_id: data.messages[0].id,
        status: 'sent',
        status_updated_at: new Date().toISOString(),
        message_category: TEST_THREAD_LABEL,
        is_automated: false,
      })
      .then(() => null)
      .catch(err => console.error('[testSend] could not record the test message:', err.message));
  }

  return {
    sent: true,
    wa_message_id: data.messages[0].id,
    organisation: resolvedProject.toUpperCase(),
    account_name: account.name,
    from_number_id: account.phone_number_id,
    recipient,
    conversation_id: stored?.conversationId || null,
  };
}

/**
 * A conversation for the test recipient, so the reply can be verified.
 *
 * Uses the same contacts/conversations tables the real inbox uses -- no shadow
 * schema, as required. The distinguishing marks are `message_category =
 * 'whatsapp-test'` on the outbound row and an unassigned conversation, so it
 * never shows up as somebody's donor and never claims an agent.
 */
async function recordTestThread({ recipient, project, account }) {
  const { data: contactRows } = await db
    .from('contacts')
    .select('*')
    .eq('phone_normalized', recipient)
    .limit(1);
  let contact = (contactRows || [])[0];

  if (!contact) {
    const { data, error } = await db
      .from('contacts')
      .insert({
        phone: recipient,
        phone_normalized: recipient,
        source: TEST_THREAD_LABEL,
        project,
      })
      .select()
      .single();
    if (error) throw error;
    contact = data;
  }

  const { data: convRows } = await db
    .from('conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('project', project)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false })
    .limit(1);
  if ((convRows || [])[0]) return { conversationId: convRows[0].id, contactId: contact.id };

  const { data: created, error: convErr } = await db
    .from('conversations')
    .insert({
      contact_id: contact.id,
      status: 'open',
      project,
      last_message_at: new Date().toISOString(),
      // Intentionally NOT assigned. A test thread must not enter any agent's
      // donor queue, and must not be claimed by whoever happens to reply first.
      assigned_agent_id: null,
      whatsapp_account_id: account?.id ?? null,
    })
    .select('id')
    .single();
  if (convErr) throw convErr;

  return { conversationId: created.id, contactId: contact.id };
}
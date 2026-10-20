// Who may see and message which donor.
//
// The rule this module enforces, and the reason it exists:
//
//   An agent may see and message the donors ALLOTTED to them, and nothing else.
//   The WhatsApp admin sees everything.
//
// "Allotted" means exactly what it means everywhere else in this CRM -- an
// `fro_assignments` row for that FRO. The join chain is the one the FRO panel's
// own donor list already uses (getFroConversations, froWhatsAppService.js):
//
//   fro_assignments.fro_worker_id  ->  donor_profiles.mobile_number
//                                   ->  contacts.phone_normalized
//                                   ->  conversations.contact_id
//
// Before this module, no per-conversation endpoint consulted any of that.
// `getAgentConversations` scoped by WhatsApp NUMBER (project) and by
// `conversations.assigned_agent_id`, so every agent holding the same number saw
// every other agent's unclaimed thread, and every `:id` route took the caller's
// conversation id verbatim with no ownership check at all.
//
// ── Why identity resolution is not a one-liner ───────────────────────────
//
// Three different tokens reach these routes, and `req.user.id` means something
// different in each:
//
//   1. FRO CRM login          id = workers.id          (authController.js:176)
//   2. Agent CRM login        id = workers.id          (the FRO the agent covers)
//                             agent_user_id = crm_agents.id
//   3. WhatsApp auto-login    id = crm_agents.id  OR   workers.id, depending on
//                             which branch minted it (froWhatsAppAuthController.js:37,95)
//
// `fro_assignments.fro_worker_id` is a workers.id, so resolving case 3 by its `id`
// alone silently scoped the agent to zero donors. auto-login now stamps
// `worker_id` into the token it mints, and that claim is authoritative; the
// crm_agents probe below is the fallback for tokens minted before that.
//
// ── Why the admin is a flag and not a role ─────────────────────────────────
//
// An agent login is issued role 'fro', indistinguishable from a real FRO login,
// so no role check can separate "agent 1 who administers WhatsApp" from "any
// FRO". `crm_agents.whatsapp_admin` is already the live-checked flag for the
// admin surface (authMiddleware.requireWhatsAppAdmin); the inbox previously
// ignored it entirely and used a hardcoded role list instead, which meant the
// real WhatsApp admin got agent-level visibility while any broadly-privileged
// CRM role got inbox-wide visibility. Both now read this one function.

import db from '../config/db.js';
import { normalizeRole } from '../middleware/authMiddleware.js';

// Staff roles that already had the wide view before this module existed. Kept as
// one exported set so the inbox and the admin routes cannot drift apart again.
const WA_STAFF_ROLES = new Set(['master', 'super_admin', 'accounts', 'admin']);

// Raised when a caller reaches for a donor that is not theirs. Carries the HTTP
// status so controllers can `next(err)` / rethrow without unwrapping it.
export class ScopeError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'ScopeError';
    this.status = status;
  }
}

// ── Pure helpers (exported for tests) ───────────────────────────────────

/**
 * Every stored spelling of a phone number.
 *
 * donors.mobile_number is authored by hand off imported spreadsheets, so it
 * arrives as 10 digits, as 91+10, and with separators. The webhook only ever
 * writes digit-only `contacts.phone_normalized`. Matching therefore has to
 * expand both sides, which is what these two functions are for.
 */
export function phoneVariantsFor(donorPhones) {
  const out = new Set();
  for (const p of donorPhones || []) {
    if (p == null || p === '') continue;
    const raw = String(p).replace(/[^0-9]/g, '');
    if (!raw) continue;
    out.add(raw);
    if (raw.startsWith('91') && raw.length === 12) {
      out.add(raw.slice(2));
    } else if (raw.length === 10) {
      out.add('91' + raw);
    }
  }
  return out;
}

/** Digits-only, 91-prefixed where the length allows it. Same rule as the service. */
export function normalizeDonorPhone(phone) {
  const raw = String(phone ?? '').replace(/[^0-9]/g, '');
  if (raw.length === 10) return '91' + raw;
  if (raw.length === 12 && raw.startsWith('91')) return raw;
  return raw;
}

/**
 * The ownership predicate for one conversation, as a PostgREST `.or()` string.
 *
 * Split out pure so the two clauses that carry the whole privacy guarantee are
 * pinned by tests rather than by the next refactor:
 *
 *   - the contact must be one of MY allotted donors, and
 *   - the thread must not already belong to somebody else.
 *
 * The second clause is why a donor being mine is not enough. Two agents can be
 * allotted the same station during a handover, so my donor pool can overlap
 * another agent's; the thread owner decides who actually reads and replies.
 * Unassigned threads in my pool are visible to me, and claiming one is a normal
 * send.
 *
 * Returns null when the caller should see everything.
 */
export function conversationOwnershipOr(contactIds, callerUserId) {
  if (!Array.isArray(contactIds) || contactIds.length === 0) return '1=0';
  const mine = contactIds.map(id => `contact_id.eq.${id}`).join(',');
  const owner = String(callerUserId ?? '').trim();
  const free = owner
    ? `and(${mine},or(assigned_agent_id.eq.${owner},assigned_agent_id.is.null))`
    : `and(${mine},assigned_agent_id.is.null)`;
  return free;
}

/** Is this thread the caller's, given the contact and owner columns? */
export function isConversationOwnedBy({ contactId, assignedAgentId }, contactIds, callerUserId) {
  if (!Array.isArray(contactIds) || !contactIds.includes(contactId)) return false;
  const owner = assignedAgentId == null || assignedAgentId === '' ? null : String(assignedAgentId);
  if (owner == null) return true;
  return owner === String(callerUserId ?? '');
}

// ── Identity ────────────────────────────────────────────────────────────

/**
 * Resolve the canonical WhatsApp caller from any of the three token shapes.
 *
 * Always returns an object; `workerId` is null only when the token carries no
 * usable id at all, which every caller treats as "no donors".
 */
export async function resolveWaCaller(req) {
  const user = req?.user || {};
  const role = normalizeRole(user.role) || '';
  const tokenId = user.id == null || user.id === '' ? null : user.id;

  if (WA_STAFF_ROLES.has(role)) {
    return {
      role,
      userId: tokenId,
      workerId: tokenId,
      agentId: null,
      isWaAdmin: true,
      projects: null,
      viaStaffRole: true,
    };
  }

  const agentRow = await loadAgentRow(user);

  // worker_id is stamped by auto-login and is the whole point of stamping it: it
  // removes the need to guess which id domain `id` came from. The probe covers
  // tokens minted before the stamp existed.
  //
  // There is deliberately NO branch here that resolves to null. An agent token
  // with neither claim yields an empty allotment, and every donor is then
  // refused with "this number is not allotted to you" -- a message that blames
  // the caller's data when the real fault is an identity this function failed to
  // recover. Falling back to tokenId keeps such a session scoped to whatever it
  // actually maps to (correct for a FRO login, wrong-but-visible for a
  // degenerate agent token) and logs it, rather than locking the account out in
  // silence.
  let workerId = user.worker_id || agentRow?.worker_id || tokenId;
  if (!workerId) {
    console.warn(
      '[whatsappScope] no usable identity on the WhatsApp session; '
      + `role=${role} claims=${Object.keys(user).join(',') || 'none'}`,
    );
  }

  const agentId = user.agent_user_id || agentRow?.id || null;

  return {
    role,
    userId: agentId || tokenId,
    workerId: workerId == null ? null : workerId,
    agentId,
    isWaAdmin: Boolean(agentRow?.is_active && agentRow?.whatsapp_admin),
    // Projects are resolved lazily by callerProjects(); an admin's is null, which
    // every consumer reads as "unbounded".
    projects: null,
    viaStaffRole: false,
  };
}

async function loadAgentRow(user) {
  const { data, error } = await db
    .from('crm_agents')
    .select('id, worker_id, is_active, whatsapp_admin')
    .eq('id', user.agent_user_id || user.id)
    .maybeSingle();
  if (error) {
    // A crm_agents miss is the normal case for a plain FRO login, not a fault.
    // Anything else (missing table, bad connection) leaves the caller
    // unscoped-but-not-admin, which fails closed on every later check.
    if (error.code !== 'PGRST116' && !/does not exist/.test(error.message || '')) {
      console.error('[whatsappScope] crm_agents lookup failed:', error.message);
    }
    return null;
  }
  return data || null;
}

// ── Allotment ───────────────────────────────────────────────────────────

/**
 * The donors allotted to a worker, resolved to the contacts they match.
 *
 * `restrictPairs` is the work-as station scope: a list of `{ngo_id, station}`.
 * It is applied here for the same reason it is applied in getFroConversations
 * -- an operator covering a FRO may only work the stations their token claims.
 */
export async function loadAllotment(workerId, restrictPairs = null) {
  const empty = { donorIds: [], contactIds: [], phoneVariants: new Set() };
  if (!workerId) return empty;

  const { data: assignments, error } = await db
    .from('fro_assignments')
    .select('donor_id, ngo_id, station, donor_profiles!inner(mobile_number)')
    .eq('fro_worker_id', workerId)
    .or('status.is.null,status.neq.reassigned');

  if (error) {
    if (error.code === '42P01' || /does not exist/.test(error.message || '')) return empty;
    throw error;
  }

  let scoped = assignments || [];
  if (Array.isArray(restrictPairs) && restrictPairs.length > 0) {
    const allowed = new Set(restrictPairs.map(p => `${p?.ngo_id ?? ''}|${String(p?.station ?? '').trim()}`));
    scoped = scoped.filter(a => allowed.has(`${a.ngo_id ?? ''}|${String(a.station ?? '').trim()}`));
  }
  if (scoped.length === 0) return empty;

  const phoneVariants = phoneVariantsFor(scoped.map(a => a.donor_profiles?.mobile_number));
  if (phoneVariants.size === 0) return empty;

  const { data: contacts, error: contactErr } = await db
    .from('contacts')
    .select('id')
    .in('phone_normalized', [...phoneVariants]);

  if (contactErr) {
    if (contactErr.code === '42P01' || /does not exist/.test(contactErr.message || '')) {
      return { donorIds: scoped.map(a => a.donor_id).filter(Boolean), contactIds: [], phoneVariants };
    }
    throw contactErr;
  }

  return {
    donorIds: scoped.map(a => a.donor_id).filter(Boolean),
    contactIds: (contacts || []).map(c => c.id),
    phoneVariants,
  };
}

/**
 * May this caller open a thread with this phone number?
 *
 * Guards send-direct and create-conversation, which are the two endpoints that
 * could otherwise be handed any number on earth. The WhatsApp admin is exempt:
 * it is the documented escape hatch for reaching a donor outside any allotment.
 */
export function assertPhoneAllotted(caller, phone, allotment) {
  if (caller?.isWaAdmin) return true;
  const wanted = normalizeDonorPhone(phone);
  if (!wanted) {
    throw new ScopeError('A valid phone number is required', 400);
  }
  // Both spellings, because the donor list is hand-authored and contacts are not.
  const digits = wanted.replace(/[^0-9]/g, '');
  const candidates = new Set([wanted, digits]);
  if (digits.startsWith('91') && digits.length === 12) candidates.add(digits.slice(2));
  if (digits.length === 10) candidates.add('91' + digits);

  for (const c of candidates) {
    if (allotment?.phoneVariants?.has(c)) return true;
  }

  throw new ScopeError(
    'This number is not allotted to you. Ask your WhatsApp admin to add the donor to your allotment.',
    403,
  );
}

// ── Per-conversation enforcement ────────────────────────────────────────

/**
 * Load a conversation, or fail with the right status, if this caller may not
 * have it.
 *
 * Returns the conversation row so callers stop re-reading it. 404 (not 403) for
 * "exists but not yours": a 403 would confirm the id is real, which is itself
 * the disclosure this module exists to stop.
 */
export async function assertConversationAccess(caller, conversationId, restrictPairs = null) {
  const { data: conversation, error } = await db
    .from('conversations')
    .select('id, contact_id, project, assigned_agent_id, status')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!conversation) throw new ScopeError('Conversation not found', 404);
  if (caller?.isWaAdmin) return conversation;

  const allotment = await loadAllotment(caller?.workerId, restrictPairs);
  if (isConversationOwnedBy(conversation, allotment.contactIds, caller?.userId)) {
    return conversation;
  }

  // No donor allotment, but the caller may still be an agent granted a whole
  // WhatsApp NUMBER (fro_whatsapp_assignments / agent_phone_assignments). The
  // inbox already lists exactly those projects' conversations to them, so a
  // per-conversation read of one of them must not 404 -- otherwise the agent can
  // see a thread in the list and gets "Conversation not found" the moment they
  // try to reply in it.
  if (conversation.project) {
    const projects = await callerProjects(caller);
    if (Array.isArray(projects) && projects.includes(conversation.project)) {
      return conversation;
    }
  }

  throw new ScopeError('Conversation not found', 404);
}

/**
 * assertConversationAccess plus the caller's allotment, in one round trip.
 *
 * The allotment is needed by the org router: several donors share a household or
 * business number, so the phone alone does not say WHICH donor a send is about --
 * the caller's own fro_assignments rows do. Loading it here means the send path
 * reads the allotment once rather than twice.
 *
 * Returns null for the WhatsApp admin, who is unbounded by design; there is
 * nothing to narrow to and a query would only cost.
 */
export async function assertConversationAccessWithAllotment(caller, conversationId, restrictPairs = null) {
  const conversation = await assertConversationAccess(caller, conversationId, restrictPairs);
  const allotment = caller?.isWaAdmin ? null : await loadAllotment(caller?.workerId, restrictPairs);
  return { conversation, allotment };
}

/** Middleware form, for routes that take `:id` straight off req.params. */
export function requireConversationAccess(paramName = 'id') {
  return async (req, res, next) => {
    try {
      req.waCaller = await resolveWaCaller(req);
      req.waConversation = await assertConversationAccess(req.waCaller, req.params[paramName]);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── Account projects ────────────────────────────────────────────────────

/**
 * WhatsApp accounts (and therefore `conversations.project` values) this caller
 * may send from or read templates for.
 *
 * An admin gets null, which every consumer reads as "no bound". Mirrors the
 * three assignment tables that were already being unioned inside
 * getAgentConversations; extracted so the template endpoint and the send paths
 * stop each inventing their own version.
 */
export async function callerProjects(caller) {
  if (caller?.isWaAdmin) return null;

  // ID DOMAIN. `caller.userId` is the agent's crm_agents row whenever the caller
  // is an agent (resolveWaCaller prefers agentId over the token id), but
  // fro_whatsapp_assignments.fro_worker_id holds the WORKER id. Querying that
  // table with userId silently matched nothing, so an agent with a perfectly
  // good grant got zero numbers: an empty inbox and
  // "You are not assigned to that WhatsApp number" (403) on every send.
  // Match on whichever id each table actually stores.
  const userId = caller?.userId;
  const workerId = caller?.workerId;
  if (!userId && !workerId) return [];

  const idCandidates = [...new Set([workerId, userId].filter(Boolean))];
  const anyOf = (col) => idCandidates;

  const [workerAcctAssigns, froAssigns, agentAssigns] = await Promise.all([
    db.from('worker_agent_assignments').select('account_id').in('user_id', anyOf('user_id')),
    db.from('fro_whatsapp_assignments')
      .select('whatsapp_account_id')
      .in('fro_worker_id', anyOf('fro_worker_id'))
      .eq('is_active', true),
    db.from('agent_phone_assignments').select('account_id').in('user_id', anyOf('user_id')),
  ]);

  // fro_whatsapp_assignments names the column whatsapp_account_id; the other two
  // name it account_id. Reading only account_id dropped every FRO direct grant.
  const acctIds = new Set();
  for (const a of [...(workerAcctAssigns.data || []), ...(froAssigns.data || []), ...(agentAssigns.data || [])]) {
    const id = a.account_id || a.whatsapp_account_id;
    if (id) acctIds.add(id);
  }
  if (acctIds.size === 0) return [];

  const { data: accts } = await db
    .from('whatsapp_accounts')
    .select('project')
    .in('id', [...acctIds]);
  return (accts || []).map(a => a.project).filter(Boolean);
}

/**
 * Refuse to read or send through a WhatsApp number the caller does not hold.
 *
 * `?project=` on a GET and `project` in a POST body were both attacker-supplied
 * and both resolved a Meta access_token, so either could be pointed at any
 * configured number.
 */
export function assertProjectAllowed(caller, project, allowedProjects) {
  if (!project) return true;
  if (caller?.isWaAdmin) return true;
  if (Array.isArray(allowedProjects) && allowedProjects.includes(project)) return true;
  throw new ScopeError('You are not assigned to that WhatsApp number', 403);
}

// ── Writing a thread owner ───────────────────────────────────────────────

const ownerIsUserCache = new Map(); // id -> boolean (is this a users row?)
const OWNER_CHECK_TTL_MS = 60_000;

/**
 * Is `id` a real users(id)? That is the only value conversations.assigned_agent_id
 * can hold.
 *
 * The column carries a live FK to users(id). Verified against this database:
 * users and workers share zero ids (62 vs 166, 0 overlap), and no crm_agents row
 * has an id or a worker_id that appears in users. So for every agent session the
 * natural owner id -- crm_agents.id -- is unrepresentable, and writing it fails
 * the constraint.
 *
 * That failure is what made the WhatsApp button dead end to end. An agent
 * pressing it created a conversation via findOrCreateConversation, which stamps
 * assigned_agent_id from the token, and the insert died on the FK with a 500 --
 * after the allotment check had already correctly said yes.
 *
 * So ownership is written only when it is actually representable, and otherwise
 * stays NULL. NULL is not a loss of function here: per the policy, visibility
 * derives from the donor allotment in fro_assignments, and an unowned thread in
 * my allotment is visible to me and claimable by me, which is the normal path.
 */
export async function writableThreadOwner(candidateId) {
  if (candidateId == null || candidateId === '') return null;
  const key = String(candidateId);

  const hit = ownerIsUserCache.get(key);
  if (hit && Date.now() - hit.at < OWNER_CHECK_TTL_MS) return hit.ok ? key : null;

  let ok = false;
  try {
    const { rows } = await db._pool.query(`SELECT 1 FROM users WHERE id = $1 LIMIT 1`, [key]);
    ok = rows.length > 0;
  } catch (e) {
    // A failed probe must not invent an owner: assume unrepresentable and let
    // the thread stay unowned rather than 500 every send.
    console.error('[whatsappScope] owner probe failed:', e.message);
    return null;
  }

  ownerIsUserCache.set(key, { at: Date.now(), ok });
  if (ownerIsUserCache.size > 500) {
    const cutoff = Date.now() - OWNER_CHECK_TTL_MS;
    for (const [k, v] of ownerIsUserCache) if (v.at < cutoff) ownerIsUserCache.delete(k);
  }
  return ok ? key : null;
}

/**
 * Set the thread owner, tolerating the column being unable to represent it.
 *
 * A claim is a convenience -- it narrows a thread to one agent inside an
 * allotment several may share. It is never worth failing the send that triggered
 * it, and it must never be able to turn a permitted message into a 500.
 */
export async function setThreadOwner(conversationId, candidateId) {
  const owner = await writableThreadOwner(candidateId);
  if (!owner) return null;
  try {
    await db.from('conversations').update({ assigned_agent_id: owner }).eq('id', conversationId);
    return owner;
  } catch (e) {
    console.error('[whatsappScope] could not set thread owner:', e.message);
    return null;
  }
}
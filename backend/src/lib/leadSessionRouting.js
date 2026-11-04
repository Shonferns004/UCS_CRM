// Which WhatsApp number should a lead's WhatsApp button open?
//
// An FRO may hold several numbers for the same station. Donors sometimes block one number,
// and WhatsApp never says so: a message to a blocking contact stays "sent" forever instead of
// failing. The only evidence available is the message history on the gateway — a reply, a
// delivered/read receipt means the number works; a send that stays undelivered well past the
// usual window means it probably does not.
//
// Everything here is pure so it can be tested without a gateway or a database.

/** How long an outgoing message may stay pending/sent before we stop trusting the number. */
export const UNDELIVERED_GRACE_MS = 10 * 60 * 1000;

/** Delivered/read are the only outbound states that prove the recipient's phone took the message. */
const GOOD_OUTBOUND_STATUSES = new Set(['delivered', 'read']);

const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Digits in the form the gateway resolves: international, no plus, India assumed for a bare
 * 10-digit CRM number. Mirrors client/src/panels/fro/utils/leadWhatsApp.js.
 */
export function whatsappDigits(mobile) {
  let digits = String(mobile || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  return digits;
}

/** Gateway message time: `timestamp` is Unix seconds, `createdAt` is ISO. */
function messageTimeMs(message) {
  const timestamp = Number(message?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp < 1e12 ? timestamp * 1000 : timestamp;
  }
  const created = Date.parse(String(message?.createdAt || ''));
  return Number.isFinite(created) ? created : 0;
}

/** A small tiebreaker: a number the donor used recently outranks one used months ago. */
function recencyBonus(at, now) {
  if (!at) return 0;
  const age = Math.max(0, now - at);
  return Math.round(40 * Math.max(0, 1 - Math.min(1, age / RECENCY_WINDOW_MS)));
}

/**
 * Read one number's history with this donor and decide whether it looks reachable.
 *
 * States, best first:
 *   delivered          the newest outbound message got a delivered/read receipt
 *   answered           the donor replied after our newest outbound message
 *   awaiting-delivery  a message was sent too recently to judge (under the grace window)
 *   unknown            no history on this number, or the history read failed
 *   suspected-blocked  the newest outbound message stayed pending/sent past the grace window
 *   failed             the gateway reported the newest send as failed
 */
export function classifyLeadHistory(messages, now = Date.now()) {
  const rows = Array.isArray(messages) ? messages.filter((row) => row && typeof row === 'object') : [];

  let lastIncomingAt = 0;
  let lastOutgoingAt = 0;
  let lastOutgoing = null;
  for (const row of rows) {
    const at = messageTimeMs(row);
    if (row.direction === 'incoming') {
      if (at >= lastIncomingAt) lastIncomingAt = at;
    } else if (row.direction === 'outgoing') {
      if (!lastOutgoing || at >= lastOutgoingAt) {
        lastOutgoing = row;
        lastOutgoingAt = at;
      }
    }
  }

  const receipt = {
    hasIncoming: lastIncomingAt > 0,
    hasOutgoing: Boolean(lastOutgoing),
    lastIncomingAt,
    lastOutgoingAt,
    lastOutgoingStatus: lastOutgoing ? String(lastOutgoing.status || '').toLowerCase() : null,
  };

  if (!lastOutgoing && !lastIncomingAt) {
    return { state: 'unknown', score: 100, ...receipt };
  }

  if (lastOutgoing) {
    const status = receipt.lastOutgoingStatus;
    if (status === 'failed') {
      return { state: 'failed', score: -100, ...receipt };
    }
    if (GOOD_OUTBOUND_STATUSES.has(status)) {
      return { state: 'delivered', score: 300 + recencyBonus(lastOutgoingAt, now), ...receipt };
    }
  }

  // The donor wrote after our newest send: the thread is live regardless of receipt settings,
  // and an actual reply is the strongest evidence there is.
  if (lastIncomingAt && lastIncomingAt >= lastOutgoingAt) {
    return { state: 'answered', score: 340 + recencyBonus(lastIncomingAt, now), ...receipt };
  }

  if (lastOutgoing) {
    const status = receipt.lastOutgoingStatus;
    // Only an unconfirmed send means anything here. An unrecognised legacy status is left
    // neutral rather than treated as a block.
    if (status === 'pending' || status === 'sent' || status === '') {
      const age = Math.max(0, now - lastOutgoingAt);
      if (age >= UNDELIVERED_GRACE_MS) {
        return { state: 'suspected-blocked', score: 0, ageMs: age, ...receipt };
      }
      return {
        state: 'awaiting-delivery',
        score: 150 + recencyBonus(lastOutgoingAt, now),
        ...receipt,
      };
    }
    return { state: 'unknown', score: 90, ...receipt };
  }

  return { state: 'unknown', score: 90, ...receipt };
}

/**
 * Rank the candidate numbers for one lead.
 *
 * `candidates` is the assignment list in display order (each `{ sessionId, station, ngoId, ... }`).
 * `histories` is `[{ sessionId, messages, lookupFailed }]` in any order.
 * Returns `{ best, ranked, allBlocked, blockedCount }` where `best` is null when there is no
 * candidate at all. A failed history read is treated as unknown, never as blocked, so a gateway
 * hiccup cannot hide a working number.
 */
export function rankLeadSessions(candidates, histories, now = Date.now()) {
  const list = Array.isArray(candidates) ? candidates.filter((row) => row?.sessionId) : [];
  if (list.length === 0) {
    return { best: null, ranked: [], allBlocked: false, blockedCount: 0 };
  }

  const bySession = new Map();
  for (const history of Array.isArray(histories) ? histories : []) {
    if (history?.sessionId) bySession.set(history.sessionId, history);
  }

  const ranked = list.map((candidate, order) => {
    const history = bySession.get(candidate.sessionId);
    const verdict = history?.lookupFailed
      ? { state: 'unknown', score: 90, lookupFailed: true }
      : classifyLeadHistory(history?.messages, now);
    return { ...candidate, ...verdict, order };
  });

  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  const best = ranked[0];
  const blockedCount = ranked.filter(
    (row) => row.state === 'failed' || row.state === 'suspected-blocked',
  ).length;

  return {
    best,
    ranked,
    // Nothing left that we can vouch for. The caller still opens the best row but warns the FRO.
    allBlocked: best.score <= 0,
    blockedCount,
  };
}

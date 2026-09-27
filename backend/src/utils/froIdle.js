// ─── Effective FRO idle (single definition for every read path) ───────
// The FRO panel commits elapsed idle ONLY when an idle streak closes (on real
// donor/call work — see closeIdleStreak in client/src/panels/fro/CallContext.jsx).
// While a streak is still running, the raw fro_live_status.today_idle_seconds
// column stays at its previous value — normally 0. Reading that column directly
// made an FRO who had been idle for hours display "0m" until one click flushed
// the entire streak in at once.
//
// Every read path must therefore report: committed + still-running streak.
// It lives here, in one module, so the super-admin live list, the FRO dashboard,
// the NGO-admin list and the dashboard alerts cannot drift apart again. They
// previously disagreed: the NGO-admin list added the streak, the super-admin
// screens did not.
//
// Freshness gate: a genuinely idle panel re-writes updated_at every 60s via its
// idle heartbeat, so a row whose heartbeat is older than this belongs to a dead
// panel or a closed tab. Its abandoned idle_since must NOT keep accumulating,
// or a crashed FRO would report unbounded idle forever.
export const IDLE_LIVE_FRESH_MS = 3 * 60 * 1000;

// Accepts a fro_live_status-shaped row ({ today_idle_seconds, idle_since,
// updated_at }) and returns idle seconds safe to display.
export function effectiveIdleSeconds(row) {
  const committed = Number(row?.today_idle_seconds || 0);
  if (!row) return committed;
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : NaN;
  const since = row.idle_since ? new Date(row.idle_since).getTime() : NaN;
  if (!Number.isFinite(updatedAt) || !Number.isFinite(since)) return committed;
  if (Date.now() - updatedAt > IDLE_LIVE_FRESH_MS) return committed;
  return committed + Math.max(0, Math.floor((Date.now() - since) / 1000));
}

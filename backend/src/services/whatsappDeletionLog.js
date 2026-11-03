import db from '../config/db.js';
import { normalizeRole } from '../middleware/authMiddleware.js';
import { resolveFroIdentity, stationAccessForWorker } from '../routes/openwaAssignmentsRoutes.js';

// Deleted-message audit. The gateway only keeps a `revoked` message with an empty body, so the
// CRM records the actor, the NGO/station they worked from (permanent or temporary grant) and
// what the message said before it was cleared. Two callers land here:
//   - the gateway passthrough, for any delete made through the CRM proxy, and
//   - POST /api/openwa-message-logs/deletions, for a caller that already knows the body.
// A unique (session_id, wa_message_id) index makes the second caller update the first row
// instead of adding a duplicate.
const ADMIN_ROLES = new Set(['master', 'super_admin', 'accounts', 'admin']);
const stationKey = (ngoId, station) => `${ngoId}\u0000${station}`;

// The parser for "is this gateway call a message delete?" lives in its own pure module so the
// passthrough's decision can be tested without a server or a gateway.
export { parseMessageDeleteRequest } from './whatsappMessageDeleteIntent.js';

async function loadOriginal(sessionId, messageId) {
  const { rows } = await db._pool.query(
    `SELECT body, type, direction, "chatName", "chatId"
       FROM openwa.messages
      WHERE "sessionId" = $1 AND "waMessageId" = $2
      LIMIT 1`,
    [sessionId, messageId],
  );
  return rows[0] || null;
}

/**
 * Resolve the deleter and their station. Admins keep the CRM user's own name; an FRO is
 * resolved to their worker record, and the station is the assignment they actually have
 * access to, so a temporary grant is attributed to the station it opened.
 */
async function resolveActor(req, sessionId) {
  const role = normalizeRole(req.user?.role);
  const admin = ADMIN_ROLES.has(role);

  const { rows: assignments } = await db._pool.query(
    `SELECT session_id, session_name, ngo_id, station
       FROM whatsapp_session_assignments
      WHERE session_id = $1
      ORDER BY station ASC`,
    [sessionId],
  );

  if (admin) {
    return {
      actorId: req.user?.id || null,
      actorName: req.user?.name || null,
      actorRole: role,
      assignment: assignments[0] || null,
    };
  }

  const identity = await resolveFroIdentity(req);
  if (!identity) return null;

  const { permanent, temporary } = await stationAccessForWorker(identity.workerId, identity.agentId);
  const allowed = new Set([...permanent, ...temporary]);
  const assignment =
    assignments.find(row => row.ngo_id && allowed.has(stationKey(row.ngo_id, row.station))) || null;
  // No assignment means this session is not scoped to a station yet (or the grant just
  // expired). Refuse rather than log a delete against a station the FRO never had.
  if (!assignment) return null;

  const { rows: worker } = await db._pool.query('SELECT name FROM workers WHERE id = $1', [identity.workerId]);

  return {
    actorId: identity.workerId,
    actorName: worker[0]?.name || req.user?.name || null,
    actorRole: 'fro',
    assignment,
  };
}

export async function recordMessageDeletion(req, input) {
  const sessionId = String(input?.sessionId || '').trim();
  const messageId = String(input?.messageId || '').trim();
  if (!sessionId || !messageId) return null;

  // The row the delete is about to clear still holds the body when the passthrough calls us,
  // so look it up unless the caller already sent everything.
  const needsLookup =
    input.body === undefined ||
    input.type === undefined ||
    input.chatName === undefined ||
    input.direction === undefined;
  const original = needsLookup ? await loadOriginal(sessionId, messageId) : null;

  const actor = await resolveActor(req, sessionId);
  if (!actor) return null;

  const chatId = String(input.chatId || original?.chatId || '').trim() || null;
  const chatName =
    input.chatName !== undefined ? String(input.chatName || '').trim() || null : original?.chatName || null;
  const body = String((input.body !== undefined ? input.body : original?.body) || '').slice(0, 4096) || null;
  const type = String((input.type !== undefined ? input.type : original?.type) || '').trim() || null;
  const direction =
    String((input.direction !== undefined ? input.direction : original?.direction) || '').trim() || null;

  const { rows: ngo } = actor.assignment?.ngo_id
    ? await db._pool.query('SELECT name FROM ngos WHERE id = $1', [actor.assignment.ngo_id])
    : { rows: [] };
  const { rows: gatewaySession } = await db._pool.query('SELECT name FROM openwa.sessions WHERE id = $1', [
    sessionId,
  ]);

  const { rows } = await db._pool.query(
    `INSERT INTO whatsapp_message_deletions
       (session_id, session_name, ngo_id, ngo_name, station, chat_id, chat_name,
        wa_message_id, message_body, message_type, message_direction,
        actor_id, actor_name, actor_role, for_everyone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     -- The passthrough and the explicit call can both land, in either order: keep the first
     -- actor (whoever the delete was attributed to) and let the richer body/chat fill in.
     ON CONFLICT (session_id, wa_message_id) DO UPDATE SET
       chat_name = COALESCE(whatsapp_message_deletions.chat_name, EXCLUDED.chat_name),
       message_body = COALESCE(NULLIF(EXCLUDED.message_body, ''), whatsapp_message_deletions.message_body),
       message_type = COALESCE(whatsapp_message_deletions.message_type, EXCLUDED.message_type),
       message_direction = COALESCE(whatsapp_message_deletions.message_direction, EXCLUDED.message_direction)
     RETURNING id`,
    [
      sessionId,
      gatewaySession[0]?.name || actor.assignment?.session_name || null,
      actor.assignment?.ngo_id || null,
      ngo[0]?.name || null,
      actor.assignment?.station || null,
      chatId,
      chatName,
      messageId,
      body,
      type,
      direction,
      actor.actorId,
      actor.actorName,
      actor.actorRole,
      input.forEveryone !== false,
    ],
  );

  return rows[0]?.id || null;
}

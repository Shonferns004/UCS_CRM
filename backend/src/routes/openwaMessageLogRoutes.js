import { Router } from 'express';
import db from '../config/db.js';
import { authenticate, authenticateRole } from '../middleware/authMiddleware.js';
import { recordMessageDeletion } from '../services/whatsappDeletionLog.js';

// Deleted-message audit. The gateway only keeps a `revoked` message with an empty body, so
// the CRM records the actor, their station (including a temporary grant) and the original
// body when a delete succeeds. The logs page shows this table plus legacy revoked rows.
const router = Router();
const ADMIN_ROLES = ['master', 'super_admin', 'accounts', 'admin'];
const requireAdmin = authenticateRole(...ADMIN_ROLES);

// Month buckets follow the operator's clock (IST), so a delete at 00:30 IST on the 1st is not
// filed under the previous month.
const BILLING_TIME_ZONE = 'Asia/Kolkata';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// The untracked half of the log: gateway revoked rows no CRM audit row already covers. Kept in
// one place so the list, its count and the filter options can never disagree.
const LEGACY_REVOKED = (alias = 'm') => `
  ${alias}."sessionId" = $1
  AND ${alias}.type = 'revoked'
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_message_deletions d
     WHERE d.session_id = ${alias}."sessionId"
       AND d.wa_message_id = ${alias}."waMessageId"
  )`;


router.get('/sessions', requireAdmin, async (req, res) => {
  try {
    // Session list only: the deleted count moved into the filtered log (its totals depend on the
    // month/station filters, so a per-session badge would contradict the table).
    const { rows } = await db._pool.query(`
      SELECT s.id,
             s.name,
             s.phone,
             s.status
        FROM openwa.sessions s
       ORDER BY s.name ASC
    `);
    return res.json({ sessions: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load sessions' });
  }
});

// GET /recent — the dashboard strip: the latest deletions across every session, with who did it.
// Only CRM-tracked rows qualify; a legacy gateway tombstone has no actor to show.
router.get('/recent', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);

  try {
    const [items, types, total] = await Promise.all([
      db._pool.query(
        `SELECT id::text AS id,
                session_id,
                session_name,
                ngo_name,
                station,
                chat_id,
                chat_name,
                wa_message_id,
                message_body AS body,
                message_type AS type,
                message_direction AS direction,
                actor_name,
                actor_role,
                for_everyone,
                deleted_at::timestamptz AS "createdAt"
           FROM whatsapp_message_deletions
          ORDER BY deleted_at DESC
          LIMIT $1`,
        [limit],
      ),
      // Same window as the strip answers "what kind of messages are being deleted", so the
      // breakdown counts every tracked deletion, not just the few rows shown.
      db._pool.query(
        `SELECT COALESCE(message_type, 'unknown') AS type, COUNT(*)::int AS count
           FROM whatsapp_message_deletions
          GROUP BY 1
          ORDER BY 2 DESC`,
      ),
      db._pool.query('SELECT COUNT(*)::int AS total FROM whatsapp_message_deletions'),
    ]);

    return res.json({
      items: items.rows,
      byType: types.rows,
      total: total.rows[0]?.total || 0,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load recent deletions' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  // Empty string means "all". An unknown month is treated as no filter rather than a 400: the
  // page should still show something if a stale value survives a reload.
  const month = MONTH_RE.test(String(req.query.month || '')) ? String(req.query.month) : '';
  const station = String(req.query.station || '').trim().slice(0, 120);

  try {
    // UNION ALL: tracked CRM deletions first (they carry the actor and original body), then
    // legacy gateway revoked rows that have no CRM audit entry, marked as untracked.
    const base = `
      SELECT d.id::text AS id,
             d.session_id,
             d.session_name,
             d.ngo_id,
             d.ngo_name,
             d.station,
             d.chat_id,
             d.chat_name,
             d.wa_message_id,
             d.message_body AS body,
             d.message_type AS type,
             d.message_direction AS direction,
             d.actor_id,
             d.actor_name,
             d.actor_role,
             d.for_everyone,
             d.deleted_at::timestamptz AS "createdAt",
             true AS tracked
        FROM whatsapp_message_deletions d
       WHERE d.session_id = $1
      UNION ALL
      SELECT m.id::text,
             m."sessionId",
             NULL,
             NULL,
             NULL,
             NULL,
             m."chatId",
             m."chatName",
             m."waMessageId",
             m.body,
             m.type,
             m.direction,
             NULL,
             NULL,
             NULL,
             true,
             m."createdAt"::timestamptz,
             false
        FROM openwa.messages m
       WHERE ${LEGACY_REVOKED('m')}`;

    // Filters apply to the union so they behave the same for tracked and legacy rows. A station
    // filter drops legacy rows by design: the gateway never recorded who deleted them.
    const filtered = `
      SELECT * FROM (${base}) deleted
       WHERE ($2 = '' OR to_char("createdAt" AT TIME ZONE '${BILLING_TIME_ZONE}', 'YYYY-MM') = $2)
         AND ($3 = '' OR station = $3)`;

    const [{ rows }, countResult] = await Promise.all([
      db._pool.query(`SELECT * FROM (${filtered}) page ORDER BY "createdAt" DESC LIMIT $4 OFFSET $5`, [
        sessionId,
        month,
        station,
        limit,
        offset,
      ]),
      db._pool.query(`SELECT COUNT(*)::int AS total FROM (${filtered}) all_rows`, [sessionId, month, station]),
    ]);

    return res.json({ logs: rows, total: countResult.rows[0]?.total || 0, limit, offset });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load deleted messages' });
  }
});

// GET /filters?sessionId= — the months and stations that actually appear in this session's
// log, so the dropdowns can never offer a choice that returns nothing.
router.get('/filters', requireAdmin, async (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

  try {
    const [{ rows: stationRows }, { rows: monthRows }] = await Promise.all([
      db._pool.query(
        `SELECT DISTINCT station
           FROM whatsapp_message_deletions
          WHERE session_id = $1 AND station IS NOT NULL AND station <> ''
          ORDER BY station ASC`,
        [sessionId],
      ),
      db._pool.query(
        `WITH entries AS (
           SELECT deleted_at AS at FROM whatsapp_message_deletions WHERE session_id = $1
           UNION ALL
           SELECT m."createdAt"::timestamptz FROM openwa.messages m WHERE ${LEGACY_REVOKED('m')}
         )
         SELECT DISTINCT to_char(at AT TIME ZONE '${BILLING_TIME_ZONE}', 'YYYY-MM') AS month
           FROM entries
          WHERE at IS NOT NULL
          ORDER BY month DESC`,
        [sessionId],
      ),
    ]);

    return res.json({
      stations: stationRows.map(row => row.station),
      months: monthRows.map(row => row.month),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load log filters' });
  }
});

// POST /deletions — explicit recording for a caller that already knows the message body.
// The actor comes from the CRM token; the station/NGO is resolved from the session's
// assignments and, for an FRO, from their permanent or temporary station access. The gateway
// passthrough records the same delete on its own, so this is idempotent.
router.post('/deletions', authenticate, async (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim();
  const waMessageId = String(req.body?.messageId || '').trim();
  if (!sessionId || !waMessageId) {
    return res.status(400).json({ message: 'sessionId and messageId are required' });
  }

  try {
    const id = await recordMessageDeletion(req, {
      sessionId,
      messageId: waMessageId,
      chatId: req.body?.chatId,
      chatName: req.body?.chatName,
      body: req.body?.body,
      type: req.body?.type,
      direction: req.body?.direction,
      forEveryone: req.body?.forEveryone,
    });
    if (!id) {
      return res.status(403).json({ message: 'This session is not assigned to your station' });
    }
    return res.status(201).json({ success: true, id });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not record the deletion' });
  }
});

export default router;

import { Router } from 'express';
import db from '../config/db.js';
import { authenticate, normalizeRole } from '../middleware/authMiddleware.js';
import { resolveFroIdentity, stationAccessForWorker } from './openwaAssignmentsRoutes.js';

// Templates for one chat: resolve the session's NGO, then read the templates of every
// session assigned to that NGO from the gateway. Admin roles see all; an FRO only sees a
// session their station access covers. This lets the chat page show an NGO's templates
// without exposing the gateway API key to the browser.
const router = Router();
const ADMIN_ROLES = new Set(['master', 'super_admin', 'accounts', 'admin']);

function gatewayConfig() {
  return {
    baseUrl: String(process.env.OPENWA_GATEWAY_URL || process.env.OPENWA_URL || '').replace(/\/+$/, ''),
    apiKey: String(process.env.OPENWA_GATEWAY_API_KEY || process.env.OPENWA_API_KEY || ''),
  };
}

router.get('/templates', authenticate, async (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

  try {
    const { rows: assignmentRows } = await db._pool.query(
      `SELECT session_id, ngo_id, station
         FROM whatsapp_session_assignments
        WHERE session_id = $1
        ORDER BY created_at ASC`,
      [sessionId],
    );
    const assignment = assignmentRows?.[0] || null;
    if (!assignment) return res.json({ ngoId: null, ngoName: null, templates: [] });

    const role = normalizeRole(req.user?.role);
    if (!ADMIN_ROLES.has(role)) {
      const identity = await resolveFroIdentity(req);
      if (!identity) return res.status(403).json({ message: 'Forbidden' });
      const { permanent, temporary } = await stationAccessForWorker(identity.workerId, identity.agentId);
      // One session can be shared with several stations: allow when ANY of them is hers.
      const allowed = assignmentRows.some((row) => {
        const key = `${row.ngo_id}\u0000${row.station}`;
        return permanent.has(key) || temporary.has(key);
      });
      if (!allowed) return res.status(403).json({ message: 'Forbidden' });
    }

    const [{ data: sessions }, { data: ngo }] = await Promise.all([
      db.from('whatsapp_session_assignments').select('session_id').eq('ngo_id', assignment.ngo_id),
      db.from('ngos').select('name').eq('id', assignment.ngo_id).maybeSingle(),
    ]);
    const sessionIds = [...new Set((sessions || []).map((row) => row.session_id))];
    const { baseUrl, apiKey } = gatewayConfig();
    if (!baseUrl) {
      return res.json({ ngoId: assignment.ngo_id, ngoName: ngo?.name || null, templates: [] });
    }

    const lists = await Promise.all(
      sessionIds.map(async (id) => {
        const response = await fetch(
          `${baseUrl}/api/sessions/${encodeURIComponent(id)}/templates`,
          { headers: apiKey ? { 'X-API-Key': apiKey } : {} },
        ).catch(() => null);
        if (!response?.ok) return [];
        const payload = await response.json().catch(() => []);
        return Array.isArray(payload) ? payload : [];
      }),
    );

    return res.json({
      ngoId: assignment.ngo_id,
      ngoName: ngo?.name || null,
      templates: lists.flat(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load templates' });
  }
});

export default router;

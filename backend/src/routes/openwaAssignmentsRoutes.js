import { Router } from 'express';
import db from '../config/db.js';
import { authenticate, authenticateRole, normalizeRole } from '../middleware/authMiddleware.js';
import { getActiveGrantPairs } from '../services/temporaryAccessService.js';

const router = Router();

// The staff roles that manage the WhatsApp connections (the same set the Accounts
// panel uses for the OpenWA pages).
const ADMIN_ROLES = ['master', 'super_admin', 'accounts', 'admin'];
const requireAdmin = authenticateRole(...ADMIN_ROLES);

// `fro_station_assignments.station` is the source of truth for station names and
// which FRO runs each station. A row may name the FRO directly (fro_worker_id) or
// through a CRM agent login (crm_agent_id -> crm_agents.worker_id), so both are
// resolved to the worker behind them.
async function loadStationDirectory() {
  const { data: stationRows } = await db
    .from('fro_station_assignments')
    .select('ngo_id, station, fro_worker_id, crm_agent_id');

  const rows = Array.isArray(stationRows) ? stationRows : [];

  const directWorkerIds = new Set();
  const agentIds = new Set();
  for (const row of rows) {
    if (row.fro_worker_id) directWorkerIds.add(row.fro_worker_id);
    if (row.crm_agent_id) agentIds.add(row.crm_agent_id);
  }

  const agents = agentIds.size
    ? (await db.from('crm_agents').select('id, worker_id, login_id, label').in('id', [...agentIds])).data || []
    : [];
  for (const agent of agents) {
    if (agent.worker_id) directWorkerIds.add(agent.worker_id);
  }

  const workers = directWorkerIds.size
    ? (await db.from('workers').select('id, name, login_id').in('id', [...directWorkerIds])).data || []
    : [];

  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  const directory = new Map();
  for (const row of rows) {
    if (!row.station) continue;
    const agent = row.crm_agent_id ? agentById.get(row.crm_agent_id) : null;
    const workerId = row.fro_worker_id || agent?.worker_id || null;
    const worker = workerId ? workerById.get(workerId) : null;
    const key = `${row.ngo_id}\u0000${row.station}`;
    const entry = {
      ngo_id: row.ngo_id,
      station: row.station,
      worker_id: workerId,
      worker_name: worker?.name || agent?.label || null,
      login_id: worker?.login_id || agent?.login_id || null,
    };
    const existing = directory.get(key);
    if (!existing || (!existing.worker_name && entry.worker_name)) directory.set(key, entry);
  }

  return {
    stations: [...directory.values()].sort((a, b) =>
      a.station.localeCompare(b.station, undefined, { numeric: true, sensitivity: 'base' }),
    ),
    rows,
  };
}

async function ngoNameMap(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await db.from('ngos').select('id, name, code').in('id', unique);
  return new Map((data || []).map((ngo) => [ngo.id, ngo]));
}

// Resolve the worker (and agent login) behind an authenticated FRO token.
async function resolveFroIdentity(req) {
  const role = normalizeRole(req.user?.role);
  const agentId = req.user?.agent_user_id || null;

  if (agentId) {
    const { data: agent } = await db
      .from('crm_agents')
      .select('id, worker_id, is_active')
      .eq('id', agentId)
      .maybeSingle();
    if (!agent || agent.is_active === false || !agent.worker_id) return null;
    return { workerId: agent.worker_id, agentId };
  }

  if (role !== 'fro' || !req.user?.id) return null;
  return { workerId: req.user.id, agentId: null };
}

export { resolveFroIdentity };

const stationKey = (ngoId, station) => `${ngoId}\u0000${station}`;

// The (ngo_id, station) pairs this worker may open in WhatsApp. `permanent` comes from
// fro_station_assignments (directly or through an agent login); `temporary` comes from a
// live temporary_data_assignments grant. A temp grant only ADDS access: the permanent
// owner keeps their tab, and the temporary FRO gets it too until the grant expires or is
// revoked. Callers union the two sets.
export async function stationAccessForWorker(workerId, agentId) {
  const { data: agents } = await db.from('crm_agents').select('id').eq('worker_id', workerId);
  const agentIds = new Set((agents || []).map((agent) => agent.id));
  if (agentId) agentIds.add(agentId);

  const { data: stationRows } = await db
    .from('fro_station_assignments')
    .select('ngo_id, station, fro_worker_id, crm_agent_id');

  const permanent = new Set();
  for (const row of stationRows || []) {
    if (!row.station) continue;
    const mine = row.fro_worker_id === workerId || (row.crm_agent_id && agentIds.has(row.crm_agent_id));
    if (mine) permanent.add(stationKey(row.ngo_id, row.station));
  }

  // getActiveGrantPairs already re-checks the live window and fails closed, so an
  // expired/revoked grant stops granting the station's WhatsApp on the next read.
  // Any live grant (whatever its donor scope) opens that station's WhatsApp: the
  // inbox is a station-level resource, not a per-donor slice.
  const temporary = new Set();
  for (const grant of await getActiveGrantPairs(workerId)) {
    if (grant.station) temporary.add(stationKey(grant.ngo_id, grant.station));
  }

  return { permanent, temporary };
}

// GET /meta — NGOs and station directory for the assign dropdowns.
router.get('/meta', requireAdmin, async (req, res) => {
  try {
    const [{ data: ngos }, { stations }] = await Promise.all([
      db.from('ngos').select('id, name, code, is_active').eq('is_active', true).order('name'),
      loadStationDirectory(),
    ]);
    return res.json({ ngos: ngos || [], stations });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load assignment data' });
  }
});

// GET / — every session assignment, with the NGO name.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data } = await db.from('whatsapp_session_assignments').select('*');
    const assignments = data || [];
    const ngos = await ngoNameMap(assignments.map((row) => row.ngo_id));
    return res.json({
      assignments: assignments.map((row) => ({
        ...row,
        ngo_name: ngos.get(row.ngo_id)?.name || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load assignments' });
  }
});

// POST / — create or replace a session's NGO/station assignment.
router.post('/', requireAdmin, async (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim();
  const sessionName = String(req.body?.sessionName || '').trim() || null;
  const ngoId = String(req.body?.ngoId || '').trim();
  const station = String(req.body?.station || '').trim() || null;

  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });
  if (!ngoId) return res.status(400).json({ message: 'ngoId is required' });

  try {
    const { data: ngo } = await db.from('ngos').select('id, name').eq('id', ngoId).maybeSingle();
    if (!ngo) return res.status(400).json({ message: 'Unknown NGO' });

    if (station) {
      const { stations } = await loadStationDirectory();
      const valid = stations.some((row) => row.ngo_id === ngoId && row.station === station);
      if (!valid) {
        return res.status(400).json({ message: `Station ${station} is not assigned in NGO ${ngo.name}` });
      }
    }

    const payload = {
      session_id: sessionId,
      session_name: sessionName,
      ngo_id: ngoId,
      station,
      assigned_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    // A session may hold several stations (and a null-station row before one is chosen),
    // so match the exact row rather than assuming one per session.
    const { data: rows } = await db
      .from('whatsapp_session_assignments')
      .select('*')
      .eq('session_id', sessionId);
    const existing = (rows || []).find((row) =>
      row.ngo_id === ngoId && (station ? row.station === station : !row.station),
    );

    if (existing?.id) {
      await db.from('whatsapp_session_assignments').update(payload).eq('id', existing.id);
    } else {
      await db.from('whatsapp_session_assignments').insert(payload);
    }

    const { data: saved } = await db
      .from('whatsapp_session_assignments')
      .select('*')
      .eq('session_id', sessionId);

    return res.json({
      assignments: (saved || []).map((row) => ({ ...row, ngo_name: ngo.name })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not save the assignment' });
  }
});

// PUT /:sessionId — replace a session's station set for one NGO. The Assign dialog
// checks/unchecks stations and saves once: adding a station, removing one, or moving
// the session from BOD-4 to BOD-3 all arrive here.
router.put('/:sessionId', requireAdmin, async (req, res) => {
  const sessionId = String(req.params.sessionId || '').trim();
  const sessionName = String(req.body?.sessionName || '').trim() || null;
  const ngoId = String(req.body?.ngoId || '').trim();
  const requested = Array.isArray(req.body?.stations) ? req.body.stations : [];
  const stations = [...new Set(requested.map((station) => String(station).trim()).filter(Boolean))];

  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });
  if (!ngoId) return res.status(400).json({ message: 'ngoId is required' });

  try {
    const { data: ngo } = await db.from('ngos').select('id, name').eq('id', ngoId).maybeSingle();
    if (!ngo) return res.status(400).json({ message: 'Unknown NGO' });

    const { stations: directory } = await loadStationDirectory();
    const valid = new Set(
      directory.filter((row) => row.ngo_id === ngoId).map((row) => row.station),
    );
    const invalid = stations.find((station) => !valid.has(station));
    if (invalid) {
      return res.status(400).json({ message: `Station ${invalid} is not assigned in NGO ${ngo.name}` });
    }

    await db
      .from('whatsapp_session_assignments')
      .delete()
      .eq('session_id', sessionId)
      .eq('ngo_id', ngoId);

    if (stations.length > 0) {
      await db.from('whatsapp_session_assignments').insert(
        stations.map((station) => ({
          session_id: sessionId,
          session_name: sessionName,
          ngo_id: ngoId,
          station,
          assigned_by: req.user?.id || null,
          updated_at: new Date().toISOString(),
        })),
      );
    }

    const { data: saved } = await db
      .from('whatsapp_session_assignments')
      .select('*')
      .eq('session_id', sessionId);

    return res.json({
      assignments: (saved || []).map((row) => ({ ...row, ngo_name: ngo.name })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not save the assignments' });
  }
});

// DELETE /:sessionId — remove an assignment (the session keeps running).
router.delete('/:sessionId', requireAdmin, async (req, res) => {
  try {
    await db
      .from('whatsapp_session_assignments')
      .delete()
      .eq('session_id', req.params.sessionId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not remove the assignment' });
  }
});

// GET /mine — sessions this FRO may open: their permanent stations plus any live
// temporary grant. Temp rows carry viaTemporaryAccess so the sidebar can label the tab.
router.get('/mine', authenticate, async (req, res) => {
  try {
    const identity = await resolveFroIdentity(req);
    if (!identity) return res.json({ assignments: [] });

    const { permanent, temporary } = await stationAccessForWorker(
      identity.workerId,
      identity.agentId,
    );
    const allowed = new Set([...permanent, ...temporary]);
    if (allowed.size === 0) return res.json({ assignments: [] });

    const { data } = await db
      .from('whatsapp_session_assignments')
      .select('session_id, session_name, ngo_id, station')
      .order('created_at', { ascending: true });
    const assignments = (data || []).filter(
      (row) => row.station && allowed.has(stationKey(row.ngo_id, row.station)),
    );

    // Permanent tabs first, temporary grants after them (BSCT, MANN, then BOD-1 (temp)).
    const isTemporary = (row) =>
      !permanent.has(stationKey(row.ngo_id, row.station)) &&
      temporary.has(stationKey(row.ngo_id, row.station));
    const ordered = [...assignments].sort(
      (a, b) => Number(isTemporary(a)) - Number(isTemporary(b)),
    );

    const ngos = await ngoNameMap(ordered.map((row) => row.ngo_id));
    return res.json({
      assignments: ordered.map((row) => ({
        sessionId: row.session_id,
        sessionName: row.session_name,
        station: row.station,
        ngoId: row.ngo_id,
        ngoName: ngos.get(row.ngo_id)?.name || null,
        viaTemporaryAccess: isTemporary(row),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load your assignment' });
  }
});

export default router;

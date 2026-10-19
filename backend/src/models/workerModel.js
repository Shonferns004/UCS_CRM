import pg from 'pg';
import db, { sql } from '../config/db.js';
import { clearCaches } from '../utils/workerNameMatch.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());

export const createWorker = async (workerData) => {
  const { data, error } = await db
    .from('workers')
    .insert([workerData])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const createWorkers = async (workersData) => {
  const { data, error } = await db
    .from('workers')
    .insert(workersData)
    .select();
  if (error) throw error;
  return data;
};

export const getAllWorkers = async (ngo_id, status) => {
  let query = db
    .from('workers')
    .select('*')
    .order('created_at', { ascending: false });

  if (ngo_id) {
    const { data: ids, error: idsErr } = await db
      .from('worker_ngo_allocations')
      .select('worker_id')
      .eq('ngo_id', ngo_id);
    if (idsErr) throw idsErr;
    const workerIds = (ids || []).map(r => r.worker_id);
    if (workerIds.length > 0) {
      query = query.in('id', workerIds);
    } else {
      query = query.eq('id', null);
    }
  }

  if (status === 'active') {
    query = query.eq('employment_status', 'active');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const getWorkerById = async (id) => {
  if (!isUuid(id)) return null;
  const { data, error } = await db
    .from('workers')
    .select('*')
    .eq('id', id)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    const missing = new Error('JSON object requested, multiple (or no) rows returned');
    missing.code = 'PGRST116';
    throw missing;
  }
  return data;
};

export const getWorkerCount = async () => {
  const { count, error } = await db
    .from('workers')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
};

export const getRecruiterWorkers = async () => {
  const { data, error } = await db
    .from('workers')
    .select('*')
    .or('department.ilike.*recruit*,department.ilike.hr*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
};

// Next free employee_id number (e.g. existing UFS-0042 -> next 43).
export const getNextEmployeeIdNumber = async () => {
  const { rows } = await db._pool.query(`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_id, '\\D', '', 'g'), '')::int), 0) + 1 AS next
    FROM workers
    WHERE employee_id LIKE 'UFS-%'
  `);
  return rows[0].next || 1;
};

export const getWorkerByLoginId = async (login_id) => {
  const { data, error } = await db
    .from('workers')
    .select('*')
    .eq('login_id', login_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

// Email fallback for /auth/worker/login. Deliberately NOT .ilike(): in PostgREST
// an underscore is a single-character wildcard, and addresses like
// first_last@trust.org are common enough that it would match the wrong person.
// Exact case-insensitive comparison, newest row wins to match getWorkerByLoginId.
export const getWorkerByEmail = async (email) => {
  const target = String(email || '').trim();
  if (!target) return null;
  const rows = await sql(
    `SELECT * FROM workers
     WHERE lower(btrim(email)) = lower(btrim($1))
     ORDER BY created_at DESC NULLS LAST
     LIMIT 1`,
    [target]
  );
  return rows[0] || null;
};

// NGO admins are workers with department 'ngo admin'. When ngoId is null the
// caller wants super-admin scoped targets, so return all NGO admins.
export const getNgoAdmins = async (ngo_id) => {
  const { data, error } = await db
    .from('workers')
    .select('id, name, login_id, email, department, ngo_id')
    .ilike('department', 'ngo admin')
    .eq('employment_status', 'active')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;

  const admins = data || [];

  if (ngo_id == null) return admins;

  let allocatedIds = new Set();
  const { data: ids, error: idsErr } = await db
    .from('worker_ngo_allocations')
    .select('worker_id')
    .eq('ngo_id', ngo_id);
  if (idsErr) throw idsErr;
  allocatedIds = new Set((ids || []).map(r => r.worker_id));

  return admins.filter(
    (a) => a.ngo_id === ngo_id || allocatedIds.has(a.id)
  );
};

// Resolve the worker backing a token. Prefer the exact login_id row (the one
// the user logged in with) so FRO dashboards use the correct worker even if
// the workers table has duplicate id rows; fall back to id lookup.
export const getWorkerBySession = async (user) => {
  if (user && user.login_id) {
    const byLogin = await getWorkerByLoginId(user.login_id);
    if (byLogin) return byLogin;
  }
  if (user && isUuid(user.id)) return getWorkerById(user.id);
  return null;
};

// Keep the PREVIOUS spelling resolvable after a rename.
//
// Receipts are keyed by the free text in receipts.agent_name — stamped with
// whatever the collector was called at collection time — and the ONE loader
// behind the FRO's "Collected" card and "View collections" list
// (froDonorLogModel getWorkerCollectionReceipts) matches that text against the
// worker's CURRENT name plus their worker_aliases rows. A rename that only
// updated workers.name therefore orphaned every receipt issued under the old
// name: "Damini Thakur"'s October receipts vanished from "Damini Singh"'s
// card the moment the name was edited. An alias row keeps the old spelling
// answering to the same worker, so the collection history stays credited.
//
// The spelling is added only when NO worker answers to it yet: the resolvers
// (workerNameMatch.loadAliases, froDonorLogModel getAllWorkerNameResolvers)
// are first-wins, so a second claim on the same spelling would credit the
// wrong person. Never throws — a failed alias insert must not fail the rename.
const addNameAlias = async (workerId, oldName) => {
  const alias = String(oldName || '').trim();
  if (!alias) return;
  const norm = (s) => String(s || '').trim().toLowerCase();
  try {
    const { data: all } = await db.from('worker_aliases').select('alias_name');
    const taken = (all || []).some(a => norm(a.alias_name) === norm(alias));
    if (taken) return;
    const { error } = await db.from('worker_aliases').insert({ alias_name: alias, worker_id: workerId });
    if (error) throw error;
    clearCaches(); // workerNameMatch caches workers + aliases in memory
  } catch (e) {
    console.error(`worker rename: could not alias old name "${alias}" -> ${workerId}:`, e?.message || e);
  }
};

// The rename-alias rule in one place, shared with updateWorkerPersonalDetails
// (onboardingModel), which writes workers.name through its own direct update
// rather than through updateWorker. Case/whitespace-only edits are not a
// rename: the collection loader already matches case- and trim-insensitively,
// so no alias is needed for those.
export const preserveOldNameAlias = async (workerId, oldName, newName) => {
  const norm = (s) => String(s || '').trim().toLowerCase();
  if (!oldName || norm(oldName) === norm(newName)) return;
  await addNameAlias(workerId, oldName);
};

export const updateWorker = async (id, updates) => {
  // When a rename is in flight, remember the spelling the receipts already
  // carry so it can be aliased to this worker once the update lands.
  let oldName = null;
  if (updates && typeof updates === 'object' && typeof updates.name === 'string') {
    try {
      const { data: current } = await db.from('workers').select('name').eq('id', id).maybeSingle();
      oldName = current?.name || null;
    } catch (e) {
      oldName = null; // proceed with the rename; worst case the alias is skipped
    }
  }
  const { data, error } = await db
    .from('workers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await preserveOldNameAlias(id, oldName, updates?.name);
  return data;
};

export const deleteWorker = async (id) => {
  const connStr = process.env.DATABASE_URL;
  const client = new pg.Client({
    connectionString: connStr,
    ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  try {
    await client.query('DELETE FROM attendance_corrections WHERE worker_id = $1', [id]);
    await client.query('DELETE FROM attendance WHERE worker_id = $1', [id]);
    await client.query('DELETE FROM leaves WHERE worker_id = $1', [id]);
    await client.query('DELETE FROM worker_loans WHERE worker_id = $1', [id]);
    await client.query('DELETE FROM worker_ngo_allocations WHERE worker_id = $1', [id]);
    await client.query('UPDATE conversations SET assigned_agent_id = NULL WHERE assigned_agent_id = $1', [id]);
    await client.query('DELETE FROM workers WHERE id = $1', [id]);
  } finally {
    await client.end();
  }
  return { message: 'Worker deleted successfully' };
};

export const abscondWorker = async (id) => {
  const { data, error } = await db
    .from('workers')
    .update({ employment_status: 'absconded', is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const offboardWorker = async (id) => {
  const { data, error } = await db
    .from('workers')
    .update({ employment_status: 'offboarded', is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Temporary WhatsApp identity — DERIVED from active grants, never stored.
//
// When an admin grants Temporary Data Access to a station, the working FRO
// must ALSO get that data's WhatsApp identity for exactly the grant window.
// This module derives that identity from live temporary_data_assignments at
// read/send time. It NEVER writes to the permanent assignment tables, so
// revocation and expiry are automatic.
//
// The WhatsApp account given to the temp FRO is the one the STATION'S
// PERMANENT FRO is assigned to — not every number under the NGO. This
// matches the user's intent: "give Laxmi the WhatsApp account that Archna
// (the permanent FRO) is the agent of." A receipts-only number that Archna
// is NOT assigned to (e.g. bsct) will NOT be given to Laxmi.

import db from '../config/db.js';
import { getActiveGrants, getActiveGrantPairs } from './temporaryAccessService.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';
import { projectCodeFromNgoId } from '../models/bankAuditModel.js';
import { phoneVariantsFor, callerProjects } from './whatsappScope.js';

const EMPTY_ALLOTMENT = () => ({ donorIds: [], contactIds: [], phoneVariants: new Set(), pairs: [] });
const EMPTY_ACCESS = () => ({ projects: new Set(), accounts: [], ngoIds: [], pairs: [] });

/**
 * Map a WhatsApp-surface caller id to the WORKER id that grants are keyed on.
 */
export async function resolveTempScopeWorkerId(callerId) {
  if (!callerId) return null;

  // 1) Direct hit: callerId IS a workers.id (FRO/worker login tokens).
  try {
    const { data } = await db.from('workers').select('id').eq('id', callerId).maybeSingle();
    if (data?.id) return data.id;
  } catch (e) { /* fall through */ }

  // 2) worker_agent_assignments: the canonical link used by get_worker_agents
  //    arm 1 (users.id -> workers.id). This is the real path for WhatsApp
  //    agent tokens, since auto-login resolves via this table first.
  try {
    const { data } = await db
      .from('worker_agent_assignments')
      .select('worker_id')
      .eq('user_id', callerId)
      .limit(1)
      .maybeSingle();
    if (data?.worker_id) return data.worker_id;
  } catch (e) { /* table may not exist — fall through */ }

  // 3) crm_agents.worker_id (already-linked agents; table being retired).
  try {
    const { data } = await db.from('crm_agents').select('worker_id').eq('id', callerId).maybeSingle();
    if (data?.worker_id) return data.worker_id;
  } catch (e) { /* retired table */ }

  // 4) Email bridge — fallback for tokens without worker_agent_assignments.
  try {
    const { data: u } = await db.from('users').select('email').eq('id', callerId).maybeSingle();
    const email = u?.email ? String(u.email).trim() : '';
    if (email) {
      const { rows } = await db._pool.query(
        `SELECT id FROM workers WHERE lower(login_id) = lower($1) LIMIT 1`,
        [email],
      );
      if (rows?.[0]?.id) return rows[0].id;
    }
  } catch (e) { /* fall through */ }

  // 5) Give up — return original (might be a workers.id already).
  return callerId;
}

export function grantPairKey(station, ngoId) {
  return `${ngoId ?? ''}|${String(station ?? '').trim()}`;
}

export function mergeAllotments(base, extra) {
  const donorIds = new Set([...(base?.donorIds || []), ...(extra?.donorIds || [])]);
  const contactIds = new Set([...(base?.contactIds || []), ...(extra?.contactIds || [])]);
  const phoneVariants = new Set([...(base?.phoneVariants || []), ...(extra?.phoneVariants || [])]);
  return { donorIds: [...donorIds], contactIds: [...contactIds], phoneVariants };
}

export function classifyProjectAccess(project, { permProjects = [], tempProjects = [], historyProjects = [] } = {}) {
  if (!project) return 'legacy';
  if (permProjects.includes(project)) return 'permanent';
  if (tempProjects instanceof Set ? tempProjects.has(project) : (tempProjects || []).includes(project)) return 'temporary';
  if (historyProjects instanceof Set ? historyProjects.has(project) : (historyProjects || []).includes(project)) return 'temp-ended';
  return 'legacy';
}

export async function getTempWhatsappAccess(workerId) {
  const empty = EMPTY_ACCESS();
  if (!workerId) return empty;

  const resolved = await resolveTempScopeWorkerId(workerId);
  console.log('[getTempWhatsappAccess] input=', workerId, 'resolved=', resolved);
  workerId = resolved;
  if (!workerId) return empty;

  const grants = await getActiveGrants(workerId);
  console.log('[getTempWhatsappAccess] grants=', grants.length, grants.map(g => ({ station: g.station, ngo: g.ngo_id, expires: g.expires_at })));
  if (grants.length === 0) return empty;

  const pairs = [];
  const ngoIdSet = new Set();
  const expiryByStation = new Map();
  for (const g of grants) {
    pairs.push({ station: String(g.station).trim(), ngo_id: g.ngo_id });
    if (g.ngo_id) ngoIdSet.add(g.ngo_id);
    const st = String(g.station).trim();
    const exp = g.expires_at ? new Date(g.expires_at).getTime() : Infinity;
    const cur = expiryByStation.get(st) ?? Infinity;
    if (exp < cur) expiryByStation.set(st, exp);
  }

  const projects = new Set();
  const accounts = [];
  const permanentFroAgentIds = new Set();

  // Derive WhatsApp identity from the STATION'S PERMANENT FRO.
  // Laxmi gets exactly the number Archna (permanent FRO) is assigned to.
  const stationSet = new Set(pairs.map(p => p.station));
  for (const station of stationSet) {
    try {
      const { data: stationRow } = await db
        .from('fro_station_assignments')
        .select('fro_worker_id')
        .eq('station', station)
        .maybeSingle();
      const permFroId = stationRow?.fro_worker_id;
      console.log('[getTempWhatsappAccess] station=', station, 'permFroId=', permFroId);
      if (!permFroId) continue;

      // Resolve permanent FRO's agent id (users.id) so Laxmi can see
      // Archna's claimed conversations on the granted number.
      try {
        const { data: waa } = await db
          .from('worker_agent_assignments')
          .select('user_id')
          .eq('worker_id', permFroId)
          .limit(1)
          .maybeSingle();
        console.log('[getTempWhatsappAccess] station=', station, 'permFroId=', permFroId, 'waa=', waa);
        if (waa?.user_id) {
          permanentFroAgentIds.add(waa.user_id);
        } else {
          const { data: w } = await db.from('workers').select('login_id').eq('id', permFroId).maybeSingle();
          console.log('[getTempWhatsappAccess] station=', station, 'worker login_id=', w?.login_id);
          if (w?.login_id) {
            const { data: u } = await db.from('users').select('id').eq('email', w.login_id).maybeSingle();
            console.log('[getTempWhatsappAccess] station=', station, 'resolved user id=', u?.id);
            if (u?.id) permanentFroAgentIds.add(u.id);
          }
        }
      } catch (e) { console.error('[getTempWhatsappAccess] agent id resolution failed:', e?.message); }

      const { data: froAssigns } = await db
        .from('fro_whatsapp_assignments')
        .select('whatsapp_accounts!inner(id, name, project, phone_number_id, is_active)')
        .eq('fro_worker_id', permFroId)
        .eq('is_active', true);
      console.log('[getTempWhatsappAccess] station=', station, 'permFroId=', permFroId, 'froAssigns=', froAssigns?.length, froAssigns?.map(a => a.whatsapp_accounts?.project));
      for (const a of froAssigns || []) {
        const acct = a.whatsapp_accounts;
        if (!acct || !acct.is_active) continue;
        const proj = String(acct.project || '').toLowerCase();
        if (!proj || projects.has(proj)) continue;
        projects.add(proj);
        accounts.push({
          id: acct.id,
          name: acct.name,
          project: acct.project,
          phone_number_id: acct.phone_number_id,
          temporary: true,
          expires_at: expiryByStation.has(station) ? new Date(expiryByStation.get(station)).toISOString() : null,
        });
      }
    } catch (e) {
      console.error('[temp wa scope] permanent FRO WhatsApp lookup failed for station', station, e?.message || e);
    }
  }

  return { projects, accounts, ngoIds: [...ngoIdSet], pairs, permanentFroAgentIds };
}

export async function loadTempAllotment(workerId) {
  const empty = EMPTY_ALLOTMENT();
  if (!workerId) return empty;

  workerId = await resolveTempScopeWorkerId(workerId);
  if (!workerId) return empty;

  let grants;
  try {
    grants = await getActiveGrants(workerId);
  } catch (e) {
    console.error('[temp wa scope] grant pairs load failed:', e?.message || e);
    return empty;
  }
  if (!grants || grants.length === 0) return empty;

  const stationByNgo = new Map();
  const scopeByPair = new Map();
  for (const g of grants) {
    const ngo = g.ngo_id ?? '';
    if (!stationByNgo.has(ngo)) stationByNgo.set(ngo, new Set());
    stationByNgo.get(ngo).add(String(g.station).trim());
    const key = `${g.ngo_id ?? ''}|${String(g.station).trim()}`;
    scopeByPair.set(key, g.scope_type || 'STATION_ALL');
  }
  const pairs = grants.map(g => ({ station: String(g.station).trim(), ngo_id: g.ngo_id }));
  const ngoIds = [...stationByNgo.keys()].filter(Boolean);
  if (ngoIds.length === 0) return empty;

  let assignments;
  try {
    const { data, error } = await db
      .from('fro_assignments')
      .select('donor_id, ngo_id, station, batch_type, donor_profiles!inner(mobile_number)')
      .in('ngo_id', ngoIds)
      .or('status.is.null,status.neq.reassigned');
    if (error) throw error;
    assignments = data || [];
  } catch (e) {
    if (e?.code === '42P01' || /does not exist/.test(e?.message || '')) return empty;
    throw e;
  }

  const scoped = assignments.filter((a) => {
    const stations = stationByNgo.get(a.ngo_id ?? '');
    if (!stations || !stations.has(String(a.station ?? '').trim())) return false;
    // Tier filtering based on grant scope.
    const key = `${a.ngo_id ?? ''}|${String(a.station ?? '').trim()}`;
    const scope = scopeByPair.get(key) || 'STATION_ALL';
    const isHighTier = a.batch_type === 'high_tier';
    if (scope === 'STATION_HIGH_TIER') return isHighTier;
    if (scope === 'STATION_NORMAL') return !isHighTier;
    return true; // STATION_ALL
  });
  if (scoped.length === 0) return empty;

  const phoneVariants = phoneVariantsFor(scoped.map((a) => a.donor_profiles?.mobile_number));
  if (phoneVariants.size === 0) return empty;

  let contacts;
  try {
    const { data, error } = await db
      .from('contacts')
      .select('id')
      .in('phone_normalized', [...phoneVariants]);
    if (error) throw error;
    contacts = data || [];
  } catch (e) {
    if (e?.code === '42P01' || /does not exist/.test(e?.message || '')) return empty;
    throw e;
  }

  return {
    donorIds: scoped.map((a) => a.donor_id).filter(Boolean),
    contactIds: contacts.map((c) => c.id),
    phoneVariants,
    pairs,
  };
}

async function getTempProjectHistory(workerId) {
  const out = new Set();
  try {
    const { rows } = await db._pool.query(
      `SELECT DISTINCT station FROM temporary_data_assignments WHERE working_fro_worker_id = $1`,
      [workerId],
    );
    for (const r of rows || []) {
      const station = String(r.station || '').trim();
      try {
        const { data: stationRow } = await db
          .from('fro_station_assignments')
          .select('fro_worker_id')
          .eq('station', station)
          .maybeSingle();
        const permFroId = stationRow?.fro_worker_id;
        if (permFroId) {
          const { data: froAssigns } = await db
            .from('fro_whatsapp_assignments')
            .select('whatsapp_accounts!inner(project)')
            .eq('fro_worker_id', permFroId)
            .eq('is_active', true);
          for (const a of froAssigns || []) {
            const p = a.whatsapp_accounts?.project;
            if (p) out.add(String(p).toLowerCase());
          }
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) {
    console.error('[temp wa scope] grant history load failed:', e?.message || e);
  }
  return out;
}

export async function assertFroProjectSend(callerId, project) {
  if (!project) return 'legacy';

  const workerId = await resolveTempScopeWorkerId(callerId) || callerId;

  let permProjects = [];
  try {
    permProjects = (await callerProjects({ userId: callerId, workerId, isWaAdmin: false })) || [];
  } catch (e) {
    console.error('[temp wa scope] permanent project lookup failed:', e?.message || e);
  }
  const temp = await getTempWhatsappAccess(workerId);
  const history = await getTempProjectHistory(workerId);

  const verdict = classifyProjectAccess(project, {
    permProjects,
    tempProjects: temp.projects,
    historyProjects: history,
  });

  if (verdict === 'temp-ended') {
    const err = new Error(
      `Temporary WhatsApp access to \"${project}\" is no longer active. Ask your admin to extend or re-grant the temporary assignment.`,
    );
    err.statusCode = 403;
    throw err;
  }
  return verdict;
}
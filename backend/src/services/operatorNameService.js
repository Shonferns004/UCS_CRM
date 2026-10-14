// Resolve fro_donor_logs.operator_id to a display name.
//
// operator_id carries the ACTOR behind a claim (who was at the keyboard during
// a Work As / cover session) while fro_worker_id carries the COVERED FRO. It has
// deliberately NO foreign key — see migrations/182_fro_donor_logs_operator_id.sql —
// because the id spans two id spaces: workers (a manual cover by a fellow FRO)
// and users (an admin). So a name lookup has to ask both tables.
//
// Reads resolve at query time (no name column is written on the log): historical
// rows keep working and a renamed person shows their current name.

import db from '../config/db.js';

// Pure merge of id -> { name, label, login, workerId }. Later sources never
// overwrite an earlier one, so call order carries precedence.
//
// workerId is the workers row this operator's CREDIT belongs to: everyone
// carries their own id (an admin's users id matches nothing in workers, which
// is the honest answer — an admin collects no FRO cash on their own card).
export const mergeOperatorNameRows = (sources = []) => {
  const map = new Map();
  for (const rows of sources) {
    for (const r of rows || []) {
      if (!r?.id) continue;
      const key = String(r.id);
      if (map.has(key)) continue;
      map.set(key, {
        name: r.name || '',
        label: r.label || r.name || '',
        login: r.login_id || r.email || '',
        workerId: r.worker_id ?? r.id ?? null,
      });
    }
  }
  return map;
};

// Batch-resolve a set of operator ids. Returns Map<id, { name, label, login }>;
// unknown ids are simply absent so callers can fall back to the covered FRO.
// Every lookup is independent and non-fatal: a missing table must not break the
// list being rendered.
export const resolveOperatorNames = async (ids) => {
  const unique = [...new Set((ids || []).filter((v) => v != null && String(v) !== '').map(String))];
  if (unique.length === 0) return new Map();

  const safe = (query) => query.then((r) => (r.error ? [] : r.data || [])).catch(() => []);

  const workers = await safe(db.from('workers').select('id, name, login_id').in('id', unique));
  const map = mergeOperatorNameRows([workers]);

  // Anything still unresolved may be an admin (users). Workers were resolved
  // first so a direct workers hit wins.
  const remaining = unique.filter((id) => !map.has(id));
  if (remaining.length === 0) return map;

  const users = await safe(db.from('users').select('id, name, email').in('id', remaining));
  for (const row of mergeOperatorNameRows([users])) if (!map.has(row[0])) map.set(row[0], row[1]);

  return map;
};

// Single-id convenience for the write paths (receipt / bank-entry stamps).
export const resolveOperatorName = async (id) => {
  if (id == null || String(id) === '') return null;
  const map = await resolveOperatorNames([id]);
  return map.get(String(id)) || null;
};

// Resolve the id the FRO panel credits collections to.
//
// creditWorkerId on the panel is req.user.imposter_id — the OPERATOR. Passing an
// id that matches nothing in workers returned no rows at all, so this maps it
// through the same two-table lookup and falls back to the id itself.
//
// Returns { workerId, name, label } — workerId for the log-link window, name and
// label (the identity this session stamps into receipts.agent_name) for the name
// window. Never throws: an unresolvable id must degrade to the caller's old
// behaviour, not take the dashboard down.
export const resolveCreditTarget = async (id) => {
  if (id == null || String(id) === '') return null;
  try {
    const map = await resolveOperatorNames([id]);
    const hit = map.get(String(id));
    if (!hit) return null;
    return {
      workerId: hit.workerId != null && String(hit.workerId) !== '' ? String(hit.workerId) : String(id),
      name: hit.name || '',
      label: hit.label || '',
    };
  } catch (e) {
    return null;
  }
};

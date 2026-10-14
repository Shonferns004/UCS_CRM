// READ-ONLY. The exact conflicting NGO assignments behind the 5 blocked
// donors, so the source data can be corrected at source.
//
// Reports, per blocked donor: the donor_profiles row, and EVERY active
// fro_assignments row with its ngo_id, ngo name and resolved project code --
// i.e. exactly what has to be corrected, and what it currently says.

import { config as dotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  u.hostname = '127.0.0.1';
  u.port = process.env.DB_TUNNEL_LOCAL_PORT || '15432';
  process.env.DATABASE_URL = u.toString();
}

const db = (await import('../src/config/db.js')).default;
const { resolveDonorProject } = await import('../src/services/whatsappOrgRouting.js');
const { loadAllotment } = await import('../src/services/whatsappScope.js');

const q = (sql, p) => db._pool.query(sql, p);
const login = process.env.DIAG_LOGIN || 'agent1';

const { rows: agent } = await q(
  `SELECT id, label, worker_id FROM crm_agents WHERE lower(login_id) = $1`, [login],
);
if (!agent.length) { console.error(`no crm_agents row for ${login}`); process.exit(1); }

const allotment = await loadAllotment(agent[0].worker_id);

const { rows: donors } = await q(
  `SELECT d.id, d.name, d.mobile_number, d.project_supported
     FROM fro_assignments a
     JOIN donor_profiles d ON d.id = a.donor_id
    WHERE a.fro_worker_id = $1 AND a.status <> 'reassigned'
    ORDER BY d.name`,
  [agent[0].worker_id],
);

const blocked = [];
for (const d of donors) {
  const r = await resolveDonorProject(d.mobile_number, { preferDonorIds: allotment.donorIds });
  if (r.source === 'ambiguous') blocked.push({ donor: d, candidates: r.candidates });
}

console.log(`${login} (${agent[0].label}): ${donors.length} donors allotted, ${blocked.length} blocked as ambiguous\n`);

for (const b of blocked) {
  const d = b.donor;
  console.log('='.repeat(78));
  console.log(`DONOR  donor_profiles.id = ${d.id}   name = ${d.name}`);
  console.log(`       mobile_number = ${d.mobile_number}   project_supported = ${JSON.stringify(d.project_supported)}`);
  console.log(`       resolver candidates = [${b.candidates.join(', ')}]`);

  const { rows: assigns } = await q(
    `SELECT a.id AS fro_assignments_id, a.status, a.station, a.fro_worker_id,
            w.login_id AS worker_login, w.name AS worker_name,
            a.ngo_id, n.name AS ngo_name
       FROM fro_assignments a
       LEFT JOIN ngos n ON n.id = a.ngo_id
       LEFT JOIN workers w ON w.id = a.fro_worker_id
      WHERE a.donor_id = $1
      ORDER BY a.id`,
    [d.id],
  );

  console.log('\n  ACTIVE assignments (status <> \'reassigned\'):');
  for (const a of assigns.filter(x => x.status !== 'reassigned')) {
    console.log(`    fro_assignments.id=${a.fro_assignments_id}  status=${a.status}`);
    console.log(`      ngo_id   = ${a.ngo_id}`);
    console.log(`      ngo.name = ${JSON.stringify(a.ngo_name)}`);
    console.log(`      station  = ${JSON.stringify(a.station)}`);
    console.log(`      worker   = ${a.worker_login} (${a.worker_name})`);
  }
  const inactive = assigns.filter(x => x.status === 'reassigned');
  if (inactive.length) {
    console.log('\n  inactive (NOT counted -- status = reassigned):');
    for (const a of inactive) {
      console.log(`    fro_assignments.id=${a.fro_assignments_id}  ngo_name=${JSON.stringify(a.ngo_name)}`);
    }
  }
  console.log('\n  TO FIX: exactly one of the active assignments above must carry the');
  console.log('  organisation this donor actually belongs to, or the others must be');
  console.log('  marked reassigned. Routing stays blocked until then -- by design.');
}

console.log('\n' + '='.repeat(78));
process.exit(0);
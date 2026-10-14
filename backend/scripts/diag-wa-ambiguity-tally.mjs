// READ-ONLY. Lists every donor in agent1's allotment whose organisation the new
// resolver calls ambiguous, so the reason can be inspected instead of assumed.

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

const { rows: agent } = await db._pool.query(
  `SELECT id, worker_id FROM crm_agents WHERE lower(login_id) = $1`,
  [process.env.DIAG_LOGIN || 'agent1'],
);
const workerId = agent[0]?.worker_id;
const allotment = await loadAllotment(workerId);

const { rows: all } = await db._pool.query(
  `SELECT d.id, d.name, d.mobile_number, n.name AS ngo
     FROM fro_assignments a
     JOIN donor_profiles d ON d.id = a.donor_id
     LEFT JOIN ngos n ON n.id = a.ngo_id
    WHERE a.fro_worker_id = $1
      AND a.status <> 'reassigned'`,
  [workerId],
);

const tally = { routed: 0, ambiguous: 0, unmapped: 0, noDonor: 0 };
const ambiguous = [];

for (const d of all) {
  // Exactly what a send does now: the caller's allotment narrows the candidates.
  const r = await resolveDonorProject(d.mobile_number, { preferDonorIds: allotment.donorIds });
  if (r.source === 'ambiguous') { tally.ambiguous++; ambiguous.push(d); }
  else if (r.project) tally.routed++;
  else if (r.source === 'no-donor') tally.noDonor++;
  else tally.unmapped++;
}

console.log(`agent1 allotment: ${all.length} assignments, ${allotment.donorIds.length} donor rows`);
console.log('resolution tally WITH allotment narrowing:', tally);
console.log('\nstill ambiguous (would be blocked):');
for (const d of ambiguous) {
  const r = await resolveDonorProject(d.mobile_number, { preferDonorIds: allotment.donorIds });
  console.log(`  ${String(d.name).padEnd(24)} ${String(d.mobile_number).padEnd(14)} own-ngo=${String(d.ngo).padEnd(5)} candidates=${r.candidates.join(',')}`);
}

// And the same sample WITHOUT narrowing, for comparison.
let before = { routed: 0, ambiguous: 0, unmapped: 0, noDonor: 0 };
for (const d of all) {
  const r = await resolveDonorProject(d.mobile_number);
  if (r.source === 'ambiguous') before.ambiguous++;
  else if (r.project) before.routed++;
  else if (r.source === 'no-donor') before.noDonor++;
  else before.unmapped++;
}
console.log('\nsame allotment WITHOUT narrowing:', before);

process.exit(0);
// READ-ONLY. Explains WHY a donor resolves as 'ambiguous', so the block can be
// judged rather than assumed. Writes nothing.

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
const { phoneVariantsFor } = await import('../src/services/whatsappScope.js');
const { projectCodeFromNgoId } = await import('../src/models/bankAuditModel.js');
const q = (sql, params) => db._pool.query(sql, params);

for (const target of process.argv.slice(2)) {
  const keys = [...phoneVariantsFor([target])];
  const { rows: donors } = await q(
    `SELECT id, name, mobile_number, project_supported
       FROM donor_profiles WHERE mobile_number = ANY($1)`,
    [keys],
  );
  console.log(`\n=== ${target} -> ${donors.length} donor_profiles row(s) ===`);
  for (const d of donors) {
    const { rows: assigns } = await q(
      `SELECT a.id, a.ngo_id, a.station, a.status, n.name AS ngo
         FROM fro_assignments a LEFT JOIN ngos n ON n.id = a.ngo_id
        WHERE a.donor_id = $1`,
      [d.id],
    );
    console.log(`  donor ${d.id} "${d.name}" mobile=${d.mobile_number} project_supported=${JSON.stringify(d.project_supported)}`);
    for (const a of assigns) {
      let code = null;
      try { code = await projectCodeFromNgoId(a.ngo_id); } catch { /* ignore */ }
      console.log(`     assignment ${a.id} status=${a.status} ngo_id=${a.ngo_id} ngo=${JSON.stringify(a.ngo)} -> ${code}`);
    }
    if (!assigns.length) console.log('     (no assignments)');
  }
}

process.exit(0);
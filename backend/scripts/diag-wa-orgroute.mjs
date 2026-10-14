// READ-ONLY verification of the NEW org routing, against live data.
//
// Imports the real resolver and asks it, for a sample of agent1's donors, which
// WhatsApp number a message would leave from. Sends nothing and writes nothing --
// requireAccountForProject only SELECTs.
//
// Also checks the two things that would break inbound routing: two accounts
// sharing a phone_number_id (getAccountByPhoneNumberId uses maybeSingle and
// throws), and a donor whose number is ambiguous across NGOs.

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
const { resolveDonorProject, resolveOutboundAccount, requireAccountForProject } =
  await import('../src/services/whatsappOrgRouting.js');

const q = (sql, params) => db._pool.query(sql, params);

// ── Inbound routing prerequisite ────────────────────────────────────────────
const { rows: sharedNumbers } = await q(
  `SELECT phone_number_id, count(*)::int AS n
     FROM whatsapp_accounts WHERE is_active
    GROUP BY phone_number_id HAVING count(*) > 1`,
);
console.log('=== inbound account lookup ===');
console.log('active accounts sharing one phone_number_id:', sharedNumbers.length ? sharedNumbers.rows : 'none (getAccountByPhoneNumberId cannot throw)');

// ── Sample agent1 donors through the new resolver ───────────────────────────
const { rows: agent } = await q(
  `SELECT id, worker_id FROM crm_agents WHERE lower(login_id)='agent1'`,
);
const workerId = agent[0]?.worker_id;

const { rows: donors } = await q(
  `SELECT d.id, d.name, d.mobile_number, d.project_supported, a.ngo_id, n.name AS ngo
     FROM fro_assignments a
     JOIN donor_profiles d ON d.id = a.donor_id
     LEFT JOIN ngos n ON n.id = a.ngo_id
    WHERE a.fro_worker_id = $1 AND a.status <> 'reassigned'
    ORDER BY n.name NULLS LAST, d.name
    LIMIT 12`,
  [workerId],
);

console.log('\n=== NEW org routing, sampled from agent1\'s real donors ===');
for (const d of donors) {
  const r = await resolveDonorProject(d.mobile_number);
  let account = null;
  let note = '';
  if (r.project) {
    try {
      const a = await requireAccountForProject(r.project);
      account = `${a.project} -> ${a.account.name}`;
    } catch (e) { note = `REFUSED: ${e.message.slice(0, 70)}`; }
  } else {
    note = `NO ROUTE (${r.source}) -> send would be blocked`;
  }
  console.log(
    `  ${String(d.name).slice(0, 22).padEnd(22)} | ngo=${String(d.ngo).padEnd(5)} | `
    + `-> ${String(r.project).padEnd(5)} via ${String(r.source).padEnd(18)} | ${account || ''} ${note}`,
  );
}

// ── The NULL-project conversation that used to go out as BSCT ───────────────
const { rows: nullConvs } = await q(
  `SELECT c.id, c.project, ct.phone_normalized
     FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.project IS NULL LIMIT 5`,
);
console.log('\n=== conversations with project NULL (previously defaulted to bsct) ===');
for (const c of nullConvs) {
  const r = await resolveDonorProject(c.phone_normalized);
  console.log(`  contact ${c.phone_normalized} -> ${r.project || '(unroutable)'} via ${r.source}`);
}

process.exit(0);
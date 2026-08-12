import 'dotenv/config';
import { Pool } from 'pg';
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const q = async (label, sql) => {
  const { rows } = await p.query(sql);
  console.log(label, JSON.stringify(rows));
};

await q('bank_audit_entries total:', `select count(*)::int as n from bank_audit_entries`);
await q('bank_audit_entries unverified (all time):', `select count(*)::int as n from bank_audit_entries where status='unverified'`);
await q('bank_audit_entries unverified (Aug 2026):', `select count(*)::int as n from bank_audit_entries where status='unverified' and transaction_date>='2026-08-01' and transaction_date<='2026-08-31'`);
await q('bank_audit_entries ANY status (Aug 2026):', `select count(*)::int as n from bank_audit_entries where transaction_date>='2026-08-01' and transaction_date<='2026-08-31'`);
await q('unlinked receipts total:', `select count(*)::int as n from receipts where donor_id is null and log_id is null`);
await q('unlinked receipts (Aug 2026):', `select count(*)::int as n from receipts where donor_id is null and log_id is null and receipt_date>='2026-08-01' and receipt_date<='2026-08-31'`);
await q('unlinked receipts (Aug 2026) by agent/project:', `select project_id, agent_name, count(*)::int as n from receipts where donor_id is null and log_id is null and receipt_date>='2026-08-01' and receipt_date<='2026-08-31' group by 1,2 order by 1,2`);
process.exit(0);

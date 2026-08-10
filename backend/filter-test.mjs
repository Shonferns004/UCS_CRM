import dotenv from 'dotenv';
import path from 'path';
import pg from 'pg';

dotenv.config({ path: 'C:/Users/ADMIN/Desktop/UCS_CRM/backend/.env' });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ngoKw = { bsct: ['bsct','beingsevak','being sevak','sevak'], maan: ['maan','mann','manncar','mann care'], aflf: ['aflf','ashray'] };
const matches = (e, nf) => {
  const src = (e.bank_audit_sources?.name || '').toLowerCase();
  const rem = (e.remarks || '').toLowerCase();
  const prj = (e.project_id || '').toLowerCase();
  const kw = ngoKw[nf] || [];
  return kw.some(k => src.includes(k) || rem.includes(k) || prj.includes(k));
};

const run = async () => {
  const { rows: suspense } = await pool.query(
    `SELECT id, receipt_no, donor_name, donor_mobile, amount, receipt_date, project_id, payment_id, created_at
     FROM receipts WHERE donor_id IS NULL AND agent_name = 'Suspense' AND log_id IS NULL`
  );
  const rows = suspense.filter(r => {
    const d = r.receipt_date instanceof Date ? r.receipt_date.toISOString().slice(0, 7) : String(r.receipt_date || '').slice(0, 7);
    return d === '2026-08';
  });
  const mapped = rows.map(r => ({
    id: `suspense-${r.id}`,
    kind: 'suspense',
    receipt_no: r.receipt_no,
    project_id: r.project_id,
    donor_mobile: r.donor_mobile,
    amount: r.amount,
    payer_name: r.donor_name,
    remarks: `Suspense receipt ${r.receipt_no}`,
    bank_audit_sources: { name: 'Suspense Receipt' },
    status: 'unverified',
  }));

  const byProj = {};
  for (const r of mapped) byProj[r.project_id] = (byProj[r.project_id] || 0) + 1;
  console.log('suspense rows Aug 2026 by project:', JSON.stringify(byProj));

  for (const nf of ['bsct', 'maan', 'aflf']) {
    console.log(`ngoFilter='${nf}' -> ${mapped.filter(e => matches(e, nf)).length} rows`);
  }
  await pool.end();
};
run().catch(e => { console.error(e); process.exit(1); });

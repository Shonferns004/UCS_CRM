const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgresql://ucs_app:xm4BAoZRhOVU3NFW2qLe@localhost:5434/postgres' });
  await c.connect();
  const r1 = await c.query("SELECT id, payer_name, amount, receipt_id, match_status, status, transaction_date FROM bank_audit_entries WHERE payer_name ILIKE '%lad%' ORDER BY transaction_date DESC");
  console.log('=== bank_audit_entries ===');
  console.log(JSON.stringify(r1.rows, null, 2));
  const ids = r1.rows.map(r => r.receipt_id).filter(Boolean);
  if (ids.length) { const r2 = await c.query('SELECT id, donor_name, donor_id, log_id, agent_name, donor_mobile, receipt_date, project_id, receipt_no FROM receipts WHERE id = ANY($1)', [ids]); console.log('=== linked receipts ==='); console.log(JSON.stringify(r2.rows, null, 2)); } else { console.log('=== no linked receipts (receipt_id is NULL) ==='); }
  const r3 = await c.query("SELECT id, donor_name, donor_id, log_id, agent_name, donor_mobile, receipt_date, project_id, receipt_no FROM receipts WHERE donor_name ILIKE '%lad%' AND receipt_date >= '2026-08-01' ORDER BY receipt_date DESC");
  console.log('=== receipts by name ===');
  console.log(JSON.stringify(r3.rows, null, 2));
  await c.end();
})();

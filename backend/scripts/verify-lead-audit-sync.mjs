// Regression check for the Lead <-> Bank Audit sync fixes.
//
// Verifies, against the real database, using a synthetic probe entry that is
// inserted and removed within the run:
//
//   1. findBankAuditEntryForLead() resolves an entry through
//      matched_lead_log_id - the link the old lookup dropped on the floor, so
//      a manually matched entry was never settled.
//   2. findBankAuditEntryForLead() resolves an entry by amount + payer name
//      when the lead has no transaction date to match on.
//   3. settleBankAuditEntry() settles that entry and records the link, so the
//      pair (lead + audit entry) can no longer diverge.
//
// Run: cd backend && node scripts/verify-lead-audit-sync.mjs

import db from '../src/config/db.js';
import { findBankAuditEntryForLead, settleBankAuditEntry } from '../src/services/bankAuditSettleService.js';

let failures = 0;
const ok = (name, extra = '') => console.log(`  PASS  ${name}${extra ? ' :: ' + extra : ''}`);
const fail = (name, extra = '') => { failures++; console.log(`  FAIL  ${name}${extra ? ' :: ' + extra : ''}`); };

const stamp = Date.now();
const PROBE = {
  amount: 987654.32,
  payerName: `REALTIME PROBE ${stamp}`,
  paymentId: `PROBE-${stamp}`,
  logId: 999000000 + (stamp % 100000),
};

const { data: source } = await db.from('bank_audit_sources').select('id').limit(1).maybeSingle();
if (!source?.id) { console.error('no bank_audit_sources row to reference - cannot run the probe'); process.exit(1); }

let probeEntryId = null;

try {
  // ── insert the probe entry ───────────────────────────────────────────────
  const { data: inserted, error: insErr } = await db
    .from('bank_audit_entries')
    .insert({
      source_id: source.id,
      amount: PROBE.amount,
      transaction_date: new Date().toISOString().slice(0, 10),
      payment_id: PROBE.paymentId,
      payer_name: PROBE.payerName,
      status: 'unverified',
      // a manual match link - exactly what the "Link" button writes
      matched_lead_log_id: PROBE.logId,
      match_status: 'matched',
      match_source: 'manual',
    })
    .select('id')
    .maybeSingle();
  if (insErr) { console.error('probe insert failed:', insErr.message); process.exit(1); }
  probeEntryId = inserted?.id;
  if (!probeEntryId) { console.error('probe insert returned no id'); process.exit(1); }
  console.log(`\n(probe entry ${probeEntryId} inserted, log_id ${PROBE.logId})`);

  // ── 1. lookup by matched_lead_log_id ────────────────────────────────────
  console.log('\n== 1. settle lookup finds an entry via matched_lead_log_id ==');
  const byLink = await findBankAuditEntryForLead({
    logId: PROBE.logId,
    receiptId: null,          // deliberately NOT the receipt link
    upiTransactionId: null,   // deliberately NOT the UPI link
    amount: null,             // deliberately NOT the fingerprint link
    transactionDate: null,
    payerName: null,
  });
  if (byLink && String(byLink.id) === String(probeEntryId)) {
    ok(`entry ${probeEntryId} found via matched_lead_log_id=${PROBE.logId}`);
  } else {
    fail(`entry ${probeEntryId} NOT found via matched_lead_log_id=${PROBE.logId}`,
      `got ${byLink ? 'entry ' + byLink.id : 'null'}`);
  }

  // ── 2. lookup by amount + payer name, with no date ──────────────────────
  console.log('\n== 2. settle lookup finds an entry by amount + name when there is no date ==');
  const byAmount = await findBankAuditEntryForLead({
    logId: null,
    receiptId: null,
    upiTransactionId: null,
    amount: PROBE.amount,
    transactionDate: null,    // the lead has no transaction_datetime
    payerName: PROBE.payerName,
  });
  if (byAmount && String(byAmount.id) === String(probeEntryId)) {
    ok(`entry ${probeEntryId} found via amount + payer name (no date)`);
  } else {
    fail(`entry ${probeEntryId} NOT found via amount + payer name (no date)`,
      `got ${byAmount ? 'entry ' + byAmount.id : 'null'}`);
  }

  // ── 3. the settle writes the link back ──────────────────────────────────
  console.log('\n== 3. settleBankAuditEntry settles it and records matched_lead_log_id ==');
  const settled = await settleBankAuditEntry({
    logId: PROBE.logId,
    receipt: null,
    receiptId: null,
    receiptNo: null,
    donorId: null,
    upiTransactionId: null,
    amount: PROBE.amount,
    transactionDate: null,
    payerName: PROBE.payerName,
    userId: null,
  });
  if (!settled) {
    fail('settleBankAuditEntry returned nothing for the probe entry');
  } else {
    const { data: reread } = await db.from('bank_audit_entries')
      .select('status, matched_lead_log_id, match_status')
      .eq('id', probeEntryId).maybeSingle();
    const r = reread?.data || reread;
    if (r?.status === 'verified') ok('probe entry is now verified');
    else fail('probe entry status', `got ${r?.status}`);
    if (String(r?.matched_lead_log_id) === String(PROBE.logId)) ok(`matched_lead_log_id recorded as ${PROBE.logId}`);
    else fail('matched_lead_log_id not recorded', `got ${r?.matched_lead_log_id}`);
    if (r?.match_status === 'confirmed') ok('match_status recorded as confirmed');
    else fail('match_status', `got ${r?.match_status}`);
  }
} finally {
  if (probeEntryId) {
    await db.from('bank_audit_entries').delete().eq('id', probeEntryId);
    console.log(`\n(probe entry ${probeEntryId} removed)`);
  }
}

console.log(failures ? `\nRESULT: ${failures} check(s) FAILED\n` : '\nRESULT: all checks passed\n');
process.exit(failures ? 1 : 0);

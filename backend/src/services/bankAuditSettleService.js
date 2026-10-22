// Shared helper: settle the bank audit entry that belongs to a lead when
// that lead is verified.
//
// Why this exists: a bank audit entry and an FRO lead are two rows for the
// same money. The Audits screen lists entries whose status is still
// 'unverified'. If a lead is verified but the matching audit entry is left
// alone, the entry sits in the Audits tab forever even though the money was
// already collected - it looks like unclaimed money that does not exist.
//
// The lookup used to be: find the entry by receipt_id, else by the lead's
// upi_transaction_id. A SCRAPED entry (created by the payment scrapper) has
// no receipt_id, and the FRO lead often does not carry the UPI reference
// either, so the lookup missed and the entry was never settled.
//
// The lookup is now layered:
//   1. by receipt_id
//   2. by payment_id = lead's upi_transaction_id
//   3. by amount + transaction date + payer name (the scraper's fingerprint)
// and it also covers a lead that has no receipt yet.

import db from '../config/db.js';

/** Normalised name for fuzzy comparison (same rule the scrapper uses). */
const normName = (v) => String(v || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const sameName = (a, b) => {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
};

/**
 * Find the bank audit entry that belongs to this lead.
 * Returns null when there is nothing to settle.
 */
export async function findBankAuditEntryForLead({ logId, receiptId, upiTransactionId, amount, transactionDate, payerName }) {
  // 1. Linked to a receipt already
  if (receiptId) {
    try {
      const { data } = await db.from('bank_audit_entries').select('*').eq('receipt_id', receiptId).maybeSingle();
      if (data) return data;
    } catch (e) { console.error('[settleAudit] receipt lookup failed:', e.message); }
  }

  // 2. Same UPI reference
  if (upiTransactionId) {
    try {
      const { data } = await db.from('bank_audit_entries').select('*')
        .eq('payment_id', String(upiTransactionId))
        .neq('status', 'verified')
        .maybeSingle();
      if (data) return data;
    } catch (e) { console.error('[settleAudit] payment_id lookup failed:', e.message); }
  }

  // 3. Same amount + date + payer name (the scraper's fingerprint)
  if (amount != null && transactionDate) {
    try {
      const { data } = await db.from('bank_audit_entries').select('*')
        .eq('amount', Number(amount))
        .eq('transaction_date', String(transactionDate).slice(0, 10))
        .neq('status', 'verified')
        .limit(20);
      const rows = data || [];
      for (const row of rows) {
        if (sameName(row.payer_name, payerName)) return row;
      }
      // A lead whose payer field is empty still matches an entry that has no
      // payer name at all - do not leave the entry behind for that.
      if (rows.length === 1 && !normName(payerName) && !normName(rows[0].payer_name)) return rows[0];
    } catch (e) { console.error('[settleAudit] fingerprint lookup failed:', e.message); }
  }

  return null;
}

/**
 * Mark the bank audit entry as verified and link it to the lead + receipt.
 * Safe to call when there is no entry - it simply does nothing.
 */
export async function settleBankAuditEntry({ logId, receipt, receiptId, receiptNo, donorId, upiTransactionId, amount, transactionDate, payerName, userId }) {
  try {
    const entry = await findBankAuditEntryForLead({
      logId,
      receiptId: receiptId || receipt?.id || null,
      upiTransactionId,
      amount,
      transactionDate,
      payerName,
    });
    if (!entry) return null;
    if (entry.status === 'verified') return entry;

    const patch = {
      status: 'verified',
      donor_id: donorId ?? entry.donor_id ?? null,
      matched_lead_log_id: logId,
      match_status: 'confirmed',
      matched_by: userId || null,
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      receipt_id: receipt?.id ?? receiptId ?? entry.receipt_id ?? null,
      receipt_no: receipt?.receipt_no ?? receiptNo ?? entry.receipt_no ?? null,
    };
    if (!entry.match_no) {
      try {
        const { rows } = await db._pool.query("SELECT nextval('bank_audit_match_no_seq') AS n");
        patch.match_no = 'MTCH-' + String(rows[0].n).padStart(6, '0');
      } catch (e) { console.error('[settleAudit] match no allocation failed:', e.message); }
    }
    const { data, error } = await db.from('bank_audit_entries').update(patch).eq('id', entry.id).select('*').single();
    if (error) throw error;
    console.log(`[settleAudit] entry ${entry.id} verified for lead ${logId}`);
    return data;
  } catch (e) {
    console.error('[settleAudit] failed to settle bank audit entry:', e.message);
    return null;
  }
}

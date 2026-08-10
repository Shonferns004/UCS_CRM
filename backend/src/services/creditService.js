import db from '../config/db.js';
import { getNextReceiptNo } from '../models/bankAuditModel.js';
import { sendPushNotification } from './fcmService.js';

// Credit a bank audit entry whose suggested match (matched_lead_log_id) was
// confirmed by Accounts. Links the entry's generated receipt (or creates one)
// to the donor + lead, credits donor totals and the FRO's collected, and closes
// the open assignment. Idempotent: refuses to double-credit.
export const confirmMatchCredit = async (entryId, actorId) => {
  const { data: entry, error: eErr } = await db
    .from('bank_audit_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle();
  if (eErr) throw eErr;
  if (!entry) return { error: 404, message: 'Entry not found' };
  if (entry.status === 'verified') return { error: 409, message: 'This entry is already verified' };
  if (!entry.matched_lead_log_id || entry.match_status !== 'matched') {
    return { error: 409, message: 'No pending match to confirm for this entry' };
  }

  const logId = entry.matched_lead_log_id;
  const { data: log, error: lErr } = await db
    .from('fro_donor_logs')
    .select(`
      id, amount_collected, action, disposition_detail, accounts_status, fro_worker_id,
      fro_assignments!inner(
        id, fro_worker_id, donor_id,
        donor_profiles!inner(id, name, mobile_number, project_supported)
      )
    `)
    .eq('id', logId)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!log) return { error: 404, message: 'Matched lead not found' };
  if (log.accounts_status !== 'pending') return { error: 409, message: 'Matched lead is already processed' };

  const assignment = log.fro_assignments;
  const donor = assignment?.donor_profiles;
  const donorId = assignment?.donor_id;
  if (!donorId || !donor) return { error: 400, message: 'Matched lead is missing donor info' };

  const amount = Number(entry.amount || 0);
  const now = new Date().toISOString();
  const date = entry.transaction_date || new Date().toISOString().slice(0, 10);

  const result = await db.transaction(async ({ from }) => {
    await from('bank_audit_entries').update({
      status: 'verified',
      donor_id: donorId,
      match_status: 'confirmed',
      matched_by: actorId,
      matched_at: now,
      updated_at: now,
    }).eq('id', entry.id);

    await from('fro_donor_logs').update({
      accounts_status: 'verified',
      verified_at: now,
      verified_by: actorId,
    }).eq('id', log.id);

    await from('fro_assignments').update({
      status: 'donation_collected',
      last_contacted_at: now,
    }).eq('id', assignment.id);

    const { data: donorRow } = await from('donor_profiles')
      .select('total_amount, donation_count, last_donation_date')
      .eq('id', donorId)
      .single();
    await from('donor_profiles').update({
      total_amount: Math.round(((donorRow?.total_amount || 0) + amount) * 100) / 100,
      donation_count: (donorRow?.donation_count || 0) + 1,
      last_donation_date: !donorRow?.last_donation_date || date > donorRow.last_donation_date ? date : donorRow.last_donation_date,
      updated_at: now,
    }).eq('id', donorId);

    let receipt = null;
    if (entry.receipt_id) {
      const { data: updated } = await from('receipts').update({
        donor_id: donorId,
        log_id: log.id,
        project_id: donor.project_supported || entry.project_id || 'bsct',
        donor_name: donor.name || entry.payer_name || null,
      }).eq('id', entry.receipt_id).select().single();
      receipt = updated;
    } else {
      const receiptNo = await getNextReceiptNo(donor.project_supported || entry.project_id || 'bsct');
      const { data: created } = await from('receipts').insert({
        log_id: log.id,
        receipt_no: receiptNo,
        project_id: donor.project_supported || entry.project_id || 'bsct',
        donor_name: donor.name || entry.payer_name || 'Unknown',
        donor_mobile: donor.mobile_number || null,
        amount,
        payment_id: entry.payment_id || null,
        receipt_date: date,
        purpose: 'Bank Audit Match',
        generated_by: actorId,
        donor_id: donorId,
      }).select().single();
      receipt = created;
    }

    return { donor_id: donorId, log_id: log.id, amount, receipt_no: receipt?.receipt_no || null, receipt_id: receipt?.id || null };
  });

  const froWorkerId = log.fro_worker_id || assignment?.fro_worker_id;
  if (froWorkerId) {
    try {
      const notifTitle = 'Lead Verified';
      const notifBody = `Your lead for ${donor.name || 'donor'} (\u20B9${amount.toLocaleString('en-IN')}) was verified. Receipt: ${result.receipt_no || ''}`;
      let fcmLogged = false;
      try {
        const pushResult = await sendPushNotification(froWorkerId, notifTitle, notifBody, 'lead_verified', log.id);
        fcmLogged = !!pushResult;
      } catch (err) { console.error('FCM send error:', err.message); }
      if (!fcmLogged) {
        await db.from('notification_log').insert({
          worker_id: froWorkerId,
          type: 'lead_verified',
          title: notifTitle,
          body: notifBody,
          fro_donor_log_id: String(log.id),
          sent_at: now,
        });
      }
    } catch (err) { console.error('Failed to create verified notification:', err.message); }
  }

  return { ...result, message: 'Match confirmed and credited' };
};

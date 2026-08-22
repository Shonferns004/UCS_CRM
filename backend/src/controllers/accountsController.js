import db from '../config/db.js';
import { createReceipt, findReceiptByLogId } from '../models/receiptModel.js';
import { sendPushNotification } from '../services/fcmService.js';
import { confirmMatchCredit } from '../services/creditService.js';
import { getEntryByPaymentId, getNextReceiptNo, isBlankSuspenseValue, projectCodeFromNgoId, cancelReceiptNo, getReceiptNumbers as modelGetReceiptNumbers } from '../models/bankAuditModel.js';
import { nameMatch } from '../services/autoMatchService.js';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getLeadList = async (req, res) => {
  try {
    const { status } = req.query;

    let query = db
      .from('fro_donor_logs')
      .select(`
        id, action, disposition_category, disposition_detail, amount_collected,
        payment_screenshot_url, accounts_status, pan_number, notes, remark, created_at, verified_at,
        upi_transaction_id, transaction_datetime, payment_from, payment_mode,
        assignment_id, fro_worker_id,
        workers!fro_donor_logs_fro_worker_id_fkey(id, name, login_id),
        fro_assignments!inner(
          id,
          donor_id,
          fro_worker_id,
          ngo_id,
          status,
          ngos!left(id, name),
          donor_profiles!inner(id, name, mobile_number, city, pan_number, address_1, email, project_supported, donation_count, total_amount, birth_date, donors_bank_name),
          workers!inner(id, name, login_id)
        )
      `)
      .eq('action', 'disposition')
      .eq('disposition_detail', 'lead_done')
      .not('fro_worker_id', 'is', null)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('accounts_status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    const logIds = (data || []).map(r => r.id);
    const receiptMap = {};
    let entrySourceMap = {};
    let entryPayerMap = {};
    const leadMatchMap = {};
    if (logIds.length) {
      const { data: claimedReceipts, error: receiptErr } = await db
        .from('receipts')
        .select('id, receipt_no, donor_id, donor_mobile, donor_name, bank_payer_name, payment_id, mode, pan_number, log_id')
        .in('log_id', logIds);
      if (!receiptErr) {
        for (const rc of (claimedReceipts || [])) {
          if (rc.log_id != null && !receiptMap[rc.log_id]) receiptMap[rc.log_id] = rc;
        }
        const receiptIds = (claimedReceipts || []).map(rc => rc.id).filter(Boolean);
        if (receiptIds.length) {
          const { data: linkedEntries } = await db
            .from('bank_audit_entries')
            .select('receipt_id, source_id, payer_name, bank_audit_sources(name)')
            .in('receipt_id', receiptIds);
          entrySourceMap = {};
          entryPayerMap = {};
          for (const en of (linkedEntries || [])) {
            if (en.receipt_id != null) entrySourceMap[en.receipt_id] = en.bank_audit_sources?.name || null;
            if (en.receipt_id != null && en.payer_name) entryPayerMap[en.receipt_id] = en.payer_name;
          }
        }
      }

      const { data: matchedEntries, error: matchErr } = await db
        .from('bank_audit_entries')
        .select('id, matched_lead_log_id, match_status, match_source, match_no, match_score, payment_id, check_id, payer_name, transaction_date, payment_time, receipt_id, donor_pan, donor_address_1, donor_address_2')
        .in('matched_lead_log_id', logIds)
        .in('match_status', ['matched', 'confirmed']);
      if (!matchErr) {
        for (const me of (matchedEntries || [])) {
          if (me.matched_lead_log_id != null && !leadMatchMap[me.matched_lead_log_id]) {
            leadMatchMap[me.matched_lead_log_id] = me;
          }
        }
      }
    }

    const result = (data || []).map(r => {
      const profile = r.fro_assignments?.donor_profiles || {};
      const match = leadMatchMap[r.id] || null;
      const profileAddr = [profile.address_1, profile.address_2].filter(Boolean).join(', ');
      const matchAddr = match ? [match.donor_address_1, match.donor_address_2].filter(Boolean).join(', ') : '';
      // The linked bank audit entry is the source of truth for the money
      // details shown on the pending lead: its payment id, txn time, payer, and
      // mode override what was stored at claim time (works for already-claimed
      // leads too, not just new claims).
      const matchTxn = match?.transaction_date
        ? (() => {
            const d = String(match.transaction_date);
            const datePart = d.includes('T') ? d.slice(0, 10) : d;
            // Bank payment times are IST wall-clock; send with the explicit
            // offset so it displays as the bank's time regardless of browser tz.
            return match.payment_time ? `${datePart}T${match.payment_time}+05:30` : `${datePart}T00:00:00+05:30`;
          })()
        : null;
      const matchMode = (match?.payment_id || match?.check_id) ? (match.payment_id ? 'UPI' : 'Cheque') : null;
      return {
      log_id: r.id,
      amount: r.amount_collected,
      screenshot_url: r.payment_screenshot_url,
      accounts_status: r.accounts_status,
      pan_number: r.pan_number || receiptMap[r.id]?.pan_number || '',
      notes: r.notes,
      remark: r.remark,
      rejection_reason: r.rejection_reason,
      created_at: r.created_at,
      assignment_id: r.assignment_id,
      assignment_status: r.fro_assignments?.status || 'lead_done',
      donor_id: r.fro_assignments?.donor_id,
      donor_name: r.fro_assignments?.donor_profiles?.name || 'Unknown',
      original_payer: receiptMap[r.id]?.bank_payer_name || receiptMap[r.id]?.donor_name || entryPayerMap[receiptMap[r.id]?.id] || '',
      audit_name: receiptMap[r.id]?.bank_payer_name || receiptMap[r.id]?.donor_name || entryPayerMap[receiptMap[r.id]?.id] || r.fro_assignments?.donor_profiles?.bank_donor_name || '',
      donor_mobile: r.fro_assignments?.donor_profiles?.mobile_number || receiptMap[r.id]?.donor_mobile || '',
      donor_city: r.fro_assignments?.donor_profiles?.city || '',
      donor_pan: profile.pan_number || match?.donor_pan || r.pan_number || '',
      donor_address: profileAddr || matchAddr || '',
      donor_address_2: profile.address_2 || match?.donor_address_2 || '',
      donor_email: r.fro_assignments?.donor_profiles?.email || '',
      donor_bank_name: r.fro_assignments?.donor_profiles?.donors_bank_name || '',
      donor_project: (r.fro_assignments?.ngos?.name === 'BSCT' ? 'bsct' : r.fro_assignments?.ngos?.name === 'AFLF' ? 'aflf' : r.fro_assignments?.ngos?.name === 'MANN' ? 'mann' : r.fro_assignments?.donor_profiles?.project_supported) || '',
      donor_dob: r.fro_assignments?.donor_profiles?.birth_date || '',
      donation_count: r.fro_assignments?.donor_profiles?.donation_count || 0,
      total_donated: r.fro_assignments?.donor_profiles?.total_amount || 0,
      upi_transaction_id: (match && match.payment_id) ? match.payment_id : (r.upi_transaction_id || receiptMap[r.id]?.payment_id || null),
      transaction_datetime: matchTxn || r.transaction_datetime || null,
      payment_from: (match && match.payer_name) ? match.payer_name : (r.payment_from || receiptMap[r.id]?.bank_payer_name || receiptMap[r.id]?.donor_name || null),
      payment_mode: matchMode || r.payment_mode || receiptMap[r.id]?.mode || null,
      verified_at: r.verified_at || null,
      agent_id: r.fro_worker_id,
      agent_name: r.fro_assignments?.workers?.name || 'Priyank Shah',
      agent_login: r.fro_assignments?.workers?.login_id || '',
      claimant_name: r.workers?.name || r.fro_assignments?.workers?.name || 'Priyank Shah',
      claimant_login: r.workers?.login_id || r.fro_assignments?.workers?.login_id || '',
      claimed_receipt: receiptMap[r.id] || null,
      received_source: entrySourceMap[receiptMap[r.id]?.id] || null,
      bank_match: match
        ? {
            entry_id: match.id,
            match_status: match.match_status,
            match_source: match.match_source || 'auto',
            match_no: match.match_no || null,
            match_score: match.match_score || null,
          }
        : null,
    };
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const verifyLead = async (req, res) => {
  try {
    const { logId } = req.params;
    const {
      pan_number, notes,
      donor_name, donor_receipt_name, donor_mobile, donor_city, donor_email, donor_pan, donor_address, donor_dob,
      upi_transaction_id, transaction_datetime, payment_from, payment_mode,
    } = req.body;

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, ngo_id, ngos(name), workers!left(name), donor_profiles!inner(id, name, mobile_number, city, address_1, address_2, email, pan_number, project_supported, donors_bank_name))')
      .eq('id', logId)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }
    const log = logs[0];

    if (log.accounts_status !== 'pending') {
      return res.status(400).json({ message: `This lead has already been ${log.accounts_status || 'processed'}` });
    }

    const assignmentId = log.fro_assignments?.id;
    const donorProfile = log.fro_assignments?.donor_profiles;
    if (!assignmentId || !donorProfile) {
      return res.status(400).json({ message: 'Associated assignment/donor not found' });
    }

    // The NGO a lead is assigned under is the per-lead truth for which project
    // (and therefore which receipt-number sequence) its money belongs to. The
    // donor profile's project_supported is only a fallback — it is frequently
    // unset, which would wrongly fall through to the 'bsct' default and give an
    // Ashray receipt the next number from the BSCT sequence.
    let project = donorProfile?.project_supported || 'bsct';
    try {
      project = await projectCodeFromNgoId(log.fro_assignments?.ngo_id) || project;
    } catch (err) { console.error('Failed to resolve project from assignment NGO:', err.message); }

    // ── Manual bank-audit link path ─────────────────────────────────────────
    // Accounts can pick an unmatched bank audit entry next to the UPI id. That
    // entry is linked + credited through the same pipeline as a confirmed
    // auto-match. If no entry is picked, fall back to an already manually
    // linked entry (from the lead-detail "Save" action) so Verify reuses it.
    const { bank_audit_entry_id } = req.body;
    let linkedEntryId = bank_audit_entry_id || null;
    if (!linkedEntryId) {
      try {
        const { data: autoLinked } = await db
          .from('bank_audit_entries')
          .select('id')
          .eq('matched_lead_log_id', logId)
          .eq('match_status', 'matched')
          .eq('match_source', 'manual')
          .maybeSingle();
        if (autoLinked?.id) linkedEntryId = autoLinked.id;
      } catch (err) { console.error('Failed to find manually linked entry:', err.message); }
    }

    if (linkedEntryId) {
      const { data: linkedEntry, error: leErr } = await db
        .from('bank_audit_entries')
        .select('id, status, match_status, matched_lead_log_id')
        .eq('id', linkedEntryId)
        .maybeSingle();
      if (leErr) throw leErr;
      if (!linkedEntry) return res.status(400).json({ message: 'Selected bank audit entry not found' });
      if (linkedEntry.status === 'verified') return res.status(400).json({ message: 'Selected bank audit entry is already verified' });
      if (linkedEntry.match_status && linkedEntry.matched_lead_log_id != null && String(linkedEntry.matched_lead_log_id) !== String(logId)) {
        return res.status(409).json({ message: 'Selected bank audit entry is already matched to another lead' });
      }

      const donorId = log.fro_assignments?.donor_id;
      if (donorId) {
        const donorUpdate = { updated_at: new Date().toISOString() };
        if (donor_name !== undefined) donorUpdate.name = donor_name || null;
        if (donor_mobile !== undefined) donorUpdate.mobile_number = donor_mobile || null;
        if (donor_city !== undefined) donorUpdate.city = donor_city || null;
        if (donor_email !== undefined) donorUpdate.email = donor_email || null;
        if (donor_pan !== undefined || pan_number) donorUpdate.pan_number = pan_number || donor_pan || null;
        if (donor_address !== undefined) donorUpdate.address_1 = donor_address || null;
        if (donor_dob !== undefined) donorUpdate.birth_date = donor_dob || null;
        try { await db.from('donor_profiles').update(donorUpdate).eq('id', donorId); }
        catch (err) { console.error('Failed to update donor profile:', err); }
      }

      // Log edits (kept pending; the credit step sets it verified).
      const logPatch = {};
      if (pan_number !== undefined) logPatch.pan_number = pan_number || null;
      if (notes !== undefined) logPatch.notes = notes || null;
      if (upi_transaction_id !== undefined) logPatch.upi_transaction_id = upi_transaction_id || null;
      if (transaction_datetime !== undefined) logPatch.transaction_datetime = transaction_datetime || null;
      if (payment_from !== undefined) logPatch.payment_from = payment_from || null;
      if (payment_mode !== undefined) logPatch.payment_mode = payment_mode || null;
      if (Object.keys(logPatch).length > 0) {
        await db.from('fro_donor_logs').update(logPatch).eq('id', logId);
      }

      if (!linkedEntry.match_status) {
        await db.from('bank_audit_entries').update({
          matched_lead_log_id: logId,
          match_status: 'matched',
          match_source: 'manual',
          matched_by: req.user.id,
          matched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', linkedEntry.id);
      }

      const credit = await confirmMatchCredit(linkedEntry.id, req.user.id);
      if (credit?.error) return res.status(credit.error).json({ message: credit.message });
      return res.status(200).json({ ...credit, message: 'Lead verified and bank audit entry credited' });
    }

    const donorId = log.fro_assignments?.donor_id;

    // Apply the Accounts-entered lead edits immediately (these never change the
    // lead's accounts_status, so a later failure keeps the lead pending and
    // visible in Lead Verification).
    const logPatch = { pan_number: pan_number || log.pan_number || null, notes: notes || log.notes || null };
    if (upi_transaction_id !== undefined) logPatch.upi_transaction_id = upi_transaction_id || null;
    if (transaction_datetime !== undefined) logPatch.transaction_datetime = transaction_datetime || null;
    if (payment_from !== undefined) logPatch.payment_from = payment_from || null;
    if (payment_mode !== undefined) logPatch.payment_mode = payment_mode || null;
    const { error: patchLogError } = await db
      .from('fro_donor_logs')
      .update(logPatch)
      .eq('id', logId);
    if (patchLogError) throw patchLogError;

    // Create or link the receipt BEFORE the lead is marked verified: if any of
    // this fails the lead stays pending (still in Lead Verification, retryable)
    // instead of vanishing. The verified flag is written only at the very end.
    const existing = await findReceiptByLogId(logId);
    let receipt = existing || null;
    if (!existing) {
      const donorName = donor_receipt_name || donorProfile?.name || 'Unknown';
      const receiptData = {
        log_id: parseInt(logId),
        project_id: project,
        donor_name: donorName,
        donor_mobile: donorProfile?.mobile_number || null,
        amount: log.amount_collected || 0,
        pan_number: pan_number || log.pan_number || donorProfile?.pan_number || null,
        address: [donor_address || donorProfile?.address_1, donorProfile?.address_2].filter(Boolean).join(', ') || null,
        email: donorProfile?.email || null,
        bank_name: donorProfile?.donors_bank_name || null,
        mode: payment_mode || null,
        purpose: 'General Donation',
        generated_by: req.user.id,
        donor_id: donorId,
        receipt_date: transaction_datetime || log.transaction_datetime || new Date().toISOString(),
      };
      // A receipt-number collision (UNIQUE project_id + receipt_no) can happen
      // when the counter fell behind the numbers already on file; the counter
      // advances on every allocation, so retry with a fresh number instead of
      // failing the verify.
      let receiptNo = await getNextReceiptNo(project);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          receipt = await createReceipt({ ...receiptData, receipt_no: receiptNo });
          break;
        } catch (createErr) {
          const msg = String(createErr?.message || createErr || '');
          const isDup = createErr?.code === '23505' || /duplicate key/i.test(msg);
          if (!isDup || attempt === 2) throw createErr;
          receiptNo = await getNextReceiptNo(project);
          console.error(`Receipt number collision on verify (attempt ${attempt + 1}), retrying:`, msg);
        }
      }
    } else {
      // Receipt already exists (e.g. created for a bank audit entry or a suspense
      // claim). Link it to the verified donor and mark its bank audit entry done.
      const profileName = donorProfile?.name;
      const oldPayerName = existing.donor_name && existing.donor_name !== profileName ? existing.donor_name : null;
      const receiptPatch = {
        donor_id: donorId,
        donor_name: donor_receipt_name || profileName || existing.donor_name || 'Unknown',
        donor_mobile: donorProfile?.mobile_number || existing.donor_mobile || null,
        bank_payer_name: existing.bank_payer_name || oldPayerName || null,
        bank_name: donorProfile?.donors_bank_name || null,
        address: [donor_address || donorProfile?.address_1, donorProfile?.address_2].filter(Boolean).join(', ') || null,
        agent_name: existing.agent_name === 'Suspense' ? (log.fro_assignments?.workers?.name || existing.agent_name) : existing.agent_name,
      };
      if (!existing.receipt_no) {
        existing.receipt_no = await getNextReceiptNo(existing.project_id || project);
        receiptPatch.receipt_no = existing.receipt_no;
      }
      const { error: linkReceiptErr } = await db.from('receipts').update(receiptPatch).eq('id', existing.id);
      if (linkReceiptErr) throw new Error(`Failed to link existing receipt to donor: ${linkReceiptErr.message}`);
      try {
        await db.from('bank_audit_entries').update({
          donor_id: donorId,
          status: 'verified',
          matched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          receipt_no: existing.receipt_no || null,
        }).eq('receipt_id', existing.id);
      } catch (err) { console.error('Failed to mark bank audit entry verified:', err.message); }
    }

    // Settle the bank audit entry for this money (linked to the receipt, or
    // matching the lead's UPI transaction id) so it leaves the audit fully
    // credited (status verified, linked to the lead + receipt) instead of a
    // bare "verified" row.
    try {
      let bankEntry = null;
      try {
        const { data } = await db.from('bank_audit_entries').select('*').eq('receipt_id', receipt.id).maybeSingle();
        bankEntry = data || null;
      } catch (err) { console.error('Failed to find entry by receipt:', err.message); }
      if (!bankEntry && upi_transaction_id) {
        try { bankEntry = await getEntryByPaymentId(upi_transaction_id); }
        catch (err) { console.error('Failed to find entry by payment id:', err.message); }
      }
      if (bankEntry && bankEntry.status !== 'verified') {
        const settlePatch = {
          status: 'verified',
          donor_id: donorId,
          matched_lead_log_id: logId,
          match_status: 'confirmed',
          matched_by: req.user.id,
          matched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          receipt_id: receipt.id,
          receipt_no: receipt.receipt_no || null,
        };
        if (!bankEntry.match_no) {
          try {
            const { rows } = await db._pool.query("SELECT nextval('bank_audit_match_no_seq') AS n");
            settlePatch.match_no = 'MTCH-' + String(rows[0].n).padStart(6, '0');
          } catch (err) { console.error('Match no allocation failed:', err.message); }
        }
        await db.from('bank_audit_entries').update(settlePatch).eq('id', bankEntry.id);
      }
    } catch (err) { console.error('Failed to settle bank audit entry on verify:', err.message); }

    // Everything the receipt depends on has succeeded — only now mark the lead
    // verified (this is what removes it from Lead Verification) and credit the
    // donor + assignment.
    const now = new Date().toISOString();
    const { error: updateLogError } = await db
      .from('fro_donor_logs')
      .update({
        accounts_status: 'verified',
        verified_at: now,
        verified_by: req.user.id,
      })
      .eq('id', logId);

    if (updateLogError) throw updateLogError;

    const { error: updateAsgnError } = await db
      .from('fro_assignments')
      .update({
        status: 'donation_collected',
        last_contacted_at: now,
      })
      .eq('id', assignmentId);

    if (updateAsgnError) throw updateAsgnError;

    if (donorId) {
      const donorUpdate = { updated_at: now };
      if (donor_name !== undefined) donorUpdate.name = donor_name || null;
      if (donor_mobile !== undefined) donorUpdate.mobile_number = donor_mobile || null;
      if (donor_city !== undefined) donorUpdate.city = donor_city || null;
      if (donor_email !== undefined) donorUpdate.email = donor_email || null;
      if (donor_pan !== undefined || pan_number) donorUpdate.pan_number = pan_number || donor_pan || null;
      if (donor_address !== undefined) donorUpdate.address_1 = donor_address || null;
      if (donor_dob !== undefined) donorUpdate.birth_date = donor_dob || null;
      try {
        const { data: donor } = await db
          .from('donor_profiles')
          .select('total_amount, donation_count')
          .eq('id', donorId)
          .single();
        donorUpdate.total_amount = (donor?.total_amount || 0) + (log.amount_collected || 0);
        donorUpdate.donation_count = (donor?.donation_count || 0) + 1;
        await db.from('donor_profiles').update(donorUpdate).eq('id', donorId);
      } catch (err) { console.error('Failed to update donor totals:', err); }
    }

    // Notify FRO that their lead was verified (FCM + notification_log)
    const froWorkerId = log.fro_worker_id;
    const donorName = log.fro_assignments?.donor_profiles?.name || 'Unknown';
    if (froWorkerId) {
      try {
        const notifTitle = 'Lead Verified';
        const notifBody = `Your lead for ${donorName} (₹${log.amount_collected || 0}) has been verified. Receipt: ${receipt?.receipt_no || ''}`;
        const refId = /^\d+$/.test(String(logId)) ? parseInt(logId) : null;
        let fcmLogged = false;
        try {
          const pushResult = await sendPushNotification(froWorkerId, notifTitle, notifBody, 'lead_verified', refId);
          fcmLogged = !!pushResult;
        } catch (err) { console.error('FCM send error:', err.message); }
        if (!fcmLogged) {
          await db.from('notification_log').insert({
            worker_id: froWorkerId,
            type: 'lead_verified',
            title: notifTitle,
            body: notifBody,
            fro_donor_log_id: String(logId),
            sent_at: new Date().toISOString(),
          });
        }
      } catch (err) { console.error('Failed to create verified notification:', err.message); }
    }

    return res.json({ message: 'Lead verified, receipt generated', receipt });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Done Lead ─────────────────────────────────────────────
// Simplified verify for leads where the receipt already exists (e.g. receipt_sent
// flow: Accounts created the receipt, FRO claimed, now Accounts just closes out).

export const doneLead = async (req, res) => {
  try {
    const { logId } = req.params;

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, ngo_id, ngos(name), workers!left(name), donor_profiles!inner(id, name, mobile_number, city, address_1, address_2, email, pan_number, project_supported, donors_bank_name))')
      .eq('id', logId)
      .limit(1);
    if (logError || !logs || logs.length === 0) return res.status(404).json({ message: 'Log entry not found' });
    const log = logs[0];
    if (log.accounts_status !== 'pending') {
      return res.status(400).json({ message: `This lead has already been ${log.accounts_status || 'processed'}` });
    }

    const assignment = log.fro_assignments;
    const donorProfile = assignment?.donor_profiles;
    const donorId = assignment?.donor_id;
    if (!assignment?.id || !donorProfile) return res.status(400).json({ message: 'Associated assignment/donor not found' });

    const existing = await findReceiptByLogId(logId);
    if (!existing?.receipt_no) {
      return res.status(400).json({ message: 'No receipt found for this lead — use Verify instead' });
    }

    const amount = Number(log.amount_collected || 0);
    const now = new Date().toISOString();

    const result = await db.transaction(async ({ from }) => {
      // Mark the lead verified.
      await from('fro_donor_logs').update({
        accounts_status: 'verified',
        verified_at: now,
        verified_by: req.user.id,
      }).eq('id', logId);

      // Update assignment.
      await from('fro_assignments').update({
        status: 'donation_collected',
        last_contacted_at: now,
      }).eq('id', assignment.id);

      // Credit donor totals.
      const { data: donorRow } = await from('donor_profiles')
        .select('total_amount, donation_count, last_donation_date')
        .eq('id', donorId)
        .single();
      const date = now.slice(0, 10);
      await from('donor_profiles').update({
        total_amount: Math.round(((donorRow?.total_amount || 0) + amount) * 100) / 100,
        donation_count: (donorRow?.donation_count || 0) + 1,
        last_donation_date: !donorRow?.last_donation_date || date > donorRow.last_donation_date ? date : donorRow.last_donation_date,
        updated_at: now,
      }).eq('id', donorId);

      // Mark any linked bank_audit_entries as verified.
      try {
        await from('bank_audit_entries').update({
          status: 'verified',
          matched_at: now,
          updated_at: now,
        }).eq('receipt_id', existing.id);
      } catch (err) { console.error('Failed to mark bank audit entry verified:', err.message); }

      return { receipt_no: existing.receipt_no };
    });

    // Notify the FRO.
    const froWorkerId = log.fro_worker_id;
    const froName = log.fro_assignments?.workers?.name || 'An FRO';
    if (froWorkerId) {
      try {
        const notifTitle = 'Lead Completed';
        const notifBody = `Lead for ${donorProfile.name || 'donor'} (₹${amount.toLocaleString('en-IN')}) completed. Receipt: ${result.receipt_no}`;
        let fcmLogged = false;
        try {
          const pushResult = await sendPushNotification(froWorkerId, notifTitle, notifBody, 'lead_verified', parseInt(logId));
          fcmLogged = !!pushResult;
        } catch (err) { console.error('FCM send error:', err.message); }
        if (!fcmLogged) {
          await db.from('notification_log').insert({
            worker_id: froWorkerId,
            type: 'lead_verified',
            title: notifTitle,
            body: notifBody,
            fro_donor_log_id: String(logId),
            sent_at: now,
          });
        }
      } catch (err) { console.error('Failed to create done notification:', err.message); }
    }

    return res.json({ message: 'Lead completed', receipt_no: result.receipt_no });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Quick Verify (Priyank Shah default) ────────────────────
// When a lead has no FRO agent, accounts can quickly verify it under the
// default agent name "Priyank Shah" without filling donor details.

export const quickVerifyLead = async (req, res) => {
  try {
    const { logId } = req.params;
    const { donor_name, donor_mobile, donor_pan, donor_address, donor_city, donor_email, project } = req.body;

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, ngo_id, ngos(name), donor_profiles!inner(id, name, mobile_number, city, address_1, address_2, email, pan_number, project_supported, donors_bank_name))')
      .eq('id', logId)
      .limit(1);

    if (logError || !logs || logs.length === 0) return res.status(404).json({ message: 'Lead not found' });
    const log = logs[0];
    if (log.accounts_status !== 'pending') return res.status(400).json({ message: `Lead is already ${log.accounts_status}` });

    const assignmentId = log.fro_assignments?.id;
    const donorProfile = log.fro_assignments?.donor_profiles;
    if (!assignmentId) return res.status(400).json({ message: 'No assignment found' });

    let resolvedProject = project || donorProfile?.project_supported || 'bsct';
    try { resolvedProject = await projectCodeFromNgoId(log.fro_assignments?.ngo_id) || resolvedProject; } catch {}

    const finalDonorName = donor_name || 'Priyank Shah';

    const existing = await findReceiptByLogId(logId);
    let receipt = existing || null;

    if (!existing) {
      const receiptNo = await getNextReceiptNo(resolvedProject);
      receipt = await createReceipt({
        log_id: parseInt(logId),
        receipt_no: receiptNo,
        project_id: resolvedProject,
        donor_name: finalDonorName,
        donor_mobile: donor_mobile || donorProfile?.mobile_number || null,
        amount: log.amount_collected || 0,
        pan_number: donor_pan || donorProfile?.pan_number || null,
        address: donor_address || donorProfile?.address_1 || null,
        email: donor_email || donorProfile?.email || null,
        bank_name: donorProfile?.donors_bank_name || null,
        mode: log.payment_mode || null,
        purpose: 'General Donation',
        agent_name: 'Priyank Shah',
        generated_by: req.user.id,
        donor_id: log.fro_assignments?.donor_id || null,
        receipt_date: log.transaction_datetime || new Date().toISOString(),
      });
    } else {
      await db.from('receipts').update({
        donor_name: finalDonorName,
        agent_name: 'Priyank Shah',
        donor_mobile: donor_mobile || existing.donor_mobile || null,
      }).eq('id', existing.id);
    }

    const now = new Date().toISOString();
    await db.from('fro_donor_logs').update({
      accounts_status: 'verified',
      verified_at: now,
      verified_by: req.user.id,
    }).eq('id', logId);

    await db.from('fro_assignments').update({
      status: 'donation_collected',
      last_contacted_at: now,
    }).eq('id', assignmentId);

    const donorId = log.fro_assignments?.donor_id;
    if (donorId) {
      try {
        const { data: donor } = await db.from('donor_profiles').select('total_amount, donation_count').eq('id', donorId).single();
        await db.from('donor_profiles').update({
          total_amount: (donor?.total_amount || 0) + (log.amount_collected || 0),
          donation_count: (donor?.donation_count || 0) + 1,
          updated_at: now,
        }).eq('id', donorId);
      } catch (err) { console.error('Failed to update donor totals:', err.message); }
    }

    return res.json({ message: 'Lead verified under Priyank Shah', receipt });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Suspense ─────────────────────────────────────────────

export const getSuspenseList = async (req, res) => {
  try {
    const { status } = req.query;
    let query = db
      .from('suspense_donations')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return res.json(data || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const createSuspense = async (req, res) => {
  try {
    const { donor_name, amount, transaction_date, notes } = req.body;
    if (!donor_name || !amount) {
      return res.status(400).json({ message: 'Donor name and amount are required' });
    }

    const { data, error } = await db
      .from('suspense_donations')
      .insert({ donor_name, amount, transaction_date, notes })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const addSuspenseNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ message: 'Notes are required' });

    const { data: existing } = await db
      .from('suspense_donations')
      .select('notes')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ message: 'Suspense entry not found' });

    const updatedNotes = existing.notes
      ? existing.notes + '\n---\n' + new Date().toLocaleString() + ': ' + notes
      : new Date().toLocaleString() + ': ' + notes;

    const { data, error } = await db
      .from('suspense_donations')
      .update({ notes: updatedNotes })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const assignSuspense = async (req, res) => {
  try {
    const { id } = req.params;
    const { fro_worker_id } = req.body;
    if (!fro_worker_id) return res.status(400).json({ message: 'FRO worker ID is required' });

    const { data, error } = await db
      .from('suspense_donations')
      .update({ assigned_to_fro_id: fro_worker_id, assigned_at: new Date().toISOString(), status: 'resolved' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const rejectLead = async (req, res) => {
  try {
    const { logId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, ngo_id, station, donor_profiles!inner(id, name, mobile_number))')
      .eq('id', logId)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }
    const log = logs[0];

    if (log.accounts_status !== 'pending') {
      return res.status(400).json({ message: `This lead has already been ${log.accounts_status || 'processed'}` });
    }

    const assignmentId = log.fro_assignments?.id;
    if (!assignmentId) {
      return res.status(400).json({ message: 'Associated assignment not found' });
    }

    const { error: updateLogError } = await db
      .from('fro_donor_logs')
      .update({
        accounts_status: 'rejected',
        rejection_reason: reason,
        verified_by: req.user.id,
        verified_at: new Date().toISOString(),
        notes: reason,
      })
      .eq('id', logId);

    if (updateLogError) throw updateLogError;

    const { error: updateAsgnError } = await db
      .from('fro_assignments')
      .update({
        status: 'payment_rejected',
        last_contacted_at: new Date().toISOString(),
        notes: reason,
      })
      .eq('id', assignmentId);

    if (updateAsgnError) throw updateAsgnError;

    // Return any suspense receipt attached to the rejected lead back to the
    // suspense pool (unclaimed) so another FRO can claim it.
    try {
      await db.from('receipts').update({ log_id: null }).eq('log_id', parseInt(logId, 10));
    } catch (err) { console.error('Failed to clear receipt log_id on rejection:', err.message); }

    if (log.fro_assignments?.donor_id) {
      await db.from('donor_profiles').update({ updated_at: new Date().toISOString() }).eq('id', log.fro_assignments.donor_id);
    }

    const froWorkerId = log.fro_worker_id;
    const assignmentNgoId = log.fro_assignments?.ngo_id;
    const assignmentStation = log.fro_assignments?.station;
    const donorName = log.fro_assignments?.donor_profiles?.name || 'Unknown';
    let froNotified = false;
    let ticketCreated = false;

    const notifTitle = 'Lead Rejected by Accounts';
    const notifBody = `Your lead for ${donorName} (₹${log.amount_collected || 0}) was rejected. Reason: ${reason}`;
    const refId = /^\d+$/.test(String(logId)) ? parseInt(logId) : null;

    if (froWorkerId) {
      let fcmLogged = false;
      try {
        const pushResult = await sendPushNotification(froWorkerId, notifTitle, notifBody, 'lead_rejected', refId);
        fcmLogged = !!pushResult;
      } catch (err) { console.error('FCM send error:', err.message); }

      if (!fcmLogged) {
        try {
          await db.from('notification_log').insert({
            worker_id: froWorkerId,
            type: 'lead_rejected',
            title: notifTitle,
            body: notifBody,
            fro_donor_log_id: String(logId),
            sent_at: new Date().toISOString(),
          });
        } catch (err) { console.error('Failed to create notification_log entry:', err.message); }
      }
      froNotified = true;
    }

    // Determine ngo_id (integer): worker_ngo_allocations > assignment's ngo_id > station's ngo_id
    let ngoId = null;
    if (froWorkerId) {
      try {
        const { data: alloc } = await db
          .from('worker_ngo_allocations')
          .select('ngo_id')
          .eq('worker_id', froWorkerId)
          .not('ngo_id', 'is', null)
          .limit(1)
          .maybeSingle();
        if (alloc?.ngo_id) ngoId = alloc.ngo_id;
      } catch (err) { console.error('Failed to fetch worker ngo allocation:', err.message); }
    }
    if (!ngoId && assignmentNgoId && typeof assignmentNgoId === 'number') {
      ngoId = assignmentNgoId;
    }
    if (!ngoId && assignmentStation) {
      try {
        const { data: stationAssign } = await db
          .from('fro_station_assignments')
          .select('ngo_id')
          .eq('station', assignmentStation)
          .not('ngo_id', 'is', null)
          .limit(1)
          .maybeSingle();
        if (stationAssign?.ngo_id) ngoId = stationAssign.ngo_id;
      } catch (err) { console.error('Failed to fetch station ngo:', err.message); }
    }

    try {
      await db.from('rejected_lead_tickets').insert({
        fro_donor_log_id: logId,
        fro_worker_id: froWorkerId,
        ngo_id: ngoId,
        donor_name: donorName,
        amount: log.amount_collected || 0,
        rejection_reason: reason,
        status: 'pending_review',
      });
      ticketCreated = true;
    } catch (err) { console.error('Failed to create rejected lead ticket:', err.message); }

    if (ngoId) {
      try {
        await db.from('alerts').insert({
          ngo_id: ngoId,
          type: 'lead_rejected',
          title: 'Lead Rejected',
          description: `${donorName} (₹${log.amount_collected || 0}) lead rejected. Reason: ${reason}`,
          donor_name: donorName,
        });
      } catch (err) { console.error('Failed to create alert:', err.message); }
    }

    return res.json({ message: 'Lead rejected', froWorkerId, froNotified, ticketCreated });  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Send a lead back to the FRO as if the lead_done disposition never happened.
// Works for pending (incl. suspense-claimed) and already-verified leads: any
// verification side-effects are reversed, the claimed suspense receipt returns
// to the pool, the disposition log is removed, and the assignment reopens so the
// FRO can rework it from scratch.
export const goBackLead = async (req, res) => {
  try {
    const { logId } = req.params;
    const { reason } = req.body || {};

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, donor_profiles!inner(id, name, mobile_number))')
      .eq('id', logId)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }
    const log = logs[0];

    if (log.action !== 'disposition' || log.disposition_detail !== 'lead_done') {
      return res.status(400).json({ message: 'Only lead verification entries can be sent back' });
    }

    if (!['pending', 'verified'].includes(log.accounts_status)) {
      return res.status(400).json({ message: `This lead is ${log.accounts_status || 'processed'} and cannot be sent back` });
    }

    const assignmentId = log.fro_assignments?.id;
    const donorId = log.fro_assignments?.donor_id;

    // Reverse verification side-effects if the lead was already verified.
    if (log.accounts_status === 'verified') {
      const { error: revertError } = await db
        .from('fro_donor_logs')
        .update({ accounts_status: 'pending', verified_at: null, verified_by: null })
        .eq('id', logId);
      if (revertError) throw revertError;

      if (donorId) {
        try {
          const { data: donor } = await db
            .from('donor_profiles')
            .select('total_amount, donation_count')
            .eq('id', donorId)
            .single();
          const amount = Number(log.amount_collected || 0);
          await db.from('donor_profiles').update({
            total_amount: Math.max(0, (donor?.total_amount || 0) - amount),
            donation_count: Math.max(0, (donor?.donation_count || 0) - 1),
            updated_at: new Date().toISOString(),
          }).eq('id', donorId);
        } catch (err) { console.error('Failed to reverse donor totals on go-back:', err.message); }
      }
    }

    // Receipt handling: revert any linked bank audit entry, then either delete
    // a verification-only receipt or release the money back to the pool. Either
    // way the receipt number is cancelled so it can be reused.
    const receipt = await findReceiptByLogId(logId);
    if (receipt) {
      const { data: entry } = await db.from('bank_audit_entries').select('id').eq('receipt_id', receipt.id).maybeSingle();
      if (entry) {
        const { error: eErr } = await db.from('bank_audit_entries').update({
          status: 'unverified',
          donor_id: null,
          donor_mobile: null,
          donor_email: null,
          donor_pan: null,
          donor_address_1: null,
          donor_address_2: null,
          donor_city: null,
          donor_pin_code: null,
          matched_lead_log_id: null,
          match_status: null,
          match_score: null,
          matched_at: null,
          receipt_id: null,
          receipt_no: null,
          updated_at: new Date().toISOString(),
        }).eq('id', entry.id);
        if (eErr) console.error('Failed to revert bank audit entry on go-back:', eErr.message);
      }

      if (receipt.purpose === 'General Donation' && !entry) {
        try { await db.from('receipts').delete().eq('id', receipt.id); }
        catch (err) { console.error('Failed to delete verification receipt on go-back:', err.message); }
      } else {
        try { await db.from('receipts').update({ log_id: null, donor_id: null, receipt_no: null }).eq('id', receipt.id); }
        catch (err) { console.error('Failed to release receipt on go-back:', err.message); }
      }

      // Free the cancelled number(s) so the next receipt continues from the
      // last live number instead of skipping over them.
      try { await cancelReceiptNo(receipt.project_id); }
      catch (err) { console.error('Failed to cancel receipt number on go-back:', err.message); }
    }

    // Revert an entry auto-verified from the lead's UPI transaction id.
    if (log.upi_transaction_id) {
      try {
        const autoEntry = await getEntryByPaymentId(log.upi_transaction_id, 'verified');
        if (autoEntry?.id) {
          await db.from('bank_audit_entries').update({ status: 'unverified', updated_at: new Date().toISOString() }).eq('id', autoEntry.id);
        }
      } catch (err) { console.error('Failed to revert auto-verified entry on go-back:', err.message); }
    }

    // Clear child references, then remove the disposition log (cleared disposition).
    try { await db.from('notification_log').delete().in('fro_donor_log_id', [logId]); }
    catch (err) { console.warn('notification_log cleanup skipped:', err.message); }
    try { await db.from('rejected_lead_tickets').delete().in('fro_donor_log_id', [logId]); }
    catch (err) { console.warn('rejected_lead_tickets cleanup skipped:', err.message); }
    const { error: delError } = await db.from('fro_donor_logs').delete().eq('id', logId);
    if (delError) throw delError;

    // Reopen the assignment so the FRO sees the lead again and can rework it.
    if (assignmentId) {
      const { error: asgnError } = await db
        .from('fro_assignments')
        .update({ status: 'pending', last_contacted_at: new Date().toISOString() })
        .eq('id', assignmentId);
      if (asgnError) throw asgnError;
    }

    // Notify the FRO that their lead was sent back.
    const froWorkerId = log.fro_worker_id;
    const donorName = log.fro_assignments?.donor_profiles?.name || 'Unknown';
    if (froWorkerId) {
      const notifTitle = 'Lead Sent Back';
      const notifBody = reason
        ? `Your lead for ${donorName} (\u20B9${log.amount_collected || 0}) was sent back. Reason: ${reason}`
        : `Your lead for ${donorName} (\u20B9${log.amount_collected || 0}) was sent back \u2014 please rework it.`;
      const refId = /^\d+$/.test(String(logId)) ? parseInt(logId, 10) : null;
      let fcmLogged = false;
      try {
        const pushResult = await sendPushNotification(froWorkerId, notifTitle, notifBody, 'lead_sent_back', refId);
        fcmLogged = !!pushResult;
      } catch (err) { console.error('FCM send error:', err.message); }
      if (!fcmLogged) {
        try {
          await db.from('notification_log').insert({
            worker_id: froWorkerId,
            type: 'lead_sent_back',
            title: notifTitle,
            body: notifBody,
            fro_donor_log_id: String(logId),
            sent_at: new Date().toISOString(),
          });
        } catch (err) { console.error('Failed to create notification_log entry:', err.message); }
      }
    }

    return res.json({ message: 'Lead sent back to the FRO', log_id: logId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const undoLeadVerification = async (req, res) => {
  try {
    const { logId } = req.params;

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, donor_id, donor_profiles!inner(id, name, mobile_number))')
      .eq('id', logId)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }
    const log = logs[0];

    if (log.action !== 'disposition' || log.disposition_detail !== 'lead_done') {
      return res.status(400).json({ message: 'Only lead verification entries can be undone' });
    }

    if (log.accounts_status !== 'verified') {
      return res.status(400).json({ message: `This lead is ${log.accounts_status || 'processed'} and cannot be undone` });
    }

    const donorId = log.fro_assignments?.donor_id;
    const assignmentId = log.fro_assignments?.id;

    // Bring the lead back to Lead Verification.
    const { error: revertError } = await db
      .from('fro_donor_logs')
      .update({ accounts_status: 'pending', verified_at: null, verified_by: null })
      .eq('id', logId);
    if (revertError) throw revertError;

    // Reopen the assignment so the donor's status returns to pending.
    if (assignmentId) {
      try {
        await db
          .from('fro_assignments')
          .update({ status: 'pending', last_contacted_at: new Date().toISOString() })
          .eq('id', assignmentId);
      } catch (err) { console.error('Failed to reopen assignment on undo:', err.message); }
    }

    // Reverse the donor totals added during verification.
    if (donorId) {
      try {
        const { data: donor } = await db
          .from('donor_profiles')
          .select('total_amount, donation_count')
          .eq('id', donorId)
          .single();
        const amount = Number(log.amount_collected || 0);
        await db.from('donor_profiles').update({
          total_amount: Math.max(0, (donor?.total_amount || 0) - amount),
          donation_count: Math.max(0, (donor?.donation_count || 0) - 1),
          updated_at: new Date().toISOString(),
        }).eq('id', donorId);
      } catch (err) { console.error('Failed to reverse donor totals on undo:', err.message); }
    }

    // Cancel the receipt: a verification-only receipt is deleted outright; a
    // receipt tied to bank money is released back to the pool. Either way the
    // number is freed so the next verification reuses it. The linked bank audit
    // entry is sent back to Bank Audit (unverified, unlinked).
    const receipt = await findReceiptByLogId(logId);
    if (receipt) {
      const { data: entry } = await db.from('bank_audit_entries').select('id').eq('receipt_id', receipt.id).maybeSingle();
      if (entry) {
        const { error: eErr } = await db.from('bank_audit_entries').update({
          status: 'unverified',
          donor_id: null,
          donor_mobile: null,
          donor_email: null,
          donor_pan: null,
          donor_address_1: null,
          donor_address_2: null,
          donor_city: null,
          donor_pin_code: null,
          matched_lead_log_id: null,
          match_status: null,
          match_score: null,
          matched_at: null,
          receipt_id: null,
          receipt_no: null,
          updated_at: new Date().toISOString(),
        }).eq('id', entry.id);
        if (eErr) console.error('Failed to revert bank audit entry on undo:', eErr.message);
      }

      if (receipt.purpose === 'General Donation' && !entry && !receipt.sent) {
        try { await db.from('receipts').delete().eq('id', receipt.id); }
        catch (err) { console.error('Failed to delete receipt on undo:', err.message); }
      } else {
        try { await db.from('receipts').update({ log_id: null, donor_id: null, receipt_no: null }).eq('id', receipt.id); }
        catch (err) { console.error('Failed to unlink receipt on undo:', err.message); }
      }
      try { await cancelReceiptNo(receipt.project_id); }
      catch (err) { console.error('Failed to cancel receipt number on undo:', err.message); }
    }

    // Revert an entry auto-verified from the lead's UPI transaction id.
    if (log.upi_transaction_id) {
      try {
        const autoEntry = await getEntryByPaymentId(log.upi_transaction_id, 'verified');
        if (autoEntry?.id) {
          await db.from('bank_audit_entries').update({ status: 'unverified', updated_at: new Date().toISOString() }).eq('id', autoEntry.id);
        }
      } catch (err) { console.error('Failed to revert auto-verified entry on undo:', err.message); }
    }

    // Clear child references.
    try { await db.from('notification_log').delete().in('fro_donor_log_id', [logId]); }
    catch (err) { console.warn('notification_log cleanup skipped:', err.message); }
    try { await db.from('rejected_lead_tickets').delete().in('fro_donor_log_id', [logId]); }
    catch (err) { console.warn('rejected_lead_tickets cleanup skipped:', err.message); }

    return res.json({ message: 'Lead returned to Lead Verification', log_id: logId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Universal receipt go-back: works for ANY receipt (with or without log_id,
// from manual verify, bank audit, lead verification, CSV import, etc.).
export const undoReceipt = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { data: receipt, error: rErr } = await db
      .from('receipts').select('*').eq('id', receiptId).maybeSingle();
    if (rErr) throw rErr;
    if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

    const donorId = receipt.donor_id;
    const logId = receipt.log_id;
    const projectId = receipt.project_id;

    // 1. Revert linked bank_audit_entry if any.
    const { data: entry } = await db.from('bank_audit_entries')
      .select('id').eq('receipt_id', receipt.id).maybeSingle();
    if (entry) {
      await db.from('bank_audit_entries').update({
        status: 'unverified', donor_id: null, agent_name: null,
        donor_mobile: null, donor_email: null, donor_pan: null,
        donor_address_1: null, donor_address_2: null, donor_city: null, donor_pin_code: null,
        matched_lead_log_id: null, match_status: null, match_score: null,
        matched_by: null, matched_at: null,
        receipt_id: null, receipt_no: null, updated_at: new Date().toISOString(),
      }).eq('id', entry.id);
    }

    // 2. Revert fro_donor_log if linked.
    if (logId) {
      try {
        const { data: log } = await db.from('fro_donor_logs')
          .select('id, action, disposition_detail, accounts_status, amount_collected, fro_worker_id, fro_assignments!inner(id, status, donor_id, ngo_id)')
          .eq('id', logId).maybeSingle();
        if (log) {
          // Revert the log to pending.
          await db.from('fro_donor_logs').update({
            accounts_status: 'pending', verified_at: null, verified_by: null,
          }).eq('id', logId);
          // Reopen assignment if it was donation_collected.
          const asgn = log.fro_assignments;
          if (asgn?.id && asgn.status === 'donation_collected') {
            await db.from('fro_assignments').update({
              status: 'pending', last_contacted_at: new Date().toISOString(),
            }).eq('id', asgn.id);
          }
          // Reverse donor totals.
          if (asgn?.donor_id && log.accounts_status === 'verified') {
            try {
              const { data: donor } = await db.from('donor_profiles')
                .select('total_amount, donation_count').eq('id', asgn.donor_id).single();
              const amt = Number(log.amount_collected || 0);
              await db.from('donor_profiles').update({
                total_amount: Math.max(0, (donor?.total_amount || 0) - amt),
                donation_count: Math.max(0, (donor?.donation_count || 0) - 1),
                updated_at: new Date().toISOString(),
              }).eq('id', asgn.donor_id);
            } catch (e) { console.error('donor totals revert failed:', e.message); }
          }
          // Clean up child references.
          try { await db.from('notification_log').delete().in('fro_donor_log_id', [logId]); } catch (_) {}
          try { await db.from('rejected_lead_tickets').delete().in('fro_donor_log_id', [logId]); } catch (_) {}
        }
      } catch (e) { console.error('fro_donor_log revert failed:', e.message); }
    }

    // 3. Reverse donor totals from the receipt itself (if no log but has donor_id).
    if (donorId && !logId) {
      try {
        const { data: donor } = await db.from('donor_profiles')
          .select('total_amount, donation_count').eq('id', donorId).single();
        const amt = Number(receipt.amount || 0);
        await db.from('donor_profiles').update({
          total_amount: Math.max(0, (donor?.total_amount || 0) - amt),
          donation_count: Math.max(0, (donor?.donation_count || 0) - 1),
          updated_at: new Date().toISOString(),
        }).eq('id', donorId);
      } catch (e) { console.error('donor totals revert (receipt-level) failed:', e.message); }
    }

    // 4. Delete the receipt and free the number.
    await db.from('receipts').delete().eq('id', receipt.id);
    try { await cancelReceiptNo(projectId); } catch (_) {}

    return res.json({ message: 'Receipt undone — returned to Bank Audit', receipt_id: receipt.id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const { logId } = req.params;

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select('id, action, disposition_detail, accounts_status, fro_worker_id, fro_assignments!inner(id, status, donor_id, fro_worker_id)')
      .eq('id', logId)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }
    const log = logs[0];

    if (log.action !== 'disposition' || log.disposition_detail !== 'lead_done') {
      return res.status(400).json({ message: 'Only lead verification entries can be deleted' });
    }

    if (log.accounts_status !== 'pending') {
      return res.status(400).json({ message: `Only pending leads can be deleted (this one is ${log.accounts_status || 'processed'})` });
    }

    // Release any suspense-claim receipt linked to this lead back to the pool
    // (also required to satisfy the receipts->fro_donor_logs FK before deleting).
    try {
      const receipt = await findReceiptByLogId(logId);
      if (receipt) {
        await db.from('receipts').update({ log_id: null, donor_id: null }).eq('id', receipt.id);
      }
    } catch (err) { console.warn('Failed to release linked receipt on delete:', err.message); }

    const { error: delError } = await db
      .from('fro_donor_logs')
      .delete()
      .eq('id', logId);
    if (delError) throw delError;

    // Delete the orphaned assignment
    const assignmentId = log.fro_assignments?.id;
    if (assignmentId) {
      const { error: asgnError } = await db
        .from('fro_assignments')
        .delete()
        .eq('id', assignmentId);
      if (asgnError) throw asgnError;
    }

    return res.json({ message: 'Lead deleted', log_id: logId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteAllPendingLeads = async (req, res) => {
  try {
    const { data: logs, error: listError } = await db
      .from('fro_donor_logs')
      .select('id, assignment_id')
      .eq('action', 'disposition')
      .eq('disposition_detail', 'lead_done')
      .eq('accounts_status', 'pending');

    if (listError) throw listError;

    const ids = (logs || []).map(l => l.id);
    const assignmentIds = [...new Set((logs || []).map(l => l.assignment_id).filter(Boolean))];

    if (ids.length > 0) {
      // Release any linked receipts to satisfy FK before deleting logs
      try {
        await db.from('receipts').update({ log_id: null, donor_id: null }).in('log_id', ids);
      } catch (e) { console.warn('Failed to release receipts on bulk delete:', e.message); }

      const { error: delError } = await db
        .from('fro_donor_logs')
        .delete()
        .in('id', ids);
      if (delError) throw delError;
    }

    // Delete orphaned assignments
    if (assignmentIds.length > 0) {
      const { error: asgnError } = await db
        .from('fro_assignments')
        .delete()
        .in('id', assignmentIds);
      if (asgnError) throw asgnError;
    }

    return res.json({ message: 'Pending leads deleted', deleted: ids.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Inline Field Update ───────────────────────────────────

const ALLOWED_FIELDS = ['upi_transaction_id', 'transaction_datetime', 'payment_from', 'payment_mode', 'pan_number', 'notes', 'remark',
  'donor_name', 'donor_mobile', 'donor_city', 'donor_email', 'donor_pan', 'donor_address', 'donor_dob'];

const DONOR_FIELD_MAP = {
  donor_name: 'name',
  donor_mobile: 'mobile_number',
  donor_city: 'city',
  donor_email: 'email',
  donor_pan: 'pan_number',
  donor_address: 'address_1',
  donor_dob: 'birth_date',
};

export const patchLeadField = async (req, res) => {
  try {
    const { logId } = req.params;
    const { field, value } = req.body;

    if (!field || !ALLOWED_FIELDS.includes(field)) {
      return res.status(400).json({ message: `Invalid field. Allowed: ${ALLOWED_FIELDS.join(', ')}` });
    }

    const isDonorField = field in DONOR_FIELD_MAP;

    if (isDonorField) {
      const { data: logs, error: logError } = await db
        .from('fro_donor_logs')
        .select('id, fro_assignments!inner(donor_id)')
        .eq('id', logId)
        .limit(1);

      if (logError || !logs || logs.length === 0) {
        return res.status(404).json({ message: 'Log entry not found' });
      }
      const log = logs[0];

      const donorId = log.fro_assignments?.donor_id;
      if (!donorId) {
        return res.status(400).json({ message: 'Donor not associated with this lead' });
      }

      const donorColumn = DONOR_FIELD_MAP[field];
      const { error: updateError } = await db
        .from('donor_profiles')
        .update({ [donorColumn]: value === '' ? null : value, updated_at: new Date().toISOString() })
        .eq('id', donorId);

      if (updateError) throw updateError;

      return res.json({ message: 'Field updated', field, value: value === '' ? null : value });
    }

    const { data: log, error: logError } = await db
      .from('fro_donor_logs')
      .select('id, accounts_status')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    const updateData = {};
    updateData[field] = value === '' ? null : value;

    const { error: updateError } = await db
      .from('fro_donor_logs')
      .update(updateData)
      .eq('id', logId);

    if (updateError) throw updateError;

    return res.json({ message: 'Field updated', field, value: updateData[field] });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Receipts ──────────────────────────────────────────────

export const generateReceipt = async (req, res) => {
  try {
    const { logId } = req.params;
    const { pan_number, address, mode, purpose } = req.body;

    const existing = await findReceiptByLogId(logId);
    if (existing) {
      return res.json({ receipt: existing, message: 'Receipt already exists' });
    }

    const { data: logs, error: logError } = await db
      .from('fro_donor_logs')
      .select(`
        id, amount_collected, pan_number, notes, transaction_datetime, verified_at,
        fro_assignments!inner(
          donor_id,
          fro_worker_id,
          ngo_id,
          ngos(name),
          donor_profiles!inner(id, name, mobile_number, city, address_1, address_2, email, pan_number, project_supported, donors_bank_name),
          workers!inner(id, name, login_id)
        )
      `)
      .eq('id', logId)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }
    const log = logs[0];

    const donorProfile = log.fro_assignments?.donor_profiles;
    let project = donorProfile?.project_supported || 'bsct';
    try {
      project = await projectCodeFromNgoId(log.fro_assignments?.ngo_id) || project;
    } catch (err) { console.error('Failed to resolve project from assignment NGO:', err.message); }
    const donorName = donorProfile?.name || 'Unknown';

    const receiptNo = await getNextReceiptNo(project);

    const donorId = log.fro_assignments?.donor_id;
    const receipt = await createReceipt({
      log_id: logId,
      receipt_no: receiptNo,
      project_id: project,
      donor_name: donorName,
      donor_mobile: donorProfile?.mobile_number || null,
      amount: log.amount_collected || 0,
      pan_number: pan_number || log.pan_number || donorProfile?.pan_number || null,
      address: address || [donorProfile?.address_1, donorProfile?.address_2].filter(Boolean).join(', ') || null,
      email: donorProfile?.email || null,
      bank_name: donorProfile?.donors_bank_name || null,
      mode: mode || null,
      purpose: purpose || 'General Donation',
      generated_by: req.user.id,
      donor_id: donorId,
      receipt_date: log.transaction_datetime || log.verified_at || new Date().toISOString(),
    });

    return res.status(201).json({ receipt, message: 'Receipt generated' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getReceipt = async (req, res) => {
  try {
    const { logId } = req.params;
    const receipt = await findReceiptByLogId(logId);
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    return res.json(receipt);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getReceiptList = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const search = (req.query.search || '').trim();
    const project = (req.query.project || '').trim();
    const link = (req.query.link === 'suspense' || req.query.link === 'unlinked')
      ? 'suspense'
      : (req.query.link === 'donors' || req.query.link === 'linked' ? 'donors'
      : (req.query.link === 'others' ? 'others' : ''));
    const isSuspense = link === 'suspense' || req.query.suspense === '1';
    const filterMonth = parseInt(req.query.filter_month, 10) || 0;
    const filterYear  = parseInt(req.query.filter_year, 10) || 0;

    // Cheap per-NGO aggregates + project options (unfiltered).
    const statsRes = await db._pool.query(
      `SELECT project_id,
              count(*)::int AS count,
              COALESCE(round(sum(amount)::numeric, 2), 0)::float8 AS total_amount,
              count(DISTINCT COALESCE(NULLIF(donor_mobile, ''), donor_name))::int AS donors
       FROM receipts
       GROUP BY project_id
       ORDER BY count(*) DESC`
    );
    const projectsRes = await db._pool.query(
      `SELECT project_id, count(*)::int AS n FROM receipts GROUP BY project_id ORDER BY n DESC`
    );

    // Month-scoped stats (honours from_date / to_date if provided).
    const monthFrom = (req.query.from_date || '').trim();
    const monthTo = (req.query.to_date || '').trim();
    let monthStatsByProject = statsRes.rows;
    if (monthFrom || monthTo) {
      const mw = []; const mp = [];
      if (monthFrom) { mp.push(monthFrom); mw.push(`receipt_date >= $${mp.length}::date`); }
      if (monthTo)   { mp.push(monthTo);   mw.push(`receipt_date <= $${mp.length}::date`); }
      const mRes = await db._pool.query(
        `SELECT project_id,
                count(*)::int AS count,
                COALESCE(round(sum(amount)::numeric, 2), 0)::float8 AS total_amount,
                count(DISTINCT COALESCE(NULLIF(donor_mobile, ''), donor_name))::int AS donors
         FROM receipts WHERE ${mw.join(' AND ')}
         GROUP BY project_id ORDER BY count(*) DESC`, mp
      );
      monthStatsByProject = mRes.rows;
    }

    // Today stats (IST) per project.
    const todayRes = await db._pool.query(
      `SELECT project_id,
              count(*)::int AS count,
              COALESCE(round(sum(amount)::numeric, 2), 0)::float8 AS total_amount
       FROM receipts
       WHERE receipt_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
       GROUP BY project_id`
    );

    const where = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(receipt_no ILIKE $${params.length} OR donor_name ILIKE $${params.length} OR donor_mobile ILIKE $${params.length})`);
    }
    if (project) {
      params.push(project);
      where.push(`project_id = $${params.length}`);
    }
    if (link === 'donors') where.push('donor_id IS NOT NULL');
    if (isSuspense) {
      let y, m;
      if (filterMonth && filterYear) {
        y = filterYear;
        m = filterMonth;
      } else {
        const now = new Date();
        const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
        y = ist.getUTCFullYear();
        m = ist.getUTCMonth() + 1;
      }
      const mStr = String(m).padStart(2, '0');
      params.push(`${y}-${mStr}-01`);
      where.push(`receipt_date >= $${params.length}`);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      params.push(`${y}-${mStr}-${String(lastDay).padStart(2, '0')}`);
      where.push(`receipt_date <= $${params.length}`);
      where.push('donor_id IS NULL');
      where.push(`(agent_name IS NULL OR trim(agent_name) = '' OR lower(trim(agent_name)) IN ('na', 'suspense'))`);
      where.push(`(donor_mobile IS NULL OR trim(donor_mobile) = '' OR lower(trim(donor_mobile)) IN ('na', 'suspense'))`);
    }
    if (link === 'others') {
      where.push(`lower(trim(agent_name)) IN ('priyank shah', 'priyank sir')`);
    }
    if (!isSuspense) {
      where.push('receipt_no IS NOT NULL');
    }

    const period = (req.query.period || '').trim();
    const fromDate = (req.query.from_date || '').trim();
    const toDate = (req.query.to_date || '').trim();
    if (period === 'today') {
      where.push(`receipt_date = (now() AT TIME ZONE 'Asia/Kolkata')::date`);
    } else if (period === 'yesterday') {
      where.push(`receipt_date = ((now() - INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata')::date`);
    } else if (period === 'week') {
      where.push(`receipt_date >= ((now() - INTERVAL '7 days') AT TIME ZONE 'Asia/Kolkata')::date`);
      where.push(`receipt_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date`);
    } else if (period === 'month') {
      where.push(`receipt_date >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date`);
      where.push(`receipt_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date`);
    } else if (period === 'year') {
      where.push(`receipt_date >= date_trunc('year', now() AT TIME ZONE 'Asia/Kolkata')::date`);
      where.push(`receipt_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date`);
    }
    if (fromDate) { params.push(fromDate); where.push(`receipt_date >= $${params.length}::date`); }
    if (toDate) { params.push(toDate); where.push(`receipt_date <= $${params.length}::date`); }

    const hasDateFilter = !!period || !!fromDate || !!toDate;
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await db._pool.query(`SELECT count(*)::int AS n FROM receipts ${whereSql}`, params);

    // Ascending by receipt number when searching, otherwise highest receipt number first.
    const orderSql = search
      ? 'ORDER BY receipt_no ASC, receipt_date ASC'
      : 'ORDER BY CAST(receipt_no AS INTEGER) DESC, receipt_date DESC';

    if (hasDateFilter) {
      const rowsRes = await db._pool.query(
        `SELECT id, log_id, receipt_no, project_id, donor_name,
                COALESCE(receipts.donor_mobile,
                  (SELECT b.donor_mobile FROM bank_audit_entries b
                   WHERE b.receipt_id = receipts.id AND b.donor_mobile IS NOT NULL AND b.donor_mobile <> ''
                   ORDER BY b.id LIMIT 1)
                ) AS donor_mobile,
                amount,
                receipt_date, receipt_time, "mode", payment_id, bank_name, bank_payer_name, address, pan_number, email,
                donor_id, agent_name, caller_name, mobile_2, address_2, station, account_of,
                sent, sent_at, created_at,
                (SELECT b.payer_name FROM bank_audit_entries b
                 WHERE b.receipt_id = receipts.id AND b.payer_name IS NOT NULL AND b.payer_name <> ''
                 ORDER BY b.id LIMIT 1) AS audit_payer_name,
                (SELECT bs.name FROM bank_audit_entries b
                 JOIN bank_audit_sources bs ON b.source_id = bs.id
                 WHERE b.receipt_id = receipts.id
                 ORDER BY b.id LIMIT 1) AS received_bank,
                (SELECT b.verify_type FROM bank_audit_entries b
                 WHERE b.receipt_id = receipts.id AND b.verify_type = 'cross_fro'
                 ORDER BY b.id LIMIT 1) AS verify_type,
                (SELECT b.verify_fro_worker_id FROM bank_audit_entries b
                 WHERE b.receipt_id = receipts.id AND b.verify_type = 'cross_fro'
                 ORDER BY b.id LIMIT 1) AS verify_fro_worker_id
         FROM receipts ${whereSql}
         ${orderSql}`,
        params
      );
      return res.json({
        data: rowsRes.rows,
        total: totalRes.rows[0].n,
        statsByProject: statsRes.rows,
        monthStatsByProject,
        todayStats: todayRes.rows,
        projects: projectsRes.rows.map(p => p.project_id),
      });
    }

    params.push(limit, (page - 1) * limit);
    const rowsRes = await db._pool.query(
      `SELECT id, log_id, receipt_no, project_id, donor_name,
              COALESCE(receipts.donor_mobile,
                (SELECT b.donor_mobile FROM bank_audit_entries b
                 WHERE b.receipt_id = receipts.id AND b.donor_mobile IS NOT NULL AND b.donor_mobile <> ''
                 ORDER BY b.id LIMIT 1)
              ) AS donor_mobile,
              amount,
              receipt_date, receipt_time, "mode", payment_id, bank_name, bank_payer_name, address, pan_number, email,
              donor_id, agent_name, caller_name, mobile_2, address_2, station, account_of,
              sent, sent_at, created_at,
              (SELECT b.payer_name FROM bank_audit_entries b
               WHERE b.receipt_id = receipts.id AND b.payer_name IS NOT NULL AND b.payer_name <> ''
               ORDER BY b.id LIMIT 1) AS audit_payer_name,
              (SELECT bs.name FROM bank_audit_entries b
               JOIN bank_audit_sources bs ON b.source_id = bs.id
               WHERE b.receipt_id = receipts.id
               ORDER BY b.id LIMIT 1) AS received_bank,
              (SELECT b.verify_type FROM bank_audit_entries b
               WHERE b.receipt_id = receipts.id AND b.verify_type = 'cross_fro'
               ORDER BY b.id LIMIT 1) AS verify_type,
              (SELECT b.verify_fro_worker_id FROM bank_audit_entries b
               WHERE b.receipt_id = receipts.id AND b.verify_type = 'cross_fro'
               ORDER BY b.id LIMIT 1) AS verify_fro_worker_id
       FROM receipts ${whereSql}
       ${orderSql}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      data: rowsRes.rows,
      total: totalRes.rows[0].n,
      statsByProject: statsRes.rows,
      monthStatsByProject,
      todayStats: todayRes.rows,
      projects: projectsRes.rows.map(p => p.project_id),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Suggest donor addresses from the DB to autofill a lead's missing address.
// Matches the same donor (mobile/name) across donor_profiles and receipts,
// plus a free-text ILIKE search over both address columns.
export const getAddressSuggestions = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const mobile = (req.query.mobile || '').trim();
    const name = (req.query.name || '').trim();

    const seen = new Map();
    const add = (address, source) => {
      const a = (address || '').trim();
      if (!a || a.length < 3) return;
      if (seen.has(a)) { seen.get(a).count += 1; return; }
      seen.set(a, { address: a, count: 1, source });
    };

    // 1) The lead's own donor profile address (most relevant, always first)
    if (mobile) {
      const { rows } = await db._pool.query(
        `SELECT address_1 FROM donor_profiles WHERE mobile_number = $1 AND address_1 IS NOT NULL AND address_1 <> ''`,
        [mobile]
      );
      rows.forEach(r => add(r.address_1, 'This donor'));
    }

    // 2) Other profiles matching the same name/mobile
    if (name || mobile) {
      const conds = [];
      const params = [];
      if (name) { params.push(`%${name}%`); conds.push(`name ILIKE $${params.length}`); }
      if (mobile) { params.push(mobile); conds.push(`mobile_number = $${params.length}`); }
      const { rows } = await db._pool.query(
        `SELECT address_1 FROM donor_profiles WHERE (${conds.join(' OR ')}) AND address_1 IS NOT NULL AND address_1 <> ''`,
        params
      );
      rows.forEach(r => add(r.address_1, 'Donor profile'));
    }

    // 3) Receipts filed under the same donor
    if (name || mobile) {
      const conds = [];
      const params = [];
      if (name) { params.push(`%${name}%`); conds.push(`donor_name ILIKE $${params.length}`); }
      if (mobile) { params.push(mobile); conds.push(`donor_mobile = $${params.length}`); }
      const { rows } = await db._pool.query(
        `SELECT address, count(*)::int AS n FROM receipts
         WHERE (${conds.join(' OR ')}) AND address IS NOT NULL AND address <> ''
         GROUP BY address ORDER BY n DESC`,
        params
      );
      rows.forEach(r => add(r.address, 'Receipt'));
    }

    // 4) Free-text search over addresses
    if (q && q.length >= 2) {
      const like = `%${q}%`;
      const { rows: r1 } = await db._pool.query(
        `SELECT address, count(*)::int AS n FROM receipts
         WHERE address ILIKE $1 AND address IS NOT NULL AND address <> ''
         GROUP BY address ORDER BY n DESC LIMIT 20`,
        [like]
      );
      r1.forEach(r => add(r.address, 'Receipt'));
      const { rows: r2 } = await db._pool.query(
        `SELECT address_1, count(*)::int AS n FROM donor_profiles
         WHERE address_1 ILIKE $1 AND address_1 IS NOT NULL AND address_1 <> ''
         GROUP BY address_1 ORDER BY n DESC LIMIT 20`,
        [like]
      );
      r2.forEach(r => add(r.address_1, 'Donor profile'));
    }

    return res.json(Array.from(seen.values()).slice(0, 25));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getPendingReceipts = async (req, res) => {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: receipts, error: recError } = await db
      .from('receipts')
      .select('*')
      .not('donor_id', 'is', null)
      .or(`sent.is.null,sent.eq.false,and(sent.eq.true,sent_at.gte.${tenMinAgo})`)
      .order('created_at', { ascending: false });

    if (recError) throw recError;
    if (!receipts || receipts.length === 0) return res.json([]);

    const logIds = receipts.map(r => r.log_id).filter(Boolean);

    const { data: logs, error: logErr } = await db
      .from('fro_donor_logs')
      .select(`
        id, amount_collected, accounts_status, verified_at, upi_transaction_id, transaction_datetime, payment_from, payment_mode,
        fro_assignments!inner(
          donor_id, ngo_id,
          ngos!left(id, name),
          donor_profiles!inner(id, name, mobile_number, city, email, pan_number, address_1, project_supported)
        )
      `)
      .in('id', logIds);

    if (logErr) throw logErr;

    const logMap = {};
    for (const l of logs || []) logMap[l.id] = l;

    const eligible = receipts.filter(r => {
      if (!r.log_id) return true;
      const log = logMap[r.log_id];
      return log && log.accounts_status === 'verified';
    });

    const result = eligible.map(r => {
      const log = logMap[r.log_id];
      const donor = log?.fro_assignments?.donor_profiles;
      return {
        'Donor Name': r.donor_name || donor?.name || '',
        'Address 1': r.address || donor?.address_1 || '',
        'PAN No.': r.pan_number || donor?.pan_number || '',
        'Email ID': r.email || donor?.email || '',
        'Mode of Payment (MOP)': log?.payment_mode || r.mode || 'Bank',
        'Payment ID No.': log?.upi_transaction_id || r.payment_id || '',
        'Donor Bank Name': r.bank_name || donor?.donors_bank_name || '',
        'Amount': String(r.amount || 0),
        'Receipt No.': r.receipt_no || '',
        'Receipt Date': r.receipt_date || log?.verified_at || '',
        'Account Of': 'Corpus',
        'Mobile No.': r.donor_mobile || donor?.mobile_number || '',
        'City': donor?.city || '',
        'Agent Name': r.agent_name || '',
        receipt_id: r.id,
        sent: r.sent || false,
        log_id: r.log_id,
        'Project': (log?.fro_assignments?.ngos?.name === 'BSCT' ? 'bsct' : log?.fro_assignments?.ngos?.name === 'AFLF' ? 'aflf' : log?.fro_assignments?.ngos?.name === 'MANN' ? 'mann' : donor?.project_supported) || '',
      };
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const markReceiptAsSent = async (req, res) => {
  try {
    const { receiptId, receipt_ids: receiptIds } = req.body;
    const ids = Array.isArray(receiptIds) ? [...new Set(receiptIds.filter(Boolean))] : (receiptId ? [receiptId] : []);
    if (ids.length === 0) return res.status(400).json({ message: 'receiptId or receipt_ids is required' });
    if (ids.length > 50) return res.status(400).json({ message: 'A maximum of 50 receipt IDs can be updated at once' });

    const { data, error } = await db
      .from('receipts')
      .update({ sent: true, sent_at: new Date().toISOString() })
      .in('id', ids)
      .select();

    if (error) throw error;
    return res.json({ success: true, data: { receipt_ids: (data || []).map(receipt => receipt.id), updated_count: data?.length || 0 } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getDonorHistory = async (req, res) => {
  try {
    const { donorId } = req.params;

    const { data: logs, error } = await db
      .from('fro_donor_logs')
      .select(`
        id, action, disposition_detail, amount_collected, accounts_status,
        payment_mode, upi_transaction_id, transaction_datetime, payment_from,
        created_at, verified_at, payment_screenshot_url,
        fro_assignments!inner(donor_id, fro_worker_id, workers!inner(id, name, login_id))
      `)
      .eq('fro_assignments.donor_id', donorId)
      .or('action.eq.donation,and(disposition_detail.eq.lead_done,accounts_status.eq.verified)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const logIds = (logs || []).map(l => l.id);

    // Look up receipts via log chain + direct donor_id link
    const receiptPromises = [];
    if (logIds.length > 0) {
      receiptPromises.push(
        db.from('receipts').select('*').in('log_id', logIds)
      );
    }
    receiptPromises.push(
      db.from('receipts').select('*').eq('donor_id', donorId)
    );

    const receiptResults = await Promise.allSettled(receiptPromises);
    const allReceipts = [];
    for (const r of receiptResults) {
      if (r.status === 'fulfilled' && r.value.data) {
        allReceipts.push(...r.value.data);
      }
    }
    // Deduplicate by id
    const seenReceiptIds = new Set();
    const uniqueReceipts = allReceipts.filter(r => {
      if (seenReceiptIds.has(r.id)) return false;
      seenReceiptIds.add(r.id);
      return true;
    });

    const receiptMap = {};
    for (const r of uniqueReceipts) receiptMap[r.log_id || `direct_${r.id}`] = r;

    const result = (logs || []).map(l => ({
      log_id: l.id,
      amount: l.amount_collected,
      payment_mode: l.payment_mode,
      upi_transaction_id: l.upi_transaction_id,
      transaction_datetime: l.transaction_datetime,
      payment_from: l.payment_from,
      accounts_status: l.accounts_status,
      created_at: l.created_at,
      verified_at: l.verified_at,
      screenshot_url: l.payment_screenshot_url,
      agent_name: l.fro_assignments?.workers?.name || 'Unknown',
      agent_login: l.fro_assignments?.workers?.login_id || '',
      type: l.action === 'donation' ? 'Donation' : 'Lead',
      receipt_no: receiptMap[l.id]?.receipt_no || null,
    }));

    // Include direct-linked receipts that are NOT tied to any log
    const logIdSet = new Set(logIds);
    const orphanReceipts = uniqueReceipts
      .filter(r => !r.log_id || !logIdSet.has(r.log_id))
      .map(r => ({
        log_id: null,
        receipt_id: r.id,
        amount: r.amount,
        payment_mode: r.mode,
        payment_from: r.bank_name,
        accounts_status: 'imported',
        created_at: r.receipt_date || r.created_at,
        verified_at: null,
        agent_name: 'System Import',
        agent_login: '',
        type: 'Imported Receipt',
        receipt_no: r.receipt_no,
        donor_name: r.donor_name,
        donor_mobile: r.donor_mobile,
      }));

    result.push(...orphanReceipts);
    result.sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getDayEndReport = async (req, res) => {
  try {
    const { date, month } = req.query;
    let dateFrom, dateTo;
    if (month) {
      const [y, m] = month.split('-');
      dateFrom = `${y}-${m}-01`;
      const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
      dateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    } else {
      const reportDate = date || new Date().toISOString().split('T')[0];
      dateFrom = reportDate + 'T00:00:00Z';
      dateTo = reportDate + 'T23:59:59Z';
    }

    const { data: froLogs, error: fErr } = await db
      .from('fro_donor_logs')
      .select(`
        amount_collected, accounts_status, verified_at, created_at, fro_worker_id,
        fro_assignments!inner(fro_worker_id),
        workers!fro_donor_logs_fro_worker_id_fkey(id, name, login_id)
      `)
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo);
    if (fErr) throw fErr;

    const froMap = {};
    let totalCollected = 0;
    let totalSubmitted = 0;
    for (const log of froLogs || []) {
      const wid = log.fro_worker_id;
      const wName = log.workers?.name || 'Unknown';
      const wLogin = log.workers?.login_id || '';
      const amount = Number(log.amount_collected || 0);
      totalSubmitted += amount;
      if (log.accounts_status === 'verified') totalCollected += amount;
      if (!froMap[wid]) froMap[wid] = { id: wid, name: wName, login: wLogin, submitted: 0, collected: 0 };
      froMap[wid].submitted += amount;
      if (log.accounts_status === 'verified') froMap[wid].collected += amount;
    }

    const { data: suspenseEntries, error: sErr } = await db
      .from('bank_audit_entries')
      .select('id, amount, payment_id, bank_audit_sources(name)')
      .eq('status', 'unverified');
    if (sErr) throw sErr;

    const suspenseAmount = (suspenseEntries || []).reduce((s, e) => s + Number(e.amount || 0), 0);

    // Source-wise breakdown from bank audit entries
    const { data: allBankEntries, error: bErr } = await db
      .from('bank_audit_entries')
      .select('amount, bank_audit_sources(name)');
    if (bErr) throw bErr;

    const sourceMap = {};
    for (const e of allBankEntries || []) {
      const name = e.bank_audit_sources?.name || 'Unknown';
      sourceMap[name] = (sourceMap[name] || 0) + Number(e.amount || 0);
    }
    const sourceBreakdown = Object.entries(sourceMap).map(([name, amount]) => ({ name, amount }));

    return res.json({
      date: month || (date || new Date().toISOString().split('T')[0]),
      isMonth: !!month,
      froWorkers: Object.values(froMap),
      totalSubmitted,
      totalCollected,
      suspenseCount: (suspenseEntries || []).length,
      suspenseAmount,
      suspenseEntries: suspenseEntries || [],
      sourceBreakdown,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

function normalizeReceiptDate(val) {
  if (!val || val === 'NA' || val === 'na' || val === '-') return null;
  const s = String(val).trim();
  if (/^\d+$/.test(s) && s.length <= 5) {
    const d = new Date(1899, 11, 30 + parseInt(s, 10));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  return null;
}

function normalizeReceiptTime(val) {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    const frac = val - Math.floor(val);
    if (frac > 0) {
      const totalMin = Math.round(frac * 24 * 60) % (24 * 60);
      return String(Math.floor(totalMin / 60)).padStart(2, '0') + ':' + String(totalMin % 60).padStart(2, '0');
    }
    return null;
  }
  const s = String(val).trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23) return null;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

export const getImportNgoOptions = async (req, res) => {
  try {
    const { data, error } = await db
      .from('ngos')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return res.json((data || []).map(n => ({ id: n.id, name: n.name })));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const importReceipts = async (req, res) => {
  try {
    const { receipts, ngo_id } = req.body;
    const cleanVal = (v) => {
      const s = String(v || '').trim();
      if (!s || /^n\/?a$/i.test(s)) return null;
      return s;
    };
    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return res.status(400).json({ message: 'No receipts data provided' });
    }
    if (!ngo_id) {
      return res.status(400).json({ message: 'Please select the NGO this receipt batch belongs to' });
    }
    const { data: ngoRow, error: ngoErr } = await db
      .from('ngos')
      .select('id, name, is_active')
      .eq('id', ngo_id)
      .single();
    if (ngoErr || !ngoRow || !ngoRow.is_active) {
      return res.status(400).json({ message: 'Selected NGO is invalid or inactive' });
    }
    const batchProjectId = ngoRow.name.toLowerCase();

    const parsed = receipts.map(r => {
      const row = {};
      Object.keys(r).forEach(k => { row[k.trim()] = r[k]; });
      const donorName = row.donor_name || row['Receipt Name'] || row['Donor Name'] || '';
      const projectRaw = (row.project_id || row['Project'] || row['Project Supported'] || 'bsct').trim();
      const projectId = projectRaw.toLowerCase().includes('anna') ? 'bsct' : projectRaw.toLowerCase();
      const rawAmount = String(row.amount || row['Amount'] || row['Amt'] || '0')
        .replace(/,/g, '')
        .trim();
      return {
        original: r,
        parsed: {
          receipt_no: cleanVal(row.receipt_no || row['Receipt No'] || row['Receipt No.']),
          project_id: projectId,
          donor_name: donorName,
          donor_mobile: cleanVal(row.donor_mobile || row['Donor Mobile'] || row['Mobile No.']),
          amount: parseFloat(rawAmount) || 0,
          pan_number: cleanVal(row.pan_number || row['PAN No.'] || row['PAN No'] || row['Pan No']),
          address: cleanVal(row.address || row['Address 1'] || row['Address-1']),
          mode: cleanVal(row.mode || row['Mode of Payment (MOP)'] || row['MOP']),
          purpose: cleanVal(row.purpose || row['Purpose']) || 'General Donation',
          receipt_date: normalizeReceiptDate(row.receipt_date || row['Receipt Date'] || row['Transaction Date'] || row.transaction_date),
          receipt_time: normalizeReceiptTime(row.receipt_time || row['Receipt Time'] || row['Time'] || row.time),
          generated_by: row.generated_by || req.user.id,
          email: cleanVal(row.email || row['Mail Id'] || row['Email ID']),
          payment_id: cleanVal(row.payment_id || row['Payment Id No.']),
          bank_name: cleanVal(row.bank_name || row['Received Bank'] || row['Donors Bank Name']),
          agent_name: cleanVal(row.agent_name || row['FSE Name'] || row['Fse Name'] || row['Agent Name']) || 'Suspense',
          caller_name: cleanVal(row.caller_name || row['Caller Name']),
          mobile_2: cleanVal(row.mobile_2 || row['Mobil No. 2 / Tel'] || row['Mobil No. 2 / Tel ']),
          address_2: cleanVal(row.address_2 || row['Address-2'] || row['Address 2']),
          station: cleanVal(row.station || row['Station']),
          account_of: cleanVal(row.account_of || row['Account of']) || 'Corpus',
          sent: true,
          sent_at: new Date().toISOString(),
        },
      };
    }).filter(({ parsed }) => {
      const isBlank = parsed.donor_name.toLowerCase().includes('blank');
      const hasAmount = parsed.amount > 0;
      return !isBlank && hasAmount;
    });

    if (parsed.length === 0) {
      return res.status(400).json({ message: 'No valid receipts found after filtering' });
    }

    for (const p of parsed) p.parsed.project_id = batchProjectId;

    // Duplicate check against DB (batched at 100). Scoped by NGO so each NGO's
    // own receipt-number series (1..n) never collides with another NGO's. Each
    // existing copy's pool-relevant fields are kept so re-uploads can decide
    // whether to skip the number or restore its receipt to the suspense pool.
    const incomingNos = [...new Set(parsed.map(p => p.parsed.receipt_no).filter(Boolean))];
    const existingReceiptIds = new Map();
    if (incomingNos.length > 0) {
      for (let i = 0; i < incomingNos.length; i += 100) {
        const batch = incomingNos.slice(i, i + 100);
        const { data: existing } = await db
          .from('receipts')
          .select('id, receipt_no, donor_id, log_id, agent_name, donor_mobile, receipt_date, receipt_time, amount, pan_number, address, mode, payment_id, bank_name, email, caller_name, mobile_2, address_2, station, account_of')
          .eq('project_id', batchProjectId)
          .in('receipt_no', batch);
        for (const r of (existing || [])) existingReceiptIds.set(r.receipt_no, r);
      }
    }

    // Existing copies referenced by a bank-audit entry are out of the suspense
    // pool even when otherwise unlinked.
    const existingIds = [...existingReceiptIds.values()].map(r => r.id);
    const bankAudited = new Set();
    if (existingIds.length > 0) {
      for (let i = 0; i < existingIds.length; i += 100) {
        const { rows } = await db._pool.query(
          `SELECT DISTINCT receipt_id FROM bank_audit_entries WHERE receipt_id = ANY($1)`,
          [existingIds.slice(i, i + 100)]
        );
        for (const b of (rows || [])) bankAudited.add(b.receipt_id);
      }
    }

    // A receipt number already on file is never re-inserted (UNIQUE). What
    // happens to the existing copy depends on the new file row and the copy's
    // current state — re-uploading is always non-destructive:
    //   • copy cleared (claimed / linked / bank-audited) → kept as-is, never
    //     rolled back and never double-credited;
    //   • copy still pure suspense + the file row is now identified (agent or
    //     mobile present) → the existing receipt is updated in place and
    //     auto-credited to the FRO / donor history;
    //   • copy claimed (log_id → pending lead) + the file row has an agent →
    //     the pending lead is auto-verified and leaves Lead Verification;
    //   • otherwise → the existing copy wins, nothing changes.
    const upgradeRows = [];
    const verifyRows = [];
    const upgradeSeen = new Set();
    const verifySeen = new Set();
    const seen = new Set();
    const uniqueParsed = parsed.filter(({ parsed }) => {
      if (!parsed.receipt_no) return true;
      const existing = existingReceiptIds.get(parsed.receipt_no);
      if (existing) {
        const fileIsSuspense = isBlankSuspenseValue(parsed.agent_name) && isBlankSuspenseValue(parsed.donor_mobile);
        if (!fileIsSuspense) {
            const key = `${existing.id}|${parsed.receipt_no}`;
            if (existing.log_id) {
              if (!verifySeen.has(key)) {
                verifySeen.add(key);
                verifyRows.push({ existing, parsed });
              }
            } else if (!upgradeSeen.has(key)) {
              upgradeSeen.add(key);
              upgradeRows.push({ existing, parsed });
            }
          }
        return false; // number already on file — never re-insert (UNIQUE)
      }
      if (seen.has(parsed.receipt_no)) return false;
      seen.add(parsed.receipt_no);
      return true;
    });
    const dupCount = parsed.length - uniqueParsed.length - upgradeRows.length - verifyRows.length;

    const uniqueRows = uniqueParsed.map(p => p.parsed);
    const originalRows = uniqueParsed.map(p => p.original);

    // Durability safety net: persist the exact rows we intend to insert BEFORE
    // any DB write, so a crash mid-import can never lose the source data.
    const FAILED_DIR = path.resolve(__dirname, '../../uploads/failed_imports');
    let manifestPath = null;
    try {
      fs.mkdirSync(FAILED_DIR, { recursive: true });
      manifestPath = path.join(FAILED_DIR, `receipt_import_${Date.now()}.json`);
      fs.writeFileSync(manifestPath, JSON.stringify({ imported_at: new Date().toISOString(), rows: uniqueRows }, null, 2));
    } catch (e) {
      console.warn('Could not persist import manifest:', e.message);
    }

    // ─── Pre-compute donor matches by phone (outside the transaction so read-
    //     heavy queries never bloat the tx and hit RDS statement timeouts) ───
    const cleanMobile = (m) => String(m || '').replace(/\D/g, '');
    const last10 = (m) => cleanMobile(m).slice(-10);
    const mobiles = [...new Set(uniqueRows.map(r => last10(r.donor_mobile)).filter(m => /^\d{10}$/.test(m)))];
    const donorByMobile = new Map();
    if (mobiles.length > 0) {
      const exactFound = new Set();
      for (let i = 0; i < mobiles.length; i += 100) {
        const batch = mobiles.slice(i, i + 100);
        const { rows: exact } = await db._pool.query(
          `SELECT id, name, mobile_number, total_amount, donation_count, last_donation_date
           FROM donor_profiles WHERE mobile_number = ANY($1)`, [batch]
        );
        for (const d of (exact || [])) {
          const k = last10(d.mobile_number);
          if (k) { donorByMobile.set(k, d); exactFound.add(k); }
        }
      }
      const missing = mobiles.filter(m => !exactFound.has(m));
      if (missing.length > 0) {
        for (let i = 0; i < missing.length; i += 100) {
          const batch = missing.slice(i, i + 100);
          const { rows } = await db._pool.query(
            `SELECT id, name, mobile_number, total_amount, donation_count, last_donation_date
             FROM donor_profiles
             WHERE right(regexp_replace(mobile_number, '[^0-9]', '', 'g'), 10) = ANY($1)`, [batch]
          );
          for (const d of (rows || [])) {
            const k = last10(d.mobile_number);
            if (k && !donorByMobile.has(k)) donorByMobile.set(k, d);
          }
        }
      }
    }

    // ─── Insert + match + link — one atomic transaction, with retry ───
    const MAX_RETRIES = 3;
    const MAX_QUERY_CONCURRENCY = 6;
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const mapLimit = async (items, limit, fn) => {
      const results = [];
      let next = 0;
      const worker = async () => {
        while (next < items.length) {
          const idx = next++;
          results.push(await fn(items[idx], idx));
        }
      };
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
      return results;
    };

    const isConnExhausted = (err) => {
      const m = (err && err.message ? err.message : '').toLowerCase();
      return (err && err.code === '53300') || m.includes('remaining connection slots') || m.includes('rds_reserved') || m.includes('too many connections');
    };

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        console.log(`Import retry attempt ${attempt}/${MAX_RETRIES}`);
        await sleep((isConnExhausted(lastError) ? attempt * 4000 : attempt * 1000));
      }

      try {
        console.time('import-tx');
        let resultVerifyNotifications = [];
        const result = await db.transaction(async ({ from }) => {
          // Numbered rows are unique on receipt_no: the first occurrence in the
          // batch wins, and any number already in the DB (same project_id) is
          // skipped so the UNIQUE index is never violated. Unnumbered rows are
          // always inserted — uniqueness applies only to receipt numbers.
          const toInsert = [];
          const seenNumbers = new Set();
          for (const { parsed: row } of parsed) {
            if (row.receipt_no) {
              if (existingReceiptIds.has(row.receipt_no) || seenNumbers.has(row.receipt_no)) continue;
              seenNumbers.add(row.receipt_no);
            }
            toInsert.push(row);
          }

          let inserted = [];
          if (toInsert.length > 0) {
            const INSERT_BATCH = 500;
            const chunks = [];
            for (let i = 0; i < toInsert.length; i += INSERT_BATCH) chunks.push(toInsert.slice(i, i + INSERT_BATCH));
            const insertedChunks = await mapLimit(chunks, 2, async (chunk) => {
              const { data, error } = await from('receipts').insert(chunk).select();
              if (error) throw error;
              return data || [];
            });
            inserted = insertedChunks.flat();
          }

          // Re-uploading never rolls back. Suspense rows that are now identified
          // in the file (agent/mobile) get their existing receipt updated in
          // place; rows with a pending claim get that pending lead auto-verified
          // so it leaves Lead Verification. All inside the same transaction.
          let upgraded = 0;
          let creditedPending = 0;
          if (upgradeRows.length > 0) {
            for (const { existing, parsed: row } of upgradeRows) {
              const { error: upErr } = await from('receipts').update({
                donor_name: row.donor_name,
                donor_mobile: row.donor_mobile,
                amount: row.amount,
                pan_number: row.pan_number,
                address: row.address,
                mode: row.mode,
                purpose: row.purpose,
                receipt_date: row.receipt_date,
                receipt_time: row.receipt_time,
                generated_by: row.generated_by,
                email: row.email,
                payment_id: row.payment_id,
                bank_name: row.bank_name,
                agent_name: row.agent_name,
                caller_name: row.caller_name,
                mobile_2: row.mobile_2,
                address_2: row.address_2,
                station: row.station,
                account_of: row.account_of,
                sent: true,
                sent_at: new Date().toISOString(),
              }).eq('id', existing.id);
              if (upErr) throw new Error(upErr.message);
              upgraded++;
            }
          }

          if (verifyRows.length > 0) {
            const nowIso = new Date().toISOString();
            const verifyNotifications = [];
            for (const { existing, parsed: row } of verifyRows) {
              const { data: lead, error: leadErr } = await from('fro_donor_logs')
                .select('id, assignment_id, fro_worker_id, donor_id, amount_collected, accounts_status')
                .eq('id', existing.log_id)
                .maybeSingle();
              if (leadErr) throw new Error(leadErr.message);
              if (!lead || lead.accounts_status !== 'pending') continue;
              const effAmount = parseFloat(row.amount) || parseFloat(existing.amount) || parseFloat(lead.amount_collected) || 0;
              const { error: rErr } = await from('receipts').update({
                donor_name: row.donor_name || existing.donor_name || null,
                donor_mobile: row.donor_mobile || existing.donor_mobile || null,
                amount: effAmount,
                pan_number: row.pan_number || existing.pan_number,
                address: row.address || existing.address,
                mode: row.mode || existing.mode,
                purpose: row.purpose || existing.purpose,
                receipt_date: row.receipt_date || existing.receipt_date,
                receipt_time: row.receipt_time || existing.receipt_time,
                payment_id: row.payment_id || existing.payment_id,
                bank_name: row.bank_name || existing.bank_name,
                agent_name: row.agent_name || existing.agent_name,
                email: row.email || existing.email,
                caller_name: row.caller_name || existing.caller_name,
                mobile_2: row.mobile_2 || existing.mobile_2,
                address_2: row.address_2 || existing.address_2,
                station: row.station || existing.station,
                account_of: row.account_of || existing.account_of,
                sent: true,
                sent_at: nowIso,
              }).eq('id', existing.id);
              if (rErr) throw new Error(rErr.message);
              const { error: lErr } = await from('fro_donor_logs').update({
                accounts_status: 'verified',
                verified_at: row.receipt_date || nowIso,
                verified_by: req.user.id,
              }).eq('id', lead.id);
              if (lErr) throw new Error(lErr.message);
              if (lead.assignment_id) {
                const { error: aErr } = await from('fro_assignments').update({ status: 'donation_collected', last_contacted_at: nowIso }).eq('id', lead.assignment_id);
                if (aErr) throw new Error(aErr.message);
              }
              if (lead.donor_id) {
                const { data: donor, error: dErr } = await from('donor_profiles')
                  .select('total_amount, donation_count')
                  .eq('id', lead.donor_id)
                  .maybeSingle();
                if (dErr) throw new Error(dErr.message);
                if (donor) {
                  const { error: upErr } = await from('donor_profiles').update({
                    total_amount: Math.round(((donor.total_amount || 0) + effAmount) * 100) / 100,
                    donation_count: (donor.donation_count || 0) + 1,
                    updated_at: nowIso,
                  }).eq('id', lead.donor_id);
                  if (upErr) throw new Error(upErr.message);
                }
              }
              const { error: bErr } = await from('bank_audit_entries').update({
                donor_id: lead.donor_id || null,
                status: 'verified',
                matched_at: nowIso,
                updated_at: nowIso,
              }).eq('receipt_id', existing.id);
              if (bErr) throw new Error(bErr.message);
              if (lead.fro_worker_id) {
                const donorName = row.donor_name || existing.donor_name || 'a donor';
                verifyNotifications.push({
                  worker_id: lead.fro_worker_id,
                  type: 'lead_verified',
                  title: 'Lead Verified',
                  body: `Your claim for ${donorName} (\u20B9${Number(effAmount).toLocaleString('en-IN')}) was verified from the re-uploaded receipts.`,
                  fro_donor_log_id: String(lead.id),
                  sent_at: nowIso,
                });
              }
              creditedPending++;
            }
            // Best-effort verified-lead notifications are sent AFTER the
            // transaction commits so a notification failure can never abort the
            // import (and never leave the tx in the aborted 25P02 state).
            resultVerifyNotifications = verifyNotifications;
          }

          let matched = 0;
          let withBank = 0;
          let receiptsByDonor = {};
          const matchedIds = new Set();
          const processRows = [
            ...inserted,
            ...upgradeRows.map(({ existing, parsed: row }) => ({ id: existing.id, ...row })),
          ];
          if (processRows.length > 0) {
            receiptsByDonor = {};
            const matchPool = processRows.filter(r => !r.donor_id);
            for (const receipt of matchPool) {
              const m = last10(receipt.donor_mobile);
              if (!/^\d{10}$/.test(m)) continue;
              const donor = donorByMobile.get(m);
              if (!donor) continue;
              matched++;
              matchedIds.add(receipt.id);
              if (!receiptsByDonor[donor.id]) {
                receiptsByDonor[donor.id] = { ids: [], total_amount: donor.total_amount || 0, donation_count: donor.donation_count || 0, last_donation_date: donor.last_donation_date };
              }
              receiptsByDonor[donor.id].ids.push(receipt.id);
              receiptsByDonor[donor.id].total_amount += parseFloat(receipt.amount || 0);
              receiptsByDonor[donor.id].donation_count += 1;
              if (receipt.receipt_date && (!receiptsByDonor[donor.id].last_donation_date || receipt.receipt_date > receiptsByDonor[donor.id].last_donation_date)) {
                receiptsByDonor[donor.id].last_donation_date = receipt.receipt_date;
              }
            }

            // Auto-create donor profiles for unmatched valid mobiles so receipts
            // clear out of the suspense pool instead of sitting orphaned.
            {
              const toCreateMap = new Map();
              for (const r of matchPool) {
                if (matchedIds.has(r.id)) continue;
                const m = last10(r.donor_mobile);
                if (!/^\d{10}$/.test(m)) continue;
                if (!toCreateMap.has(m)) toCreateMap.set(m, r.donor_name || 'Unknown Donor');
              }
              if (toCreateMap.size > 0) {
                const rows = [...toCreateMap].map(([mobile, name]) => ({
                  name, mobile_number: mobile,
                  total_amount: 0, donation_count: 0,
                  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                }));
                for (let i = 0; i < rows.length; i += 500) {
                  const chunk = rows.slice(i, i + 500);
                  const { data: created, error } = await from('donor_profiles')
                    .upsert(chunk, { onConflict: 'mobile_number', ignoreDuplicates: true })
                    .select('id, mobile_number, total_amount, donation_count, last_donation_date');
                  if (error) throw new Error(error.message);
                  for (const d of (created || [])) {
                    const k = last10(d.mobile_number);
                    if (k) donorByMobile.set(k, d);
                  }
                  const chunkMobiles = [...new Set(chunk.map(c => c.mobile_number))];
                  for (let j = 0; j < chunkMobiles.length; j += 100) {
                    const { rows: existing } = await db._pool.query(
                      `SELECT id, mobile_number, total_amount, donation_count, last_donation_date
                       FROM donor_profiles WHERE mobile_number = ANY($1)`, [chunkMobiles.slice(j, j + 100)]
                    );
                    for (const d of (existing || [])) {
                      const k = last10(d.mobile_number);
                      if (k) donorByMobile.set(k, d);
                    }
                  }
                }
                for (const receipt of matchPool) {
                  if (matchedIds.has(receipt.id)) continue;
                  const m = last10(receipt.donor_mobile);
                  if (!/^\d{10}$/.test(m)) continue;
                  const donor = donorByMobile.get(m);
                  if (!donor) continue;
                  matched++;
                  matchedIds.add(receipt.id);
                  if (!receiptsByDonor[donor.id]) {
                    receiptsByDonor[donor.id] = { ids: [], total_amount: donor.total_amount || 0, donation_count: donor.donation_count || 0, last_donation_date: donor.last_donation_date };
                  }
                  receiptsByDonor[donor.id].ids.push(receipt.id);
                  receiptsByDonor[donor.id].total_amount += parseFloat(receipt.amount || 0);
                  receiptsByDonor[donor.id].donation_count += 1;
                  if (receipt.receipt_date && (!receiptsByDonor[donor.id].last_donation_date || receipt.receipt_date > receiptsByDonor[donor.id].last_donation_date)) {
                    receiptsByDonor[donor.id].last_donation_date = receipt.receipt_date;
                  }
                }
              }
            }

            withBank = processRows.filter(r => r.bank_name && r.bank_name !== 'NA').length;
          }

          // Link receipts to donors and roll up donor totals. A failed
          // link/donor update aborts the whole import (rollback), so it never
          // silently leaves an unlinked receipt behind.
          if (Object.keys(receiptsByDonor).length > 0) {
            const updates = [];
            for (const [donorId, info] of Object.entries(receiptsByDonor)) {
              for (let i = 0; i < info.ids.length; i += 50) {
                updates.push(from('receipts').update({ donor_id: parseInt(donorId) }).in('id', info.ids.slice(i, i + 50)));
              }
              updates.push(from('donor_profiles').update({
                total_amount: Math.round(info.total_amount * 100) / 100,
                donation_count: info.donation_count,
                last_donation_date: info.last_donation_date,
                updated_at: new Date().toISOString(),
              }).eq('id', donorId));
            }
            await mapLimit(updates, MAX_QUERY_CONCURRENCY, async (q) => {
              const { error } = await q;
              if (error) throw new Error(error.message);
            });
          }

          // ── Credit each imported receipt to the FRO named on it (agent/FSE) ──
          // The FRO is resolved by fuzzy name match; the donor is matched by
          // mobile (or created in that FRO's donor list when the number is new);
          // the amount is credited to that FRO and the donation is written to
          // the donor's history (fro_donor_log). No month gate — backfilled
          // receipts still get their history entry (their date keeps them out of
          // the current month's collected). Truly-suspense receipts (agent AND
          // mobile both missing) are skipped here and stay in the suspense pool.
          // Newly inserted rows and re-uploaded suspense→identified upgrades both
          // flow through here, so the credit + donor history is written once.
          const nowIso = new Date().toISOString();
          const donorIdByReceiptId = new Map();
          for (const [donorId, info] of Object.entries(receiptsByDonor)) {
            for (const id of info.ids) donorIdByReceiptId.set(id, parseInt(donorId, 10));
          }

          const creditPool = processRows.filter(
            r => !isBlankSuspenseValue(r.agent_name) && parseFloat(r.amount || 0) > 0
          );

          let leadsCollected = 0;
          const credits = new Map();
          if (creditPool.length > 0) {
            // Workers for this NGO (via worker_ngo_allocations), falling back to
            // all active workers when no allocation rows exist, plus their
            // station mapping so created assignments land on the right station.
            const { data: allocatedRows, error: allocErr } = await from('worker_ngo_allocations')
              .select('worker_id')
              .eq('ngo_id', ngo_id);
            if (allocErr) throw new Error(allocErr.message);
            let workerRows = [];
            if ((allocatedRows || []).length > 0) {
              const workerIds = [...new Set(allocatedRows.map(a => a.worker_id))];
              for (let i = 0; i < workerIds.length; i += 500) {
                const { data: wr, error: werr } = await from('workers')
                  .select('id, name, is_active')
                  .in('id', workerIds.slice(i, i + 500));
                if (werr) throw new Error(werr.message);
                workerRows.push(...(wr || []));
              }
            } else {
              const { data: wr, error: werr } = await from('workers')
                .select('id, name, is_active');
              if (werr) throw new Error(werr.message);
              workerRows = wr || [];
            }
            const activeWorkers = workerRows.filter(w => w.is_active !== false);

            const { data: stationRows, error: stErr } = await from('fro_station_assignments')
              .select('fro_worker_id, station')
              .eq('ngo_id', ngo_id);
            if (stErr) throw new Error(stErr.message);
            const stationByWorker = {};
            for (const s of (stationRows || [])) {
              if (s.fro_worker_id && s.station && !stationByWorker[s.fro_worker_id]) {
                stationByWorker[s.fro_worker_id] = s.station;
              }
            }

            // Fuzzy FRO-name match: exact first, then close name matches.
            const resolveWorker = (agentName) => {
              if (!agentName) return null;
              const an = String(agentName).trim().toLowerCase();
              const exact = activeWorkers.find(w => String(w.name || '').trim().toLowerCase() === an);
              if (exact) return exact;
              return activeWorkers.find(w => nameMatch(agentName, w.name)) || null;
            };

            // Pre-load the donors' existing assignments for this NGO so money can
            // close them (and credit their owner) instead of duplicating.
            // Reassigned rows are included too: fro_assignments is UNIQUE on
            // (donor_id, ngo_id), so reusing the existing row beats a duplicate.
            const poolDonorIds = [...new Set(creditPool.map(r => donorIdByReceiptId.get(r.id)).filter(Boolean))];
            const assignmentsByDonor = new Map();
            if (poolDonorIds.length > 0) {
              for (let i = 0; i < poolDonorIds.length; i += 1000) {
                const { data: aData, error: aErr } = await from('fro_assignments')
                  .select('id, donor_id, fro_worker_id, ngo_id, status, assigned_at')
                  .in('donor_id', poolDonorIds.slice(i, i + 1000))
                  .eq('ngo_id', ngo_id);
                if (aErr) throw new Error(aErr.message);
                for (const a of (aData || [])) {
                  const cur = assignmentsByDonor.get(a.donor_id);
                  const isReassigned = a.status === 'reassigned';
                  if (!cur) { assignmentsByDonor.set(a.donor_id, a); continue; }
                  const curReassigned = cur.status === 'reassigned';
                  if (!isReassigned && curReassigned) { assignmentsByDonor.set(a.donor_id, a); continue; }
                  if (isReassigned === curReassigned && new Date(a.assigned_at || 0) > new Date(cur.assigned_at || 0)) {
                    assignmentsByDonor.set(a.donor_id, a);
                  }
                }
              }
            }

            const logs = [];
            const closeAssignmentIds = new Set();
            const newDonorTotals = new Map();

            for (const r of creditPool) {
              const worker = resolveWorker(r.agent_name);
              if (!worker) continue; // unknown FRO → keep receipt, skip credit until resolved

              let donorId = donorIdByReceiptId.get(r.id) || null;
              if (!donorId) {
                // Agent present but no donor yet (mobile missing / number not in
                // the DB) → create the donor under this FRO's donor list. Only
                // when the row carries a usable mobile number: donor_profiles.
                // mobile_number is NOT NULL, so a blank number can't be stored
                // and there is nothing to credit against — skip instead of
                // aborting the whole import.
                const mobile = cleanMobile(r.donor_mobile);
                if (!mobile) continue;
                const { data: created, error: cErr } = await from('donor_profiles')
                  .upsert({
                    name: r.donor_name || 'Unknown Donor',
                    mobile_number: mobile,
                    project_supported: r.project_id,
                    total_amount: 0,
                    donation_count: 0,
                    created_at: nowIso,
                    updated_at: nowIso,
                  }, { onConflict: 'mobile_number', ignoreDuplicates: true })
                  .select('id, mobile_number, total_amount, donation_count, last_donation_date');
                if (cErr) throw new Error(cErr.message);
                let donorRow = (created || [])[0] || null;
                if (!donorRow) {
                  const { rows: existing } = await db._pool.query(
                    `SELECT id, mobile_number, total_amount, donation_count, last_donation_date
                     FROM donor_profiles WHERE mobile_number = $1`, [mobile]
                  );
                  donorRow = (existing || [])[0] || null;
                }
                if (!donorRow) continue; // still no donor → keep the receipt uncredited
                donorId = donorRow.id;
                matched++;
                const m10 = last10(donorRow.mobile_number);
                if (/^\d{10}$/.test(m10) && !donorByMobile.has(m10)) donorByMobile.set(m10, donorRow);
                donorIdByReceiptId.set(r.id, donorId);
                const { error: linkErr } = await from('receipts').update({ donor_id: donorId }).eq('id', r.id);
                if (linkErr) throw new Error(linkErr.message);
                newDonorTotals.set(donorId, { amount: 0, count: 0, last: null });
              }

              // Reuse the donor's existing assignment for this NGO (its owner
              // keeps the credit — never steal) or open one under this FRO.
              let assignment = assignmentsByDonor.get(donorId) || null;
              if (!assignment) {
                const { data: created, error: asErr } = await from('fro_assignments')
                  .insert({
                    donor_id: donorId,
                    fro_worker_id: worker.id,
                    ngo_id,
                    station: stationByWorker[worker.id] || null,
                    status: 'donation_collected',
                    assigned_at: nowIso,
                  })
                  .select('id, fro_worker_id, status')
                  .single();
                if (asErr) throw new Error(asErr.message);
                assignment = created;
                assignmentsByDonor.set(donorId, assignment);
              }

              const froWorkerId = assignment.fro_worker_id;
              if (!froWorkerId) continue;

              const amount = parseFloat(r.amount || 0);
              const t = newDonorTotals.get(donorId);
              if (t) {
                t.amount += amount;
                t.count += 1;
                if (r.receipt_date && (!t.last || r.receipt_date > t.last)) t.last = r.receipt_date;
              }

              logs.push({
                assignment_id: assignment.id,
                donor_id: donorId,
                fro_worker_id: froWorkerId,
                action: 'donation',
                amount_collected: amount,
                accounts_status: 'verified',
                verified_at: r.receipt_date || nowIso,
                verified_by: req.user.id,
                created_by: req.user.id,
                upi_transaction_id: r.payment_id || null,
                transaction_datetime: r.receipt_date || null,
                pan_number: r.pan_number || null,
                notes: `Auto-credited from imported receipt ${r.receipt_no || r.id}`,
              });
              closeAssignmentIds.add(assignment.id);
              const cred = credits.get(froWorkerId) || { count: 0, total: 0 };
              cred.count += 1;
              cred.total += amount;
              credits.set(froWorkerId, cred);
            }

            // Donors created in this phase get their first donation rolled up.
            if (newDonorTotals.size > 0) {
              for (const [donorId, t] of newDonorTotals) {
                const { error: dtErr } = await from('donor_profiles').update({
                  total_amount: Math.round(t.amount * 100) / 100,
                  donation_count: t.count,
                  first_donation_date: t.last,
                  last_donation_date: t.last,
                  updated_at: nowIso,
                }).eq('id', donorId);
                if (dtErr) throw new Error(dtErr.message);
              }
            }

            if (logs.length > 0) {
              const LOG_BATCH = 500;
              const logChunks = [];
              for (let i = 0; i < logs.length; i += LOG_BATCH) logChunks.push(logs.slice(i, i + LOG_BATCH));
              await mapLimit(logChunks, 2, async (chunk) => {
                const { error } = await from('fro_donor_logs').insert(chunk);
                if (error) throw new Error(error.message);
              });
              leadsCollected = logs.length;

              // Change the donor's status: close the assignments the money
              // settled (leave already-closed rows untouched).
              if (closeAssignmentIds.size > 0) {
                const { error: closeErr } = await from('fro_assignments')
                  .update({ status: 'donation_collected', last_contacted_at: nowIso })
                  .in('id', [...closeAssignmentIds])
                  .neq('status', 'donation_collected');
                if (closeErr) throw new Error(closeErr.message);
              }
            }
          }

          return { imported: inserted.length, upgraded, creditedPending, matched, withBank, leadsCollected, credits };
        });
        console.timeEnd('import-tx');
        console.log(`Import OK: ${result.imported} rows, ${result.upgraded} re-upload credits, ${result.creditedPending} pending claims auto-credited, ${result.leadsCollected} leads credited`);

        // Notify FROs whose pending claims were auto-verified from a re-upload —
        // best effort, after the commit (a notification failure must never abort
        // the import transaction).
        for (const notif of resultVerifyNotifications) {
          try {
            let fcmLogged = false;
            try {
              const pushResult = await sendPushNotification(notif.worker_id, notif.title, notif.body, 'lead_verified', null);
              fcmLogged = !!pushResult;
            } catch (err) { console.error('FCM send error:', err.message); }
            if (!fcmLogged) {
              await db.from('notification_log').insert({
                worker_id: notif.worker_id,
                type: notif.type,
                title: notif.title,
                body: notif.body,
                fro_donor_log_id: notif.fro_donor_log_id,
                sent_at: notif.sent_at,
              });
            }
          } catch (err) { console.error('Failed to create verified-lead notification:', err.message); }
        }

        // Notify FROs (aggregated per worker) — best effort, after the commit.
        for (const [workerId, cred] of result.credits) {
          try {
            const notifTitle = 'Lead Collected';
            const notifBody = `Your lead${cred.count > 1 ? 's' : ''} ${cred.count > 1 ? 'were' : 'was'} collected: \u20B9${cred.total.toLocaleString('en-IN')} across ${cred.count} receipt${cred.count > 1 ? 's' : ''}.`;
            let fcmLogged = false;
            try {
              const pushResult = await sendPushNotification(workerId, notifTitle, notifBody, 'lead_verified', null);
              fcmLogged = !!pushResult;
            } catch (err) { console.error('FCM send error:', err.message); }
            if (!fcmLogged) {
              await db.from('notification_log').insert({
                worker_id: workerId,
                type: 'lead_verified',
                title: notifTitle,
                body: notifBody,
                sent_at: new Date().toISOString(),
              });
            }
          } catch (err) { console.error('Failed to create collected notification:', err.message); }
        }

        // All-or-nothing committed — the safety manifest is no longer needed.
        try { if (manifestPath) fs.unlinkSync(manifestPath); } catch (_) { /* best effort */ }

        return res.status(201).json({
          message: `${result.imported} receipts imported${result.upgraded > 0 ? `, ${result.upgraded} suspense receipts credited from re-upload` : ''}${result.creditedPending > 0 ? `, ${result.creditedPending} pending claims auto-credited` : ''}${dupCount > 0 ? `, ${dupCount} duplicates skipped` : ''}${result.matched > 0 ? `, ${result.matched} linked to donors` : ''}${result.leadsCollected > 0 ? `, ${result.leadsCollected} leads credited to FROs` : ''}`,
          imported: result.imported,
          upgraded: result.upgraded,
          creditedPending: result.creditedPending,
          withBank: result.withBank,
          matchedDonors: result.matched,
          leads_collected: result.leadsCollected,
        });

      } catch (err) {
        lastError = err;
        console.warn(`Import attempt ${attempt} failed:`, err.message);
        if (attempt === MAX_RETRIES) {
          const hint = isConnExhausted(err) ? ' The database connection limit is reached; wait a moment and try again.' : '';
          return res.status(500).json({ message: `Import failed after ${MAX_RETRIES} attempts: ${err.message}${hint}${manifestPath ? ` Your data is safe and saved at: ${manifestPath}` : ''}` });
        }
      }
    }

    return res.status(500).json({ message: 'Import failed: unknown error' });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const reverseDonorTotals = async () => {
  try {
    const { data: linked } = await db
      .from('receipts')
      .select('donor_id, amount')
      .not('donor_id', 'is', null);
    const safeLinked = linked || [];
    if (safeLinked.length === 0) return 0;

    const deductions = {};
    const donorIds = [];
    for (const r of safeLinked) {
      if (!deductions[r.donor_id]) {
        deductions[r.donor_id] = { amount: 0, count: 0 };
        donorIds.push(r.donor_id);
      }
      deductions[r.donor_id].amount += parseFloat(r.amount || 0);
      deductions[r.donor_id].count += 1;
    }

    const donorMap = {};
    const BATCH = 100;
    for (let i = 0; i < donorIds.length; i += BATCH) {
      const batch = donorIds.slice(i, i + BATCH);
      const { data: donors } = await db
        .from('donor_profiles')
        .select('id, total_amount, donation_count')
        .in('id', batch);
      for (const d of (donors || [])) donorMap[d.id] = d;
    }

    await Promise.all(
      Object.entries(deductions).map(([donorId, dec]) => {
        const donor = donorMap[donorId];
        if (!donor) return Promise.resolve();
        return db.from('donor_profiles').update({
          total_amount: Math.max(0, (donor.total_amount || 0) - dec.amount),
          donation_count: Math.max(0, (donor.donation_count || 0) - dec.count),
          first_donation_date: null,
          last_donation_date: null,
          updated_at: new Date().toISOString(),
        }).eq('id', donorId);
      })
    );

    try {
      for (let i = 0; i < donorIds.length; i += 500) {
        const chunk = donorIds.slice(i, i + 500);
        await db
          .from('fro_assignments')
          .update({ status: 'pending' })
          .in('donor_id', chunk)
          .eq('status', 'donation_collected');
      }
    } catch (assignErr) {
      console.warn('Assignment reset skipped:', assignErr.message);
    }
    return donorIds.length;
  } catch (err) {
    console.warn('Donor reversal skipped (column may not exist):', err.message);
    return 0;
  }
};

const deleteLinkedLogs = async (logIds) => {
  if (!logIds || logIds.length === 0) return 0;
  const BATCH = 500;
  let deleted = 0;
  for (let i = 0; i < logIds.length; i += BATCH) {
    const chunk = logIds.slice(i, i + BATCH);
    try {
      await db.from('notification_log').delete().in('fro_donor_log_id', chunk);
    } catch (e) {
      console.warn('notification_log cleanup skipped:', e.message);
    }
    try {
      await db.from('rejected_lead_tickets').delete().in('fro_donor_log_id', chunk);
    } catch (e) {
      console.warn('rejected_lead_tickets cleanup skipped:', e.message);
    }
    try {
      const { data } = await db.from('fro_donor_logs').delete().in('id', chunk).select('id');
      deleted += data?.length || 0;
    } catch (e) {
      console.warn('fro_donor_logs deletion skipped:', e.message);
    }
  }
  return deleted;
};

const cleanupImportAutoCredits = async () => {
  // Import auto-credit logs are never linked via receipts.log_id — they only
  // carry the assignment_id plus this notes marker. Deleting the receipts
  // alone leaves them (and their closed assignments) behind, which would both
  // keep old wrong FRO credits and block a re-upload from crediting again.
  let cleaned = 0;
  while (true) {
    const { data: logs } = await db
      .from('fro_donor_logs')
      .select('id, assignment_id')
      .ilike('notes', 'Auto-credited from imported receipt%')
      .limit(1000);
    const rows = logs || [];
    if (rows.length === 0) break;
    const ids = rows.map(r => r.id);
    const assignmentIds = [...new Set(rows.map(r => r.assignment_id).filter(Boolean))];
    try { await db.from('notification_log').delete().in('fro_donor_log_id', ids); } catch (e) { console.warn('notification_log cleanup skipped:', e.message); }
    const { data: deleted } = await db.from('fro_donor_logs').delete().in('id', ids).select('id');
    cleaned += deleted?.length || 0;
    if (assignmentIds.length > 0) {
      const { error } = await db.from('fro_assignments')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .in('id', assignmentIds)
        .eq('status', 'donation_collected');
      if (error) console.warn('assignment reopen skipped:', error.message);
    }
  }
  return cleaned;
};

const recomputeDonorTotals = async (donorIds) => {
  if (!donorIds || donorIds.length === 0) return 0;
  const { rows } = await db._pool.query(`
    SELECT donor_id::text AS donor_id,
           COALESCE(round(sum(amount)::numeric, 2), 0)::float8 AS total_amount,
           count(*)::int AS donation_count,
           min(receipt_date)::date AS first_donation_date,
           max(receipt_date)::date AS last_donation_date
    FROM receipts
    WHERE donor_id::text = ANY($1::text[])
    GROUP BY donor_id
  `, [donorIds.map(String)]);
  const agg = new Map(rows.map(r => [r.donor_id, r]));
  let updated = 0;
  const BATCH = 100;
  for (let i = 0; i < donorIds.length; i += BATCH) {
    const chunk = donorIds.slice(i, i + BATCH);
    const { data: donors } = await db.from('donor_profiles').select('id').in('id', chunk);
    for (const d of (donors || [])) {
      const a = agg.get(String(d.id));
      const hasRemaining = a && a.donation_count > 0;
      await db.from('donor_profiles').update({
        total_amount: hasRemaining ? a.total_amount : 0,
        donation_count: hasRemaining ? a.donation_count : 0,
        first_donation_date: hasRemaining ? a.first_donation_date : null,
        last_donation_date: hasRemaining ? a.last_donation_date : null,
        updated_at: new Date().toISOString(),
      }).eq('id', d.id);
      if (!hasRemaining) {
        try {
          await db.from('fro_assignments')
            .update({ status: 'pending' })
            .in('donor_id', [d.id])
            .eq('status', 'donation_collected');
        } catch (e) { console.warn('assignment reopen skipped:', e.message); }
      }
      updated++;
    }
  }
  return updated;
};

const cleanupDayAutoCredits = async (from, to) => {
  // Auto-credit logs store transaction_datetime = receipt date at session-midnight,
  // so cast the column to date for a timezone-independent day match.
  const nextDay = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
  let cleaned = 0;
  while (true) {
    const { rows: logs } = await db._pool.query(`
      SELECT id, assignment_id FROM fro_donor_logs
      WHERE notes ILIKE 'Auto-credited from imported receipt%'
        AND transaction_datetime::date >= $1 AND transaction_datetime::date < $2
      LIMIT 1000
    `, [from, nextDay]);
    const rows = logs || [];
    if (rows.length === 0) break;
    const ids = rows.map(r => r.id);
    const assignmentIds = [...new Set(rows.map(r => r.assignment_id).filter(Boolean))];
    try { await db.from('notification_log').delete().in('fro_donor_log_id', ids); } catch (e) { console.warn('notification_log cleanup skipped:', e.message); }
    const { data: deleted } = await db.from('fro_donor_logs').delete().in('id', ids).select('id');
    cleaned += deleted?.length || 0;
    if (assignmentIds.length > 0) {
      const { error } = await db.from('fro_assignments')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .in('id', assignmentIds)
        .eq('status', 'donation_collected');
      if (error) console.warn('assignment reopen skipped:', error.message);
    }
  }
  return cleaned;
};

const clearReceiptsByDate = async (from, to) => {
  let deleted = 0, deletedLogs = 0;
  const affected = new Set();
  const affectedProjects = new Set();
  while (true) {
    const { data: rows } = await db
      .from('receipts')
      .select('id, log_id, donor_id, project_id')
      .neq('id', 0)
      .gte('receipt_date', from)
      .lte('receipt_date', to)
      .limit(1000);
    const batchRows = rows || [];
    if (batchRows.length === 0) break;
    const ids = batchRows.map(r => r.id);
    // Reset linked bank_audit_entries BEFORE deleting (FK ON DELETE SET NULL
    // only clears receipt_id; receipt_no and status must be explicitly reset)
    if (ids.length > 0) {
      await db
        .from('bank_audit_entries')
        .update({
          receipt_id: null, receipt_no: null, status: 'unverified',
          match_status: null, match_source: null, match_score: null,
          matched_lead_log_id: null, matched_by: null, matched_at: null,
          donor_id: null, agent_name: null,
        })
        .in('receipt_id', ids);
    }
    const { data: delRows } = await db
      .from('receipts')
      .delete()
      .in('id', ids)
      .select('id, log_id, donor_id, project_id');
    const rowsOut = delRows || [];
    deleted += rowsOut.length;
    for (const r of rowsOut) {
      if (r.donor_id) affected.add(r.donor_id);
      if (r.project_id) affectedProjects.add(r.project_id);
    }
    deletedLogs += await deleteLinkedLogs(rowsOut.map(r => r.log_id).filter(Boolean));
  }
  // Reset receipt number counters so next receipt continues from last live number
  for (const projectId of affectedProjects) {
    try { await cancelReceiptNo(projectId); } catch (e) { /* ignore */ }
  }
  const cleanedAutoCredits = await cleanupDayAutoCredits(from, to);
  const recomputed = await recomputeDonorTotals([...affected]);
  const { count } = await db
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .gte('receipt_date', from)
    .lte('receipt_date', to);
  return { deleted, remaining: count || 0, recomputedDonors: recomputed, deletedLogs, cleanedAutoCredits };
};

export const importReceiptNames = async (req, res) => {
  try {
    const { rows, ngo_id } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No name rows provided' });
    }
    if (!ngo_id) {
      return res.status(400).json({ message: 'Please select the NGO this upload belongs to' });
    }
    const { data: ngoRow, error: ngoErr } = await db
      .from('ngos')
      .select('id, name, is_active')
      .eq('id', ngo_id)
      .single();
    if (ngoErr || !ngoRow || !ngoRow.is_active) {
      return res.status(400).json({ message: 'Selected NGO is invalid or inactive' });
    }
    const batchProjectId = ngoRow.name.toLowerCase();

    const byNo = new Map();
    for (const r of rows) {
      const no = String(r.receipt_no ?? '').trim();
      const name = String(r.donor_name ?? '').trim();
      if (!no || !name) continue;
      byNo.set(no, name);
    }
    const skipped = rows.length - byNo.size;
    const receiptNos = [...byNo.keys()];

    const receiptsByNo = new Map();
    if (receiptNos.length > 0) {
      for (let i = 0; i < receiptNos.length; i += 100) {
        const batch = receiptNos.slice(i, i + 100);
        const { data, error } = await db
          .from('receipts')
          .select('id, receipt_no, donor_id')
          .eq('project_id', batchProjectId)
          .in('receipt_no', batch);
        if (error) throw new Error(error.message);
        for (const r of (data || [])) receiptsByNo.set(String(r.receipt_no).trim(), r);
      }
    }

    const donorNameById = new Map();
    const updateQueries = [];
    for (const [no, name] of byNo) {
      const receipt = receiptsByNo.get(no);
      if (!receipt) continue;
      updateQueries.push(db.from('receipts').update({ donor_name: name }).eq('id', receipt.id));
      if (receipt.donor_id) donorNameById.set(parseInt(receipt.donor_id), name);
    }
    for (const q of updateQueries) {
      const { error } = await q;
      if (error) throw new Error(error.message);
    }

    for (const [donorId, name] of donorNameById) {
      const { error } = await db.from('donor_profiles')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', donorId);
      if (error) throw new Error(error.message);
    }

    return res.json({
      updated: updateQueries.length,
      notFound: receiptNos.length - updateQueries.length,
      skipped,
    });
  } catch (e) {
    console.error('importReceiptNames error:', e.message);
    return res.status(500).json({ message: 'Failed to update donor names: ' + e.message });
  }
};

export const getReceiptByMobile = async (req, res) => {
  try {
    const mobile = String(req.query.mobile || '').replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ message: 'A valid mobile number is required' });
    }
    const { rows } = await db._pool.query(
      `SELECT r.donor_name, r.address, r.pan_number, r.donor_mobile, r.donor_id, r.receipt_no, r.receipt_date,
              r.email,
              COALESCE(dp.address_2, '') AS address_2,
              COALESCE(dp.city, '') AS city,
              COALESCE(dp.pin_code, '') AS pin_code
       FROM receipts r
       LEFT JOIN donor_profiles dp ON dp.id = r.donor_id
       WHERE right(regexp_replace(r.donor_mobile, '[^0-9]', '', 'g'), 10) = $1
       ORDER BY r.receipt_date DESC NULLS LAST, r.id DESC
       LIMIT 1`,
      [mobile]
    );
    return res.json(rows[0] || null);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const clearReceipts = async (req, res) => {
  try {
    const batch = req.query.batch ? parseInt(req.query.batch) : null;
    const shouldReverse = req.query.reverse === '1';
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;

    if (from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ message: 'from must be in YYYY-MM-DD format' });
      if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ message: 'to must be in YYYY-MM-DD format' });
      const result = await clearReceiptsByDate(from, to || from);
      return res.json({ ...result, total: result.deleted + result.remaining });
    }

    const reversed = batch ? (shouldReverse ? await reverseDonorTotals() : 0) : await reverseDonorTotals();
    const cleanedAutoCredits = (batch ? shouldReverse : true) ? await cleanupImportAutoCredits() : 0;

    let deleted = 0, remaining = 0;
    let deletedLogs = 0;
    if (batch) {
      const { data: ids } = await db
        .from('receipts')
        .select('id, log_id')
        .neq('id', 0)
        .limit(batch);
      const batchIds = (ids || []).map(r => r.id);
      if (batchIds.length > 0) {
        const { data: rows } = await db
          .from('receipts')
          .delete()
          .in('id', batchIds)
          .select('id, log_id');
        deleted = rows?.length || 0;
        deletedLogs = await deleteLinkedLogs((rows || []).map(r => r.log_id).filter(Boolean));
      }
    } else {
      const { data: rows } = await db
        .from('receipts')
        .delete()
        .neq('id', 0)
        .select('id, log_id');
      deleted = rows?.length || 0;
      remaining = 0;
      deletedLogs = await deleteLinkedLogs((rows || []).map(r => r.log_id).filter(Boolean));
    }

    return res.json({ deleted, remaining, total: deleted + remaining, reversedDonorLinks: reversed, deletedLogs, cleanedAutoCredits });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getReceiptCount = async (req, res) => {
  try {
    const { count } = await db
      .from('receipts')
      .select('*', { count: 'exact', head: true });
    return res.json({ count: count || 0 });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Last issued + next upcoming receipt number per NGO. Read-only — never calls
// next_receipt_no() so viewing the numbers doesn't consume any receipt numbers.
export const getReceiptNumbers = async (req, res) => {
  try {
    const numbers = await modelGetReceiptNumbers();
    return res.json(numbers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Bare suspense receipts per NGO: unlinked (no donor, no log), truly suspense
// (agent name AND donor mobile both missing), not priyank, not already in a
// bank-audit entry. The same pool the bank-audit page counts as suspense.
export const getSuspenseByNgo = async (req, res) => {
  try {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
    const y = ist.getUTCFullYear();
    const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const monthStart = `${y}-${m}-01`;
    const lastDay = new Date(Date.UTC(y, ist.getUTCMonth() + 1, 0)).getUTCDate();
    const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    const { rows } = await db._pool.query(`
      SELECT project_id,
             count(*)::int AS count,
             COALESCE(round(sum(amount)::numeric, 2), 0)::float8 AS total_amount
      FROM receipts
      WHERE donor_id IS NULL AND log_id IS NULL
        AND (agent_name IS NULL OR trim(agent_name) = '' OR lower(trim(agent_name)) IN ('na', 'suspense'))
        AND (donor_mobile IS NULL OR trim(donor_mobile) = '' OR lower(trim(donor_mobile)) IN ('na', 'suspense'))
        AND lower(trim(COALESCE(agent_name, ''))) <> 'priyank shah'
        AND receipt_date >= $1 AND receipt_date <= $2
      GROUP BY project_id
      ORDER BY count(*) DESC
    `, [monthStart, monthEnd]);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const quickSearchDonors = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const query = q.trim();
    const { data, error } = await db
      .from('donor_profiles')
      .select('id,name,mobile_number,address_1,address_2,city,pin_code,pan_number,email')
      .or(`name.ilike.%${query}%,mobile_number.ilike.%${query}%`)
      .order('last_donation_date', { ascending: false, nullsFirst: false })
      .limit(8);
    if (error) throw error;
    return res.json(data || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getDonorsList = async (req, res) => {
  try {
    const { search, page = '1', limit = '50', ngo } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100000, Math.max(1, parseInt(limit) || 50));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = db
      .from('donor_profiles')
      .select('*', { count: 'exact' });

    if (search) {
      const q = search.trim();
      query = query.or(`name.ilike.%${q}%,mobile_number.ilike.%${q}%,city.ilike.%${q}%`);
    }

    let ngoRow = null;
    if (ngo && ngo.trim()) {
      const n = ngo.trim();
      const ids = new Set();
      const { data: matched } = await db
        .from('ngos')
        .select('id')
        .ilike('name', n)
        .maybeSingle();
      ngoRow = matched || null;
      if (ngoRow) {
        const { data: assigned } = await db
          .from('fro_assignments')
          .select('donor_id')
          .eq('ngo_id', ngoRow.id)
          .not('status', 'eq', 'reassigned');
        for (const a of assigned || []) if (a.donor_id) ids.add(a.donor_id);
      }
      const { data: byProfile } = await db
        .from('donor_profiles')
        .select('id')
        .ilike('ngo', `%${n}%`);
      for (const d of byProfile || []) ids.add(d.id);

      if (ids.size === 0) return res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
      query = query.in('id', [...ids]);
    }

    const { data, count, error } = await query
      .order('last_donation_date', { ascending: false, nullsFirst: false })
      .order('first_imported_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const donorIds = (data || []).map(d => d.id).filter(Boolean);
    if (donorIds.length > 0) {
      const { data: assignments } = await db
        .from('fro_assignments')
        .select('donor_id, fro_worker_id, station, ngo_id')
        .in('donor_id', donorIds)
        .not('status', 'eq', 'reassigned');

      const ngoIds = [...new Set((assignments || []).map(a => a.ngo_id).filter(Boolean))];
      const ngoMap = {};
      if (ngoIds.length > 0) {
        const { data: ngos } = await db
          .from('ngos')
          .select('id, name')
          .in('id', ngoIds);
        for (const n of ngos || []) ngoMap[n.id] = n.name;
      }

      const workerIds = [...new Set((assignments || []).map(a => a.fro_worker_id).filter(Boolean))];
      const workerMap = {};
      if (workerIds.length > 0) {
        const { data: workers } = await db
          .from('workers')
          .select('id, name')
          .in('id', workerIds);
        for (const w of workers || []) workerMap[w.id] = w.name;
      }

      const scopedAssignments = ngoRow
        ? (assignments || []).filter(a => a.ngo_id === ngoRow.id)
        : (assignments || []);

      const donorNgoMap = {};
      const donorAssignmentMap = {};
      const donorAssignmentList = {};
      for (const a of scopedAssignments) {
        if (!donorNgoMap[a.donor_id]) donorNgoMap[a.donor_id] = new Set();
        const ngoName = ngoMap[a.ngo_id];
        if (ngoName) donorNgoMap[a.donor_id].add(ngoName);

        if (!donorAssignmentMap[a.donor_id]) donorAssignmentMap[a.donor_id] = [];
        const name = workerMap[a.fro_worker_id];
        if (name) donorAssignmentMap[a.donor_id].push(`${name} (${a.station || '?'})`);

        if (!donorAssignmentList[a.donor_id]) donorAssignmentList[a.donor_id] = [];
        donorAssignmentList[a.donor_id].push({ name, station: a.station || '' });
      }

      for (const d of data || []) {
        const labels = donorAssignmentMap[d.id];
        d.assigned_to = labels && labels.length > 0 ? [...new Set(labels)].join(', ') : null;
        d.assignment_list = donorAssignmentList[d.id] || [];

        const ngoFromAssignments = donorNgoMap[d.id];
        if (ngoFromAssignments && ngoFromAssignments.size > 0) {
          if (d.ngo && ngoFromAssignments.has(d.ngo)) {
            d.ngo = d.ngo;
          } else {
            d.ngo = [...ngoFromAssignments].join(', ');
          }
        }
      }
    }

    return res.json({ data: data || [], total: count || 0, page: pageNum, limit: limitNum });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const exportDonors = async (req, res) => {
  try {
    const { search } = req.query;

    let query = db.from('donor_profiles').select('*');

    if (search && search.trim()) {
      const q = search.trim();
      query = query.or(`name.ilike.%${q}%,mobile_number.ilike.%${q}%,city.ilike.%${q}%`);
    }

    const { data: donors, error } = await query.order('last_donation_date', { ascending: false, nullsFirst: false });
    if (error) throw error;
    if (!donors || donors.length === 0) return res.json({ data: [], total: 0 });

    const donorIds = donors.map(d => d.id).filter(Boolean);

    // Chunked assignment fetch
    const latestByDonor = new Map();
    const ASSIGN_BATCH = 1000;
    for (let i = 0; i < donorIds.length; i += ASSIGN_BATCH) {
      const { data: assignments, error: asgnErr } = await db
        .from('fro_assignments')
        .select('donor_id, fro_worker_id, station, ngo_id, assigned_at')
        .in('donor_id', donorIds.slice(i, i + ASSIGN_BATCH))
        .not('status', 'eq', 'reassigned');
      if (asgnErr) throw asgnErr;
      for (const a of assignments || []) {
        const cur = latestByDonor.get(a.donor_id);
        const ts = (x) => new Date(x?.assigned_at || 0).getTime();
        if (!cur || ts(a) > ts(cur)) latestByDonor.set(a.donor_id, a);
      }
    }

    const assignments = [...latestByDonor.values()];

    const workerIds = [...new Set(assignments.map(a => a.fro_worker_id).filter(Boolean))];
    const workerMap = {};
    if (workerIds.length > 0) {
      for (let i = 0; i < workerIds.length; i += 500) {
        const { data: workers, error: wErr } = await db.from('workers').select('id, name').in('id', workerIds.slice(i, i + 500));
        if (wErr) throw wErr;
        for (const w of workers || []) workerMap[w.id] = w.name;
      }
    }

    const ngoIds = [...new Set(assignments.map(a => a.ngo_id).filter(Boolean))];
    const ngoMap = {};
    if (ngoIds.length > 0) {
      const { data: ngos, error: nErr } = await db.from('ngos').select('id, name').in('id', ngoIds);
      if (nErr) throw nErr;
      for (const n of ngos || []) ngoMap[n.id] = n.name;
    }

    // Fetch receipt details per donor by donor_id (chunked)
    const receiptsByDonor = new Map();
    const RECEIPT_BATCH = 500;
    for (let i = 0; i < donorIds.length; i += RECEIPT_BATCH) {
      const chunk = donorIds.slice(i, i + RECEIPT_BATCH);
      const { data: recs } = await db
        .from('receipts')
        .select('donor_id, receipt_no, amount, receipt_date, mode, payment_id, project_id')
        .in('donor_id', chunk)
        .order('receipt_date', { ascending: false });
      for (const r of recs || []) {
        if (!receiptsByDonor.has(r.donor_id)) receiptsByDonor.set(r.donor_id, []);
        receiptsByDonor.get(r.donor_id).push(r);
      }
    }

    // Second pass: catch receipts with donor_id = NULL matched by mobile or name
    const mobileToDonorId = new Map();
    const nameToDonorId = new Map();
    for (const d of donors) {
      const mob = String(d.mobile_number || '').trim();
      if (mob) mobileToDonorId.set(mob, d.id);
      const nm = String(d.name || '').trim().toLowerCase();
      if (nm) nameToDonorId.set(nm, d.id);
    }

    // Build WHERE: donor_id IS NULL AND (mobile or name matches)
    const mobileList = [...mobileToDonorId.keys()].filter(Boolean);
    const orConditions = [];
    if (mobileList.length > 0) {
      orConditions.push(`donor_mobile IN (${mobileList.map((_, i) => `$${i + 1}`).join(',')})`);
    }
    if (mobileList.length === 0) {
      // No mobiles to match — skip second pass
    } else {
      const mobileParams = [...mobileList];
      const whereNull = `donor_id IS NULL AND (${orConditions.join(' OR ')})`;
      try {
        const sql = `SELECT donor_id, donor_name, donor_mobile, receipt_no, amount, receipt_date, "mode", payment_id, project_id
                     FROM receipts WHERE ${whereNull} ORDER BY receipt_date DESC`;
        const { rows: unmatched } = await db._pool.query(sql, mobileParams);
        for (const r of unmatched || []) {
          const matchedMob = String(r.donor_mobile || '').trim();
          const matchedId = mobileToDonorId.get(matchedMob);
          if (matchedId) {
            if (!receiptsByDonor.has(matchedId)) receiptsByDonor.set(matchedId, []);
            receiptsByDonor.get(matchedId).push(r);
          }
        }
      } catch (err) {
        console.error('Export donors: unmatched receipt pass failed:', err.message);
      }

      // Also catch receipts with donor_id set but pointing to a donor not in the list
      // These are receipts where donor_id exists but we didn't fetch them (shouldn't happen but safety)
    }

    const rows = donors.map(d => {
      const a = latestByDonor.get(d.id);
      const recs = receiptsByDonor.get(d.id) || [];
      const receiptNos = recs.map(r => r.receipt_no).filter(Boolean).join(', ');
      const totalReceiptAmount = recs.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
      return {
        'Donor Name': d.name || d.bank_donor_name || d.agent_donor_name || '',
        'Mobile': d.mobile_number || '',
        'Email': d.email || '',
        'PAN': d.pan_number || '',
        'Address': d.address_1 || '',
        'Address 2': d.address_2 || '',
        'City': d.city || '',
        'Pin Code': d.pin_code || '',
        'NGO': a?.ngo_id ? (ngoMap[a.ngo_id] || d.ngo || '') : (d.ngo || ''),
        'Assigned To': a?.fro_worker_id ? (workerMap[a.fro_worker_id] || '') : '',
        'Station': a?.station || d.station || '',
        'Project': d.project_supported || '',
        'Total Amount': d.total_amount != null ? Number(d.total_amount) : 0,
        'Donations': d.donation_count != null ? Number(d.donation_count) : 0,
        'Last Donation': d.last_donation_date || '',
        'Receipt Numbers': receiptNos,
        'Receipt Count': recs.length,
        'Total Receipt Amount': totalReceiptAmount,
      };
    });

    return res.json({ data: rows, total: rows.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getDonorDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: donor, error: donorErr } = await db
      .from('donor_profiles')
      .select('*')
      .eq('id', id)
      .single();
    if (donorErr) throw donorErr;

    const { data: receipts, error: recErr } = await db
      .from('receipts')
      .select('*')
      .eq('donor_id', id)
      .order('receipt_date', { ascending: false });
    if (recErr) throw recErr;

    let assigned_agent = null;
    let assignment_station = null;
    let assignment_ngo = null;
    try {
      const { data: assignments } = await db
        .from('fro_assignments')
        .select('fro_worker_id, station, ngo_id')
        .eq('donor_id', id)
        .not('status', 'eq', 'reassigned')
        .order('assigned_at', { ascending: false });

      if (assignments && assignments.length > 0) {
        const a = assignments[0];
        if (a.fro_worker_id) {
          const { data: worker } = await db
            .from('workers')
            .select('name')
            .eq('id', a.fro_worker_id)
            .maybeSingle();
          assigned_agent = worker?.name || null;
        }
        assignment_station = a.station || null;
        if (a.ngo_id) {
          const { data: ngo } = await db
            .from('ngos')
            .select('name')
            .eq('id', a.ngo_id)
            .maybeSingle();
          assignment_ngo = ngo?.name || null;
        }
      }
    } catch (assignErr) {
      console.error('getDonorDetail: failed to load assignment:', assignErr.message);
    }

    return res.json({
      donor,
      receipts: receipts || [],
      receiptCount: receipts?.length || 0,
      totalAmount: (receipts || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0),
      assigned_agent,
      assignment_station,
      assignment_ngo,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Donor Profile Update ───────────────────────────────────

const EDITABLE_DONOR_FIELDS = {
  name: 'name',
  mobile_number: 'mobile_number',
  mobile_2: 'mobile_2',
  email: 'email',
  pan_number: 'pan_number',
  address_1: 'address_1',
  address_2: 'address_2',
  city: 'city',
  pin_code: 'pin_code',
  bank_donor_name: 'bank_donor_name',
  agent_donor_name: 'agent_donor_name',
  donors_bank_name: 'donors_bank_name',
  project_supported: 'project_supported',
  ngo: 'ngo',
  station: 'station',
  category: 'category',
  data_category: 'data_category',
  team: 'team',
  agent_name: 'agent_name',
  mop: 'mop',
  birth_date: 'birth_date',
};

export const updateDonor = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    const { data: existing, error: fetchErr } = await db
      .from('donor_profiles')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    const updateData = { updated_at: new Date().toISOString() };
    let changed = false;
    for (const [field, column] of Object.entries(EDITABLE_DONOR_FIELDS)) {
      if (field in updates) {
        const value = updates[field];
        updateData[column] = (value === '' || value === null) ? null : value;
        changed = true;
      }
    }

    if (!changed) {
      return res.status(400).json({ message: 'No editable donor fields provided' });
    }

    const { data: donor, error: updateErr } = await db
      .from('donor_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    return res.json({ donor, message: 'Donor updated' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Receipt Edit ─────────────────────────────────────────

export const getFroWorkersList = async (req, res) => {
  try {
    const { data, error } = await db
      .from('workers')
      .select('id, name')
      .eq('department', 'FRO')
      .eq('employment_status', 'active')
      .order('name', { ascending: true });
    if (error) throw error;
    return res.json(data || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateReceipt = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    const { data: receipt, error: rErr } = await db
      .from('receipts').select('*').eq('id', receiptId).maybeSingle();
    if (rErr) throw rErr;
    if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

    // Fields that can be edited on the receipt row
    const RECEIPT_EDITABLE = [
      'donor_name', 'donor_mobile', 'address', 'address_2', 'pan_number',
      'email', 'mobile_2', 'station', 'account_of', 'mode', 'agent_name',
      'project_id', 'caller_name', 'bank_name', 'payment_id', 'receipt_date', 'receipt_time',
    ];
    const receiptPatch = {};
    for (const field of RECEIPT_EDITABLE) {
      if (field in updates) {
        receiptPatch[field] = (updates[field] === '' || updates[field] === null) ? null : updates[field];
      }
    }

    // Detect FRO change
    const oldAgentName = (receipt.agent_name || '').trim();
    const newAgentName = (receiptPatch.agent_name ?? receipt.agent_name ?? '').trim();
    const froChanged = oldAgentName !== newAgentName && newAgentName !== '';

    if (froChanged) {
      // Find old FRO worker
      const { data: oldWorker } = await db
        .from('workers').select('id, name').eq('name', oldAgentName).maybeSingle();

      // Find new FRO worker
      const { data: newWorker } = await db
        .from('workers').select('id, name').eq('name', newAgentName).maybeSingle();
      if (!newWorker) {
        return res.status(400).json({ message: `FRO worker "${newAgentName}" not found` });
      }

      const amount = Number(receipt.amount || 0);

      // If there's a fro_donor_log linked, handle the assignment transfer
      if (receipt.log_id) {
        const { data: log } = await db
          .from('fro_donor_logs')
          .select('id, fro_worker_id, fro_assignments!inner(id, fro_worker_id, donor_id, ngo_id)')
          .eq('id', receipt.log_id)
          .maybeSingle();

        if (log) {
          const assignment = log.fro_assignments;

          // Detect cross-FRO receipt: verify_type = 'cross_fro' on the linked bank_audit_entry
          let isCrossFro = false;
          try {
            const { data: linkedEntry } = await db
              .from('bank_audit_entries')
              .select('verify_type')
              .eq('receipt_id', receiptId)
              .maybeSingle();
            isCrossFro = linkedEntry?.verify_type === 'cross_fro';
          } catch (_) {}

          // Reverse credit from old FRO's donor profile
          if (assignment?.donor_id && amount > 0) {
            try {
              const { data: donor } = await db
                .from('donor_profiles')
                .select('total_amount, donation_count')
                .eq('id', assignment.donor_id)
                .single();
              await db.from('donor_profiles').update({
                total_amount: Math.max(0, (donor?.total_amount || 0) - amount),
                donation_count: Math.max(0, (donor?.donation_count || 0) - 1),
                updated_at: new Date().toISOString(),
              }).eq('id', assignment.donor_id);
            } catch (err) {
              console.error('Failed to reverse donor totals on receipt edit:', err.message);
            }
          }

          // Update fro_donor_log FRO (credit always moves)
          await db.from('fro_donor_logs').update({
            fro_worker_id: newWorker.id,
          }).eq('id', log.id);

          // For cross-FRO receipts: do NOT transfer the assignment — the donor stays
          // under their original FRO. Only credit moves via the log update above.
          if (!isCrossFro && assignment?.id) {
            await db.from('fro_assignments').update({
              fro_worker_id: newWorker.id,
            }).eq('id', assignment.id);
          }

          // Credit to new FRO's donor profile
          if (assignment?.donor_id && amount > 0) {
            try {
              const { data: donor } = await db
                .from('donor_profiles')
                .select('total_amount, donation_count')
                .eq('id', assignment.donor_id)
                .single();
              await db.from('donor_profiles').update({
                total_amount: Math.round(((donor?.total_amount || 0) + amount) * 100) / 100,
                donation_count: (donor?.donation_count || 0) + 1,
                updated_at: new Date().toISOString(),
              }).eq('id', assignment.donor_id);
            } catch (err) {
              console.error('Failed to credit new FRO donor totals on receipt edit:', err.message);
            }
          }
        }
      } else if (receipt.donor_id && amount > 0) {
        // No log_id but has donor_id — reverse and re-credit directly
        try {
          const { data: donor } = await db
            .from('donor_profiles')
            .select('total_amount, donation_count')
            .eq('id', receipt.donor_id)
            .single();
          // Reverse old
          await db.from('donor_profiles').update({
            total_amount: Math.max(0, (donor?.total_amount || 0) - amount),
            donation_count: Math.max(0, (donor?.donation_count || 0) - 1),
            updated_at: new Date().toISOString(),
          }).eq('id', receipt.donor_id);
          // Credit new (same donor_id since no assignment转移)
          await db.from('donor_profiles').update({
            total_amount: Math.round(((donor?.total_amount || 0) - amount + amount) * 100) / 100,
            donation_count: (donor?.donation_count || 0), // net zero since same profile
            updated_at: new Date().toISOString(),
          }).eq('id', receipt.donor_id);
        } catch (err) {
          console.error('Failed to handle no-log FRO change on receipt edit:', err.message);
        }
      }
    }

    // Update the receipt
    const { data: updated, error: updErr } = await db
      .from('receipts')
      .update(receiptPatch)
      .eq('id', receiptId)
      .select()
      .single();
    if (updErr) throw updErr;

    // Update linked bank_audit_entry
    try {
      const { data: entry } = await db
        .from('bank_audit_entries')
        .select('id')
        .eq('receipt_id', receiptId)
        .maybeSingle();
      if (entry) {
        const entryPatch = { updated_at: new Date().toISOString() };
        if ('donor_name' in receiptPatch) entryPatch.payer_name = receiptPatch.donor_name;
        if ('donor_mobile' in receiptPatch) entryPatch.donor_mobile = receiptPatch.donor_mobile;
        if ('pan_number' in receiptPatch) entryPatch.donor_pan = receiptPatch.pan_number;
        if ('address' in receiptPatch) entryPatch.donor_address_1 = receiptPatch.address;
        if ('address_2' in receiptPatch) entryPatch.donor_address_2 = receiptPatch.address_2;
        if ('email' in receiptPatch) entryPatch.donor_email = receiptPatch.email;
        if ('agent_name' in receiptPatch) entryPatch.agent_name = receiptPatch.agent_name;
        if ('bank_name' in receiptPatch) entryPatch.bank_name = receiptPatch.bank_name;
        if ('mode' in receiptPatch) entryPatch.mode = receiptPatch.mode;
        if ('payment_id' in receiptPatch) entryPatch.payment_id = receiptPatch.payment_id;
        if ('receipt_date' in receiptPatch) entryPatch.transaction_date = receiptPatch.receipt_date;
        if ('receipt_time' in receiptPatch) entryPatch.payment_time = receiptPatch.receipt_time;
        if (updates.received_bank) {
          const { data: src } = await db.from('bank_audit_sources').select('id').ilike('name', updates.received_bank).maybeSingle();
          if (src) entryPatch.source_id = src.id;
        }
        await db.from('bank_audit_entries').update(entryPatch).eq('id', entry.id);
      }
    } catch (err) {
      console.error('Failed to update linked bank audit entry:', err.message);
    }

    // Update donor_profiles
    if (receipt.donor_id) {
      try {
        const dpPatch = { updated_at: new Date().toISOString() };
        const dpMap = {
          donor_name: 'name', donor_mobile: 'mobile_number', pan_number: 'pan_number',
          address: 'address_1', address_2: 'address_2', email: 'email',
          mobile_2: 'mobile_2', station: 'station',
        };
        for (const [rField, dpField] of Object.entries(dpMap)) {
          if (rField in receiptPatch) dpPatch[dpField] = receiptPatch[rField];
        }
        if (Object.keys(dpPatch).length > 1) {
          await db.from('donor_profiles').update(dpPatch).eq('id', receipt.donor_id);
        }
      } catch (err) {
        console.error('Failed to update donor profile on receipt edit:', err.message);
      }
    }

    return res.json({ receipt: updated, message: 'Receipt updated' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

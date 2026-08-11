import db from '../config/db.js';
import { createReceipt, findReceiptByLogId } from '../models/receiptModel.js';
import { sendPushNotification } from '../services/fcmService.js';
import { getEntryByPaymentId, verifyEntry, getNextReceiptNo } from '../models/bankAuditModel.js';
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
        fro_assignments!inner(
          id,
          donor_id,
          fro_worker_id,
          ngo_id,
          status,
          ngos!left(id, name),
          donor_profiles!inner(id, name, mobile_number, city, pan_number, address_1, email, project_supported, donation_count, total_amount, birth_date),
          workers!inner(id, name, login_id)
        )
      `)
      .eq('action', 'disposition')
      .eq('disposition_detail', 'lead_done')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('accounts_status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    const logIds = (data || []).map(r => r.id);
    const receiptMap = {};
    if (logIds.length) {
      const { data: claimedReceipts, error: receiptErr } = await db
        .from('receipts')
        .select('id, receipt_no, donor_id, log_id')
        .in('log_id', logIds);
      if (!receiptErr) {
        for (const rc of (claimedReceipts || [])) {
          if (rc.log_id != null && !receiptMap[rc.log_id]) receiptMap[rc.log_id] = rc;
        }
      }
    }

    const result = (data || []).map(r => ({
      log_id: r.id,
      amount: r.amount_collected,
      screenshot_url: r.payment_screenshot_url,
      accounts_status: r.accounts_status,
      pan_number: r.pan_number,
      notes: r.notes,
      remark: r.remark,
      rejection_reason: r.rejection_reason,
      created_at: r.created_at,
      assignment_id: r.assignment_id,
      assignment_status: r.fro_assignments?.status || 'lead_done',
      donor_id: r.fro_assignments?.donor_id,
      donor_name: r.fro_assignments?.donor_profiles?.name || 'Unknown',
      donor_mobile: r.fro_assignments?.donor_profiles?.mobile_number || '',
      donor_city: r.fro_assignments?.donor_profiles?.city || '',
      donor_pan: r.fro_assignments?.donor_profiles?.pan_number || '',
      donor_address: r.fro_assignments?.donor_profiles?.address_1 || '',
      donor_email: r.fro_assignments?.donor_profiles?.email || '',
      donor_project: (r.fro_assignments?.ngos?.name === 'BSCT' ? 'bsct' : r.fro_assignments?.ngos?.name === 'AFLF' ? 'aflf' : r.fro_assignments?.ngos?.name === 'MANN' ? 'maan' : r.fro_assignments?.donor_profiles?.project_supported) || '',
      donor_dob: r.fro_assignments?.donor_profiles?.birth_date || '',
      donation_count: r.fro_assignments?.donor_profiles?.donation_count || 0,
      total_donated: r.fro_assignments?.donor_profiles?.total_amount || 0,
      upi_transaction_id: r.upi_transaction_id || null,
      transaction_datetime: r.transaction_datetime || null,
      payment_from: r.payment_from || null,
      payment_mode: r.payment_mode || null,
      verified_at: r.verified_at || null,
      agent_id: r.fro_worker_id,
      agent_name: r.fro_assignments?.workers?.name || 'Unknown',
      agent_login: r.fro_assignments?.workers?.login_id || '',
      claimed_receipt: receiptMap[r.id] || null,
    }));

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
      donor_name, donor_mobile, donor_city, donor_email, donor_pan, donor_address,
      upi_transaction_id, transaction_datetime, payment_from, payment_mode,
    } = req.body;

    const { data: log, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, donor_profiles!inner(id, name, mobile_number, city, address_1, email, pan_number, project_supported))')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    if (log.accounts_status !== 'pending') {
      return res.status(400).json({ message: `This lead has already been ${log.accounts_status || 'processed'}` });
    }

    const assignmentId = log.fro_assignments?.id;
    const donorProfile = log.fro_assignments?.donor_profiles;
    if (!assignmentId || !donorProfile) {
      return res.status(400).json({ message: 'Associated assignment/donor not found' });
    }

    const logUpdate = {
      accounts_status: 'verified',
      verified_at: new Date().toISOString(),
      verified_by: req.user.id,
      pan_number: pan_number || log.pan_number || null,
      notes: notes || log.notes || null,
    };
    if (upi_transaction_id !== undefined) logUpdate.upi_transaction_id = upi_transaction_id || null;
    if (transaction_datetime !== undefined) logUpdate.transaction_datetime = transaction_datetime || null;
    if (payment_from !== undefined) logUpdate.payment_from = payment_from || null;

    const { error: updateLogError } = await db
      .from('fro_donor_logs')
      .update(logUpdate)
      .eq('id', logId);

    if (updateLogError) throw updateLogError;

    const { error: updateAsgnError } = await db
      .from('fro_assignments')
      .update({
        status: 'donation_collected',
        last_contacted_at: new Date().toISOString(),
      })
      .eq('id', assignmentId);

    if (updateAsgnError) throw updateAsgnError;

    const donorId = log.fro_assignments?.donor_id;
    if (donorId) {
      const donorUpdate = { updated_at: new Date().toISOString() };
      if (donor_name !== undefined) donorUpdate.name = donor_name || null;
      if (donor_mobile !== undefined) donorUpdate.mobile_number = donor_mobile || null;
      if (donor_city !== undefined) donorUpdate.city = donor_city || null;
      if (donor_email !== undefined) donorUpdate.email = donor_email || null;
      if (donor_pan !== undefined || pan_number) donorUpdate.pan_number = pan_number || donor_pan || null;
      if (donor_address !== undefined) donorUpdate.address_1 = donor_address || null;
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

    const existing = await findReceiptByLogId(logId);
    let receipt = existing || null;
    if (!existing) {
      const donorName = donorProfile?.name || 'Unknown';
      const project = donorProfile?.project_supported || 'bsct';
      const receiptNo = await getNextReceiptNo(project);

      receipt = await createReceipt({
        log_id: parseInt(logId),
        receipt_no: receiptNo,
        project_id: project,
        donor_name: donorName,
        donor_mobile: donorProfile?.mobile_number || null,
        amount: log.amount_collected || 0,
        pan_number: pan_number || log.pan_number || donorProfile?.pan_number || null,
        address: donor_address || donorProfile?.address_1 || null,
        mode: payment_mode || null,
        purpose: 'General Donation',
        generated_by: req.user.id,
        donor_id: donorId,
        receipt_date: transaction_datetime || log.transaction_datetime || log.verified_at || new Date().toISOString(),
      });
    } else {
      // Receipt already exists (e.g. created for a bank audit entry or a suspense
      // claim). Link it to the verified donor and mark its bank audit entry done.
      try {
        await db.from('receipts').update({ donor_id: donorId }).eq('id', existing.id);
        await db.from('bank_audit_entries').update({
          donor_id: donorId,
          status: 'verified',
          matched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('receipt_id', existing.id);
      } catch (err) { console.error('Failed to link existing receipt to donor:', err.message); }
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

    // Auto-verify matching bank audit entry if UPI transaction ID matches
    if (upi_transaction_id) {
      try {
        const bankEntry = await getEntryByPaymentId(upi_transaction_id);
        if (bankEntry) {
          await verifyEntry(bankEntry.id);
        }
      } catch (err) { console.error('Failed to auto-verify bank audit entry:', err.message); }
    }

    return res.json({ message: 'Lead verified, receipt generated', receipt });
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

    const { data: log, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, ngo_id, station, donor_profiles!inner(id, name, mobile_number))')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

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

    const { data: log, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, fro_worker_id, donor_id, status, donor_profiles!inner(id, name, mobile_number))')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

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
    // a verification-only receipt or release the money back to the pool.
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
          updated_at: new Date().toISOString(),
        }).eq('id', entry.id);
        if (eErr) console.error('Failed to revert bank audit entry on go-back:', eErr.message);
      }

      if (receipt.purpose === 'General Donation' && !entry) {
        try { await db.from('receipts').delete().eq('id', receipt.id); }
        catch (err) { console.error('Failed to delete verification receipt on go-back:', err.message); }
      } else {
        try { await db.from('receipts').update({ log_id: null, donor_id: null }).eq('id', receipt.id); }
        catch (err) { console.error('Failed to release receipt on go-back:', err.message); }
      }
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

    const { data: log, error: logError } = await db
      .from('fro_donor_logs')
      .select('*, fro_assignments!inner(id, donor_id, donor_profiles!inner(id, name, mobile_number))')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    if (log.action !== 'disposition' || log.disposition_detail !== 'lead_done') {
      return res.status(400).json({ message: 'Only lead verification entries can be undone' });
    }

    if (log.accounts_status !== 'verified') {
      return res.status(400).json({ message: `This lead is ${log.accounts_status || 'processed'} and cannot be undone` });
    }

    const donorId = log.fro_assignments?.donor_id;

    // Bring the lead back to Lead Verification.
    const { error: revertError } = await db
      .from('fro_donor_logs')
      .update({ accounts_status: 'pending', verified_at: null, verified_by: null })
      .eq('id', logId);
    if (revertError) throw revertError;

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

    // Unlink the receipt from the donor/lead (kept, not deleted).
    const receipt = await findReceiptByLogId(logId);
    if (receipt) {
      try { await db.from('receipts').update({ log_id: null, donor_id: null }).eq('id', receipt.id); }
      catch (err) { console.error('Failed to unlink receipt on undo:', err.message); }
    }

    // Send the linked bank audit entry back to Bank Audit (unverified).
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
          updated_at: new Date().toISOString(),
        }).eq('id', entry.id);
        if (eErr) console.error('Failed to revert bank audit entry on undo:', eErr.message);
      }
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

export const deleteLead = async (req, res) => {
  try {
    const { logId } = req.params;

    const { data: log, error: logError } = await db
      .from('fro_donor_logs')
      .select('id, action, disposition_detail, accounts_status, fro_worker_id, fro_assignments!inner(id, status, donor_id, fro_worker_id)')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    if (log.action !== 'disposition' || log.disposition_detail !== 'lead_done') {
      return res.status(400).json({ message: 'Only lead verification entries can be deleted' });
    }

    if (log.accounts_status !== 'pending') {
      return res.status(400).json({ message: `Only pending leads can be deleted (this one is ${log.accounts_status || 'processed'})` });
    }

    const assignmentId = log.fro_assignments?.id;

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

    // Revert the assignment so the FRO can rework this lead
    if (assignmentId) {
      const { error: asgnError } = await db
        .from('fro_assignments')
        .update({ status: 'pending', last_contacted_at: new Date().toISOString() })
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
      const { error: delError } = await db
        .from('fro_donor_logs')
        .delete()
        .in('id', ids);
      if (delError) throw delError;
    }

    if (assignmentIds.length > 0) {
      const { error: asgnError } = await db
        .from('fro_assignments')
        .update({ status: 'pending', last_contacted_at: new Date().toISOString() })
        .in('id', assignmentIds)
        .eq('status', 'lead_done');
      if (asgnError) throw asgnError;
    }

    return res.json({ message: 'Pending leads deleted', deleted: ids.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── Inline Field Update ───────────────────────────────────

const ALLOWED_FIELDS = ['upi_transaction_id', 'transaction_datetime', 'payment_from', 'pan_number', 'notes', 'remark',
  'donor_name', 'donor_mobile', 'donor_city', 'donor_email', 'donor_pan', 'donor_address'];

const DONOR_FIELD_MAP = {
  donor_name: 'name',
  donor_mobile: 'mobile_number',
  donor_city: 'city',
  donor_email: 'email',
  donor_pan: 'pan_number',
  donor_address: 'address_1',
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
      const { data: log, error: logError } = await db
        .from('fro_donor_logs')
        .select('id, fro_assignments!inner(donor_id)')
        .eq('id', logId)
        .single();

      if (logError || !log) {
        return res.status(404).json({ message: 'Log entry not found' });
      }

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

    const { data: log, error: logError } = await db
      .from('fro_donor_logs')
      .select(`
        id, amount_collected, pan_number, notes, transaction_datetime, verified_at,
        fro_assignments!inner(
          donor_id,
          fro_worker_id,
          donor_profiles!inner(id, name, mobile_number, city, address_1, email, pan_number, project_supported),
          workers!inner(id, name, login_id)
        )
      `)
      .eq('id', logId)
      .single();

    if (logError || !log) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    const donorProfile = log.fro_assignments?.donor_profiles;
    const project = donorProfile?.project_supported || 'bsct';
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
      address: address || donorProfile?.address_1 || null,
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
    const link = req.query.link === 'unlinked' ? 'unlinked' : (req.query.link === 'linked' ? 'linked' : '');

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

    const where = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(donor_name ILIKE $${params.length} OR receipt_no ILIKE $${params.length})`);
    }
    if (project) {
      params.push(project);
      where.push(`project_id = $${params.length}`);
    }
    if (link === 'linked') where.push('donor_id IS NOT NULL');
    if (link === 'unlinked') where.push('donor_id IS NULL');
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await db._pool.query(`SELECT count(*)::int AS n FROM receipts ${whereSql}`, params);

    params.push(limit, (page - 1) * limit);
    const rowsRes = await db._pool.query(
      `SELECT id, log_id, receipt_no, project_id, donor_name, donor_mobile, amount,
              receipt_date, receipt_time, mode, payment_id, bank_name, address, pan_number, email,
              donor_id, agent_name, sent, sent_at, created_at
       FROM receipts ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      data: rowsRes.rows,
      total: totalRes.rows[0].n,
      statsByProject: statsRes.rows,
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
        receipt_id: r.id,
        sent: r.sent || false,
        log_id: r.log_id,
        'Project': (log?.fro_assignments?.ngos?.name === 'BSCT' ? 'bsct' : log?.fro_assignments?.ngos?.name === 'AFLF' ? 'aflf' : log?.fro_assignments?.ngos?.name === 'MANN' ? 'maan' : donor?.project_supported) || '',
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
          receipt_no: row.receipt_no || row['Receipt No'] || row['Receipt No.'] || '',
          project_id: projectId,
          donor_name: donorName,
          donor_mobile: row.donor_mobile || row['Donor Mobile'] || row['Mobile No.'] || null,
          amount: parseFloat(rawAmount) || 0,
          pan_number: row.pan_number || row['PAN No.'] || row['PAN No'] || row['Pan No'] || null,
          address: row.address || row['Address 1'] || row['Address-1'] || null,
          mode: row.mode || row['Mode of Payment (MOP)'] || row['MOP'] || null,
          purpose: row.purpose || row['Purpose'] || 'General Donation',
          receipt_date: normalizeReceiptDate(row.receipt_date || row['Receipt Date'] || row['Transaction Date'] || row.transaction_date),
          receipt_time: normalizeReceiptTime(row.receipt_time || row['Receipt Time'] || row['Time'] || row.time),
          generated_by: row.generated_by || req.user.id,
          email: row.email || row['Mail Id'] || row['Email ID'] || null,
          payment_id: row.payment_id || row['Payment Id No.'] || null,
          bank_name: row.bank_name || row['Received Bank'] || row['Donors Bank Name'] || null,
          agent_name: row.agent_name || row['FSE Name'] || row['Fse Name'] || row['Agent Name'] || 'Suspense',
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
    // own receipt-number series (1..n) never collides with another NGO's.
    const incomingNos = [...new Set(parsed.map(p => p.parsed.receipt_no).filter(Boolean))];
    const existingReceiptIds = new Map();
    if (incomingNos.length > 0) {
      for (let i = 0; i < incomingNos.length; i += 100) {
        const batch = incomingNos.slice(i, i + 100);
        const { data: existing } = await db
          .from('receipts')
          .select('id, receipt_no')
          .eq('project_id', batchProjectId)
          .in('receipt_no', batch);
        for (const r of (existing || [])) existingReceiptIds.set(r.receipt_no, r.id);
      }
    }

    const seen = new Set();
    const uniqueParsed = parsed.filter(({ parsed }) => {
      if (parsed.receipt_no && existingReceiptIds.has(parsed.receipt_no)) return false;
      const key = parsed.receipt_no || `${parsed.donor_name}_${parsed.amount}_${parsed.receipt_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const dupCount = parsed.length - uniqueParsed.length;

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
        const result = await db.transaction(async ({ from }) => {
          // Retry-safe dedupe: anything already in the DB is skipped, so a
          // re-upload (or a partial previous run) never creates duplicates.
          // Scoped by NGO (project_id) so each NGO's own 1..n series is deduped
          // against itself only.
          const nos = uniqueRows.map(r => r.receipt_no).filter(Boolean);
          const alreadyInserted = new Set();
          if (nos.length > 0) {
            const DEDUPE_BATCH = 1000;
            for (let i = 0; i < nos.length; i += DEDUPE_BATCH) {
              const { data: existing, error: dedupeErr } = await from('receipts')
                .select('receipt_no')
                .eq('project_id', batchProjectId)
                .in('receipt_no', nos.slice(i, i + DEDUPE_BATCH));
              if (dedupeErr) throw new Error(dedupeErr.message);
              for (const r of (existing || [])) alreadyInserted.add(r.receipt_no);
            }
          }
          const toInsert = uniqueRows.filter(r => !r.receipt_no || !alreadyInserted.has(r.receipt_no));

          // A repeat upload must not create a duplicate receipt, but it can
          // enrich an existing receipt with the FSE/agent name and, when present
          // in the newer sheet, the receipt date and time.
          const enrichUpdates = parsed
            .filter(({ parsed: row }) => row.receipt_no && existingReceiptIds.has(row.receipt_no))
            .map(({ parsed: row }) => {
              const patch = {};
              if (row.agent_name) patch.agent_name = row.agent_name;
              if (row.receipt_time) patch.receipt_time = row.receipt_time;
              if (row.receipt_date) patch.receipt_date = row.receipt_date;
              return { id: existingReceiptIds.get(row.receipt_no), patch };
            })
            .filter(({ patch }) => Object.keys(patch).length > 0);
          await mapLimit(enrichUpdates.map(({ id, patch }) =>
            from('receipts').update(patch).eq('id', id)
          ), MAX_QUERY_CONCURRENCY, async (q) => {
            const { error } = await q;
            if (error) throw new Error(error.message);
          });

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

          let matched = 0;
          let withBank = 0;
          let receiptsByDonor = {};
          if (inserted.length > 0) {
            const mobiles = [...new Set(
              inserted.map(r => (r.donor_mobile || '').replace(/\D/g, '')).filter(m => m.length >= 10)
            )];

            const donorByMobile = {};
            if (mobiles.length > 0) {
              for (let i = 0; i < mobiles.length; i += 100) {
                const batch = mobiles.slice(i, i + 100);
                const { data: donors, error: donorErr } = await from('donor_profiles')
                  .select('id, mobile_number, total_amount, donation_count, last_donation_date')
                  .in('mobile_number', batch);
                if (donorErr) throw new Error(donorErr.message);
                for (const d of (donors || [])) {
                  donorByMobile[(d.mobile_number || '').replace(/\D/g, '')] = d;
                }
              }
            }

            receiptsByDonor = {};
            for (const receipt of inserted) {
              const mobile = (receipt.donor_mobile || '').replace(/\D/g, '');
              if (mobile.length < 10) continue;
              const donor = donorByMobile[mobile];
              if (!donor) continue;
              matched++;
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
              // A failed link/donor update aborts the whole import (rollback) —
              // it must never silently leave an unlinked receipt behind.
              await mapLimit(updates, MAX_QUERY_CONCURRENCY, async (q) => {
                const { error } = await q;
                if (error) throw new Error(error.message);
              });
            }
            withBank = inserted.filter(r => r.bank_name && r.bank_name !== 'NA').length;
          }

          // ── Auto-credit current-month receipts to the assigned FRO ──
          // Only receipts dated in the current month can close an open lead and
          // add to the FRO's collected; older/backfilled rows stay as history.
          const nowD = new Date();
          const currentMonth = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
          const isCurrentMonth = (d) => typeof d === 'string' && d.slice(0, 7) === currentMonth;

          const donorIdByReceiptId = new Map();
          for (const [donorId, info] of Object.entries(receiptsByDonor)) {
            for (const id of info.ids) donorIdByReceiptId.set(id, parseInt(donorId, 10));
          }
          const creditable = inserted.filter(r => donorIdByReceiptId.has(r.id) && isCurrentMonth(r.receipt_date));

          let leadsCollected = 0;
          const credits = new Map();
          if (creditable.length > 0) {
            const donorIds = [...new Set(creditable.map(r => donorIdByReceiptId.get(r.id)))];
            const openAssignments = [];
            const ASSIGN_BATCH = 1000;
            for (let i = 0; i < donorIds.length; i += ASSIGN_BATCH) {
              const { data, error: asgnErr } = await from('fro_assignments')
                .select('id, donor_id, fro_worker_id, ngo_id, assigned_at')
                .in('donor_id', donorIds.slice(i, i + ASSIGN_BATCH))
                .not('status', 'eq', 'reassigned')
                .not('status', 'eq', 'donation_collected')
                .not('status', 'eq', 'lead_done')
                .not('status', 'eq', 'done');
              if (asgnErr) throw new Error(asgnErr.message);
              openAssignments.push(...(data || []));
            }

            // Only credit an assignment that belongs to the selected NGO, so a
            // BSCT receipt never closes/credits an AFLF or MANN lead for the
            // same donor.
            const assignmentByDonor = {};
            for (const a of openAssignments) {
              if (!a.fro_worker_id) continue;
              if (a.ngo_id !== ngo_id) continue;
              const cur = assignmentByDonor[a.donor_id];
              if (!cur || new Date(a.assigned_at || 0) > new Date(cur.assigned_at || 0)) assignmentByDonor[a.donor_id] = a;
            }

            const logs = [];
            const assignmentIds = new Set();
            for (const r of creditable) {
              const a = assignmentByDonor[donorIdByReceiptId.get(r.id)];
              if (!a) continue;
              logs.push({
                assignment_id: a.id,
                donor_id: donorIdByReceiptId.get(r.id),
                fro_worker_id: a.fro_worker_id,
                action: 'donation',
                amount_collected: parseFloat(r.amount || 0),
                accounts_status: 'verified',
                verified_at: r.receipt_date || new Date().toISOString(),
                verified_by: req.user.id,
                created_by: req.user.id,
                upi_transaction_id: r.payment_id || null,
                transaction_datetime: r.receipt_date || null,
                pan_number: r.pan_number || null,
                notes: `Auto-credited from imported receipt ${r.receipt_no || r.id}`,
              });
              assignmentIds.add(a.id);
              const cred = credits.get(a.fro_worker_id) || { count: 0, total: 0 };
              cred.count += 1;
              cred.total += parseFloat(r.amount || 0);
              credits.set(a.fro_worker_id, cred);
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

              if (assignmentIds.size > 0) {
                const { error: closeErr } = await from('fro_assignments')
                  .update({ status: 'donation_collected', last_contacted_at: new Date().toISOString() })
                  .in('id', [...assignmentIds]);
                if (closeErr) throw new Error(closeErr.message);
              }
            }
          }

          return { imported: inserted.length, matched, withBank, leadsCollected, credits };
        });
        console.timeEnd('import-tx');
        console.log(`Import OK: ${result.imported} rows, ${result.matched} matched, ${result.leadsCollected} leads credited`);

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
          message: `${result.imported} receipts imported${dupCount > 0 ? `, ${dupCount} duplicates skipped` : ''}${result.matched > 0 ? `, ${result.matched} linked to donors` : ''}${result.leadsCollected > 0 ? `, ${result.leadsCollected} leads credited to FROs` : ''}`,
          imported: result.imported,
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

export const clearReceipts = async (req, res) => {
  try {
    const batch = req.query.batch ? parseInt(req.query.batch) : null;
    const shouldReverse = req.query.reverse === '1';

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

    // Chunked assignment fetch to avoid the Postgres parameter limit on large donor sets.
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

    const rows = donors.map(d => {
      const a = latestByDonor.get(d.id);
      return {
        'Donor Name': d.name || d.bank_donor_name || d.agent_donor_name || '',
        'Mobile': d.mobile_number || '',
        'City': d.city || '',
        'NGO': a?.ngo_id ? (ngoMap[a.ngo_id] || d.ngo || '') : (d.ngo || ''),
        'Assigned To': a?.fro_worker_id ? (workerMap[a.fro_worker_id] || '') : '',
        'Total Amount': d.total_amount != null ? Number(d.total_amount) : 0,
        'Donations': d.donation_count != null ? Number(d.donation_count) : 0,
        'Last Donation': d.last_donation_date || '',
        'New Station': a?.station || d.station || 'suspense',
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

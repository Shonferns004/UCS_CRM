import * as BankAudit from '../models/bankAuditModel.js';
import db from '../config/db.js';
import { findAutoMatches } from '../services/autoMatchService.js';
import { confirmMatchCredit } from '../services/creditService.js';

export const listSources = async (req, res) => {
  try {
    const sources = await BankAudit.getSources();
    return res.json(sources);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const addSource = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Source name is required' });
    const source = await BankAudit.createSource(name);
    return res.status(201).json(source);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'Source already exists' });
    return res.status(500).json({ message: error.message });
  }
};

export const editSource = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_active, sort_order } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) updates.is_active = is_active;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    const source = await BankAudit.updateSource(id, updates);
    return res.json(source);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const removeSource = async (req, res) => {
  try {
    const { id } = req.params;
    await BankAudit.deleteSource(id);
    return res.json({ message: 'Source deleted' });
  } catch (error) {
    if (error.code === '23503') return res.status(400).json({ message: 'Cannot delete source with existing entries' });
    return res.status(500).json({ message: error.message });
  }
};

function currentMonthIST() {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(new Date().getTime() + istOffset);
  return istNow.getUTCFullYear() + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0');
}

// A "real" agent is any non-empty name other than the 'Suspense' marker used to
// flag receipts that still sit in the suspense pool.
const realAgentName = (name) => (name && name.trim() && name !== 'Suspense') ? name.trim() : null;

// Map a donor profile to the donor fields stored on a receipt.
const donorProfileReceipt = (d) => ({
  donor_id: d.id,
  donor_name: d.name || null,
  donor_mobile: d.mobile_number || null,
  pan_number: d.pan_number || null,
  address: [d.address_1, d.address_2].filter(Boolean).join(', ') || null,
  email: d.email || null,
  mode: d.mop || null,
  bank_name: d.donors_bank_name || null,
});

// Map a donor profile to the donor fields stored on a bank_audit_entries row.
const donorProfileEntry = (d) => ({
  donor_id: d.id,
  donor_mobile: d.mobile_number || null,
  donor_email: d.email || null,
  donor_pan: d.pan_number || null,
  donor_address_1: d.address_1 || null,
  donor_address_2: d.address_2 || null,
  donor_city: d.city || null,
  donor_pin_code: d.pin_code || null,
});

// Load a donor profile from the donor directory (used when a donor is picked
// via the Search Donor box instead of a lead).
const fetchDonorProfile = async (id) => {
  if (!id) return null;
  const { data } = await db
    .from('donor_profiles')
    .select('id, name, mobile_number, email, pan_number, address_1, address_2, city, pin_code, project_supported, mop, donors_bank_name')
    .eq('id', id)
    .maybeSingle();
  return data || null;
};

// Fetch a pending lead log (fro_donor_logs) together with its donor profile +
// FRO worker so a bank audit entry can be linked to it. Throws if the log is
// already processed. If the log is already linked to a receipt (e.g. a suspense
// claim), the existing receipt id is exposed on `existing_receipt_id` so the
// save path can reuse it instead of creating a duplicate. When `currentLogId`
// matches, the pending/processed checks are skipped (idempotent edit).
const getClaimableLog = async (logId, currentLogId = null) => {
  if (!logId) return null;
  const { data: log, error } = await db
    .from('fro_donor_logs')
    .select(`
      id, amount_collected, accounts_status, fro_worker_id, payment_mode,
      fro_assignments!inner(
        id, donor_id, fro_worker_id,
        donor_profiles!inner(id, name, mobile_number, email, pan_number, address_1, address_2, city, pin_code, project_supported, mop, donors_bank_name),
        workers!inner(id, name, login_id)
      )
    `)
    .eq('id', logId)
    .maybeSingle();
  if (error) throw error;
  if (!log) throw new Error('Selected lead not found');

  const { data: existingReceipt } = await db
    .from('receipts')
    .select('id')
    .eq('log_id', logId)
    .maybeSingle();
  if (error) throw error;
  log.existing_receipt_id = existingReceipt?.id || null;

  if (String(logId) !== String(currentLogId) && log.accounts_status !== 'pending') {
    throw new Error(`Selected lead is already ${log.accounts_status || 'processed'}`);
  }
  return log;
};

// Resolve receipt + entry fields when a lead log is linked to a bank audit
// entry, and verify the lead (clears it from the pending picker + shows in the
// donor's history). Returns null when no log is linked.
const resolveLogLink = async ({ log_id, actorId, currentLogId }) => {
  if (!log_id) return null;
  const log = await getClaimableLog(log_id, currentLogId);
  const assignment = log.fro_assignments;
  const donor = assignment?.donor_profiles || {};
  const worker = assignment?.workers || {};
  if (!donor.id) throw new Error('Selected lead has no donor info');

  const now = new Date().toISOString();
  await db.from('fro_donor_logs').update({
    accounts_status: 'verified',
    verified_at: now,
    verified_by: actorId,
  }).eq('id', log.id);

  return {
    receipt: {
      log_id: log.id,
      donor_id: donor.id,
      agent_name: worker?.name || null,
      donor_name: donor.name || null,
      donor_mobile: donor.mobile_number || null,
      pan_number: donor.pan_number || null,
      address: [donor.address_1, donor.address_2].filter(Boolean).join(', ') || null,
      email: donor.email || null,
      bank_name: donor.donors_bank_name || null,
      mode: log.payment_mode || donor.mop || 'Bank',
      project_id: donor.project_supported || null,
    },
    existing_receipt_id: log.existing_receipt_id || null,
    entry: {
      donor_id: donor.id,
      donor_mobile: donor.mobile_number || null,
      donor_email: donor.email || null,
      donor_pan: donor.pan_number || null,
      donor_address_1: donor.address_1 || null,
      donor_address_2: donor.address_2 || null,
      donor_city: donor.city || null,
      donor_pin_code: donor.pin_code || null,
    },
    lead_amount: log.amount_collected,
  };
};

export const listEntries = async (req, res) => {
  try {
    const { date_from, date_to, source_id, status } = req.query;
    const entries = await BankAudit.getEntries({ date_from, date_to, source_id, status });

    // Expose the linked receipt's agent/log/donor on each entry so the Edit
    // form can prefill the Agent dropdown and lock an already-claimed Log.
    for (const e of entries || []) {
      const r = e.receipts;
      if (r) {
        e.agent_name = r.agent_name || null;
        e.log_id = r.log_id || null;
        e.donor_id = r.donor_id || null;
        e.donor_name = r.donor_name || null;
        const lead = Array.isArray(r.fro_donor_logs) ? (r.fro_donor_logs[0] || null) : r.fro_donor_logs;
        e.lead_amount = lead?.amount_collected || null;
      }
      // An entry whose receipt is still unlinked (no donor, no log) is only
      // suspense when it is "truly suspense" — BOTH the agent name and the
      // donor mobile are missing. Once an agent name OR a donor mobile is
      // attached (FRO claim / import FSE / Accounts assignment), the money is
      // handled and leaves the Accounts suspense pool, consistent with the bare
      // suspense rule in getUnlinkedReceipts.
      e.kind = (r && !r.donor_id && !r.log_id
                 && !BankAudit.isPriyankShahAgent(r.agent_name)
                 && BankAudit.isBlankSuspenseValue(r.agent_name)
                 && BankAudit.isBlankSuspenseValue(r.donor_mobile))
        ? 'suspense'
        : 'entry';
      delete e.receipts;
    }

    // Enrich entries that have a suggested match with the lead's donor + FRO so
    // the UI can show who the entry matched against. `match_lead` carries the
    // full donor profile (same shape as the pending-lead picker) so the Edit
    // form can auto-fill all donor details + the FRO agent on open.
    const logIds = [...new Set((entries || []).map((e) => e.matched_lead_log_id).filter(Boolean))];
    if (logIds.length > 0) {
      const { data: logs } = await db
        .from('fro_donor_logs')
        .select(`
          id, amount_collected,
          fro_assignments!inner(
            donor_id,
            donor_profiles!inner(id, name, mobile_number, email, pan_number, address_1, address_2, city, pin_code, project_supported),
            workers!inner(id, name)
          )
        `)
        .in('id', logIds);
      const matchMap = {};
      for (const l of logs || []) {
        const assignment = l.fro_assignments;
        const donor = assignment?.donor_profiles || {};
        const worker = assignment?.workers || {};
        matchMap[l.id] = {
          donor_name: donor.name || 'Unknown',
          fro_name: worker.name || 'Unknown',
          match_lead: {
            log_id: l.id,
            amount: l.amount_collected,
            donor_id: assignment?.donor_id || null,
            donor_name: donor.name || '',
            donor_mobile: donor.mobile_number || '',
            donor_email: donor.email || '',
            donor_pan: donor.pan_number || '',
            donor_address_1: donor.address_1 || '',
            donor_address_2: donor.address_2 || '',
            donor_city: donor.city || '',
            donor_pin_code: donor.pin_code || '',
            donor_project: donor.project_supported || '',
            agent_name: worker.name || '',
          },
        };
      }
      for (const e of entries || []) {
        const mm = e.matched_lead_log_id ? matchMap[e.matched_lead_log_id] : null;
        if (mm) {
          e.match_donor = mm.donor_name;
          e.match_fro = mm.fro_name;
          e.match_lead = mm.match_lead;
        }
      }
    }

    // Merge unresolved suspense receipts (donor_id null, agent 'Suspense') into
    // the list, scoped to the same date range as the entries filter (or the
    // current month when no filter is set). Once matched (donor_id set) they
    // leave the suspense set.
    const showSuspense = !status || status === 'unverified';
    if (showSuspense) {
      const suspense = (await BankAudit.getUnlinkedReceipts()).filter((r) => !BankAudit.isPriyankShahAgent(r.agent_name));
      if (suspense.length > 0) {
        const currentMonth = currentMonthIST();
        const requestedMonth = date_from ? date_from.slice(0, 7) : currentMonth;
        const from = (date_from || '').slice(0, 10);
        const to = (date_to || date_from || '').slice(0, 10);
        const rows = suspense.filter((r) => {
          const rd = (r.receipt_date || '').slice(0, 10);
          if (!rd) return false;
          if (!from) return rd.slice(0, 7) === requestedMonth;
          return rd >= from && rd <= to;
        });

        const suspenseRows = rows.map((r) => ({
          id: `suspense-${r.id}`,
          kind: 'suspense',
          receipt_id: r.id,
          receipt_no: r.receipt_no,
          project_id: r.project_id,
          donor_mobile: r.donor_mobile,
          transaction_date: r.receipt_date,
          amount: r.amount,
          payment_id: r.payment_id || null,
          payer_name: r.donor_name,
          agent_name: r.agent_name,
          remarks: r.receipt_no ? `Suspense receipt ${r.receipt_no}` : 'Suspense receipt',
          source_id: null,
          bank_audit_sources: { name: 'Suspense Receipt' },
          status: 'unverified',
        }));
        entries.push(...suspenseRows);
      }
    }

    return res.json(entries);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const addEntry = async (req, res) => {
  try {
    const { source_id, amount, payment_id, check_id, transaction_date, remarks, payer_name, payment_time, project_id, agent_name, log_id, donor_id } = req.body;
    if (!source_id || !amount || !transaction_date) {
      return res.status(400).json({ message: 'Source, amount, and transaction date are required' });
    }

    const ngo = project_id || 'bsct';

    // When a lead log is picked, its donor + FRO become authoritative; the
    // receipt is linked (log_id + donor_id) and the lead is verified. If the
    // lead is already claimed (linked to a suspense receipt), reuse that
    // receipt instead of creating a duplicate for the same money.
    const link = await resolveLogLink({ log_id, actorId: req.user.id });

    let receiptId = link?.existing_receipt_id || null;
    let receiptNo = null;

    // When no lead is linked but a donor was picked from the donor directory,
    // the donor profile is the authoritative source for donor details (DB name,
    // not the text typed into the audit form).
    const pickedDonor = await fetchDonorProfile(donor_id);

    // Donor-derived fields for the receipt + bank_audit_entries row. A linked
    // lead wins; a picked donor profile is next; otherwise fall back to the
    // form values.
    const donorFields = link?.receipt
      ? { donor_mobile: link.receipt.donor_mobile, pan_number: link.receipt.pan_number, address: link.receipt.address, email: link.receipt.email, mode: link.receipt.mode, bank_name: link.receipt.bank_name, donor_id: link.receipt.donor_id }
      : pickedDonor
      ? donorProfileReceipt(pickedDonor)
      : { donor_mobile: req.body.donor_mobile || null, pan_number: req.body.donor_pan || null, address: req.body.donor_address_1 || null, email: req.body.donor_email || null, mode: null, bank_name: null, donor_id: null };
    const entryDonorFields = link?.entry
      ? { ...link.entry, donor_id: link.receipt.donor_id }
      : pickedDonor
      ? donorProfileEntry(pickedDonor)
      : { donor_mobile: req.body.donor_mobile || null, donor_email: req.body.donor_email || null, donor_pan: req.body.donor_pan || null, donor_address_1: req.body.donor_address_1 || null, donor_address_2: req.body.donor_address_2 || null, donor_city: req.body.donor_city || null, donor_pin_code: req.body.donor_pin_code || null, donor_id: null };

    // A bank-audit-created receipt is a suspense donation unless the creator
    // filled in BOTH an agent name and a donor (payer) name. When it stays
    // suspense, tag the receipt agent as 'Suspense' so it appears in the
    // suspense pool for an FRO to claim instead of being treated as a known
    // donation. When a lead is linked, the lead's donor + FRO are authoritative
    // (never suspense).
    const donorName = link?.receipt.donor_name || pickedDonor?.name || payer_name || null;
    const donorKnown = !!(link || pickedDonor);
    const priyankAgent = BankAudit.isPriyankShahAgent(agent_name);
    const agentKnown = link?.receipt.agent_name || realAgentName(agent_name);
    const suspenseAgent = (donorKnown || priyankAgent) ? (agentKnown || 'Priyank Shah') : 'Suspense';

    const isSuspense = !donorKnown && !priyankAgent;

    if (receiptId) {
      const receiptFields = {
        amount,
        project_id: link?.receipt.project_id || ngo,
        donor_name: donorName || 'Unknown',
        agent_name: suspenseAgent,
        ...donorFields,
        payment_id: payment_id || null,
        receipt_date: transaction_date,
        receipt_time: payment_time || null,
      };
      const { data: updatedReceipt, error: rErr } = await db.from('receipts').update(receiptFields).eq('id', receiptId).select('id, receipt_no').single();
      if (rErr) throw rErr;
      if (updatedReceipt.receipt_no) {
        receiptNo = updatedReceipt.receipt_no;
      } else {
        receiptNo = await BankAudit.getNextReceiptNo(link?.receipt.project_id || ngo);
        const { error: numErr } = await db.from('receipts').update({ receipt_no: receiptNo }).eq('id', receiptId);
        if (numErr) throw numErr;
      }
    } else {
      const insertFields = {
        project_id: link?.receipt.project_id || ngo,
        donor_name: donorName || 'Unknown',
        agent_name: suspenseAgent,
        ...donorFields,
        log_id: link?.receipt.log_id || null,
        amount,
        payment_id: payment_id || null,
        receipt_date: transaction_date,
        receipt_time: payment_time || null,
        purpose: 'Bank Audit Entry',
        generated_by: req.user.id,
      };
      if (!isSuspense) {
        receiptNo = await BankAudit.getNextReceiptNo(link?.receipt.project_id || ngo);
        insertFields.receipt_no = receiptNo;
      }
      const { data: receipt, error: rErr } = await db.from('receipts').insert(insertFields).select().single();
      if (rErr) throw rErr;
      receiptId = receipt.id;
    }

    const entry = await BankAudit.createEntry({
      source_id,
      amount,
      payment_id: payment_id || null,
      check_id: check_id || null,
      transaction_date,
      remarks: remarks || null,
      payer_name: payer_name || null,
      payment_time: payment_time || null,
      project_id: link?.receipt.project_id || ngo,
      ...entryDonorFields,
      created_by: req.user.id,
      receipt_no: receiptNo,
      receipt_id: receiptId,
    });

    findAutoMatches().catch((err) => console.error('Auto-match after addEntry failed:', err.message));
    return res.status(201).json(entry);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { source_id, amount, payment_id, check_id, transaction_date, remarks, payer_name, payment_time, project_id, agent_name, log_id, donor_id } = req.body;
    const updates = {};
    if (source_id !== undefined) updates.source_id = source_id;
    if (amount !== undefined) updates.amount = amount;
    if (payment_id !== undefined) updates.payment_id = payment_id;
    if (check_id !== undefined) updates.check_id = check_id;
    if (transaction_date !== undefined) updates.transaction_date = transaction_date;
    if (remarks !== undefined) updates.remarks = remarks;
    if (payer_name !== undefined) updates.payer_name = payer_name;
    if (payment_time !== undefined) updates.payment_time = payment_time || null;
    if (project_id !== undefined) updates.project_id = project_id;

    const { data: existing } = await db
      .from('bank_audit_entries')
      .select('id, receipt_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ message: 'Entry not found' });

    const { data: currentReceipt } = existing.receipt_id
      ? await db.from('receipts').select('id, log_id').eq('id', existing.receipt_id).maybeSingle()
      : { data: null };

    // Idempotent: allow re-saving the same log that is already on this receipt.
    const link = await resolveLogLink({ log_id, actorId: req.user.id, currentLogId: currentReceipt?.log_id || null });

    // The picked lead belongs to a different receipt (a suspense claim) — never
    // point this entry's receipt at a second lead / duplicate the link.
    if (link?.existing_receipt_id && link.existing_receipt_id !== existing.receipt_id) {
      return res.status(409).json({ message: 'Selected lead is already linked to a receipt' });
    }

    // When no lead is linked but a donor was picked from the donor directory,
    // the donor profile is authoritative for donor details (DB name, not the
    // text typed into the audit form).
    const pickedDonor = await fetchDonorProfile(donor_id);

    if (existing.receipt_id) {
      const receiptUpdate = {};
      if (amount !== undefined) receiptUpdate.amount = amount;
      if (link) {
        Object.assign(receiptUpdate, link.receipt);
        if (!receiptUpdate.project_id) receiptUpdate.project_id = project_id || 'bsct';
        if (payment_time !== undefined) receiptUpdate.receipt_time = payment_time || null;
      } else if (pickedDonor) {
        Object.assign(receiptUpdate, donorProfileReceipt(pickedDonor));
        if (agent_name !== undefined) {
          const effAgent = realAgentName(agent_name);
          receiptUpdate.agent_name = (effAgent && pickedDonor.name) ? effAgent : (BankAudit.isPriyankShahAgent(agent_name) ? 'Priyank Shah' : 'Suspense');
        }
        if (project_id !== undefined) receiptUpdate.project_id = project_id || 'bsct';
      } else {
        const { data: curRec } = await db.from('receipts').select('donor_name').eq('id', existing.receipt_id).maybeSingle();
        const effDonor = payer_name !== undefined ? (payer_name || null) : (curRec?.donor_name || null);
        if (payer_name !== undefined) receiptUpdate.donor_name = effDonor;
        if (agent_name !== undefined) {
          const effAgent = realAgentName(agent_name);
          receiptUpdate.agent_name = (effAgent && effDonor) ? effAgent : (BankAudit.isPriyankShahAgent(agent_name) ? 'Priyank Shah' : 'Suspense');
        }
        if (req.body.donor_mobile !== undefined) receiptUpdate.donor_mobile = req.body.donor_mobile || null;
        if (project_id !== undefined) receiptUpdate.project_id = project_id || 'bsct';
      }
      const { error: rErr } = await db.from('receipts').update(receiptUpdate).eq('id', existing.receipt_id);
      if (rErr) throw rErr;
    }

    if (link) {
      // Lead is authoritative for donor details; amount/payment come from form.
      updates.donor_id = link.entry.donor_id;
      for (const f of ['donor_mobile', 'donor_email', 'donor_pan', 'donor_address_1', 'donor_address_2', 'donor_city', 'donor_pin_code']) {
        updates[f] = link.entry[f];
      }
    } else if (pickedDonor) {
      Object.assign(updates, donorProfileEntry(pickedDonor));
    } else {
      for (const f of ['donor_mobile', 'donor_email', 'donor_pan', 'donor_address_1', 'donor_address_2', 'donor_city', 'donor_pin_code']) {
        if (req.body[f] !== undefined) updates[f] = req.body[f] || null;
      }
    }

    const entry = await BankAudit.updateEntry(id, updates);
    return res.json(entry);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const removeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: entry } = await db.from('bank_audit_entries').select('receipt_id').eq('id', id).maybeSingle();
    if (entry?.receipt_id) {
      const { error } = await db.from('receipts').delete().eq('id', entry.receipt_id);
      if (error) throw error;
    }
    await BankAudit.deleteEntry(id);
    return res.json({ message: 'Entry deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editSuspenseReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { donor_name, donor_mobile, amount, receipt_date, payment_id, project_id, agent_name, log_id } = req.body;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return res.status(400).json({ message: 'Invalid suspense receipt id' });

    // Resolve a picked lead log (idempotent — suspense receipts have no log yet).
    const link = await resolveLogLink({ log_id, actorId: req.user.id });

    // If the picked lead is already linked to a receipt (a suspense claim), it
    // represents different money — never attach it to another suspense receipt.
    if (link?.existing_receipt_id && link.existing_receipt_id !== numId) {
      return res.status(409).json({ message: 'Selected lead is already linked to a receipt' });
    }

    const updates = {};
    if (link) {
      Object.assign(updates, link.receipt);
      if (donor_name !== undefined) updates.donor_name = donor_name || null;
      if (project_id !== undefined) updates.project_id = project_id || link.receipt.project_id || 'bsct';
      else if (!updates.project_id) updates.project_id = 'bsct';
    } else {
      if (donor_name !== undefined) updates.donor_name = donor_name;
      if (donor_mobile !== undefined) updates.donor_mobile = donor_mobile;
      if (agent_name !== undefined) {
        const effAgent = realAgentName(agent_name);
        updates.agent_name = (effAgent && donor_name) ? effAgent : (BankAudit.isPriyankShahAgent(agent_name) ? 'Priyank Shah' : 'Suspense');
      }
      if (project_id !== undefined) updates.project_id = project_id;
    }
    if (amount !== undefined) updates.amount = amount;
    if (receipt_date !== undefined) updates.receipt_date = receipt_date;
    if (payment_id !== undefined) updates.payment_id = payment_id;

    const { data, error } = await db
      .from('receipts')
      .update(updates)
      .eq('id', numId)
      .is('donor_id', null)
      .is('log_id', null)
      .select('id, receipt_no, donor_name, donor_mobile, amount, receipt_date, payment_id, project_id, agent_name, donor_id, log_id, created_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Suspense receipt not found' });

    // Keep any linked bank_audit_entries row's donor contact info in sync.
    if (link) {
      const entryUpdates = { donor_id: link.entry.donor_id, donor_mobile: link.entry.donor_mobile };
      for (const f of ['donor_email', 'donor_pan', 'donor_address_1', 'donor_address_2', 'donor_city', 'donor_pin_code']) {
        entryUpdates[f] = link.entry[f];
      }
      const { data: entry } = await db.from('bank_audit_entries').select('id').eq('receipt_id', numId).maybeSingle();
      if (entry) await BankAudit.updateEntry(entry.id, entryUpdates);
    }

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const removeSuspenseReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return res.status(400).json({ message: 'Invalid suspense receipt id' });

    const { data: existing } = await db
      .from('receipts')
      .select('id')
      .eq('id', numId)
      .is('donor_id', null)
      .is('log_id', null)
      .maybeSingle();
    if (!existing) return res.status(404).json({ message: 'Suspense receipt not found' });

    const { error } = await db.from('receipts').delete().eq('id', numId);
    if (error) throw error;
    return res.json({ message: 'Suspense receipt deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getSummary = async (req, res) => {
  try {
    const { date_from, date_to, status } = req.query;
    const summary = await BankAudit.getSourceSummary({ date_from, date_to, status });
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const suggestEntries = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const entries = await BankAudit.suggestEntries(q);
    return res.json(entries);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Unverified, unmatched bank audit entries for the lead-detail dropdown so
// Accounts can manually pair a lead to a bank statement row.
export const listAvailableEntries = async (req, res) => {
  try {
    const entries = await BankAudit.getAvailableEntries();
    return res.json(entries);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const SUSPENSE_PREFIX = 'suspense-';

// Manually link a suspense receipt (money with no donor yet) to a lead WITHOUT
// verifying it. The lead stays 'pending'; the admin later clicks Verify, and the
// existing verifyLead flow claims the linked receipt (via log_id) and generates
// it into receipts. Mirrors the entry manual-match semantics: matched now,
// credited/verified later.
const manualMatchSuspense = async ({ rawId, logId, actorId }) => {
  const receiptId = parseInt(rawId.slice(SUSPENSE_PREFIX.length), 10);
  if (isNaN(receiptId)) throw Object.assign(new Error('Invalid suspense receipt id'), { status: 400 });

  const { data: receipt, error: rErr } = await db
    .from('receipts')
    .select('id, receipt_no, donor_name, donor_mobile, amount, receipt_date, project_id, payment_id, agent_name')
    .eq('id', receiptId)
    .is('donor_id', null)
    .is('log_id', null)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!receipt) throw Object.assign(new Error('Suspense receipt not found'), { status: 404 });

  const log = await getClaimableLog(logId);
  if (!log) throw Object.assign(new Error('Selected lead not found'), { status: 404 });
  if (log.existing_receipt_id && log.existing_receipt_id !== receiptId) {
    throw Object.assign(new Error('Selected lead is already linked to a receipt'), { status: 409 });
  }

  const donor = log.fro_assignments?.donor_profiles || {};
  const worker = log.fro_assignments?.workers || {};
  if (!donor.id) throw Object.assign(new Error('Selected lead has no donor info'), { status: 400 });

  const matchNo = await BankAudit.nextMatchNo();

  const receiptPatch = {
    ...donorProfileReceipt(donor),
    log_id: log.id,
    agent_name: worker?.name || null,
    project_id: donor.project_supported || receipt.project_id || 'bsct',
    mode: log.payment_mode || donor.mop || 'Bank',
  };
  if (!receiptPatch.donor_name) receiptPatch.donor_name = receipt.donor_name || null;

  const { data, error } = await db
    .from('receipts')
    .update(receiptPatch)
    .eq('id', receiptId)
    .is('donor_id', null)
    .is('log_id', null)
    .select('id, receipt_no, donor_name, donor_mobile, amount, receipt_date, payment_id, project_id, agent_name, donor_id, log_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Suspense receipt already claimed'), { status: 409 });

  // Fill the lead's empty payment fields from the receipt (mirror of syncEntryToLead).
  const { data: leadPay } = await db
    .from('fro_donor_logs')
    .select('upi_transaction_id, payment_from, transaction_datetime, payment_mode')
    .eq('id', logId)
    .maybeSingle();
  const patch = {};
  if (leadPay) {
    if (!leadPay.upi_transaction_id && receipt.payment_id) patch.upi_transaction_id = receipt.payment_id;
    if (!leadPay.payment_from && receipt.donor_name) patch.payment_from = receipt.donor_name;
    if (!leadPay.transaction_datetime && receipt.receipt_date) patch.transaction_datetime = receipt.receipt_date;
    if (!leadPay.payment_mode) patch.payment_mode = receipt.payment_id ? 'UPI' : 'Bank Transfer';
  }
  if (Object.keys(patch).length > 0) {
    await db.from('fro_donor_logs').update(patch).eq('id', logId);
  }

  // Keep any linked bank_audit_entries row in sync (rare for pool suspense).
  const { data: entry } = await db.from('bank_audit_entries').select('id').eq('receipt_id', receiptId).maybeSingle();
  if (entry) {
    await db.from('bank_audit_entries').update({
      matched_lead_log_id: logId,
      match_status: 'matched',
      match_source: 'manual',
      matched_by: actorId,
      match_no: matchNo,
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...donorProfileEntry(donor),
    }).eq('id', entry.id);
  }

  return { receipt: data, match_no: matchNo, matched: true };
};

// Link an entry to a lead as a MANUAL match (no credit yet). The credit happens
// later through the bank audit Confirm Match or the lead's verify action.
export const manualMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { log_id: logId } = req.body || {};
    if (!logId) return res.status(400).json({ message: 'log_id is required' });

    if (String(id).startsWith(SUSPENSE_PREFIX)) {
      const result = await manualMatchSuspense({ rawId: String(id), logId, actorId: req.user.id });
      return res.json(result);
    }

    const { data: entry, error: entryErr } = await db
      .from('bank_audit_entries')
      .select('id, status, match_status, matched_lead_log_id')
      .eq('id', id)
      .maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return res.status(404).json({ message: 'Bank audit entry not found' });
    if (entry.status === 'verified') return res.status(400).json({ message: 'This bank audit entry is already verified' });
    if (entry.match_status && String(entry.matched_lead_log_id) !== String(logId)) {
      return res.status(409).json({ message: 'This bank audit entry is already matched to a lead' });
    }

    const result = await BankAudit.manualMatchEntry(id, logId, req.user.id);
    return res.json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message });
  }
};

export const markEntryVerified = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await BankAudit.verifyEntry(id);
    return res.json(entry);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listNgoSuspense = async (req, res) => {
  try {
    const entries = await BankAudit.getSuspenseForNgo();
    return res.json(entries);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const linkSuspenseToDonor = async (req, res) => {
  try {
    const { id } = req.params;
    const { donor_id } = req.body;
    if (!donor_id) return res.status(400).json({ message: 'Donor ID is required' });

    const { data: entry } = await db
      .from('bank_audit_entries')
      .select('amount, payment_id')
      .eq('id', id)
      .single();
    if (!entry) return res.status(404).json({ message: 'Entry not found' });

    const result = await BankAudit.linkSuspenseToDonor(id, donor_id);

    const { data: assignment } = await db
      .from('fro_assignments')
      .select('id, fro_worker_id')
      .eq('donor_id', donor_id)
      .not('status', 'eq', 'reassigned')
      .maybeSingle();

    if (assignment?.fro_worker_id) {
      await db.from('fro_donor_logs').insert({
        assignment_id: assignment.id,
        donor_id: donor_id,
        fro_worker_id: assignment.fro_worker_id,
        action: 'donation',
        amount_collected: entry.amount,
        accounts_status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: req.user.id,
        created_by: req.user.id,
        notes: `Auto-credited via suspense linking (Payment: ${entry.payment_id || 'N/A'})`,
      });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const markSuspenseUnmatched = async (req, res) => {
  try {
    const { id } = req.params;
    const userName = req.user?.name || req.user?.login_id || 'Unknown';
    const entry = await BankAudit.markSuspenseUnmatched(id, userName);
    return res.json(entry);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const searchDonorsForSuspense = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const ngoIds = []; // will be scoped by user's NGO access if needed
    const donors = await BankAudit.searchDonorsForSuspense(q, ngoIds);
    return res.json(donors);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listFroSuspense = async (req, res) => {
  try {
    const entries = await BankAudit.getSuspenseForFro(req.user.id);
    const filtered = entries.filter(e => {
      if (!e.receipts) return true;
      const r = e.receipts;
      if (r.donor_id) return false;
      if (!BankAudit.isBlankSuspenseValue(r.agent_name) || !BankAudit.isBlankSuspenseValue(r.donor_mobile)) return false;
      return true;
    });
    return res.json(filtered);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const resolveSuspenseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { screenshot_url, donor_details, donor_name, donor_mobile, amount, disposition_category, disposition_detail } = req.body;
    const entry = await BankAudit.resolveSuspense(id, screenshot_url, donor_details);

    // Also create a fro_donor_log entry for this resolved suspense
    if (donor_name) {
      try {
        // Create or find donor profile
        const { data: existingDonor } = await db
          .from('donor_profiles')
          .select('id')
          .eq('name', donor_name)
          .maybeSingle();
        let donorId = existingDonor?.id;
        if (!donorId) {
          const { data: newDonor } = await db
            .from('donor_profiles')
            .insert({ name: donor_name, mobile_number: donor_mobile || null })
            .select()
            .single();
          donorId = newDonor?.id;
        }

        if (donorId) {
          // Create fro_assignment
          const { data: assignment } = await db
            .from('fro_assignments')
            .insert({
              donor_id: donorId,
              fro_worker_id: req.user.id,
              status: disposition_detail === 'lead_done' ? 'lead_done' : 'callback',
            })
            .select()
            .single();

          if (assignment) {
            await db.from('fro_donor_logs').insert({
              assignment_id: assignment.id,
              action: disposition_detail === 'lead_done' ? 'donation' : disposition_category || 'follow_up',
              disposition_category: disposition_category || 'other',
              disposition_detail: disposition_detail || 'resolved_suspense',
              amount_collected: amount || entry.amount || 0,
              accounts_status: disposition_detail === 'lead_done' ? 'pending' : 'pending',
            });
          }
        }
      } catch (err) { console.error('Failed to create lead from suspense:', err.message); }
    }

    return res.json(entry);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const searchFroDispositions = async (req, res) => {
  try {
    const { q } = req.query;
    const entries = await BankAudit.searchFroDispositions(req.user.id, q || '');
    return res.json(entries);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const runAutoMatch = async (req, res) => {
  try {
    const result = await findAutoMatches();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const confirmMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await confirmMatchCredit(id, req.user.id);
    if (result.error) return res.status(result.error).json({ message: result.message });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const clearMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await db
      .from('bank_audit_entries')
      .update({
        match_status: 'cleared',
        matched_lead_log_id: null,
        match_score: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, bank_audit_sources(name)')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Entry not found' });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Search pending lead logs (accounts_status='pending', lead_done dispositions)
// with donor + FRO details for the "Log" picker in the New/Edit Entry modal.
// Claimed leads (linked to a suspense receipt) are included — the save path
// reuses the existing receipt instead of double-claiming.
export const searchPendingLeads = async (req, res) => {
  try {
    const { q } = req.query;
    const term = (q || '').trim().toLowerCase();

    let query = db
      .from('fro_donor_logs')
      .select(`
        id, amount_collected, accounts_status, fro_worker_id, created_at,
        fro_assignments!inner(
          donor_id,
          donor_profiles!inner(id, name, mobile_number, email, pan_number, address_1, address_2, city, pin_code, project_supported),
          workers!inner(id, name, login_id)
        )
      `)
      .eq('action', 'disposition')
      .eq('disposition_detail', 'lead_done')
      .eq('accounts_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(30);

    if (term && term.length >= 2) {
      const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `fro_assignments.donor_profiles.name.ilike.%${escaped}%,` +
        `fro_assignments.donor_profiles.mobile_number.ilike.%${escaped}%,` +
        `fro_assignments.workers.name.ilike.%${escaped}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const result = (data || []).map(r => {
      const donor = r.fro_assignments?.donor_profiles || {};
      const worker = r.fro_assignments?.workers || {};
      return {
        log_id: r.id,
        amount: r.amount_collected,
        donor_id: r.fro_assignments?.donor_id || null,
        donor_name: donor.name || '',
        donor_mobile: donor.mobile_number || '',
        donor_email: donor.email || '',
        donor_pan: donor.pan_number || '',
        donor_address_1: donor.address_1 || '',
        donor_address_2: donor.address_2 || '',
        donor_city: donor.city || '',
        donor_pin_code: donor.pin_code || '',
        donor_project: donor.project_supported || '',
        agent_name: worker.name || '',
        created_at: r.created_at || null,
      };
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

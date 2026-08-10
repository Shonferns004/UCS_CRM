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

export const listEntries = async (req, res) => {
  try {
    const { date_from, date_to, source_id, status } = req.query;
    const entries = await BankAudit.getEntries({ date_from, date_to, source_id, status });

    // Enrich entries that have a suggested match with the lead's donor + FRO so
    // the UI can show who the entry matched against.
    const logIds = [...new Set((entries || []).map((e) => e.matched_lead_log_id).filter(Boolean))];
    if (logIds.length > 0) {
      const { data: logs } = await db
        .from('fro_donor_logs')
        .select('id, fro_assignments!inner(donor_profiles!inner(name), workers!inner(name))')
        .in('id', logIds);
      const matchMap = {};
      for (const l of logs || []) {
        matchMap[l.id] = {
          donor_name: l.fro_assignments?.donor_profiles?.name || 'Unknown',
          fro_name: l.fro_assignments?.workers?.name || 'Unknown',
        };
      }
      for (const e of entries || []) {
        if (e.matched_lead_log_id && matchMap[e.matched_lead_log_id]) {
          e.match_donor = matchMap[e.matched_lead_log_id].donor_name;
          e.match_fro = matchMap[e.matched_lead_log_id].fro_name;
        }
      }
    }

    // Merge unresolved suspense receipts (donor_id null, agent 'Suspense') into
    // the list, scoped to the requested month (or the current month when no
    // filter is set). Once matched (donor_id set) they leave the suspense set.
    const showSuspense = !status || status === 'unverified';
    if (showSuspense) {
      const suspense = await BankAudit.getUnlinkedReceipts();
      if (suspense.length > 0) {
        const currentMonth = currentMonthIST();
        const requestedMonth = date_from ? date_from.slice(0, 7) : currentMonth;
        const rows = suspense.filter((r) => (r.receipt_date || '').slice(0, 7) === requestedMonth);

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
    const { source_id, amount, payment_id, check_id, transaction_date, remarks, payer_name, payment_time, project_id } = req.body;
    if (!source_id || !amount || !transaction_date) {
      return res.status(400).json({ message: 'Source, amount, and transaction date are required' });
    }

    const ngo = project_id || 'bsct';
    const receiptNo = await BankAudit.getNextReceiptNo(ngo);

    const { data: receipt, error: rErr } = await db.from('receipts').insert({
      receipt_no: receiptNo,
      project_id: ngo,
      donor_name: payer_name || 'Unknown',
      agent_name: 'Suspense',
      donor_mobile: req.body.donor_mobile || null,
      amount,
      payment_id: payment_id || null,
      receipt_date: transaction_date,
      purpose: 'Bank Audit Entry',
      generated_by: req.user.id,
    }).select().single();
    if (rErr) throw rErr;

    const entry = await BankAudit.createEntry({
      source_id,
      amount,
      payment_id: payment_id || null,
      check_id: check_id || null,
      transaction_date,
      remarks: remarks || null,
      payer_name: payer_name || null,
      payment_time: payment_time || null,
      project_id: ngo,
      donor_mobile: req.body.donor_mobile || null,
      donor_email: req.body.donor_email || null,
      donor_pan: req.body.donor_pan || null,
      donor_address_1: req.body.donor_address_1 || null,
      donor_address_2: req.body.donor_address_2 || null,
      donor_city: req.body.donor_city || null,
      donor_pin_code: req.body.donor_pin_code || null,
      created_by: req.user.id,
      receipt_no: receiptNo,
      receipt_id: receipt.id,
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
    const { source_id, amount, payment_id, check_id, transaction_date, remarks, payer_name, payment_time, project_id } = req.body;
    const updates = {};
    if (source_id !== undefined) updates.source_id = source_id;
    if (amount !== undefined) updates.amount = amount;
    if (payment_id !== undefined) updates.payment_id = payment_id;
    if (check_id !== undefined) updates.check_id = check_id;
    if (transaction_date !== undefined) updates.transaction_date = transaction_date;
    if (remarks !== undefined) updates.remarks = remarks;
    if (payer_name !== undefined) updates.payer_name = payer_name;
    if (payment_time !== undefined) updates.payment_time = payment_time;
    if (project_id !== undefined) updates.project_id = project_id;
    for (const f of ['donor_mobile', 'donor_email', 'donor_pan', 'donor_address_1', 'donor_address_2', 'donor_city', 'donor_pin_code']) {
      if (req.body[f] !== undefined) updates[f] = req.body[f] || null;
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
    return res.json(entries);
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

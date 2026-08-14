import db from '../config/db.js';
import { nextMatchNo, syncEntryToLead, getUnlinkedReceipts } from '../models/bankAuditModel.js';

const MIN_SCORE = 75;
const MARGIN = 10;
const DATE_WINDOW_DAYS = 3;

// ─── Name normalization / fuzzy matching ───────────────────
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'smt', 'shri', 'shree', 'kumari', 'kumar', 'sir', 'sd', 's/o', 'd/o', 'c/o']);

export const normalizeName = (name) => {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .filter((w) => w.length > 0 && !TITLES.has(w))
    .join(' ');
};

export const nameMatch = (a, b) => {
  const na = normalizeName(String(a || '').replace(/don@/gi, ''));
  const nb = normalizeName(String(b || '').replace(/don@/gi, ''));
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = na.split(' ')[0];
  const fb = nb.split(' ')[0];
  if (fa && fb && fa === fb && fa.length >= 3) return true;
  if (na.includes(nb) || nb.includes(na)) return na.length >= 3 && nb.length >= 3;
  const dist = levenshtein(na, nb);
  const ratio = 1 - dist / Math.max(na.length, nb.length);
  return ratio >= 0.7;
};

const levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev.splice(0, n + 1, ...cur);
  }
  return prev[n];
};

const daysBetween = (a, b) => {
  const da = new Date(a);
  const dbDate = new Date(b);
  if (isNaN(da) || isNaN(dbDate)) return null;
  return Math.abs((da.getTime() - dbDate.getTime()) / 86400000);
};

// ─── Scoring ───────────────────────────────────────────────
// entry: bank_audit_entries row; lead: fro_donor_logs row (with fro_assignments + donor_profiles)
export const scoreEntryLead = (entry, lead) => {
  let score = 0;
  const reasons = [];

  const entryPid = String(entry.payment_id || '').trim().toUpperCase();
  const leadPid = String(lead.upi_transaction_id || '').trim().toUpperCase();
  if (entryPid && leadPid && entryPid === leadPid) {
    score += 100;
    reasons.push('payment ID matches');
  }

  if (Number(entry.amount) === Number(lead.amount_collected)) {
    score += 30;
    reasons.push('amount matches');
  }

  const donor = lead.fro_assignments?.donor_profiles;
  if (nameMatch(entry.payer_name, donor?.name)) {
    score += 25;
    reasons.push('name matches');
  }

  const entryNgo = String(entry.project_id || '').toLowerCase();
  const donorNgo = String(donor?.project_supported || '').toLowerCase();
  if (entryNgo && donorNgo && entryNgo === donorNgo) {
    score += 20;
    reasons.push('NGO matches');
  }

  const leadDate = lead.transaction_datetime || lead.verified_at || lead.created_at;
  const diff = daysBetween(entry.transaction_date, leadDate);
  if (diff !== null && diff <= DATE_WINDOW_DAYS) {
    score += 25;
    reasons.push('date matches');
  }

  return { score: Math.min(score, 100), reasons };
};

// Link a matched suspense receipt to a lead without verifying it (the lead
// stays pending; the admin Verify action later claims the receipt via log_id
// and generates it into receipts).
const linkSuspenseToLead = async (receipt, lead) => {
  const donor = lead.fro_assignments?.donor_profiles || {};
  const worker = lead.fro_assignments?.workers || {};
  const receiptPatch = {
    log_id: lead.id,
    donor_id: donor.id || null,
    donor_name: donor.name || receipt.donor_name || null,
    donor_mobile: donor.mobile_number || null,
    agent_name: worker?.name || null,
    project_id: donor.project_supported || receipt.project_id || 'bsct',
    pan_number: donor.pan_number || null,
    address: [donor.address_1, donor.address_2].filter(Boolean).join(', ') || null,
    email: donor.email || null,
    bank_name: donor.donors_bank_name || null,
    mode: lead.payment_mode || donor.mop || 'Bank',
  };
  await db
    .from('receipts')
    .update(receiptPatch)
    .eq('id', receipt.id)
    .is('donor_id', null)
    .is('log_id', null);

  const { data: leadPay } = await db
    .from('fro_donor_logs')
    .select('upi_transaction_id, payment_from, transaction_datetime, payment_mode')
    .eq('id', lead.id)
    .maybeSingle();
  const leadPatch = {};
  if (leadPay) {
    if (!leadPay.upi_transaction_id && receipt.payment_id) leadPatch.upi_transaction_id = receipt.payment_id;
    if (!leadPay.payment_from && receipt.donor_name) leadPatch.payment_from = receipt.donor_name;
    if (!leadPay.transaction_datetime && receipt.receipt_date) leadPatch.transaction_datetime = receipt.receipt_date;
    if (!leadPay.payment_mode) leadPatch.payment_mode = receipt.payment_id ? 'UPI' : 'Bank Transfer';
  }
  if (Object.keys(leadPatch).length > 0) {
    await db.from('fro_donor_logs').update(leadPatch).eq('id', lead.id);
  }
};

// ─── Engine ────────────────────────────────────────────────
export const findAutoMatches = async () => {
  const { data: entries, error: eErr } = await db
    .from('bank_audit_entries')
    .select('id, amount, payer_name, payment_id, transaction_date, project_id, receipt_id, status')
    .eq('status', 'unverified')
    .is('match_status', null)
    .order('transaction_date', { ascending: false });
  if (eErr) throw eErr;

  const { data: leads, error: lErr } = await db
    .from('fro_donor_logs')
    .select(`
      id, amount_collected, upi_transaction_id, transaction_datetime, verified_at, created_at,
      fro_assignments!inner(
        donor_id,
        fro_worker_id,
        donor_profiles!inner(id, name, mobile_number, project_supported, pan_number, address_1, address_2, email, donors_bank_name, mop),
        workers(id, name, login_id)
      )
    `)
    .eq('action', 'disposition')
    .eq('disposition_detail', 'lead_done')
    .eq('accounts_status', 'pending');
  if (lErr) throw lErr;

  // Never auto-link a second receipt onto a lead that already holds one.
  const { data: existing, error: exErr } = await db
    .from('receipts')
    .select('log_id')
    .not('log_id', 'is', null);
  if (exErr) throw exErr;
  const existingLogs = new Set((existing || []).map((r) => String(r.log_id)));
  const autoLeads = (leads || []).filter((l) => !existingLogs.has(String(l.id)));

  const matched = [];
  for (const entry of entries || []) {
    let best = null;
    let second = null;
    for (const lead of autoLeads || []) {
      const res = scoreEntryLead(entry, lead);
      if (!best || res.score > best.score) {
        second = best;
        best = { lead, ...res };
      } else if (!second || res.score > second.score) {
        second = { lead, ...res };
      }
    }
    if (best && best.score >= MIN_SCORE && (!second || best.score - second.score > MARGIN)) {
      matched.push({ kind: 'entry', entry, lead: best.lead, score: best.score, reasons: best.reasons });
    }
  }

  // ── Suspense receipt pass: auto-link anonymous money to a pending lead ──
  // Uses the same scoring engine (payment id / amount / NGO / date signals) and
  // the same thresholds. Links the receipt to the lead WITHOUT verifying it.
  const suspenseReceipts = await getUnlinkedReceipts();
  for (const receipt of suspenseReceipts || []) {
    const pseudo = {
      id: `suspense-${receipt.id}`,
      payment_id: receipt.payment_id,
      amount: receipt.amount,
      payer_name: receipt.donor_name,
      project_id: receipt.project_id,
      transaction_date: receipt.receipt_date,
    };
    let best = null;
    let second = null;
    for (const lead of autoLeads || []) {
      const res = scoreEntryLead(pseudo, lead);
      if (!best || res.score > best.score) {
        second = best;
        best = { lead, ...res };
      } else if (!second || res.score > second.score) {
        second = { lead, ...res };
      }
    }
    if (best && best.score >= MIN_SCORE && (!second || best.score - second.score > MARGIN)) {
      const matchNo = await nextMatchNo();
      await linkSuspenseToLead(receipt, best.lead);
      matched.push({
        kind: 'suspense',
        entry: { id: pseudo.id },
        match_no: matchNo,
        lead: best.lead,
        score: best.score,
        reasons: best.reasons,
      });
    }
  }

  for (const m of matched) {
    if (m.kind === 'suspense') continue;
    const matchNo = await nextMatchNo();
    await db.from('bank_audit_entries').update({
      matched_lead_log_id: m.lead.id,
      match_score: m.score,
      match_status: 'matched',
      match_no: matchNo,
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', m.entry.id);
    await syncEntryToLead(m.entry.id, m.lead.id);
  }

  return {
    matched: matched.length,
    matches: matched.map((m) => ({
      entry_id: m.entry.id,
      lead_id: m.lead.id,
      score: m.score,
      reasons: m.reasons,
      kind: m.kind,
    })),
  };
};

import db from '../config/db.js';

export const createDonorLog = async (data) => {
  const { data: result, error } = await db
    .from('fro_donor_logs')
    .insert([data])
    .select()
    .single();
  if (error) throw error;
  return result;
};

// Find a same-day disposition log for the same assignment + worker + detail so
// repeat saves (e.g. re-dialing a ringing/busy donor) refresh the existing row
// instead of piling up identical timeline entries.
export const findDispositionLogToday = async (assignmentId, workerId, detail, dayStart) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('fro_worker_id', workerId)
    .eq('action', 'disposition')
    .eq('disposition_detail', detail)
    .gte('created_at', dayStart)
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
};

export const updateDonorLog = async (id, updates) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const findLogsByAssignment = async (assignmentId) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

// OR-groups matching a collection on its ACTUAL collection date, expressed FLAT
// (no or() nested inside and()) so the custom query builder's or()-parser can
// handle it. donations & 'done' logs count on created_at OR transaction_datetime;
// verified 'lead_done' logs count on verified_at.
export const COLLECTION_DATE_OR = (s, e) =>
  `and(action.eq.donation,created_at.gte.${s},created_at.lte.${e}),` +
  `and(action.eq.donation,transaction_datetime.gte.${s},transaction_datetime.lte.${e}),` +
  `and(disposition_detail.eq.done,action.eq.disposition,created_at.gte.${s},created_at.lte.${e}),` +
  `and(disposition_detail.eq.done,action.eq.disposition,transaction_datetime.gte.${s},transaction_datetime.lte.${e}),` +
  `and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified,verified_at.gte.${s},verified_at.lte.${e})`;

const dayKey = (iso) => (iso ? String(iso).slice(0, 10) : null);

// A log counts as a collection on its ACTUAL transaction date, not its upload date.
// Imported receipts carry the real date in transaction_datetime; verified lead-dones
// are counted on the date they were verified.
export function logCollectionDate(d) {
  if (d.action === 'disposition' && d.disposition_detail === 'lead_done' && d.accounts_status === 'verified') {
    return d.verified_at;
  }
  return d.transaction_datetime || d.created_at;
}

export function inRange(date, start, end) {
  if (!date) return false;
  const dk = dayKey(date);
  return dk >= dayKey(start) && dk <= dayKey(end);
}

// Discriminates genuinely distinct payments that share donor + amount + day + NGO
// (e.g. a donor paying the same amount twice in one day) from duplicate copies of
// the SAME payment (a donation log plus its verified lead_done copy), which always
// carry the same payment reference.
export function paymentDiscriminant(d) {
  const ref = String(d.upi_transaction_id || '').replace(/[^0-9a-z]/gi, '').toLowerCase();
  if (ref) return `U${ref}`;
  const rm = /receipt\s+([A-Za-z0-9]+)/i.exec(String(d.remark || ''));
  if (rm) return `R${rm[1]}`;
  return 'X';
}

export const getCollectedByNgo = async (workerId, monthStart, monthEnd, allowedNgoIds) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select(`
      donor_id, amount_collected, action, disposition_detail, accounts_status,
      created_at, transaction_datetime, verified_at, upi_transaction_id, remark,
      fro_assignments!inner(ngo_id)
    `)
    .eq('fro_worker_id', workerId)
    .or(COLLECTION_DATE_OR(monthStart, monthEnd));
  if (error) throw error;

  const dayKey = (d) => d ? String(d).slice(0, 10) : null;
  const seen = new Set();
  const byNgo = {};
  for (const d of data || []) {
    if (!inRange(logCollectionDate(d), monthStart, monthEnd)) continue;
    const isDonation = d.action === 'donation';
    const isDoneDirect = d.action === 'disposition' && d.disposition_detail === 'done';
    const isVerifiedLead = d.action === 'disposition' && d.disposition_detail === 'lead_done' && d.accounts_status === 'verified';
    if (!isDonation && !isDoneDirect && !isVerifiedLead) continue;
    const amount = parseFloat(d.amount_collected || 0);
    if (amount <= 0) continue;
    const dedupKey = `${d.donor_id}|${amount}|${dayKey(logCollectionDate(d))}|${d.fro_assignments?.ngo_id || 'none'}|${paymentDiscriminant(d)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const ngoId = d.fro_assignments?.ngo_id;
    const key = (ngoId && allowedNgoIds.includes(ngoId)) ? ngoId : 'others';
    byNgo[key] = (byNgo[key] || 0) + amount;
  }
  return byNgo;
};

export const getTotalCollectedByWorker = async (workerId, monthStart, monthEnd) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('donor_id, amount_collected, action, disposition_detail, accounts_status, created_at, transaction_datetime, verified_at, upi_transaction_id, remark, fro_worker_id, fro_assignments(ngo_id)')
    .eq('fro_worker_id', workerId)
    .or(COLLECTION_DATE_OR(monthStart, monthEnd));
  if (error) throw error;

  const dayKey = (d) => d ? String(d).slice(0, 10) : null;
  const seen = new Set();
  let total = 0;
  for (const d of data || []) {
    if (!inRange(logCollectionDate(d), monthStart, monthEnd)) continue;
    const isDonation = d.action === 'donation';
    const isDoneDirect = d.action === 'disposition' && d.disposition_detail === 'done';
    const isVerifiedLead = d.action === 'disposition' && d.disposition_detail === 'lead_done' && d.accounts_status === 'verified';
    if (isDonation || isDoneDirect || isVerifiedLead) {
      const dedupKey = `${d.donor_id}|${d.amount_collected}|${dayKey(logCollectionDate(d))}|${d.fro_assignments?.ngo_id || 'none'}|${paymentDiscriminant(d)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      total += parseFloat(d.amount_collected || 0);
    }
  }
  return total;
};

export const getDailyCollectionByWorker = async (workerId, monthStart, monthEnd) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('donor_id, amount_collected, action, disposition_detail, accounts_status, created_at, transaction_datetime, verified_at, upi_transaction_id, remark, fro_worker_id, fro_assignments(ngo_id)')
    .eq('fro_worker_id', workerId)
    .or(COLLECTION_DATE_OR(monthStart, monthEnd));
  if (error) throw error;

  const seen = new Set();
  const byDay = {};
  for (const d of data || []) {
    const amount = parseFloat(d.amount_collected || 0);
    if (amount <= 0) continue;
    const date = logCollectionDate(d);
    if (!inRange(date, monthStart, monthEnd)) continue;
    const day = dayKey(date);
    const dedupKey = `${d.donor_id}|${amount}|${day}|${d.fro_assignments?.ngo_id || 'none'}|${paymentDiscriminant(d)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    byDay[day] = (byDay[day] || 0) + amount;
  }
  return byDay;
};

export const getBatchCollectionStats = async (workerIds, monthStart, monthEnd, todayStart, todayEnd, ngoIds) => {
  if (workerIds.length === 0) {
    const zero = {};
    for (const id of workerIds) zero[id] = 0;
    const zeroV = {};
    for (const id of workerIds) zeroV[id] = { amount: 0, count: 0 };
    return { monthCollection: zero, todayCollection: zero, weekCollection: zero, verifiedMonth: zeroV, unverifiedMonth: zeroV, verifiedToday: zeroV, unverifiedToday: zeroV };
  }

  let query = db
    .from('fro_donor_logs')
    .select('amount_collected, action, disposition_detail, accounts_status, created_at, transaction_datetime, verified_at, fro_worker_id, fro_assignments!inner(fro_worker_id, ngo_id)')
    .in('fro_worker_id', workerIds);

  if (ngoIds && ngoIds.length > 0) {
    query = query.in('fro_assignments.ngo_id', ngoIds);
  }

  const { data, error } = await query.or(
    COLLECTION_DATE_OR(monthStart, monthEnd) +
    `,and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.pending,created_at.gte.${monthStart},created_at.lte.${monthEnd})`
  );
  if (error) throw error;

  const init = () => ({ amount: 0, count: 0 });
  const monthCollection = {}; for (const id of workerIds) monthCollection[id] = 0;
  const todayCollection = {}; for (const id of workerIds) todayCollection[id] = 0;
  const weekCollection = {}; for (const id of workerIds) weekCollection[id] = 0;
  const verifiedMonth = {}; for (const id of workerIds) verifiedMonth[id] = init();
  const unverifiedMonth = {}; for (const id of workerIds) unverifiedMonth[id] = init();
  const verifiedToday = {}; for (const id of workerIds) verifiedToday[id] = init();
  const unverifiedToday = {}; for (const id of workerIds) unverifiedToday[id] = init();

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  for (const d of data || []) {
    const wId = d.fro_worker_id;
    if (!wId || !(wId in monthCollection)) continue;
    const amount = parseFloat(d.amount_collected || 0);

    const isDonation = d.action === 'donation';
    const isDoneDirect = d.action === 'disposition' && d.disposition_detail === 'done';
    const isVerifiedLead = d.action === 'disposition' && d.disposition_detail === 'lead_done' && d.accounts_status === 'verified';
    const isPendingLead = d.action === 'disposition' && d.disposition_detail === 'lead_done' && d.accounts_status === 'pending';

    const collectDate = logCollectionDate(d);

    if ((isDonation || isDoneDirect) && inRange(collectDate, monthStart, monthEnd)) {
      monthCollection[wId] += amount;
    }
    if (isVerifiedLead && inRange(collectDate, monthStart, monthEnd)) {
      monthCollection[wId] += amount;
    }

    if ((isDonation || isDoneDirect) && inRange(collectDate, weekStartIso, weekEndIso)) {
      weekCollection[wId] += amount;
    }
    if (isVerifiedLead && inRange(collectDate, weekStartIso, weekEndIso)) {
      weekCollection[wId] += amount;
    }

    if ((isDonation || isDoneDirect) && inRange(collectDate, todayStart, todayEnd)) {
      todayCollection[wId] += amount;
    }
    if (isVerifiedLead && inRange(collectDate, todayStart, todayEnd)) {
      todayCollection[wId] += amount;
    }

    if (isVerifiedLead && inRange(collectDate, monthStart, monthEnd)) {
      verifiedMonth[wId].amount += amount;
      verifiedMonth[wId].count++;
    }
    if (isPendingLead && d.created_at >= monthStart && d.created_at <= monthEnd) {
      unverifiedMonth[wId].amount += amount;
      unverifiedMonth[wId].count++;
    }
    if (isVerifiedLead && inRange(collectDate, todayStart, todayEnd)) {
      verifiedToday[wId].amount += amount;
      verifiedToday[wId].count++;
    }
    if (isPendingLead && d.created_at >= todayStart && d.created_at <= todayEnd) {
      unverifiedToday[wId].amount += amount;
      unverifiedToday[wId].count++;
    }
  }

  return { monthCollection, todayCollection, weekCollection, verifiedMonth, unverifiedMonth, verifiedToday, unverifiedToday };
};

export const findLogsByDonorAndWorker = async (donorId, workerId) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('*')
    .eq('donor_id', donorId)
    .eq('fro_worker_id', workerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('findLogsByDonorAndWorker query failed, trying fallback:', error.message);
    const { data: assignment, error: asgnErr } = await db
      .from('fro_assignments')
      .select('id')
      .eq('donor_id', donorId)
      .eq('fro_worker_id', workerId)
      .not('status', 'eq', 'reassigned')
      .maybeSingle();
    if (asgnErr) {
      console.error('findLogsByDonorAndWorker fallback also failed:', asgnErr.message);
      throw asgnErr;
    }
    if (assignment) {
      return findLogsByAssignment(assignment.id);
    }
    return [];
  }
  return data || [];
};

export const getTotalCollectedByDonorAndWorker = async (donorId, workerId) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('amount_collected')
    .eq('donor_id', donorId)
    .eq('fro_worker_id', workerId)
    .or('action.eq.donation,and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified),and(disposition_detail.eq.done,action.eq.disposition)');
  if (error) {
    console.error('getTotalCollectedByDonorAndWorker failed, trying fallback:', error.message);
    const { data: assignment, error: asgnErr } = await db
      .from('fro_assignments')
      .select('id')
      .eq('donor_id', donorId)
      .eq('fro_worker_id', workerId)
      .not('status', 'eq', 'reassigned')
      .maybeSingle();
    if (asgnErr) {
      console.error('getTotalCollectedByDonorAndWorker fallback also failed:', asgnErr.message);
      throw asgnErr;
    }
    if (assignment) {
      return getTotalCollectedByAssignment(assignment.id);
    }
    return 0;
  }
  let total = 0;
  for (const d of data || []) {
    total += parseFloat(d.amount_collected || 0);
  }
  return total;
};

export const getVerifiedCollection = async (workerId, startDate, endDate) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('amount_collected, fro_worker_id')
    .eq('fro_worker_id', workerId)
    .eq('disposition_detail', 'lead_done')
    .eq('accounts_status', 'verified')
    .gte('verified_at', startDate)
    .lte('verified_at', endDate);
  if (error) throw error;

  let total = 0;
  for (const d of data || []) total += parseFloat(d.amount_collected || 0);
  return { amount: total, count: (data || []).length };
};

export const getUnverifiedCollection = async (workerId, startDate, endDate) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('amount_collected, fro_worker_id')
    .eq('fro_worker_id', workerId)
    .eq('disposition_detail', 'lead_done')
    .eq('accounts_status', 'pending')
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  if (error) throw error;

  let total = 0;
  for (const d of data || []) total += parseFloat(d.amount_collected || 0);
  return { amount: total, count: (data || []).length };
};

export const getTotalCollectedByAssignment = async (assignmentId) => {
  const { data, error } = await db
    .from('fro_donor_logs')
    .select('amount_collected, action, disposition_detail')
    .eq('assignment_id', assignmentId)
    .or('action.eq.donation,and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified),and(disposition_detail.eq.done,action.eq.disposition)');
  if (error) throw error;

  let total = 0;
  for (const d of data) {
    total += parseFloat(d.amount_collected || 0);
  }
  return total;
};

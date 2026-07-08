import supabase from '../config/supabase.js';

export const createDonorLog = async (data) => {
  const { data: result, error } = await supabase
    .from('fro_donor_logs')
    .insert([data])
    .select()
    .single();
  if (error) throw error;
  return result;
};

export const findLogsByAssignment = async (assignmentId) => {
  const { data, error } = await supabase
    .from('fro_donor_logs')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getTotalCollectedByWorker = async (workerId, monthStart, monthEnd) => {
  const { data, error } = await supabase
    .from('fro_donor_logs')
    .select('amount_collected, fro_assignments!inner(fro_worker_id)')
    .eq('fro_assignments.fro_worker_id', workerId)
    .or(
      `and(action.eq.donation,created_at.gte.${monthStart},created_at.lte.${monthEnd}),` +
      `and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified,verified_at.gte.${monthStart},verified_at.lte.${monthEnd})`
    );
  if (error) throw error;

  let total = 0;
  for (const d of data) {
    total += parseFloat(d.amount_collected || 0);
  }
  return total;
};

export const getBatchCollectionStats = async (workerIds, monthStart, monthEnd, todayStart, todayEnd, ngoIds) => {
  if (workerIds.length === 0) {
    const zero = {};
    for (const id of workerIds) zero[id] = 0;
    const zeroV = {};
    for (const id of workerIds) zeroV[id] = { amount: 0, count: 0 };
    return { monthCollection: zero, todayCollection: zero, verifiedMonth: zeroV, unverifiedMonth: zeroV, verifiedToday: zeroV, unverifiedToday: zeroV };
  }

  let query = supabase
    .from('fro_donor_logs')
    .select('amount_collected, action, disposition_detail, accounts_status, created_at, verified_at, fro_assignments!inner(fro_worker_id)')
    .in('fro_assignments.fro_worker_id', workerIds);

  if (ngoIds && ngoIds.length > 0) {
    query = query.in('fro_assignments.ngo_id', ngoIds);
  }

  const { data, error } = await query.or(
      `and(action.eq.donation,created_at.gte.${monthStart},created_at.lte.${monthEnd}),` +
      `and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified,verified_at.gte.${monthStart},verified_at.lte.${monthEnd}),` +
      `and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.pending,created_at.gte.${monthStart},created_at.lte.${monthEnd})`
    );
  if (error) throw error;

  const init = () => ({ amount: 0, count: 0 });
  const monthCollection = {}; for (const id of workerIds) monthCollection[id] = 0;
  const todayCollection = {}; for (const id of workerIds) todayCollection[id] = 0;
  const verifiedMonth = {}; for (const id of workerIds) verifiedMonth[id] = init();
  const unverifiedMonth = {}; for (const id of workerIds) unverifiedMonth[id] = init();
  const verifiedToday = {}; for (const id of workerIds) verifiedToday[id] = init();
  const unverifiedToday = {}; for (const id of workerIds) unverifiedToday[id] = init();

  for (const d of data || []) {
    const wId = d.fro_assignments?.fro_worker_id;
    if (!wId || !(wId in monthCollection)) continue;
    const amount = parseFloat(d.amount_collected || 0);

    const isDonation = d.action === 'donation';
    const isVerifiedLead = d.action === 'disposition' && d.disposition_detail === 'lead_done' && d.accounts_status === 'verified';
    const isPendingLead = d.action === 'disposition' && d.disposition_detail === 'lead_done' && d.accounts_status === 'pending';

    if (isDonation && d.created_at >= monthStart && d.created_at <= monthEnd) {
      monthCollection[wId] += amount;
    }
    if (isVerifiedLead && d.verified_at >= monthStart && d.verified_at <= monthEnd) {
      monthCollection[wId] += amount;
    }

    if (isDonation && d.created_at >= todayStart && d.created_at <= todayEnd) {
      todayCollection[wId] += amount;
    }
    if (isVerifiedLead && d.verified_at >= todayStart && d.verified_at <= todayEnd) {
      todayCollection[wId] += amount;
    }

    if (isVerifiedLead && d.verified_at >= monthStart && d.verified_at <= monthEnd) {
      verifiedMonth[wId].amount += amount;
      verifiedMonth[wId].count++;
    }
    if (isPendingLead && d.created_at >= monthStart && d.created_at <= monthEnd) {
      unverifiedMonth[wId].amount += amount;
      unverifiedMonth[wId].count++;
    }
    if (isVerifiedLead && d.verified_at >= todayStart && d.verified_at <= todayEnd) {
      verifiedToday[wId].amount += amount;
      verifiedToday[wId].count++;
    }
    if (isPendingLead && d.created_at >= todayStart && d.created_at <= todayEnd) {
      unverifiedToday[wId].amount += amount;
      unverifiedToday[wId].count++;
    }
  }

  return { monthCollection, todayCollection, verifiedMonth, unverifiedMonth, verifiedToday, unverifiedToday };
};

export const findLogsByDonorAndWorker = async (donorId, workerId) => {
  const { data, error } = await supabase
    .from('fro_donor_logs')
    .select('*')
    .eq('donor_id', donorId)
    .eq('fro_worker_id', workerId)
    .order('created_at', { ascending: false });
  if (error) {
    // fallback to assignment-based lookup
    const { data: assignment } = await supabase
      .from('fro_assignments')
      .select('id')
      .eq('donor_id', donorId)
      .eq('fro_worker_id', workerId)
      .not('status', 'eq', 'reassigned')
      .maybeSingle();
    if (assignment) {
      return findLogsByAssignment(assignment.id);
    }
    return [];
  }
  return data || [];
};

export const getTotalCollectedByDonorAndWorker = async (donorId, workerId) => {
  const { data, error } = await supabase
    .from('fro_donor_logs')
    .select('amount_collected')
    .eq('donor_id', donorId)
    .eq('fro_worker_id', workerId)
    .or('action.eq.donation,and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified)');
  if (error) {
    const { data: assignment } = await supabase
      .from('fro_assignments')
      .select('id')
      .eq('donor_id', donorId)
      .eq('fro_worker_id', workerId)
      .not('status', 'eq', 'reassigned')
      .maybeSingle();
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
  const { data, error } = await supabase
    .from('fro_donor_logs')
    .select('amount_collected, fro_assignments!inner(fro_worker_id)')
    .eq('fro_assignments.fro_worker_id', workerId)
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
  const { data, error } = await supabase
    .from('fro_donor_logs')
    .select('amount_collected, fro_assignments!inner(fro_worker_id)')
    .eq('fro_assignments.fro_worker_id', workerId)
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
  const { data, error } = await supabase
    .from('fro_donor_logs')
    .select('amount_collected, action, disposition_detail')
    .eq('assignment_id', assignmentId)
    .or('action.eq.donation,and(disposition_detail.eq.lead_done,action.eq.disposition,accounts_status.eq.verified)');
  if (error) throw error;

  let total = 0;
  for (const d of data) {
    total += parseFloat(d.amount_collected || 0);
  }
  return total;
};

import db from '../config/db.js';

export const upsertTarget = async (data) => {
  const { fro_worker_id, ngo_id, month, target_amount, set_by } = data;
  const { data: result, error } = await db
    .from('fro_monthly_targets')
    .upsert(
      { fro_worker_id, ngo_id, month, target_amount, set_by },
      { onConflict: 'fro_worker_id, ngo_id, month' }
    )
    .select()
    .single();
  if (error) throw error;
  return result;
};

// A worker can hold multiple fro_monthly_targets rows per month (one per
// ngo_id). Pick the most recently set row deterministically so the dashboard
// target query never trips the wrapper's single-row check on duplicate rows.
export const getTargetByWorker = async (workerId, month) => {
  const { data, error } = await db
    .from('fro_monthly_targets')
    .select('*')
    .eq('fro_worker_id', workerId)
    .eq('month', month)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const getTargetsByNgo = async (ngoId, month) => {
  const { data, error } = await db
    .from('fro_monthly_targets')
    .select('*, workers!inner(id, name, login_id)')
    .eq('ngo_id', ngoId)
    .eq('month', month);
  if (error) throw error;
  return data;
};

export const updateAchievedTarget = async (workerId, ngoId, month, achievedAmount) => {
  const { data: existing } = await db
    .from('fro_monthly_targets')
    .select('id')
    .eq('fro_worker_id', workerId)
    .eq('ngo_id', ngoId)
    .eq('month', month)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from('fro_monthly_targets')
      .update({ achieved_target: achievedAmount })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from('fro_monthly_targets')
    .insert({ fro_worker_id: workerId, ngo_id: ngoId, month, achieved_target: achievedAmount, target_amount: 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateIncentive = async (workerId, ngoId, month, amount) => {
  const { data: existing } = await db
    .from('fro_monthly_targets')
    .select('id')
    .eq('fro_worker_id', workerId)
    .eq('ngo_id', ngoId)
    .eq('month', month)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from('fro_monthly_targets')
      .update({ incentive: amount })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from('fro_monthly_targets')
    .insert({ fro_worker_id: workerId, ngo_id: ngoId, month, incentive: amount, target_amount: 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getAllTargetsForNgo = async (ngoId) => {
  const { data, error } = await db
    .from('fro_monthly_targets')
    .select('*, workers!inner(id, name, login_id)')
    .eq('ngo_id', ngoId)
    .order('month', { ascending: false });
  if (error) throw error;
  return data;
};

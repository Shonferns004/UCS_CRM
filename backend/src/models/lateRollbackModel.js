import db from '../config/db.js';

// Late-deduction rollbacks: an admin can waive part (or all) of one month's
// computed late deduction for one worker. `salary_month` is 'YYYY-MM' — the
// same key salary_holds uses.

export const getLateRollback = async (workerId, monthStr) => {
  const { data, error } = await db
    .from('salary_late_rollbacks')
    .select('*')
    .eq('worker_id', workerId)
    .eq('salary_month', monthStr)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

// Bulk read for the monthly salary sheet / payroll export: one query per month
// instead of one per worker.
export const getLateRollbacksForMonth = async (monthStr) => {
  const { data, error } = await db
    .from('salary_late_rollbacks')
    .select('worker_id, waived_minutes')
    .eq('salary_month', monthStr);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.worker_id] = Number(row.waived_minutes) || 0;
  return map;
};

export const upsertLateRollback = async ({ workerId, monthStr, waivedMinutes, reason, createdBy }) => {
  const { data, error } = await db
    .from('salary_late_rollbacks')
    .upsert(
      {
        worker_id: workerId,
        salary_month: monthStr,
        waived_minutes: waivedMinutes,
        reason,
        created_by: createdBy || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'worker_id,salary_month' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteLateRollback = async (workerId, monthStr) => {
  const { error } = await db
    .from('salary_late_rollbacks')
    .delete()
    .eq('worker_id', workerId)
    .eq('salary_month', monthStr);
  if (error) throw error;
};

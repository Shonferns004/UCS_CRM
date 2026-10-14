import db from '../config/db.js';

// One proof row per worker per date (UNIQUE(worker_id, date)). Workers can
// replace their proof while it is still pending; once HR has decided, the
// row is frozen (reviewed_at set) and re-uploads are rejected.

export async function getAbsenceProofsByWorker(workerId, startDate, endDate) {
  let query = db
    .from('absence_proofs')
    .select('*')
    .eq('worker_id', workerId)
    .order('date', { ascending: true });
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Bulk month window for payroll: every proof in the range, grouped later.
export async function getAbsenceProofsInRange(startDate, endDate) {
  const { data, error } = await db
    .from('absence_proofs')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAbsenceProofById(id) {
  const { data, error } = await db
    .from('absence_proofs')
    .select('*, workers(name, login_id)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAbsenceProofByWorkerDate(workerId, date) {
  const { data, error } = await db
    .from('absence_proofs')
    .select('*')
    .eq('worker_id', workerId)
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAbsenceProofs(status = null) {
  let query = db
    .from('absence_proofs')
    .select('*, workers(name, login_id)')
    .order('date', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Insert or replace a worker's proof for a date. Re-upload resets the row
// to pending ONLY while it has not been reviewed yet.
export async function upsertAbsenceProof({ workerId, date, leaveId, proofData, proofMime }) {
  const existing = await getAbsenceProofByWorkerDate(workerId, date);
  if (existing?.reviewed_at) {
    const err = new Error('This absence has already been reviewed. Contact HR.');
    err.code = 'ALREADY_REVIEWED';
    throw err;
  }
  if (existing) {
    const { data, error } = await db
      .from('absence_proofs')
      .update({
        proof_data: proofData,
        proof_mime: proofMime,
        leave_id: leaveId ?? existing.leave_id,
        status: 'pending',
        admin_remark: null,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db
    .from('absence_proofs')
    .insert([{
      worker_id: workerId,
      date,
      leave_id: leaveId ?? null,
      proof_data: proofData,
      proof_mime: proofMime,
      status: 'pending',
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAbsenceProofStatus(id, status, adminRemark, reviewerId) {
  const { data, error } = await db
    .from('absence_proofs')
    .update({
      status,
      admin_remark: adminRemark || null,
      reviewed_by: reviewerId || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

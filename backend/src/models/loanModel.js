import db from '../config/db.js';

export const applyLoan = async (data) => {
  const { data: result, error } = await db
    .from('worker_loans')
    .insert([data])
    .select()
    .single();
  if (error) throw error;
  return result;
};

export const getWorkerLoans = async (workerId) => {
  const { data, error } = await db
    .from('worker_loans')
    .select('*')
    .eq('worker_id', workerId)
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getAllLoans = async () => {
  const { data, error } = await db
    .from('worker_loans')
    .select('*, workers(name, login_id, email, department)')
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getPendingLoans = async () => {
  const { data, error } = await db
    .from('worker_loans')
    .select('*, workers(name, login_id, email, department)')
    .eq('status', 'pending')
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getLoanById = async (id) => {
  const { data, error } = await db
    .from('worker_loans')
    .select('*, workers(name, login_id, email, department)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

export const updateLoan = async (id, updates) => {
  const { data, error } = await db
    .from('worker_loans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getActiveLoansByWorker = async (workerId) => {
  const { data, error } = await db
    .from('worker_loans')
    .select('*')
    .eq('worker_id', workerId)
    .in('status', ['approved', 'active'])
    .gt('remaining_amount', 0);
  if (error) throw error;
  return data || [];
};

export const getActiveLoansForAllWorkers = async () => {
  const { data, error } = await db
    .from('worker_loans')
    .select('*')
    .in('status', ['approved', 'active'])
    .gt('remaining_amount', 0)
    .order('worker_id');
  if (error) throw error;
  return data || [];
};

export const createDeduction = async (loanId, month, amount) => {
  const { data, error } = await db
    .from('worker_loan_deductions')
    .insert([{ loan_id: loanId, month, amount }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getDeductionsForWorkerMonth = async (workerId, month) => {
  const { data, error } = await db
    .from('worker_loan_deductions')
    .select('*, worker_loans!inner(worker_id)')
    .eq('worker_loans.worker_id', workerId)
    .eq('month', month);
  if (error) throw error;
  return data || [];
};

export const getDeductionsByLoan = async (loanId) => {
  const { data, error } = await db
    .from('worker_loan_deductions')
    .select('*')
    .eq('loan_id', loanId)
    .order('month', { ascending: false });
  if (error) throw error;
  return data || [];
};

import db from '../config/db.js';

export const createOperatorEvent = async (data) => {
  const { data: result, error } = await db
    .from('operator_events')
    .insert({ ...data, updated_at: new Date() })
    .select('*')
    .single();
  if (error) throw error;
  return result;
};

export const updateOperatorEvent = async (id, updates) => {
  const { data, error } = await db
    .from('operator_events')
    .update({ ...updates, updated_at: new Date() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const getOperatorEventById = async (id) => {
  const { data, error } = await db
    .from('operator_events')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
};

export const listOperatorEvents = async ({ date, state } = {}) => {
  let query = db
    .from('operator_events')
    .select('*')
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (date) query = query.eq('event_date', date);
  if (state) query = query.ilike('state', `%${state}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const deleteOperatorEvent = async (id) => {
  const { error } = await db.from('operator_events').delete().eq('id', id);
  if (error) throw error;
  return { message: 'Event deleted' };
};

export const assignOperatorEvent = async (data) => {
  const { data: result, error } = await db
    .from('operator_assignments')
    .upsert(data, { onConflict: 'operator_id,assignment_date,event_id' })
    .select('*')
    .single();
  if (error) throw error;
  return result;
};

export const getOperatorAssignmentsByDate = async (operatorId, date) => {
  const { data, error } = await db
    .from('operator_assignments')
    .select('*, operator_events(*)')
    .eq('operator_id', operatorId)
    .eq('assignment_date', date);
  if (error) throw error;
  return data || [];
};

export const getTodayAssignment = async (operatorId, date) => {
  const { data, error } = await db
    .from('operator_assignments')
    .select('*, operator_events(*)')
    .eq('operator_id', operatorId)
    .eq('assignment_date', date)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
};
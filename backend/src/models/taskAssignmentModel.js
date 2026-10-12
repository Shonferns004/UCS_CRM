import db from '../config/db.js';

// Social Media task assignments (backend/migrations/184_task_assignments.sql).
// A row is one task one manager handed to one Social team member for a date.

const TABLE = 'task_assignments';
const COLUMNS =
  'id, panel, task_date, title, description, assignee_id, assignee_name, assigned_by_id, assigned_by_name, status, created_at';

export const createAssignment = async (row) => {
  const { data, error } = await db
    .from(TABLE)
    .insert([row])
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
};

// Every assignment for a panel, optionally narrowed to one date or one month
// (YYYY-MM). The controller partitions the result into "assigned to me" /
// "created by me" in memory — a day or month holds a handful of rows, so no
// second query is needed.
export const listAssignments = async (panel, { date, month } = {}) => {
  let query = db.from(TABLE).select(COLUMNS).eq('panel', panel);
  if (date) query = query.eq('task_date', date);
  if (month) query = query.gte('task_date', `${month}-01`).lte('task_date', `${month}-31`);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getAssignmentById = async (id) => {
  const { data, error } = await db
    .from(TABLE)
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const deleteAssignment = async (id) => {
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) throw error;
  return { message: 'Assignment removed' };
};

// The assignee (or the head) moves a task between pending / wip / done.
export const updateAssignmentStatus = async (id, status) => {
  const { data, error } = await db
    .from(TABLE)
    .update({ status })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
};

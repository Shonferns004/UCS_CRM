import db, { getTableColumns } from '../config/db.js';

// Social Media task assignments (backend/migrations/184_task_assignments.sql).
// A row is one task one manager handed to one Social team member for a date.

const TABLE = 'task_assignments';

// Exclusive end bound for a YYYY-MM month. `${month}-31` used to be the bound
// and it breaks on every 30-day month and February ("date/time field value out
// of range"), which failed the whole list — so assignments looked deleted on a
// refresh while the rows were still in the table.
const monthEndExclusive = (month) => {
  const [y, m] = String(month).split('-').map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
};
const BASE_COLUMNS = [
  'id', 'panel', 'task_date', 'title', 'description', 'content_type',
  'assignee_id', 'assignee_name', 'assigned_by_id', 'assigned_by_name', 'status', 'created_at',
];

// 187's completion day. Migrations in this repo are hand-applied (no runner), so
// the column is appended against the live schema instead of hard-coded: an
// installation that has not applied 187 keeps reading rows back rather than
// erroring on a column that is not there yet.
const selectCols = async () => {
  const out = [...BASE_COLUMNS];
  if ((await getTableColumns(TABLE)).includes('completed_date')) out.push('completed_date');
  return out.join(', ');
};

export const createAssignment = async (row) => {
  const { data, error } = await db
    .from(TABLE)
    .insert([row])
    .select(await selectCols())
    .single();
  if (error) throw error;
  return data;
};

// Every assignment for a panel, optionally narrowed to one date or one month
// (YYYY-MM). The controller partitions the result into "assigned to me" /
// "created by me" in memory — a day or month holds a handful of rows, so no
// second query is needed.
export const listAssignments = async (panel, { date, month } = {}) => {
  let query = db.from(TABLE).select(await selectCols()).eq('panel', panel);
  if (date) query = query.eq('task_date', date);
  if (month) query = query.gte('task_date', `${month}-01`).lt('task_date', monthEndExclusive(month));
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getAssignmentById = async (id) => {
  const { data, error } = await db
    .from(TABLE)
    .select(await selectCols())
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

// The assignee (or the head) moves a task between pending / wip / done. When it
// becomes 'done' the current day is stored as completed_date — the day the work
// was actually finished — so the Monthly Planner can green the cell once the head
// accepts that day's report; leaving 'done' clears it.
export const updateAssignmentStatus = async (id, status, completed_date = null) => {
  const fields = { status };
  if ((await getTableColumns(TABLE)).includes('completed_date')) {
    fields.completed_date = status === 'done' ? completed_date : null;
  }
  const { data, error } = await db
    .from(TABLE)
    .update(fields)
    .eq('id', id)
    .select(await selectCols())
    .single();
  if (error) throw error;
  return data;
};

// A rejected daily report raises a task on the reporter's board. Those tasks are
// marked with a fixed `content_type` so they can be told apart from the manager's
// planned deliverables, and re-found on a re-reject or resolved on an accept.
export const REWORK_CONTENT_TYPE = 'daily-report-rework';

const OPEN_STATUSES = ['pending', 'wip'];

// The open rework task for one reporter on one date, if the report is rejected
// again before the member fixes it (so the note is updated, not duplicated).
export const findOpenReworkTask = async (panel, assignee_id, task_date, content_type) => {
  const { data, error } = await db
    .from(TABLE)
    .select(await selectCols())
    .eq('panel', panel)
    .eq('assignee_id', String(assignee_id))
    .eq('task_date', task_date)
    .eq('content_type', content_type)
    .in('status', OPEN_STATUSES)
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
};

export const updateAssignmentFields = async (id, fields) => {
  const { data, error } = await db
    .from(TABLE)
    .update(fields)
    .eq('id', id)
    .select(await selectCols())
    .single();
  if (error) throw error;
  return data;
};

// Clear the rework task for (reporter, date) once the head accepts the report —
// whatever status it was left in, the review is resolved and the task is spent.
export const deleteReworkTasks = async (panel, assignee_id, task_date, content_type) => {
  const { error } = await db
    .from(TABLE)
    .delete()
    .eq('panel', panel)
    .eq('assignee_id', String(assignee_id))
    .eq('task_date', task_date)
    .eq('content_type', content_type);
  if (error) throw error;
};

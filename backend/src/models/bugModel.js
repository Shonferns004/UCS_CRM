import db from '../config/db.js';

// QA bug tracker (table `bugs`, migration 189). Reporter/assignee names are
// denormalized onto the row at write time, so no worker joins are needed here
// and the board renders without a second round-trip.

const STATUSES = ['reported', 'in_progress', 'fixed'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export const BUG_STATUSES = STATUSES;
export const BUG_SEVERITIES = SEVERITIES;

export const insertBug = async (bug) => {
  const { data, error } = await db
    .from('bugs')
    .insert(bug)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const selectBugs = async (filters = {}) => {
  let query = db
    .from('bugs')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.module) query = query.eq('module', filters.module);
  if (filters.assigned_to) {
    if (filters.assigned_to === 'null' || filters.assigned_to === '') {
      query = query.is('assigned_to', null);
    } else {
      query = query.eq('assigned_to', filters.assigned_to);
    }
  }
  if (filters.reported_by) query = query.eq('reported_by_id', filters.reported_by);
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,module.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const selectBugById = async (id) => {
  const { data, error } = await db
    .from('bugs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

export const updateBug = async (id, updates) => {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db
    .from('bugs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteBug = async (id) => {
  const { error } = await db
    .from('bugs')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return { id };
};

export const getBugStats = async () => {
  const { data: bugs, error } = await db
    .from('bugs')
    .select('status, severity');
  if (error) throw error;

  const all = bugs || [];
  const countBy = (field, value) => all.filter(b => b[field] === value).length;

  return {
    total: all.length,
    reported: countBy('status', 'reported'),
    in_progress: countBy('status', 'in_progress'),
    fixed: countBy('status', 'fixed'),
    by_severity: {
      low: countBy('severity', 'low'),
      medium: countBy('severity', 'medium'),
      high: countBy('severity', 'high'),
      critical: countBy('severity', 'critical'),
    },
  };
};

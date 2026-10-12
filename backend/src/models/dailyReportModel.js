import db from '../config/db.js';

// Storage for the hand-typed section data of the per-department daily reports
// (Developer, HR, Recruiter, Social Media). Everything countable is derived live
// in the client and never written here; this table holds only what needs a human
// each day. One row per (panel, report_date, reporter_name).
//
// `department` mirrors the panel key; `reporter_id` is the stable users.id of
// the author (reporter_name is a display label and can be edited), and the
// remark columns hold the HOD's review of the row.

const COLUMNS = [
  'id', 'panel', 'department', 'report_date', 'reporter_id', 'reporter_name',
  'data', 'remark', 'remark_by', 'remark_at', 'created_by', 'created_at', 'updated_at',
];

export const getReport = async (panel, report_date, reporter_name) => {
  const { data, error } = await db
    .from('daily_reports')
    .select(COLUMNS.join(', '))
    .eq('panel', panel)
    .eq('report_date', report_date)
    .eq('reporter_name', reporter_name)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const getReportById = async (id) => {
  const { data, error } = await db
    .from('daily_reports')
    .select(COLUMNS.join(', '))
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const listReportsForDate = async (panel, report_date, reporter_id) => {
  let q = db
    .from('daily_reports')
    .select(COLUMNS.join(', '))
    .eq('panel', panel)
    .eq('report_date', report_date);
  if (reporter_id) q = q.eq('reporter_id', reporter_id);
  const { data, error } = await q.order('reporter_name', { ascending: true });
  if (error) throw error;
  return data || [];
};

// All panels for a date — the HOD / super-admin overview. Filters are optional.
export const listAllForDate = async (report_date, { panel, department, reporter_id } = {}) => {
  let q = db
    .from('daily_reports')
    .select(COLUMNS.join(', '))
    .eq('report_date', report_date);
  if (panel) q = q.eq('panel', panel);
  if (department) q = q.eq('department', department);
  if (reporter_id) q = q.eq('reporter_id', reporter_id);
  const { data, error } = await q.order('panel', { ascending: true });
  if (error) throw error;
  return data || [];
};

// Update first, insert only if nothing matched, rather than db.from().upsert().
// Two reasons, both of which the builder's ON CONFLICT DO UPDATE gets wrong for
// this table:
//
//   1. created_by must be first-write-only. _execUpsert in config/db.js emits
//      `col = EXCLUDED.col` for *every* non-conflict column it was handed, so an
//      upsert that includes created_by silently restamps it with whoever typed
//      last. An UPDATE payload that simply never mentions created_by makes the
//      rule structural instead of a comment.
//
//   2. Timestamps stay on the database clock, matched by the
//      daily_reports_touch BEFORE UPDATE trigger on every update.
export const upsertReport = async ({ panel, department, report_date, reporter_id, reporter_name, data, created_by }) => {
  const edits = {
    data: data && typeof data === 'object' ? data : {},
  };

  const { data: updated, error: updateError } = await db
    .from('daily_reports')
    .update(edits)
    .eq('panel', panel)
    .eq('report_date', report_date)
    .eq('reporter_name', reporter_name)
    .select(COLUMNS.join(', '));
  if (updateError) throw updateError;
  if (updated && updated.length) return updated[0];

  const { data: inserted, error: insertError } = await db
    .from('daily_reports')
    .insert({
      ...edits,
      panel,
      department: department || null,
      report_date,
      reporter_id: reporter_id || null,
      reporter_name,
      created_by: created_by || null,
    })
    .select(COLUMNS.join(', '))
    .single();

  // A double submit (or a retry after a flaky connection) can slip two inserts
  // past the update above and land on the unique constraint together. That is
  // the row now existing, so fall back to updating it instead of failing the
  // save the reporter is waiting on.
  if (insertError) {
    const raced = await db
      .from('daily_reports')
      .update(edits)
      .eq('panel', panel)
      .eq('report_date', report_date)
      .eq('reporter_name', reporter_name)
      .select(COLUMNS.join(', '));
    if (raced.error) throw insertError;
    if (raced.data && raced.data.length) return raced.data[0];
    throw insertError;
  }
  return inserted || null;
};

// HOD review. updated_at is bumped by the daily_reports_touch trigger.
export const setRemark = async (id, remark, remark_by) => {
  const { data, error } = await db
    .from('daily_reports')
    .update({
      remark: remark ? String(remark) : null,
      remark_by: remark_by || null,
      remark_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(COLUMNS.join(', '));
  if (error) throw error;
  return data && data.length ? data[0] : null;
};

import db, { getTableColumns } from '../config/db.js';

// Storage for the hand-typed section data of the per-department daily reports
// (Developer, HR, Recruiter, Social Media). Everything countable is derived live
// in the client and never written here; this table holds only what needs a human
// each day. One row per (panel, report_date, reporter_name).
//
// `department` mirrors the panel key; `reporter_id` is the stable users.id of
// the author (reporter_name is a display label and can be edited); the remark
// columns hold the HOD's review and the review_* columns the Social head's
// accept / reject of the row.

// Base columns exist on every installation. The review columns (review_status,
// reviewed_by, reviewed_at) only arrive with the 185 migration, which is
// hand-applied (there is no migration runner in this repo) — so lists that must
// return them are expanded against the live schema instead of hard-coded.
const COLUMNS = [
  'id', 'panel', 'department', 'report_date', 'reporter_id', 'reporter_name',
  'data', 'remark', 'remark_by', 'remark_at', 'created_by', 'created_at', 'updated_at',
];
const REVIEW_COLUMNS = ['review_status', 'reviewed_by', 'reviewed_at'];
// 186's reviewer note. Tracked separately from the 185 trio so an install that
// applied 185 but not 186 still reads its rows back instead of erroring on a
// missing column.
const REVIEW_NOTE_COLUMN = 'review_note';

// db.js caches information_schema with a short TTL, so this is cheap and picks
// the new columns up ~30s after the migration lands without a restart.
const colsWithReview = async () => {
  const cols = await getTableColumns('daily_reports');
  const out = [...COLUMNS];
  if (cols.includes('review_status')) out.push(...REVIEW_COLUMNS);
  if (cols.includes(REVIEW_NOTE_COLUMN)) out.push(REVIEW_NOTE_COLUMN);
  return out;
};

// Whether the reviewer-query column (migration 186) exists yet.
const reviewNoteEnabled = async () => (await getTableColumns('daily_reports')).includes(REVIEW_NOTE_COLUMN);
const selectCols = async () => (await colsWithReview()).join(', ');

// Whether the review feature is live — the migration columns exist.
export const reviewEnabled = async () => {
  const cols = await getTableColumns('daily_reports');
  return cols.includes('review_status');
};

export const getReport = async (panel, report_date, reporter_name) => {
  const { data, error } = await db
    .from('daily_reports')
    .select(await selectCols())
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
    .select(await selectCols())
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const listReportsForDate = async (panel, report_date, reporter_id) => {
  let q = db
    .from('daily_reports')
    .select(await selectCols())
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
    .select(await selectCols())
    .eq('report_date', report_date);
  if (panel) q = q.eq('panel', panel);
  if (department) q = q.eq('department', department);
  if (reporter_id) q = q.eq('reporter_id', reporter_id);
  const { data, error } = await q.order('panel', { ascending: true });
  if (error) throw error;
  return data || [];
};

// Every panel's rows for a month (YYYY-MM), ordered per reporter per day — the
// Super Admin monthly developer report. Filters are optional and applied
// before the ordering so a single-reporter drill-down stays cheap.
export const listAllForMonth = async (month, { panel, department, reporter_id } = {}) => {
  let q = db
    .from('daily_reports')
    .select(await selectCols())
    .gte('report_date', `${month}-01`)
    .lte('report_date', `${month}-31`);
  if (panel) q = q.eq('panel', panel);
  if (department) q = q.eq('department', department);
  if (reporter_id) q = q.eq('reporter_id', reporter_id);
  const { data, error } = await q
    .order('reporter_name', { ascending: true })
    .order('report_date', { ascending: true });
  if (error) throw error;
  return data || [];
};

// One reporter's rows for a month — the Developer panel's own monthly view.
// Keyed by reporter_name because that is the column upsertReport writes and
// getReport reads, so the list always matches what their panel shows.
export const listMineForMonth = async (panel, month, reporter_name) => {
  const { data, error } = await db
    .from('daily_reports')
    .select(await selectCols())
    .eq('panel', panel)
    .eq('reporter_name', reporter_name)
    .gte('report_date', `${month}-01`)
    .lte('report_date', `${month}-31`)
    .order('report_date', { ascending: true });
  if (error) throw error;
  return data || [];
};

// One panel's ACCEPTED reports for a month (YYYY-MM), reduced to the two facts
// the Social Monthly Planner needs: which reporter's report for which day is
// signed off. The planner turns that day's deliverables green — only the head's
// acceptance does it, never a member's own "done". Empty until the review
// columns (185) exist.
export const listAcceptedForMonth = async (panel, month) => {
  if (!(await reviewEnabled())) return [];
  const { data, error } = await db
    .from('daily_reports')
    .select('reporter_id, report_date')
    .eq('panel', panel)
    .eq('review_status', 'accepted')
    .gte('report_date', `${month}-01`)
    .lte('report_date', `${month}-31`)
    .order('report_date', { ascending: true });
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

  // A fresh save re-opens the review: an edit (e.g. after a rejection) must be
  // seen again, so the previous accept/reject never stands against newer
  // content. The reporter's own panel does not send these columns, so this is
  // the one place the decision is cleared. Skipped until the migration adds the
  // columns, so an un-migrated install keeps saving reports untouched.
  if (await reviewEnabled()) {
    edits.review_status = 'pending';
    edits.reviewed_by = null;
    edits.reviewed_at = null;
    // The reviewer's query is about the content being replaced, so it is spent
    // by the same save.
    if (await reviewNoteEnabled()) edits.review_note = null;
  }

  const sel = await selectCols();

  const { data: updated, error: updateError } = await db
    .from('daily_reports')
    .update(edits)
    .eq('panel', panel)
    .eq('report_date', report_date)
    .eq('reporter_name', reporter_name)
    .select(sel);
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
    .select(sel)
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
      .select(sel);
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
    .select(await selectCols());
  if (error) throw error;
  return data && data.length ? data[0] : null;
};

// A rejected report comes back for review when the reporter marks the rework
// task done (task_assignments.status = 'done'), which the task controller maps
// to this. Only a currently-'rejected' row is touched, so an accepted report is
// never dragged back into the queue; the reviewer's spent query is cleared like
// a fresh save does. Returns the re-opened rows (empty when nothing matched).
export const reopenReviewForReporter = async (panel, report_date, reporter_id) => {
  if (!reporter_id) return [];
  if (!(await reviewEnabled())) return [];
  const edits = {
    review_status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
  };
  if (await reviewNoteEnabled()) edits.review_note = null;
  const { data, error } = await db
    .from('daily_reports')
    .update(edits)
    .eq('panel', panel)
    .eq('report_date', report_date)
    .eq('reporter_id', String(reporter_id))
    .eq('review_status', 'rejected')
    .select(await selectCols());
  if (error) throw error;
  return data || [];
};

// Marking an assigned task done is fresh work the head has to see, so it puts
// the reporter's report for that day back in front of her. Unlike
// reopenReviewForReporter (which only revives a REJECTED row), this re-opens any
// decided row by moving it to 'pending'. And when the member never saved a report
// for that day it CREATES one — with empty data — so the completion still reaches
// the Approvals list, where the assigned tasks are shown read-only alongside it.
// Returns the touched row(s); empty when the review columns (185) are missing.
export const openReviewForReporter = async (panel, report_date, reporter_id, reporter_name) => {
  if (!report_date || !reporter_id) return [];
  if (!(await reviewEnabled())) return [];
  const edits = {
    review_status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
  };
  if (await reviewNoteEnabled()) edits.review_note = null;

  const { data: updated, error: updateError } = await db
    .from('daily_reports')
    .update(edits)
    .eq('panel', panel)
    .eq('report_date', report_date)
    .eq('reporter_id', String(reporter_id))
    .select(await selectCols());
  if (updateError) throw updateError;
  if (updated && updated.length) return updated;

  // Nothing to re-open and no name to file under — nothing to do.
  if (!reporter_name) return [];

  const { data: inserted, error: insertError } = await db
    .from('daily_reports')
    .insert({
      ...edits,
      panel,
      department: panel,
      report_date,
      reporter_id: String(reporter_id),
      reporter_name,
      data: {},
    })
    .select(await selectCols())
    .single();
  if (insertError) {
    // A concurrent save, or an older row keyed by name only — fall back to a
    // name-scoped re-open rather than failing the task update the member awaits.
    const { data: raced } = await db
      .from('daily_reports')
      .update(edits)
      .eq('panel', panel)
      .eq('report_date', report_date)
      .eq('reporter_name', reporter_name)
      .select(await selectCols());
    return raced || [];
  }
  return inserted ? [inserted] : [];
};

// The Social head's accept / reject of one submitted report (marking a report
// back to 'pending' is deliberately not offered here — only the reviewer's
// statuses, and a reporter's own save re-opens the review). `note` is the
// reviewer's optional query / suggestion, kept only when the 186 column exists.
export const setReview = async (id, status, reviewed_by, note) => {
  const edits = {
    review_status: status,
    reviewed_by: reviewed_by || null,
    reviewed_at: new Date().toISOString(),
  };
  if (await reviewNoteEnabled()) {
    const text = note == null ? '' : String(note).trim();
    edits.review_note = text ? text.slice(0, 4000) : null;
  }
  const { data, error } = await db
    .from('daily_reports')
    .update(edits)
    .eq('id', id)
    .select(await selectCols());
  if (error) throw error;
  return data && data.length ? data[0] : null;
};
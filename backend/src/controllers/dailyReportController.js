import db from '../config/db.js';
import { normalizeRole } from '../middleware/authMiddleware.js';
import { istDateString } from '../utils/ist.js';
import {
  getReport,
  getReportById,
  listReportsForDate,
  listAllForDate,
  listAcceptedForMonth,
  upsertReport,
  setRemark,
  setReview,
  reviewEnabled,
} from '../models/dailyReportModel.js';
import {
  PANEL_ROLES,
  isDigitalDept,
  isDigitalIdentity,
  workerDeptPanel,
  withReviewedPanel,
} from '../utils/dailyReportPanels.js';
import {
  REWORK_CONTENT_TYPE,
  createAssignment,
  findOpenReworkTask,
  updateAssignmentFields,
  deleteReworkTasks,
} from '../models/taskAssignmentModel.js';


const PANELS = ['dev', 'hr', 'recruiter', 'social'];

const PANEL_LABELS = {
  dev: 'Developer',
  hr: 'HR',
  recruiter: 'Recruiter',
  social: 'Social Media',
};

// Digital reporters, keyed by name — the input withReviewedPanel needs to place
// a row under the tab it is reviewed in. Identity rather than eligibility:
// inactive or transferred people are included so their past rows stay bucketed
// with the team they belong to today. Pure: takes the already-fetched table
// snapshots so the summary does not re-scan them once per panel.
function digitalReporterNames(workers, users) {
  const names = new Set();
  const add = (name) => {
    const n = String(name || '').trim();
    if (n) names.add(n);
  };
  for (const u of users) {
    if (isDigitalIdentity(normalizeRole(u.role), u.department)) add(u.name);
  }
  for (const w of workers) {
    if (isDigitalDept(w.department)) add(w.name);
  }
  return names;
}

async function loadDigitalReporterNames() {
  const [usersRes, workersRes] = await Promise.all([
    db.from('users').select('name, role, department'),
    db.from('workers').select('name, department'),
  ]);
  // A failed lookup degrades to the old behaviour (the row stays under 'dev')
  // instead of blanking the whole overview, which is what the roster queries
  // would do if they threw here.
  if (usersRes.error) console.error('[daily-reports] digital reporter lookup (users) failed:', usersRes.error.message);
  if (workersRes.error) console.error('[daily-reports] digital reporter lookup (workers) failed:', workersRes.error.message);
  return digitalReporterNames(workersRes.data || [], usersRes.data || []);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value) => {
  const text = String(value ?? '');
  if (!ISO_DATE.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
};

const clampText = (value, max) => (value == null ? '' : String(value).slice(0, max));

// report_date is a DATE column; the driver hands it back as a Date at local
// midnight, which formats to the stored calendar day via the local parts.
const toIsoDay = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MAX_FIELDS_PER_SECTION = 60;
const MAX_CHECKLIST_ITEMS = 200;

// A checklist value is [{ text, done }]; a table row is any flat object (e.g.
// { task, reason, expected } for pending HR tasks, or { position, required,
// interviewed, … } for a vacancy list). Keep the arrays small and the strings
// clamped so a hostile payload cannot bloat the JSONB.
const sanitizeList = (arr) => {
  const out = [];
  for (const item of arr.slice(0, MAX_CHECKLIST_ITEMS)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      if (typeof item.text !== 'undefined') {
        const text = clampText(item.text, 1000).trim();
        if (text) out.push({ text, done: !!item.done });
      } else {
        const row = {};
        for (const [k, v] of Object.entries(item).slice(0, 32)) {
          if (v == null) continue;
          const key = String(k).slice(0, 64);
          if (typeof v === 'string') {
            const value = clampText(v, 1000).trim();
            if (value) row[key] = value;
          } else if (typeof v === 'number' || typeof v === 'boolean') {
            row[key] = v;
          }
        }
        if (Object.keys(row).length > 0) out.push(row);
      }
    } else if (typeof item === 'string') {
      const text = clampText(item, 1000).trim();
      if (text) out.push({ text, done: false });
    }
  }
  return out;
};

// data is reporter free text, so it is clamped rather than trusted: cap the
// number of sections/fields and the length of every string so an accidental or
// hostile payload cannot bloat the JSONB. Numbers/booleans pass through, and
// arrays are only kept as sanitized checklists.
const sanitizeData = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [section, fields] of Object.entries(input).slice(0, MAX_FIELDS_PER_SECTION)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    const clean = {};
    for (const [key, value] of Object.entries(fields).slice(0, MAX_FIELDS_PER_SECTION)) {
      if (value == null) continue;
      const k = String(key).slice(0, 64);
      if (typeof value === 'string') clean[k] = clampText(value, 3000);
      else if (typeof value === 'number' || typeof value === 'boolean') clean[k] = value;
      else if (Array.isArray(value)) clean[k] = sanitizeList(value);
    }
    if (Object.keys(clean).length > 0) out[String(section).slice(0, 64)] = clean;
  }
  return out;
};

// The reporter is the signed-in user. `reporter_name` is the key the saved row
// is looked up by, so letting the client choose it would let one user overwrite
// or impersonate another's day. Department staff sign in from the workers table
// and their JWT already carries `name`; fall back to a users-table lookup for
// email logins, then to email/id so a nameless token still rows up under a
// stable key.
async function resolveReporter(req) {
  const id = req.user?.id;
  const tokenName = req.user?.name ? String(req.user.name).trim() : '';
  if (tokenName) return { id: id ? String(id) : null, name: tokenName };
  if (id) {
    const { data, error } = await db
      .from('users')
      .select('name')
      .eq('id', id)
      .maybeSingle();
    if (!error && data?.name) return { id: String(id), name: String(data.name).trim() };
    if (error) console.error('[daily-reports] reporter name lookup failed:', error.message);
  }
  const fallback = String(req.user?.email || req.user?.id || 'Unknown reporter').trim();
  return { id: id ? String(id) : null, name: fallback };
}

function requirePanel(req, res) {
  const panel = String(req.query.panel || req.body?.panel || '').trim();
  if (!PANELS.includes(panel)) {
    return { error: res.status(400).json({ message: `panel query parameter is required (one of ${PANELS.join(', ')})` }) };
  }
  return { panel };
}

// Employees eligible to file a report for a panel, unioned from the stores that
// can log into it: department workers, users-table roles, and (for HR) the hrs
// table. Pure — works from already-fetched table snapshots so callers loading
// several panels at once do not re-scan each table per panel. Terminated/
// deactivated rows are dropped; deduped by id.
function buildRoster(panel, workers, users, hrs) {
  const roles = PANEL_ROLES[panel] || [];
  const seen = new Map();
  const add = (id, name, role, department) => {
    const key = String(id);
    if (!key || seen.has(key)) return;
    seen.set(key, { id: key, name: String(name || id).trim(), role, department: department || null });
  };

  for (const w of workers || []) {
    if (w.is_active === false || w.employment_status === 'terminated') continue;
    if (workerDeptPanel(w.department) === panel) add(w.id, w.name, panel, w.department);
  }

  for (const u of users || []) {
    if (u.is_active === false) continue;
    const role = normalizeRole(u.role);
    // Same identity rule as digitalReporterNames: a 'digital' department makes
    // someone Social Media's to review whatever their role says, so the roster
    // and the re-bucketed rows can never disagree about their tab.
    if (isDigitalIdentity(role, u.department)) {
      if (panel === 'social') add(u.id, u.name, role, u.department);
      continue;
    }
    if (roles.includes(role)) add(u.id, u.name, role, u.department);
  }

  if (panel === 'hr') {
    for (const h of hrs || []) {
      if (h.is_active === false) continue;
      add(h.id, h.name, 'hr', h.department);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Exported so the task-assignment controller can offer the same Social team
// roster as the assignee picker.
export async function rosterForPanel(panel) {
  const [workersRes, usersRes, hrsRes] = await Promise.all([
    db.from('workers').select('id, name, department, is_active, employment_status'),
    db.from('users').select('id, name, role, department, is_active'),
    panel === 'hr'
      ? db.from('hrs').select('id, name, department, is_active')
      : Promise.resolve({ data: [] }),
  ]);
  if (workersRes.error) throw workersRes.error;
  if (usersRes.error) throw usersRes.error;
  return buildRoster(panel, workersRes.data || [], usersRes.data || [], hrsRes.data || []);
}

export async function saveReport(req, res) {
  const { panel, date, data } = req.body || {};
  if (!panel || !PANELS.includes(panel)) {
    return res.status(400).json({ message: `panel is required (one of ${PANELS.join(', ')})` });
  }
  if (!isIsoDate(date)) {
    return res.status(400).json({ message: 'date is required (YYYY-MM-DD)' });
  }
  try {
    const reporter = await resolveReporter(req);
    // The Social report belongs to the day the member completes it, not to
    // whatever date their page happened to be showing. A tab left open across
    // midnight (or any stale date) used to misfile a report onto the previous
    // day, so the head reviewing "today" never saw it. Stamping the current IST
    // day here makes the review always land on the day the report was done.
    const reportDate = panel === 'social' ? istDateString() : date;
    const report = await upsertReport({
      panel,
      department: panel,
      report_date: reportDate,
      reporter_id: reporter.id,
      reporter_name: reporter.name,
      data: sanitizeData(data),
      created_by: req.user?.id ? String(req.user.id) : null,
    });
    return res.json({ success: true, report });
  } catch (error) {
    console.error('[daily-reports] save failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

export async function getMyReport(req, res) {
  const panel = requirePanel(req, res);
  if (panel.error) return panel.error;
  const date = req.query.date;
  if (!isIsoDate(date)) {
    return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
  }
  try {
    const reporter = await resolveReporter(req);
    const report = await getReport(panel.panel, date, reporter.name);
    return res.json({ date, panel: panel.panel, reporter_name: reporter.name, report });
  } catch (error) {
    console.error('[daily-reports] fetch own report failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

export async function getReports(req, res) {
  const panel = requirePanel(req, res);
  if (panel.error) return panel.error;
  const date = req.query.date;
  if (!isIsoDate(date)) {
    return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
  }
  const reporter_id = req.query.reporter_id ? String(req.query.reporter_id) : null;
  try {
    const reports = await listReportsForDate(panel.panel, date, reporter_id);
    return res.json({ date, panel: panel.panel, reports });
  } catch (error) {
    console.error('[daily-reports] fetch failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// Which of a panel's reports for a month are accepted — the Social Monthly
// Planner reads this to paint a reporter's day green, so the marker tracks the
// head's acceptance and not a member's own "done". Reduced to the (reporter, day)
// keys the planner matches against its assignments.
export async function getReviewedReports(req, res) {
  const panel = requirePanel(req, res);
  if (panel.error) return panel.error;
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: 'month query parameter is required (YYYY-MM)' });
  }
  try {
    const rows = await listAcceptedForMonth(panel.panel, month);
    const accepted = rows.map((r) => ({ reporter_id: r.reporter_id, report_date: toIsoDay(r.report_date) }));
    return res.json({ panel: panel.panel, month, accepted });
  } catch (error) {
    console.error('[daily-reports] reviewed list failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// All departments for a date — drives the HOD / super-admin overview.
// Optional ?panel= / ?department= / ?reporter_id= narrow the rows.
export async function getAllReports(req, res) {
  const date = req.query.date;
  if (!isIsoDate(date)) {
    return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
  }
  const panel = req.query.panel && PANELS.includes(String(req.query.panel)) ? String(req.query.panel) : null;
  const department = req.query.department && PANELS.includes(String(req.query.department)) ? String(req.query.department) : null;
  const reporter_id = req.query.reporter_id ? String(req.query.reporter_id) : null;
  try {
    // Filtering happens after the re-bucketing below, because a digital row is
    // stored under 'dev' but reviewed under 'social' — a panel/department
    // filter has to see the reviewed value. One date holds a handful of rows,
    // so this runs in memory rather than in SQL.
    const [rows, digital] = await Promise.all([
      listAllForDate(date, { reporter_id }),
      loadDigitalReporterNames(),
    ]);
    const reports = rows
      .map((r) => withReviewedPanel(r, digital))
      .filter((r) => (!panel || r.panel === panel) && (!department || r.department === department));
    return res.json({ date, reports });
  } catch (error) {
    console.error('[daily-reports] fetch all failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// Submitted vs pending per department for a date — the roster (from users) minus
// the reporters who have a row that day. `?panel=` narrows to one department.
export async function getSummary(req, res) {
  const date = req.query.date;
  if (!isIsoDate(date)) {
    return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
  }
  const panelFilter = req.query.panel && PANELS.includes(String(req.query.panel)) ? String(req.query.panel) : null;
  try {
    const panels = panelFilter ? [panelFilter] : PANELS;
    // One round-trip per source table, not one per panel. The old code scanned
    // workers + users (+ hrs) for every panel and again for the digital names —
    // ~11 queries for the whole page — and each query costs seconds on the slow
    // DB link, which is what made the overview appear to hang. Fetch each table
    // once and derive every panel's roster in memory.
    const [rows, workersRes, usersRes, hrsRes] = await Promise.all([
      listAllForDate(date, {}),
      db.from('workers').select('id, name, department, is_active, employment_status'),
      db.from('users').select('id, name, role, department, is_active'),
      db.from('hrs').select('id, name, department, is_active'),
    ]);
    if (workersRes.error) throw workersRes.error;
    if (usersRes.error) throw usersRes.error;
    const digital = digitalReporterNames(workersRes.data || [], usersRes.data || []);
    const byPanel = rows.reduce((acc, r) => {
      const reviewed = withReviewedPanel(r, digital);
      (acc[reviewed.panel] ||= []).push(reviewed);
      return acc;
    }, {});

    const rosters = {};
    for (const panel of panels) {
      rosters[panel] = buildRoster(panel, workersRes.data || [], usersRes.data || [], hrsRes.data || []);
    }

    const departments = [];
    for (const panel of panels) {
      const roster = rosters[panel];
      const reports = byPanel[panel] || [];
      const submittedIds = new Set(reports.map((r) => String(r.reporter_id || '')));
      const submitted = reports.map((r) => ({
        id: r.id,
        reporter_id: r.reporter_id || null,
        name: r.reporter_name,
        remark: r.remark || null,
      }));
      const pending = roster.filter((emp) => !submittedIds.has(emp.id));
      departments.push({
        panel,
        label: PANEL_LABELS[panel] || panel,
        submitted,
        pending,
      });
    }
    return res.json({ date, departments });
  } catch (error) {
    console.error('[daily-reports] summary failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// The eligible-employee list for one department, so the dashboard can offer an
// employee filter even before anyone has reported.
export async function getRoster(req, res) {
  const panel = requirePanel(req, res);
  if (panel.error) return panel.error;
  try {
    const employees = await rosterForPanel(panel.panel);
    return res.json({ panel: panel.panel, employees });
  } catch (error) {
    console.error('[daily-reports] roster failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// HOD review of a single report.
export async function setReportRemark(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'report id is required' });
  const remark = clampText(req.body?.remark, 4000).trim();
  try {
    const existing = await getReportById(id);
    if (!existing) return res.status(404).json({ message: 'Report not found' });
    const report = await setRemark(id, remark, req.user?.name || req.user?.email || 'HOD');
    return res.json({ success: true, report });
  } catch (error) {
    console.error('[daily-reports] remark failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// A rejected report raises a pending task on the reporter's board carrying the
// reviewer's query/suggestion, so the member sees "fix this" next to the plan.
// Re-rejecting before the fix updates the same task instead of stacking copies;
// accepting clears it. All of this is best-effort: a failure here must not fail
// the review the head is waiting on, and the task table (184) may be absent.
async function syncReworkTask(existing, status, note, reviewer) {
  const assigneeId = existing.reporter_id != null ? String(existing.reporter_id) : '';
  const reportDay = toIsoDay(existing.report_date);
  if (!assigneeId || !reportDay) return;
  const description = String(note || '').trim()
    || 'Your daily report was rejected. Please review and resubmit.';
  try {
    if (status === 'accepted') {
      await deleteReworkTasks('social', assigneeId, reportDay, REWORK_CONTENT_TYPE);
      return;
    }
    const fields = {
      title: 'Rework: Daily Social Media Report',
      description: description.slice(0, 3000),
      status: 'pending',
    };
    const open = await findOpenReworkTask('social', assigneeId, reportDay, REWORK_CONTENT_TYPE);
    if (open) {
      await updateAssignmentFields(open.id, fields);
      return;
    }
    await createAssignment({
      panel: 'social',
      task_date: reportDay,
      title: fields.title,
      description: fields.description,
      content_type: REWORK_CONTENT_TYPE,
      assignee_id: assigneeId,
      assignee_name: existing.reporter_name,
      assigned_by_id: reviewer?.id != null ? String(reviewer.id) : null,
      assigned_by_name: reviewer?.name ? String(reviewer.name).trim() : (reviewer?.email || null),
      status: 'pending',
    });
  } catch (error) {
    console.error('[daily-reports] rework task sync failed:', error.message);
  }
}

// Accept / reject review of one report — the Social head's call. The route
// middleware gates who may call it; this only validates the payload.
export async function setReportReview(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'report id is required' });
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'status must be accepted or rejected' });
  }
  const note = clampText(req.body?.note, 4000).trim();
  try {
    // The review columns come from the 185 migration, which is hand-applied. If
    // it has not landed yet, fail loudly instead of writing to a missing column
    // and surfacing a raw SQL error to the reviewer.
    if (!(await reviewEnabled())) {
      return res.status(503).json({ message: 'Report review is not enabled yet (migration 185 not applied).' });
    }
    const existing = await getReportById(id);
    if (!existing) return res.status(404).json({ message: 'Report not found' });
    const report = await setReview(id, status, req.user?.name || req.user?.email || 'Reviewer', note);
    await syncReworkTask(existing, status, note, req.user);
    return res.json({ success: true, report });
  } catch (error) {
    console.error('[daily-reports] review failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

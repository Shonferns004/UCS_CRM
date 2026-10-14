import {
  createAssignment,
  listAssignments,
  getAssignmentById,
  deleteAssignment,
  updateAssignmentStatus,
  deleteReworkTasks,
  REWORK_CONTENT_TYPE,
} from '../models/taskAssignmentModel.js';
import { reopenReviewForReporter, openReviewForReporter } from '../models/dailyReportModel.js';
import { istDateString } from '../utils/ist.js';
import { rosterForPanel } from './dailyReportController.js';
import { isTaskHead } from '../utils/taskAssignmentAccess.js';

// Task assignments, the data side. A Social Media manager assigns a task to one
// member of the Social team for a date; the member sees it read-only in their
// Daily Report and still keeps their own task list. Only the Social panel is
// wired, so `panel` is fixed here rather than trusted from the client.
const PANEL = 'social';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value) => {
  const text = String(value ?? '');
  if (!ISO_DATE.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
};

const clampText = (value, max) => (value == null ? '' : String(value).slice(0, max).trim());

// Indicates to the frontend whether the signed-in user may assign tasks, so the
// Monthly Planner can show the assign UI only for the head.
export async function getAccess(req, res) {
  return res.json({ panel: PANEL, can_assign: isTaskHead(req.user) });
}

// The assignee picker: the same eligible Social team the daily-report roster
// uses, so a task can only ever be handed to someone the HOD already reviews.
export async function getAssignees(req, res) {
  try {
    const employees = await rosterForPanel(PANEL);
    return res.json({ panel: PANEL, employees });
  } catch (error) {
    console.error('[task-assignments] assignees failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// GET /?date=YYYY-MM-DD or ?month=YYYY-MM — the assignments in scope, split for
// the caller into the tasks handed to them and the tasks they handed out. The
// raw list (which the Monthly Planner maps each row's programme to its assignee)
// is returned only to the head; other team members should never see who else is
// assigned what.
export async function listMyAssignments(req, res) {
  const date = req.query.date ? String(req.query.date) : null;
  const month = req.query.month ? String(req.query.month) : null;
  if (date && !isIsoDate(date)) {
    return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
  }
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: 'month must be YYYY-MM' });
  }
  try {
    const rows = await listAssignments(PANEL, { date, month });
    const me = req.user?.id != null ? String(req.user.id) : '';
    const assigned_to_me = rows.filter((r) => String(r.assignee_id) === me);
    const created_by_me = rows.filter((r) => String(r.assigned_by_id) === me);
    const body = { panel: PANEL, date, month, assigned_to_me, created_by_me };
    // The raw list (the planner maps each row's programme to its assignee, and
    // the Super-Admin overview shows every assignment with its status) is only
    // returned to the head and admins; other members never see who else is
    // assigned what.
    const role = String(req.user?.role || '');
    if (isTaskHead(req.user) || ['super_admin', 'admin'].includes(role)) body.assignments = rows;
    return res.json(body);
  } catch (error) {
    console.error('[task-assignments] list failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// POST — assign a task. The member must be on the Social roster; the assigner is
// the signed-in user, never the client.
export async function addAssignment(req, res) {
  const title = clampText(req.body?.title, 500);
  const description = clampText(req.body?.description, 3000);
  const content_type = clampText(req.body?.content_type, 60);
  const task_date = clampText(req.body?.task_date, 10);
  const assignee_id = clampText(req.body?.assignee_id, 64);
  const assignee_name = clampText(req.body?.assignee_name, 200);

  if (!title) return res.status(400).json({ message: 'Task title is required' });
  if (!isIsoDate(task_date)) return res.status(400).json({ message: 'task_date is required (YYYY-MM-DD)' });
  if (!assignee_id || !assignee_name) {
    return res.status(400).json({ message: 'Choose a team member to assign the task to' });
  }

  try {
    const roster = await rosterForPanel(PANEL);
    if (!roster.some((emp) => String(emp.id) === assignee_id)) {
      return res.status(400).json({ message: 'That member is not on the Social team.' });
    }
    const assignment = await createAssignment({
      panel: PANEL,
      task_date,
      title,
      description: description || null,
      content_type: content_type || null,
      assignee_id,
      assignee_name,
      assigned_by_id: req.user?.id != null ? String(req.user.id) : null,
      assigned_by_name: req.user?.name ? String(req.user.name).trim() : (req.user?.email || null),
    });
    return res.status(201).json({ success: true, assignment });
  } catch (error) {
    console.error('[task-assignments] create failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// DELETE /:id — only the person who assigned it (or an admin) may remove it, so
// an assignee cannot clear a task set for them.
export async function removeAssignment(req, res) {
  try {
    const existing = await getAssignmentById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Assignment not found' });
    const me = req.user?.id != null ? String(req.user.id) : '';
    const role = String(req.user?.role || '');
    const privileged = ['super_admin', 'admin'].includes(role);
    if (!privileged && String(existing.assigned_by_id) !== me) {
      return res.status(403).json({ message: 'You can only remove a task you assigned' });
    }
    await deleteAssignment(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error('[task-assignments] delete failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

// PATCH /:id/status — the assignee (or the head/admin) can move a task from
// pending to wip or done.
export async function updateAssignment(req, res) {
  const status = String(req.body?.status || '').trim().toLowerCase();
  const allowed = ['pending', 'wip', 'done'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: 'status must be pending, wip or done' });
  }
  try {
    const existing = await getAssignmentById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Assignment not found' });
    const me = req.user?.id != null ? String(req.user.id) : '';
    const role = String(req.user?.role || '');
    const privileged = ['super_admin', 'admin'].includes(role);
    const isAssignee = String(existing.assignee_id) === me;
    const isHead = isTaskHead(req.user);
    if (!privileged && !isAssignee && !isHead) {
      return res.status(403).json({ message: 'Only the assignee or the head can update this task.' });
    }
    const assignment = await updateAssignmentStatus(req.params.id, status, status === 'done' ? istDateString() : null);
    // Marking a Daily Report rework task done is how a rejected report comes
    // back: re-open the review so it reappears in the head's queue with accept /
    // reject. Best-effort — a failed reopen must not fail the status change the
    // member is waiting on.
    if (status === 'done' && existing.content_type === REWORK_CONTENT_TYPE) {
      try {
        const day = String(existing.task_date || '').slice(0, 10);
        const reopened = await reopenReviewForReporter(existing.panel, day, existing.assignee_id);
        // The task is spent once the report is back with the reviewer, so clear
        // it instead of leaving a Done card — a later rejection raises a fresh
        // one. Only when the review actually re-opened, so a report that could
        // not be reopened keeps its task.
        if (reopened.length) {
          await deleteReworkTasks(existing.panel, existing.assignee_id, day, REWORK_CONTENT_TYPE);
        }
      } catch (err) {
        console.error('[task-assignments] reopen review failed:', err.message);
      }
    } else if (status === 'done') {
      // A completed assigned task is work the head must see, so the reporter's
      // report goes back to the front of the review queue (or is opened there for
      // the first time) and shows in Report Approvals with the assigned tasks.
      // The day is the CURRENT IST day, not the task's planned date: the member
      // does the work on the day the head is reviewing, so a programme done early
      // (or late) still lands on today's report. Best-effort: a failure here must
      // not fail the status change the member is waiting on.
      try {
        const day = istDateString();
        await openReviewForReporter(existing.panel, day, existing.assignee_id, existing.assignee_name);
      } catch (err) {
        console.error('[task-assignments] open review failed:', err.message);
      }
    }
    return res.json({ success: true, assignment });
  } catch (error) {
    console.error('[task-assignments] update failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
}

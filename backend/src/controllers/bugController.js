import {
  insertBug, selectBugs, selectBugById, updateBug, deleteBug,
  insertBugHistory, selectBugHistory,
  BUG_STATUSES, BUG_SEVERITIES, BUG_TYPES,
} from '../models/bugModel.js';
import { getBugAssignableMembers } from '../models/developerTicketModel.js';
import db from '../config/db.js';
import { getSenderPanel, getSenderName } from '../utils/panel.js';
import { istDateString } from '../utils/ist.js';

// Resolve a worker's display name for an assignee id, so the board card reads a
// name without the client having to join anything.
const lookupWorkerName = async (id) => {
  if (!id) return null;
  try {
    const { data } = await db.from('workers').select('name, login_id').eq('id', id).maybeSingle();
    if (data) return data.name || data.login_id || null;
  } catch { /* fall through to users */ }
  try {
    const { data } = await db.from('users').select('name, email').eq('id', id).maybeSingle();
    if (data) return data.name || data.email || null;
  } catch { /* ignore */ }
  return null;
};

// A bug is visible to a non-admin if it is unassigned (pending), assigned to
// them, or reported by them. The super admin sees every bug.
const BUG_SEE_ALL_ROLES = ['super_admin'];
const bugVisibleTo = (bug, user) => {
  const role = String(user?.role || '').toLowerCase();
  if (BUG_SEE_ALL_ROLES.includes(role)) return true;
  const me = user?.id != null ? String(user.id) : '';
  if (!me) return true;
  if (!bug.assigned_to) return true;
  if (String(bug.assigned_to) === me) return true;
  if (String(bug.reported_by_id) === me) return true;
  return false;
};

// Normalize the legacy 'fixed' label onto the current lifecycle value.
const normalizeStatus = (s) => {
  if (s === 'fixed') return 'ready_for_test';
  return s;
};

const actorOf = (user) => ({
  actor_id: user?.id != null ? String(user.id) : null,
  actor_name: getSenderName(user) || user?.login_id || null,
});

// Build a history entry for one field change (only when it actually changed).
const historyEntry = (bugId, field, from, to, user, note = null) => {
  if (String(from ?? '') === String(to ?? '')) return null;
  return {
    bug_id: bugId,
    field,
    from_value: from == null ? null : String(from),
    to_value: to == null ? null : String(to),
    note,
    ...actorOf(user),
  };
};

export const listBugs = async (req, res) => {
  try {
    const { status, severity, module, assigned_to, reported_by, search, type } = req.query;
    const data = await selectBugs({ status, severity, module, assigned_to, reported_by, search, type });
    return res.json(data.filter(b => bugVisibleTo(b, req.user)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getStats = async (req, res) => {
  try {
    const all = await selectBugs({});
    const scoped = all.filter(b => bugVisibleTo(b, req.user));
    const stats = {
      total: scoped.length,
      reported: 0, in_progress: 0, ready_for_test: 0, closed: 0, reopened: 0,
      by_severity: { low: 0, medium: 0, high: 0, critical: 0 },
    };
    scoped.forEach(b => {
      const st = normalizeStatus(b.status);
      if (stats[st] !== undefined) stats[st] += 1;
      if (stats.by_severity[b.severity] !== undefined) stats.by_severity[b.severity] += 1;
    });
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Batched display-name lookup for the id-only actor columns (fixed_by_id,
// closed_by_id — only the reporter's name is denormalised onto the row). Two
// queries for the whole feed instead of one per bug.
const resolveActorNames = async (ids) => {
  const map = new Map();
  const list = [...new Set(ids.filter(Boolean))];
  if (list.length === 0) return map;
  try {
    const { data } = await db.from('workers').select('id, name, login_id').in('id', list);
    for (const w of data || []) {
      const name = w.name || w.login_id;
      if (name) map.set(String(w.id), name);
    }
  } catch { /* workers table may be absent — fall through to users */ }
  const missing = list.filter((id) => !map.has(String(id)));
  if (missing.length) {
    try {
      const { data } = await db.from('users').select('id, name, email').in('id', missing);
      for (const u of data || []) {
        const name = u.name || u.email;
        if (name) map.set(String(u.id), name);
      }
    } catch { /* ignore: the entry falls back to 'Unknown' */ }
  }
  return map;
};

// ── Report feed ────────────────────────────────────────────────────────
// One entry per bug EVENT inside [from, to] — reported (someone found it),
// fixed (the dev handed it to test) and verified (the tester closed it). This
// is what makes QA work count as work: a developer like Omkar, whose days are
// spent filing bugs, shows activity on the daily/monthly report without typing
// a word into the prose.
//
// The date range is applied to each event's own timestamp, not the bug's
// created_at: a bug found last month and verified this month credits both
// months on the right day. Days are IST calendar days (see utils/ist.js) so
// they agree with the daily_reports rows they sit next to.
//
// Visibility: super_admin/admin see every event; anyone else only sees the
// events they personally performed, so a dev panel can show "my bug work"
// without leaking who else reported what.
export const getActivity = async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) {
    return res.status(400).json({ message: 'from and to are required (YYYY-MM-DD)' });
  }
  if (to < from) return res.status(400).json({ message: 'to must not be before from' });
  try {
    const bugs = await selectBugs({});
    const role = String(req.user?.role || '').toLowerCase();
    const seesAll = role === 'super_admin' || role === 'admin';
    const me = req.user?.id != null ? String(req.user.id) : '';

    const nameIds = [];
    for (const b of bugs) {
      if (b.fixed_at && b.fixed_by_id) nameIds.push(String(b.fixed_by_id));
      if (b.closed_at && b.closed_by_id) nameIds.push(String(b.closed_by_id));
    }
    const names = await resolveActorNames(nameIds);

    const activity = [];
    const push = (bug, kind, at, personId, personName) => {
      if (!at) return;
      const day = istDateString(new Date(at));
      if (day < from || day > to) return;
      const pid = personId != null && personId !== '' ? String(personId) : '';
      const name = (pid && names.get(pid)) || personName || null;
      if (!pid && !name) return;                 // nothing to credit
      if (!seesAll && pid !== me) return;        // others' work stays private
      activity.push({
        id: `${bug.id}:${kind}`,
        bug_id: bug.id,
        kind,                                     // reported | fixed | verified
        day,                                      // IST calendar day
        at,
        person_id: pid || null,
        person_name: name,
        title: bug.title,
        module: bug.module,
        type: bug.type,
        severity: bug.severity,
        status: bug.status,
      });
    };

    for (const b of bugs) {
      push(b, 'reported', b.created_at, b.reported_by_id, b.reported_by_name);
      push(b, 'fixed', b.fixed_at, b.fixed_by_id, null);
      push(b, 'verified', b.closed_at, b.closed_by_id, null);
    }
    activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return res.json({ from, to, activity });
  } catch (error) {
    console.error('[bugs] activity feed failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const getBug = async (req, res) => {
  try {
    const bug = await selectBugById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    return res.json(bug);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const createBug = async (req, res) => {
  try {
    const {
      title, description, steps, expected_result, actual_result,
      module, type, severity, environment, screenshot_url,
      assigned_to,
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const assignedId = assigned_to ? String(assigned_to) : null;

    const data = await insertBug({
      title: String(title).trim(),
      description: description || null,
      steps: steps || null,
      expected_result: expected_result || null,
      actual_result: actual_result || null,
      module: module || null,
      type: BUG_TYPES.includes(type) ? type : 'bug',
      severity: BUG_SEVERITIES.includes(severity) ? severity : 'medium',
      status: 'reported',
      environment: environment || null,
      screenshot_url: screenshot_url || null,
      assigned_to: assignedId,
      assigned_name: assignedId ? await lookupWorkerName(assignedId) : null,
      reported_by_id: req.user?.id != null ? String(req.user.id) : null,
      reported_by_name: getSenderName(req.user) || req.user?.login_id || null,
      reported_by_panel: getSenderPanel(req.user),
    });

    // Seed the timeline: creation, and the initial assignee if one was set.
    const seed = [historyEntry(data.id, 'status', null, 'reported', req.user, 'Bug reported')];
    if (data.assigned_to) {
      seed.push(historyEntry(data.id, 'assignee', null, data.assigned_name || data.assigned_to, req.user, 'Assigned on creation'));
    }
    await insertBugHistory(seed.filter(Boolean)).catch(() => {});

    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editBug = async (req, res) => {
  try {
    const existing = await selectBugById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Bug not found' });

    const {
      title, description, steps, expected_result, actual_result,
      module, type, severity, environment, screenshot_url, resolution,
      status, assigned_to,
    } = req.body;

    const updates = {};
    const history = [];
    const now = new Date().toISOString();
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = description || null;
    if (steps !== undefined) updates.steps = steps || null;
    if (expected_result !== undefined) updates.expected_result = expected_result || null;
    if (actual_result !== undefined) updates.actual_result = actual_result || null;
    if (module !== undefined) updates.module = module || null;
    if (type !== undefined && BUG_TYPES.includes(type)) {
      updates.type = type;
      history.push(historyEntry(existing.id, 'type', existing.type, type, req.user));
    }
    if (severity !== undefined && BUG_SEVERITIES.includes(severity)) updates.severity = severity;
    if (environment !== undefined) updates.environment = environment || null;
    if (screenshot_url !== undefined) updates.screenshot_url = screenshot_url || null;
    if (resolution !== undefined) updates.resolution = resolution || null;

    // ── Lifecycle transition ──
    // reported -> in_progress -> ready_for_test -> closed | reopened
    if (status !== undefined) {
      const next = normalizeStatus(status);
      if (BUG_STATUSES.includes(next) && next !== normalizeStatus(existing.status)) {
        updates.status = next;
        history.push(historyEntry(existing.id, 'status', normalizeStatus(existing.status), next, req.user));

        if (next === 'ready_for_test') {
          // Developer is done: stamp it and hand the bug back to the reporter/tester.
          updates.fixed_at = now;
          updates.fixed_by_id = req.user?.id != null ? String(req.user.id) : null;
          updates.ready_for_test_at = now;
          updates.ready_for_test_by_id = updates.fixed_by_id;
          if (existing.reported_by_id && String(existing.reported_by_id) !== String(existing.assigned_to || '')) {
            updates.assigned_to = existing.reported_by_id;
            updates.assigned_name = existing.reported_by_name || null;
            history.push(historyEntry(existing.id, 'assignee', existing.assigned_name, updates.assigned_name, req.user, 'Sent back to tester'));
          }
        } else if (next === 'closed') {
          // Tester verified the fix.
          updates.closed_at = now;
          updates.closed_by_id = req.user?.id != null ? String(req.user.id) : null;
          updates.reopened_at = null;
        } else if (next === 'reopened') {
          // Tester rejected: send it back to the developer who fixed it.
          updates.reopened_at = now;
          updates.reopen_count = Number(existing.reopen_count || 0) + 1;
          updates.closed_at = null;
          updates.closed_by_id = null;
          updates.fixed_at = null;
          updates.fixed_by_id = null;
          const devId = existing.fixed_by_id || existing.ready_for_test_by_id;
          if (devId && String(devId) !== String(existing.assigned_to || '')) {
            const devName = await lookupWorkerName(devId);
            updates.assigned_to = String(devId);
            updates.assigned_name = devName;
            history.push(historyEntry(existing.id, 'assignee', existing.assigned_name, devName, req.user, 'Reassigned to developer'));
          }
        } else if (next === 'in_progress') {
          updates.reopened_at = null;
        } else if (next === 'reported') {
          updates.fixed_at = null;
          updates.fixed_by_id = null;
          updates.closed_at = null;
          updates.closed_by_id = null;
        }
      }
    }

    // ── Explicit assignee change ──
    if (assigned_to !== undefined) {
      const nextAssigned = assigned_to || null;
      const nextName = nextAssigned ? await lookupWorkerName(nextAssigned) : null;
      if (String(nextAssigned || '') !== String(existing.assigned_to || '')) {
        updates.assigned_to = nextAssigned;
        updates.assigned_name = nextName;
        history.push(historyEntry(existing.id, 'assignee', existing.assigned_name, nextName, req.user));
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updates provided' });
    }

    const data = await updateBug(req.params.id, updates);
    await insertBugHistory(history.filter(Boolean)).catch(() => {});
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const removeBug = async (req, res) => {
  try {
    const existing = await selectBugById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Bug not found' });
    await deleteBug(req.params.id);
    return res.json({ message: 'Bug deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAssignees = async (req, res) => {
  try {
    const data = await getBugAssignableMembers();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getBugHistory = async (req, res) => {
  try {
    const data = await selectBugHistory(req.params.id);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

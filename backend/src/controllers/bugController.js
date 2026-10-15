import {
  insertBug, selectBugs, selectBugById, updateBug, deleteBug,
  BUG_STATUSES, BUG_SEVERITIES,
} from '../models/bugModel.js';
import { getBugAssignableMembers } from '../models/developerTicketModel.js';
import db from '../config/db.js';
import { getSenderPanel, getSenderName } from '../utils/panel.js';

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

export const listBugs = async (req, res) => {
  try {
    const { status, severity, module, assigned_to, reported_by, search } = req.query;
    const data = await selectBugs({ status, severity, module, assigned_to, reported_by, search });
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
      reported: 0, in_progress: 0, fixed: 0,
      by_severity: { low: 0, medium: 0, high: 0, critical: 0 },
    };
    scoped.forEach(b => {
      if (stats[b.status] !== undefined) stats[b.status] += 1;
      if (stats.by_severity[b.severity] !== undefined) stats.by_severity[b.severity] += 1;
    });
    return res.json(stats);
  } catch (error) {
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
      module, severity, environment, screenshot_url, assigned_to,
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
      module, severity, environment, screenshot_url, resolution,
      status, assigned_to,
    } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = description || null;
    if (steps !== undefined) updates.steps = steps || null;
    if (expected_result !== undefined) updates.expected_result = expected_result || null;
    if (actual_result !== undefined) updates.actual_result = actual_result || null;
    if (module !== undefined) updates.module = module || null;
    if (severity !== undefined && BUG_SEVERITIES.includes(severity)) updates.severity = severity;
    if (environment !== undefined) updates.environment = environment || null;
    if (screenshot_url !== undefined) updates.screenshot_url = screenshot_url || null;
    if (resolution !== undefined) updates.resolution = resolution || null;

    if (status !== undefined && BUG_STATUSES.includes(status)) {
      updates.status = status;
      if (status === 'fixed') {
        updates.fixed_at = new Date().toISOString();
        updates.fixed_by_id = req.user?.id != null ? String(req.user.id) : null;
      } else {
        // Re-opened / moved back: it is no longer fixed.
        updates.fixed_at = null;
        updates.fixed_by_id = null;
      }
    }

    if (assigned_to !== undefined) {
      updates.assigned_to = assigned_to || null;
      updates.assigned_name = assigned_to ? await lookupWorkerName(assigned_to) : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updates provided' });
    }

    const data = await updateBug(req.params.id, updates);
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

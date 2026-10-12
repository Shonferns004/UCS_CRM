import { api } from './auth'

// Social Media task assignments (backend/routes/taskAssignmentRoutes.js).
// A Social manager assigns a task to a Social team member for a date; the member
// reads it back in their Daily Report. Same `_prefix: 'ucs'` convention as the
// other daily-report wrappers.
const call = (path, opts) => api(path, { _prefix: 'ucs', ...opts })

// Whether the signed-in user may assign tasks (the Social head only). The
// Monthly Planner gates every assign UI behind this flag.
export const fetchTaskAssignAccess = () => call('/task-assignments/access')

// The Social team roster, for the assignee picker.
export const fetchTaskAssignees = () => call('/task-assignments/assignees')

// One day's assignments, split into { assigned_to_me, created_by_me }.
export const fetchTaskAssignments = (date) =>
  call(`/task-assignments${date ? `?date=${encodeURIComponent(date)}` : ''}`)

// A whole month's assignments (YYYY-MM). The Monthly Planner maps each planned
// programme back to the member it is assigned to from the raw `assignments`.
export const fetchTaskMonthAssignments = (month) =>
  call(`/task-assignments?month=${encodeURIComponent(month)}`)

export const createTaskAssignment = (payload) =>
  call('/task-assignments', { method: 'POST', body: JSON.stringify(payload) })

// Change the status of an assigned task (assignee or head only on backend).
export const updateTaskAssignment = (id, status) =>
  call(`/task-assignments/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

export const deleteTaskAssignment = (id) =>
  call(`/task-assignments/${encodeURIComponent(id)}`, { method: 'DELETE' })

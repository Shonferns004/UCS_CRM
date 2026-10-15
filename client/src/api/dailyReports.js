import { api } from './auth'

// Shared per-department daily reports (Developer, HR, Recruiter, Social Media).
// Mirrors the HR daily-report wrappers in panels/hr/store.jsx but keyed by `panel`.
const call = (path, opts) => api(path, { _prefix: 'ucs', ...opts })

export const saveDailyReport = (panel, date, data) =>
  call('/daily-reports', { method: 'POST', body: JSON.stringify({ panel, date, data }) })

export const fetchMyDailyReport = (panel, date) =>
  call(`/daily-reports/mine?panel=${encodeURIComponent(panel)}&date=${encodeURIComponent(date)}`)

export const fetchDailyReports = (panel, date) =>
  call(`/daily-reports?panel=${encodeURIComponent(panel)}&date=${encodeURIComponent(date)}`)

// Which reports for a panel were accepted during a month (YYYY-MM). The Social
// Monthly Planner uses this to mark a reporter's day done, so the green tracks
// the head's acceptance rather than the member's own task status.
export const fetchReviewedDailyReports = (panel, month) =>
  call(`/daily-reports/reviewed?panel=${encodeURIComponent(panel)}&month=${encodeURIComponent(month)}`)

// HOD / super-admin overview. All filters are optional.
export const fetchAllDailyReports = (date, panel, reporterId) => {
  const parts = [`date=${encodeURIComponent(date)}`]
  if (panel) parts.push(`panel=${encodeURIComponent(panel)}`)
  if (reporterId) parts.push(`reporter_id=${encodeURIComponent(reporterId)}`)
  return call(`/daily-reports/all?${parts.join('&')}`)
}

// Submitted vs pending per department for a date.
export const fetchDailyReportSummary = (date, panel) =>
  call(`/daily-reports/summary?date=${encodeURIComponent(date)}${panel ? `&panel=${encodeURIComponent(panel)}` : ''}`)

// Eligible employees for one department (for the dashboard's employee filter).
export const fetchDepartmentRoster = (panel) =>
  call(`/daily-reports/roster?panel=${encodeURIComponent(panel)}`)

// Live whole-company attendance snapshot for a date (total / present / absent /
// half-day / late / on leave / new joinings) — the same source the HR report's
// "Attendance today" cards read from.
export const fetchAttendanceSummary = (date) =>
  call(`/hr-reports/attendance-summary?date=${encodeURIComponent(date)}`)

// Live recruitment performance (per-recruiter + company totals) from the leads
// pipeline — the same source the HR panel's Recruiter Overview reads. Super
// admin is allowed on this route. Date optionally scopes numbers to that day.
export const fetchRecruiterPerformance = (date) =>
  call(`/recruiters/overview${date ? `?date=${encodeURIComponent(date)}` : ''}`)

export const saveDailyReportRemark = (id, remark) =>
  call(`/daily-reports/${encodeURIComponent(id)}/remark`, { method: 'PUT', body: JSON.stringify({ remark }) })

// Accept / reject of a submitted daily report — the Social head's review.
// `note` is the optional query / suggestion attached to a rejection.
export const saveDailyReportReview = (id, status, note) =>
  call(`/daily-reports/${encodeURIComponent(id)}/review`, { method: 'PUT', body: JSON.stringify({ status, note }) })

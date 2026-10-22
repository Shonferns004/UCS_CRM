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
//
// `dates` (YYYY-MM-DD list) asks for days outside that month as well: a
// deliverable is finished on the day the work was really done, which for a row
// planned in another month is not in the month on screen.
export const fetchReviewedDailyReports = (panel, month, dates) => {
  const parts = [`panel=${encodeURIComponent(panel)}`, `month=${encodeURIComponent(month)}`]
  if (dates && dates.length) parts.push(`dates=${encodeURIComponent(dates.join(','))}`)
  return call(`/daily-reports/reviewed?${parts.join('&')}`)
}

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

// Month-range rows (YYYY-MM) — the Super Admin monthly developer report. Every
// filter is optional; without one it returns the whole month for all panels.
export const fetchMonthlyDailyReports = (month, panel, reporterId) => {
  const parts = [`month=${encodeURIComponent(month)}`]
  if (panel) parts.push(`panel=${encodeURIComponent(panel)}`)
  if (reporterId) parts.push(`reporter_id=${encodeURIComponent(reporterId)}`)
  return call(`/daily-reports/monthly?${parts.join('&')}`)
}

// The signed-in reporter's own rows for a month (YYYY-MM) — the Developer
// panel's Monthly tab. Server scopes it to the authenticated name.
export const fetchMyMonthlyDailyReports = (panel, month) =>
  call(`/daily-reports/mine/monthly?panel=${encodeURIComponent(panel)}&month=${encodeURIComponent(month)}`)

// Eligible employees for one department (for the dashboard's employee filter).
export const fetchDepartmentRoster = (panel) =>
  call(`/daily-reports/roster?panel=${encodeURIComponent(panel)}`)

// QA bug-tracker events (reported / fixed / verified) for a date range, one
// entry per event with the person who did it. The developer reports count these
// as WORK, so a day spent filing bugs — QA work like Omkar's — still shows
// activity without anyone re-typing it into the prose. Super admin sees every
// event; a signed-in developer only ever gets their own back from the server.
export const fetchBugActivity = (from, to) =>
  call(`/bugs/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)

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

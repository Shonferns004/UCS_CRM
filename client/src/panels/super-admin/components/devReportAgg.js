// Parsing + aggregation of the Developer daily reports (panel = 'dev'), shared
// by the Super-Admin day view (pages/DeveloperDashboard.jsx), the month view
// (pages/DeveloperMonthly.jsx) and the Developer panel's own Monthly tab
// (panels/dev-panel/pages/DevMonthly.jsx) so every reader parses `report.data`
// exactly the same way. Values all live in report.data, so legacy plain-text
// reports still work.

export const asList = (value) => {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return String(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

// The calendar day of a report_date, 'YYYY-MM-DD'. The DATE column comes back
// as a JS Date at server-local midnight (serialised as …T18:30:00Z), so slicing
// the string would read the previous UTC day — take the local parts instead,
// exactly like the backend's toIsoDay(). A bare 'YYYY-MM-DD' passes through.
export const reportDay = (value) => {
  if (value == null || value === '') return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const taskStatusOf = (it) => {
  if (it?.status === 'done' || it?.done) return 'done'
  if (it?.status === 'wip') return 'wip'
  return 'pending'
}

// The checklist of one report, normalised to [{ text, status, reporter }].
export const reportTasks = (r) => {
  const raw = r?.data?.tasks?.tasks
  const items = Array.isArray(raw) ? raw : asList(raw)
  const out = []
  for (const it of items) {
    const text = String(it?.text ?? it ?? '').trim()
    if (!text) continue
    out.push({ text, status: taskStatusOf(it), reporter: r.reporter_name })
  }
  return out
}

// Every report's checklist merged into one task list with a status badge.
// A task text repeated across reports is counted once (matching the day view's
// long-standing rule), so "12 tasks" is 12 distinct entries, not 12 boards.
export const collectTasks = (reports) => {
  const tasks = []
  const counts = { done: 0, wip: 0, pending: 0 }
  const seen = new Set()
  for (const r of reports || []) {
    for (const t of reportTasks(r)) {
      const key = t.text.toLowerCase()
      counts[t.status] += seen.has(key) ? 0 : 1
      if (seen.has(key)) continue
      seen.add(key)
      tasks.push(t)
    }
  }
  return { tasks, counts }
}

// Group a text field by report so each contributor is credited.
// entries: [{ reporter, lines: string[] }]
export const textEntries = (reports, section, field) => {
  const out = []
  for (const r of reports || []) {
    const lines = asList(r?.data?.[section]?.[field])
    if (lines.length) out.push({ reporter: r.reporter_name, lines })
  }
  return out
}

// Per-reporter rollup for the monthly table: days reported, task counts and
// the remark flag, keyed by the reporter's id (falling back to their name for
// rows written before reporter_id existed). Task texts are deduplicated per
// developer so a task carried across five days counts once, not five times.
// `expectedDays` is how many days count (whole month, or up to today).
export const perReporter = (reports, expectedDays) => {
  const map = new Map()
  for (const r of reports || []) {
    const key = String(r.reporter_id || r.reporter_name || '')
    if (!key) continue
    let row = map.get(key)
    if (!row) {
      row = {
        key,
        name: r.reporter_name || 'Unknown',
        reporterId: r.reporter_id || null,
        days: new Set(),
        seenTexts: new Set(),
        counts: { done: 0, wip: 0, pending: 0 },
        remarks: 0,
        reports: [],
      }
      map.set(key, row)
    }
    const day = reportDay(r.report_date)
    if (day) row.days.add(day)
    for (const t of reportTasks(r)) {
      const textKey = `${t.status}:${t.text.toLowerCase()}`
      if (row.seenTexts.has(textKey)) continue
      row.seenTexts.add(textKey)
      row.counts[t.status] += 1
    }
    if (r.remark) row.remarks += 1
    row.reports.push(r)
  }
  const rows = [...map.values()].map((row) => ({
    ...row,
    dayList: [...row.days].sort(),
    daySet: row.days,
    daysReported: row.days.size,
    // Days that count towards the score: the whole month for a past month, or
    // up to today for the month still running — never scored against empty
    // future days.
    expectedDays,
    total: row.counts.done + row.counts.wip + row.counts.pending,
  }))
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

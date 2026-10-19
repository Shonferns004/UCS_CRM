// Aggregation of the QA bug-tracker activity feed (GET /api/bugs/activity) for
// the developer reports — shared by the Super-Admin daily view
// (pages/DeveloperDashboard.jsx), the month view (pages/DeveloperMonthly.jsx)
// and the developer's own report (panels/dev-panel/pages/*), so every surface
// counts bug work identically.
//
// Why this exists: reporting a bug IS work. A developer whose day is spent
// finding and logging issues (QA work) has nothing to type into the prose
// sections of the daily report, and used to read as "did nothing". These counts
// come from the tracker instead — reported (found + filed), fixed (handed to
// test) and verified (tester closed it).

export const KINDS = ['reported', 'fixed', 'verified']
export const KIND_LABELS = { reported: 'Reported', fixed: 'Fixed', verified: 'Verified' }

const emptyCounts = () => ({ reported: 0, fixed: 0, verified: 0 })

const bump = (counts, kind) => { if (KINDS.includes(kind)) counts[kind] += 1 }

export const emptyTotals = () => ({ ...emptyCounts(), total: 0 })

// One row per person across the feed: totals for the whole range plus a
// per-IST-day breakdown (byDay / dayList) so a month view can drill into a
// developer's bug work day by day. Sorted busiest first.
export const bugWorkByPerson = (activity = []) => {
  const map = new Map()
  for (const ev of activity) {
    const key = String(ev.person_id || ev.person_name || 'unknown')
    let row = map.get(key)
    if (!row) {
      row = {
        key,
        name: ev.person_name || 'Unknown',
        personId: ev.person_id || null,
        counts: emptyCounts(),
        total: 0,
        byDay: new Map(),
        dayList: [],
        events: [],
      }
      map.set(key, row)
    }
    // A later event can carry the name the first one lacked (id-only columns).
    if (!row.name || row.name === 'Unknown') row.name = ev.person_name || row.name

    bump(row.counts, ev.kind)
    row.total += 1

    const day = ev.day
    if (day) {
      let dayCounts = row.byDay.get(day)
      if (!dayCounts) {
        dayCounts = emptyTotals()
        row.byDay.set(day, dayCounts)
      }
      bump(dayCounts, ev.kind)
      dayCounts.total += 1
    }
    row.events.push(ev)
  }
  const rows = [...map.values()]
  for (const row of rows) row.dayList = [...row.byDay.keys()].sort()
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  return rows
}

// Column totals for a set of rows — the KPI strip above a bug-work table.
export const totalsOf = (rows = []) => {
  const totals = emptyTotals()
  for (const r of rows) {
    totals.reported += r.counts.reported
    totals.fixed += r.counts.fixed
    totals.verified += r.counts.verified
    totals.total += r.total
  }
  return totals
}

// One person's events on one day, newest first (drill-down list).
export const personDayEvents = (row, day) =>
  !row || !day ? [] : row.events.filter((e) => e.day === day)

// First and last calendar day of a YYYY-MM month, for the ?from=&to= the feed
// takes. Shared by the Super-Admin month load and the dev panel's own month.
export const monthRange = (month) => {
  const y = Number(String(month).slice(0, 4))
  const m = Number(String(month).slice(5, 7))
  const last = new Date(y, m, 0).getDate()
  const pad = (n) => String(n).padStart(2, '0')
  return { from: `${month}-01`, to: `${month}-${pad(last)}` }
}

// Today's bug work, one card per kind — for the report's summary strip.
export const kindCards = (totals) => KINDS.map((kind) => ({
  label: kind === 'reported' ? 'Bugs reported' : kind === 'fixed' ? 'Bugs fixed' : 'Bugs verified',
  value: totals[kind],
}))

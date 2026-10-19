import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import { saveDailyReportRemark } from '../../../api/dailyReports'
import ReportView from '../../../components/DailyReport/ReportView'
import { Block, Kpi, Empty, StatusBar, TableWrap, ProseList, ReporterBar } from '../components/drShared'
import { collectTasks, perReporter, reportDay, textEntries } from '../components/devReportAgg'
import { bugWorkByPerson, totalsOf, personDayEvents, KIND_LABELS } from '../components/bugWorkAgg'

// Super-Admin Daily Reports → Developer tab → Monthly mode. Everything here is
// derived from daily_reports rows for one month (panel = 'dev'), so it agrees
// with the day view line for line: same task parser, same prose grouping.
// The bug tracker feeds its own block: reporting a bug IS work, so a QA-heavy
// developer (someone like Omkar, whose days are spent filing issues) shows
// activity here even with empty prose sections.
//
//   1. Month overview    — reports filed, developers reporting, task totals,
//      plus the month's bug work (reported / fixed / verified) when any.
//   2. Developer scorecard — one row per developer: days reported, Done / WIP /
//      Pending, bug work, remarks. Clicking a row opens its day-wise drill-down.
//   3. Day-wise report   — day chips 1..N for the selected developer; a chip is
//      lit for a filed report OR bug activity, and opens that day's report +
//      the day's bug actions + HOD remark box.
//   4. Bugs & technical blocks — the month's prose, credited per developer/day.

const IST_MS = 5.5 * 60 * 60 * 1000
const dayOf = (ts) => {
  if (!ts) return null
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : new Date(t + IST_MS).toISOString().slice(0, 10)
}
const todayIso = () => dayOf(Date.now())

const daysInMonth = (month) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
const isoOf = (month, day) => `${month}-${String(day).padStart(2, '0')}`

const monthLabel = (month) => {
  const d = new Date(`${month}-01T00:00:00`)
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
const shortDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

// Days that count: a past month is scored over all of it, the running month up
// to today, so nobody is penalised for days that have not happened yet.
const elapsedDays = (month) => {
  const total = daysInMonth(month)
  const today = todayIso()
  if (month > today.slice(0, 7)) return 0
  if (month < today.slice(0, 7)) return total
  return Number(today.slice(8, 10))
}

export default function DeveloperMonthly({ month, reports = [], roster = [], bugActivity = [], onUpdated }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const [day, setDay] = useState(null)
  const [remarkDraft, setRemarkDraft] = useState('')
  const [savingRemark, setSavingRemark] = useState(false)

  const expected = elapsedDays(month)
  const total = daysInMonth(month)
  const today = todayIso()

  // Bug-tracker work for the month, per person. Kept beside the scorecard
  // rather than inside it because the two sources key differently (the feed
  // carries the actor's id/name, reports carry reporter_id/reporter_name) —
  // bugOf() bridges them by id first, name second.
  const bugRows = useMemo(() => bugWorkByPerson(bugActivity), [bugActivity])
  const bugTotals = useMemo(() => totalsOf(bugRows), [bugRows])
  const bugByKey = useMemo(() => {
    const m = new Map()
    for (const b of bugRows) {
      if (b.personId) m.set(`id:${String(b.personId)}`, b)
      m.set(`name:${String(b.name || '').trim().toLowerCase()}`, b)
    }
    return m
  }, [bugRows])
  const bugOf = (row) =>
    (row.reporterId && bugByKey.get(`id:${String(row.reporterId)}`)) ||
    bugByKey.get(`name:${String(row.name || '').trim().toLowerCase()}`) ||
    null

  // Scorecard rows: reporters first, then roster members who never filed, so
  // "0 of 17 days" is visible rather than silently absent.
  const rows = useMemo(() => {
    const byReporter = perReporter(reports, expected)
    const seenNames = new Set(byReporter.map((r) => r.name.trim().toLowerCase()))
    const extra = roster
      .filter((e) => !seenNames.has(String(e.name || '').trim().toLowerCase()))
      .map((e) => ({
        key: `roster-${e.id}`,
        name: e.name,
        reporterId: e.id,
        dayList: [],
        daySet: new Set(),
        daysReported: 0,
        expectedDays: expected,
        counts: { done: 0, wip: 0, pending: 0 },
        remarks: 0,
        total: 0,
        reports: [],
      }))
    return [...byReporter, ...extra].sort((a, b) => b.daysReported - a.daysReported || a.name.localeCompare(b.name))
  }, [reports, roster, expected])

  const selected = rows.find((r) => r.key === selectedKey) || null

  // Team totals for the overview cards. Distinct task texts across the month,
  // same rule as the day view.
  const team = useMemo(() => {
    const { counts } = collectTasks(reports)
    const devs = new Set(reports.map((r) => String(r.reporter_id || r.reporter_name))).size
    const days = new Set(reports.map((r) => reportDay(r.report_date)).filter(Boolean)).size
    return { counts, devs, days, filed: reports.length }
  }, [reports])

  const bugs = useMemo(() => {
    const entries = []
    for (const r of [...reports].sort((a, b) => String(reportDay(a.report_date)).localeCompare(String(reportDay(b.report_date))))) {
      const lines = textEntries([r], 'dev_notes', 'technical_issues')[0]?.lines || []
      if (!lines.length) continue
      const d = reportDay(r.report_date)
      entries.push({ reporter: `${r.reporter_name}${d ? ` · ${shortDay(d)}` : ''}`, lines })
    }
    return entries
  }, [reports])

  const plans = useMemo(() => {
    const entries = []
    for (const r of reports) {
      const lines = textEntries([r], 'nextday', 'nextday')[0]?.lines || []
      if (!lines.length) continue
      const d = reportDay(r.report_date)
      entries.push({ reporter: `${r.reporter_name}${d ? ` · ${shortDay(d)}` : ''}`, lines })
    }
    return entries
  }, [reports])

  const openReport = useMemo(() => {
    if (!selected || !day) return null
    return selected.reports.find((r) => reportDay(r.report_date) === day) || null
  }, [selected, day])

  // The selected developer's bug-tracker work, and the slice for the open day.
  // A QA-only day (bugs filed, no report written) still lands on a chip that
  // opens something — the bug list below.
  const selectedBug = selected ? bugOf(selected) : null
  const dayBugs = useMemo(() => personDayEvents(selectedBug, day), [selectedBug, day])

  useEffect(() => { setRemarkDraft(openReport?.remark || '') }, [openReport?.id, openReport?.remark])

  // Open the developer's most recent worked-on day so the drill-down never
  // lands on an empty chip: the latest of their report days and bug days.
  const openDeveloper = (key) => {
    if (key === selectedKey) { setSelectedKey(null); setDay(null); return }
    const row = rows.find((r) => r.key === key)
    const bug = bugOf(row || {})
    const last = [row?.dayList?.[row?.dayList?.length - 1], bug?.dayList?.[bug?.dayList?.length - 1]]
      .filter(Boolean)
      .sort()
    setSelectedKey(key)
    setDay(last.length ? last[last.length - 1] : null)
  }

  // A day is openable when a report was filed OR bugs were touched that day.
  const pickDay = (iso, openable) => {
    if (!openable) return
    setDay(iso)
  }

  const saveRemark = async () => {
    if (!openReport || savingRemark) return
    setSavingRemark(true)
    try {
      const res = await saveDailyReportRemark(openReport.id, remarkDraft)
      const updated = res?.report || { ...openReport, remark: remarkDraft || null }
      onUpdated?.(openReport.id, { remark: updated.remark })
      toast('Remark saved', 'success')
    } catch (err) {
      toast(err.message || 'Could not save the remark', 'error')
    } finally {
      setSavingRemark(false)
    }
  }

  const reportedDevelopers = rows.filter((r) => r.daysReported > 0).length
  const developers = rows.length
  const coverage = expected > 0 ? Math.round((team.days / expected) * 100) : 0
  const rosterEmpty = developers === 0

  return (
    <>
      <ReporterBar
        names={rows.filter((r) => r.daysReported > 0).map((r) => r.name)}
        emptyText={`No developer report submitted in ${monthLabel(month)}.`}
      />

      <Block title="1. Month overview" aside={monthLabel(month)}>
        <div className="dr-kpis">
          <Kpi label="Reports filed" value={team.filed} accent="#2563eb" />
          <Kpi label="Developers reporting" value={`${reportedDevelopers}/${developers}`} accent="#16a34a" />
          <Kpi label="Days with a report" value={`${team.days}/${expected || 0}`} accent="#0ea5e9" />
          <Kpi label="Coverage" value={`${coverage}%`} accent="#8b5cf6" />
        </div>
        <div className="dr-kpis" style={{ marginTop: 12 }}>
          <Kpi label="Tasks done" value={team.counts.done} accent="#22c55e" />
          <Kpi label="In progress" value={team.counts.wip} accent="#f59e0b" />
          <Kpi label="Pending" value={team.counts.pending} accent="#64748b" />
        </div>
        <StatusBar done={team.counts.done} wip={team.counts.wip} pending={team.counts.pending} />
        {/* Tracker work, only when the month has any: reporting / fixing /
            verifying a bug is real output, so it sits beside the prose-derived
            task counts instead of hiding inside them. */}
        {bugTotals.total > 0 && (
          <div className="dr-kpis" style={{ marginTop: 12 }}>
            <Kpi label="Bugs reported" value={bugTotals.reported} accent="#dc2626" />
            <Kpi label="Bugs fixed" value={bugTotals.fixed} accent="#d97706" />
            <Kpi label="Bugs verified" value={bugTotals.verified} accent="#16a34a" />
            <Kpi label="Bug actions" value={bugTotals.total} accent="#8b5cf6" />
          </div>
        )}
      </Block>

      <Block title="2. Developer scorecard" aside={`${developers} developer${developers === 1 ? '' : 's'} · ${total} days`}>
        {rosterEmpty ? (
          <Empty big>No developers on the roster.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Developer</th>
                <th>Days reported</th>
                <th>Done</th>
                <th>WIP</th>
                <th>Pending</th>
                <th>Bug work</th>
                <th>Remarks</th>
                <th aria-label="Day-wise" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = r.key === selectedKey
                const bug = bugOf(r)
                return (
                  <tr
                    key={r.key}
                    onClick={() => (r.reports.length || bug) && openDeveloper(r.key)}
                    style={{ cursor: r.reports.length || bug ? 'pointer' : 'default', background: open ? 'rgba(37, 99, 235, .06)' : undefined }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={r.name} size={24} />
                        {r.name}
                      </span>
                    </td>
                    <td>
                      <span className={`drx-pill ${r.daysReported ? 'done' : 'pending'}`}>
                        {r.daysReported} of {r.expectedDays}
                      </span>
                    </td>
                    <td>{r.counts.done}</td>
                    <td>{r.counts.wip}</td>
                    <td>{r.counts.pending}</td>
                    {/* A zero-report month can still be a heavy bug month — this
                        column is what keeps that work visible. */}
                    <td>
                      {bug ? (
                        <span
                          className="drx-pill wip"
                          title={`${bug.counts.reported} reported · ${bug.counts.fixed} fixed · ${bug.counts.verified} verified`}
                        >
                          {bug.total}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{r.remarks || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--drx-mute)', fontSize: 12 }}>
                      {r.reports.length || bug
                        ? `${r.daysReported || bug.dayList.length} day${(r.daysReported || bug.dayList.length) === 1 ? '' : 's'} ›`
                        : 'Not filed'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Block>

      {selected && (
        <Block
          title={`3. Day-wise report — ${selected.name}`}
          aside={`${selected.daysReported} of ${selected.expectedDays} days${selectedBug ? ` · ${selectedBug.total} bug action${selectedBug.total === 1 ? '' : 's'}` : ''}`}
        >
          <div className="drx-label">{monthLabel(month)}</div>
          <div className="drx-days" role="group" aria-label={`Days of ${monthLabel(month)}`}>
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
              const iso = isoOf(month, n)
              const hasReport = selected.daySet.has(iso)
              // A chip is openable for a filed report OR for bug activity on
              // that day, so a QA-only day is not a dead chip.
              const hasBug = selectedBug?.byDay?.has(iso) || false
              const has = hasReport || hasBug
              const isFuture = iso > today
              const active = iso === day
              const note = hasReport && hasBug ? 'report + bug work' : hasReport ? 'report filed' : 'bug work only'
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!has}
                  title={has ? `${shortDay(iso)} — ${note}` : isFuture ? 'Not yet' : 'No report or bug activity'}
                  onClick={() => pickDay(iso, has)}
                  className={`drx-day${has ? ' has' : ''}${active ? ' sel' : ''}${iso === today ? ' today' : ''}`}
                >
                  {n}
                </button>
              )
            })}
          </div>

          {/* Bug actions of the selected day — shown whether or not a report
              was written, because filing bugs IS the work being reviewed. */}
          {dayBugs.length > 0 && (
            <ul className="drx-bugwork-list" style={{ marginTop: 14 }}>
              {dayBugs.map((ev) => (
                <li key={ev.id}>
                  <span className={`drx-bugwork-kind ${ev.kind}`}>{KIND_LABELS[ev.kind] || ev.kind}</span>
                  <span className="drx-bugwork-title">{ev.title}</span>
                  <span className="drx-bugwork-meta">
                    {[ev.module, ev.severity && ev.severity.toUpperCase()].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!openReport ? (
            dayBugs.length === 0 ? (
              <div style={{ marginTop: 14 }}>
                <Empty>No report or bug activity on this day.</Empty>
              </div>
            ) : null
          ) : (
            <div className="drx-report open" style={{ marginTop: 14 }}>
              <div className="drx-report-head" style={{ cursor: 'default' }}>
                <Avatar name={openReport.reporter_name} size={38} />
                <span className="drx-report-who">
                  <span className="drx-report-name">{openReport.reporter_name}</span>
                  <span className="drx-report-meta">{shortDay(day)} · Developer daily report</span>
                </span>
                {openReport.remark && <span className="drx-flag">Remark added</span>}
              </div>
              <div className="drx-report-body">
                <ReportView panel="dev" data={openReport.data || {}} />

                <div className="drx-remark-box no-print">
                  <label className="drx-label" htmlFor={`mremark-${openReport.id}`}>
                    HOD Remark{openReport.remark_by ? ` · ${openReport.remark_by}` : ''}
                  </label>
                  <textarea
                    id={`mremark-${openReport.id}`}
                    className="drx-textarea"
                    value={remarkDraft}
                    onChange={(e) => setRemarkDraft(e.target.value)}
                    rows={3}
                    placeholder="Add a remark for this report…"
                  />
                  <div className="drx-remark-actions">
                    <span className="drx-hint">{remarkDraft !== (openReport.remark || '') ? 'Unsaved changes' : (openReport.remark ? 'Saved' : '')}</span>
                    <button
                      type="button"
                      className="drx-btn primary"
                      onClick={saveRemark}
                      disabled={savingRemark || remarkDraft === (openReport.remark || '')}
                    >
                      {savingRemark ? 'Saving…' : 'Save remark'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Block>
      )}

      <Block title="4. Bugs & technical blocks this month" aside={`${bugs.length} ${bugs.length === 1 ? 'entry' : 'entries'}`}>
        <ProseList entries={bugs} empty="No bug notes filed this month." />
      </Block>

      {/* The tracker's own month, kept apart from the prose above: a developer
          who spent the month filing bugs writes nothing in "bugs & blocks" yet
          did real QA work. One row per person, busiest first. */}
      {bugRows.length > 0 && (
        <Block title="5. Bug work this month" aside={`${bugTotals.total} ${bugTotals.total === 1 ? 'action' : 'actions'} from the tracker`}>
          <div className="dr-kpis">
            <Kpi label="Reported" value={bugTotals.reported} accent="#dc2626" />
            <Kpi label="Fixed" value={bugTotals.fixed} accent="#d97706" />
            <Kpi label="Verified" value={bugTotals.verified} accent="#16a34a" />
          </div>
          <TableWrap>
            <thead>
              <tr>
                <th>Person</th>
                <th>Reported</th>
                <th>Fixed</th>
                <th>Verified</th>
                <th>Days active</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {bugRows.map((b) => (
                <tr key={b.key}>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td>{b.counts.reported || '—'}</td>
                  <td>{b.counts.fixed || '—'}</td>
                  <td>{b.counts.verified || '—'}</td>
                  <td>{b.dayList.length}</td>
                  <td><span className="drx-pill wip">{b.total}</span></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Block>
      )}

      <Block title="6. Next working day plans">
        <ProseList entries={plans} empty="No plans filed this month." />
      </Block>
    </>
  )
}

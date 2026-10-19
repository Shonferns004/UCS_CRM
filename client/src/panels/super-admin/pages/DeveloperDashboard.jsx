import { useMemo } from 'react'
import { Block, Kpi, Empty, StatusPill, StatusBar, ReporterBar, TableWrap, ProseList } from '../components/drShared'
import { collectTasks, textEntries } from '../components/devReportAgg'
import { bugWorkByPerson, totalsOf, KIND_LABELS } from '../components/bugWorkAgg'

// Developer summary inside Super-Admin Daily Reports → Developer tab, built from
// the day's daily_reports rows (panel="dev"). Five blocks:
//   1. Today's Tasks      — task status counts (Done / In Progress / Pending)
//      and the combined task list with a status badge per entry.
//   2. Bug Fixes & Technical Blocks — the reporters' prose, one bullet each.
//   3. Bug Work (tracker) — live QA activity: bugs reported / fixed / verified
//      today, per person. Reporting a bug IS work, so a developer whose day is
//      spent in the tracker (QA work) still shows activity here even with
//      nothing typed into the prose sections.
//   4. Next Working Day Plan        — the reporters' one-per-line plans.
// Values all live in report.data, so legacy plain-text reports still render.
// Parsing lives in components/devReportAgg.js so the monthly view reads rows
// exactly the same way.

export default function DeveloperDashboard({ date, devReports = [], bugActivity = [] }) {
  const { tasks, counts } = useMemo(() => collectTasks(devReports), [devReports])
  const technicalIssues = useMemo(() => textEntries(devReports, 'dev_notes', 'technical_issues'), [devReports])
  const plans = useMemo(() => textEntries(devReports, 'nextday', 'nextday'), [devReports])
  const reporters = [...new Set(devReports.map((r) => r.reporter_name).filter(Boolean))]

  const bugRows = useMemo(() => bugWorkByPerson(bugActivity), [bugActivity])
  const bugTotals = useMemo(() => totalsOf(bugRows), [bugRows])

  return (
    <div data-date={date}>
      <ReporterBar names={reporters} emptyText="No developer report submitted on this date." />

      <Block title="1. Today's Tasks" aside={tasks.length ? `${tasks.length} total` : null}>
        <div className="dr-kpis">
          <Kpi label="Done" value={counts.done} accent="#22c55e" />
          <Kpi label="In Progress" value={counts.wip} accent="#f59e0b" />
          <Kpi label="Pending" value={counts.pending} accent="#64748b" />
        </div>
        <StatusBar done={counts.done} wip={counts.wip} pending={counts.pending} />
        {tasks.length === 0 ? (
          <div style={{ marginTop: 14 }}><Empty>No tasks reported.</Empty></div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Developer</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => (
                <tr key={i}>
                  <td>{t.text}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td>{t.reporter || '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Block>

      <Block title="2. Bug Fixes & Technical Blocks">
        <ProseList entries={technicalIssues} />
      </Block>

      {/* Block 3 is the live bug tracker, not the prose — it is what makes a
          QA-only day count as work. Hidden entirely when the tracker has
          nothing for this date, so a normal dev day reads exactly as before. */}
      {bugActivity.length > 0 && (
        <Block title="3. Bug Work — reported / fixed / verified" aside={`${bugTotals.total} ${bugTotals.total === 1 ? 'action' : 'actions'} from the tracker`}>
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
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {bugRows.map((r) => (
                <tr key={r.key}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.counts.reported || '—'}</td>
                  <td>{r.counts.fixed || '—'}</td>
                  <td>{r.counts.verified || '—'}</td>
                  <td><span className="drx-pill wip">{r.total}</span></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <ul className="drx-bugwork-list">
            {bugActivity.map((ev) => (
              <li key={ev.id}>
                <span className={`drx-bugwork-kind ${ev.kind}`}>{KIND_LABELS[ev.kind] || ev.kind}</span>
                <span className="drx-bugwork-title">{ev.title}</span>
                <span className="drx-bugwork-meta">
                  {[ev.person_name, ev.module, ev.severity && ev.severity.toUpperCase()].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* <Block title="3. Support Required from HOD">
        <ProseList entries={support} />
      </Block> */}

      <Block title="4. Next Working Day Plan">
        <ProseList entries={plans} />
      </Block>
    </div>
  )
}

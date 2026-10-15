import { useMemo } from 'react'
import { Block, Kpi, Empty, StatusPill, StatusBar, ReporterBar, TableWrap, ProseList } from '../components/drShared'

// Developer summary inside Super-Admin Daily Reports → Developer tab, built from
// the day's daily_reports rows (panel="dev"). Four blocks:
//   1. Today's Tasks      — task status counts (Done / In Progress / Pending)
//      and the combined task list with a status badge per entry.
//   2. Bug Fixes & Technical Blocks — the reporters' prose, one bullet each.
//   3. Support Required from HOD    — prose from each developer report.
//   4. Next Working Day Plan        — the reporters' one-per-line plans.
// Values all live in report.data, so legacy plain-text reports still render.

const asList = (value) => {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return String(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

const taskStatusOf = (it) => {
  if (it?.status === 'done' || it?.done) return 'done'
  if (it?.status === 'wip') return 'wip'
  return 'pending'
}

// Combine every developer's checklist into one task list with a status badge,
// and count statuses across reports.
const collectTasks = (devReports) => {
  const tasks = []
  const counts = { done: 0, wip: 0, pending: 0 }
  const seen = new Set()
  for (const r of devReports) {
    const raw = r.data?.tasks?.tasks
    const items = Array.isArray(raw) ? raw : asList(raw)
    for (const it of items) {
      const text = String(it?.text ?? it ?? '').trim()
      if (!text) continue
      const key = text.toLowerCase()
      counts[taskStatusOf(it)] += seen.has(key) ? 0 : 1
      if (seen.has(key)) continue
      seen.add(key)
      tasks.push({ text, status: taskStatusOf(it), reporter: r.reporter_name })
    }
  }
  return { tasks, counts }
}

// Group a text field by report so each contributor is credited.
const textEntries = (devReports, section, field) => {
  const out = []
  for (const r of devReports) {
    const lines = asList(r.data?.[section]?.[field])
    if (lines.length) out.push({ reporter: r.reporter_name, lines })
  }
  return out
}

export default function DeveloperDashboard({ date, devReports = [] }) {
  const { tasks, counts } = useMemo(() => collectTasks(devReports), [devReports])
  const technicalIssues = useMemo(() => textEntries(devReports, 'dev_notes', 'technical_issues'), [devReports])
  const support = useMemo(() => textEntries(devReports, 'support', 'support'), [devReports])
  const plans = useMemo(() => textEntries(devReports, 'nextday', 'nextday'), [devReports])
  const reporters = [...new Set(devReports.map((r) => r.reporter_name).filter(Boolean))]

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

      {/* <Block title="3. Support Required from HOD">
        <ProseList entries={support} />
      </Block> */}

      <Block title="4. Next Working Day Plan">
        <ProseList entries={plans} />
      </Block>
    </div>
  )
}

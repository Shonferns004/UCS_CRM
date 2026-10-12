import { useMemo } from 'react'

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

const STATUS_LABEL = { done: 'Done', wip: 'In Progress', pending: 'Pending' }

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

function Block({ title, children, ...rest }) {
  return (
    <div className="sa-card" style={{ padding: 16, marginBottom: 16 }} {...rest}>
      <div className="sa-card-title" style={{ marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function ProseList({ entries }) {
  if (entries.length === 0) return <div className="sa-muted" style={{ fontSize: 13 }}>Nothing reported.</div>
  return (
    <div>
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border, #e5e7eb)' }}>
          <div className="sa-muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 3 }}>{e.reporter || 'Report'}</div>
          {e.lines.map((line, j) => (
            <div key={j} style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>• {line}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function DeveloperDashboard({ date, devReports = [] }) {
  const { tasks, counts } = useMemo(() => collectTasks(devReports), [devReports])
  const technicalIssues = useMemo(() => textEntries(devReports, 'dev_notes', 'technical_issues'), [devReports])
  const support = useMemo(() => textEntries(devReports, 'support', 'support'), [devReports])
  const plans = useMemo(() => textEntries(devReports, 'nextday', 'nextday'), [devReports])
  const reporters = [...new Set(devReports.map((r) => r.reporter_name).filter(Boolean))]

  return (
    <div>
      <div className="sa-muted" style={{ fontSize: 12, marginBottom: 12 }} data-date={date}>
        {reporters.length > 0 ? `Developer report by: ${reporters.join(', ')}` : 'No developer report submitted on this date.'}
      </div>

      <Block title="1. Today's Tasks">
        <div className="dr-kpis">
          <div className="dr-kpi" style={{ borderTop: '3px solid #22c55e' }}>
            <div className="dr-kpi-value" style={{ fontSize: 20 }}>{counts.done}</div>
            <div className="dr-kpi-label">Done</div>
          </div>
          <div className="dr-kpi" style={{ borderTop: '3px solid #f59e0b' }}>
            <div className="dr-kpi-value" style={{ fontSize: 20 }}>{counts.wip}</div>
            <div className="dr-kpi-label">In Progress</div>
          </div>
          <div className="dr-kpi" style={{ borderTop: '3px solid #6b7280' }}>
            <div className="dr-kpi-value" style={{ fontSize: 20 }}>{counts.pending}</div>
            <div className="dr-kpi-label">Pending</div>
          </div>
        </div>
        {tasks.length === 0 ? (
          <div className="sa-muted" style={{ fontSize: 13, marginTop: 10 }}>No tasks reported.</div>
        ) : (
          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            <table className="sa-table">
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
                    <td>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: t.status === 'done' ? '#dcfce7' : t.status === 'wip' ? '#fef3c7' : '#e5e7eb',
                        color: t.status === 'done' ? '#166534' : t.status === 'wip' ? '#92400e' : '#374151',
                      }}>{STATUS_LABEL[t.status]}</span>
                    </td>
                    <td>{t.reporter || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      <Block title="2. Bug Fixes & Technical Blocks">
        <ProseList entries={technicalIssues} />
      </Block>

      <Block title="3. Support Required from HOD">
        <ProseList entries={support} />
      </Block>

      <Block title="4. Next Working Day Plan">
        <ProseList entries={plans} />
      </Block>
    </div>
  )
}
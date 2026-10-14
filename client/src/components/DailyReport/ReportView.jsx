import { hrSections, recruiterSections, developerSections, socialSections, withCommon } from './configs'

// Which section config a saved report was written with, so the Super-Admin
// Daily Reports page can render a row back the same way the reporter's own
// panel shows it — labelled sections, row tables, checklists — instead of a
// flat list of raw field ids.
const PANEL_SECTIONS = {
  dev: developerSections,
  hr: withCommon(hrSections),
  recruiter: withCommon(recruiterSections),
  social: withCommon(socialSections),
}

const DEFAULT_COLUMNS = [
  { key: 'task', label: 'Task' },
  { key: 'reason', label: 'Reason for pending' },
  { key: 'expected', label: 'Expected completion' },
]

const isBlank = (v) =>
  v == null || (Array.isArray(v) && v.length === 0) || String(v).trim() === ''

const STATUS_LABEL = { done: 'Done', wip: 'WIP', pending: 'Pending' }

const text = (v) => (v == null ? '' : String(v))

const toRows = (field, value) => {
  const columns = field?.columns?.length ? field.columns : DEFAULT_COLUMNS
  if (typeof value === 'string') return { columns, rows: [Object.fromEntries(columns.map((c, i) => [c.key, i === 0 ? value : '']))] }
  if (!Array.isArray(value)) return { columns, rows: [] }
  const rows = value
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) return item
      return Object.fromEntries(columns.map((c, i) => [c.key, i === 0 ? text(item) : '']))
    })
    .filter((item) => columns.some((c) => !isBlank(item[c.key])))
  return { columns, rows }
}

const toTasks = (value) => {
  if (typeof value === 'string') return value.trim() ? [{ text: value, done: false }] : []
  if (!Array.isArray(value)) return []
  return value
    .map((it) => (it && typeof it === 'object' ? { text: text(it.text), done: !!it.done } : { text: text(it), done: false }))
    .filter((it) => it.text.trim() !== '')
}

function Field({ field, value, assignedTasks = [] }) {
  if (field.type === 'rows') {
    const { columns, rows } = toRows(field, value)
    return (
      <div className="drv-field wide">
        <div className="drv-label">{field.label}</div>
        {rows.length === 0 ? (
          <div className="drv-muted">—</div>
        ) : (
          <div className="drx-tablewrap" style={{ marginTop: 6 }}>
            <table className="sa-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} style={c === columns[0] ? { fontWeight: 600 } : undefined}>{text(row[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (field.type === 'checklist') {
    const tasks = toTasks(value)
    const assigned = Array.isArray(assignedTasks) ? assignedTasks : []
    return (
      <div className="drv-field wide">
        <div className="drv-label">{field.label}</div>
        {tasks.length === 0 && assigned.length === 0 ? (
          <div className="drv-muted">—</div>
        ) : (
          <ul className="drv-tasks">
            {tasks.map((it, i) => (
              <li key={i}>
                <span className={`drv-tick${it.done ? ' done' : ''}`} aria-hidden="true">{it.done ? '✓' : ''}</span>
                <span style={{ textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.65 : 1 }}>{it.text}</span>
              </li>
            ))}
            {assigned.map((t) => (
              <li key={`assigned-${t.id}`}>
                <span className={`drv-tick${t.status === 'done' ? ' done' : ''}`} aria-hidden="true">{t.status === 'done' ? '✓' : ''}</span>
                <span>
                  {t.title}
                  <span className="drv-task-meta">
                    Assigned{t.assigned_by_name ? ` by ${t.assigned_by_name}` : ''}{t.task_date ? ` · ${t.task_date}` : ''} · {STATUS_LABEL[t.status] || 'Pending'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="drv-field">
      <div className="drv-label">{field.label}</div>
      <div className="drv-value">{text(value) || '—'}</div>
    </div>
  )
}

// Read-only render of one daily report's data using the panel's own section
// config: identical grouping, labels and table/list shapes to what the
// reporter filled in on their side.
//
// `assignedTasks` are manager-assigned tasks for THIS reporter; they are shown
// inside the panel's "My Tasks" checklist so the view matches what the member
// sees (own tasks + assigned tasks in one place).
export default function ReportView({ panel, data, assignedTasks = [] }) {
  const sections = PANEL_SECTIONS[panel] || []
  const assigned = Array.isArray(assignedTasks) ? assignedTasks : []
  const hasAssigned = (s, f) => f.type === 'checklist' && assigned.length > 0 && s.id === 'social_tasks'
  const populated = sections.filter((s) => (s.fields || []).some((f) => !isBlank(data?.[s.id]?.[f.id]) || hasAssigned(s, f)))
  if (populated.length === 0) return <div className="drv-muted" style={{ paddingTop: 14 }}>No entries.</div>

  return (
    <div>
      {populated.map((s) => (
        <div key={s.id} className="drv-section">
          <div className="drv-section-title">{s.label}</div>
          <div className="drv-grid">
            {(s.fields || [])
              .filter((f) => !isBlank(data?.[s.id]?.[f.id]) || hasAssigned(s, f))
              .map((f) => (
                <Field
                  key={f.id}
                  field={f}
                  value={data?.[s.id]?.[f.id]}
                  assignedTasks={hasAssigned(s, f) ? assigned : []}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
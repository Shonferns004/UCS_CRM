import { Avatar } from '../../../components/ui'

export const STATUS_LABEL = { done: 'Done', wip: 'In Progress', pending: 'Pending' }

// "1. Attendance Summary" -> number badge "1" + heading
export function Block({ title, aside, children }) {
  const m = /^(\d+)\.\s*(.*)$/.exec(String(title || ''))
  return (
    <section className="drx-block">
      <header className="drx-block-head">
        {m && <span className="drx-num">{m[1]}</span>}
        <h3 className="drx-block-title">{m ? m[2] : title}</h3>
        {aside != null && <span className="drx-block-aside">{aside}</span>}
      </header>
      <div className="drx-block-body">{children}</div>
    </section>
  )
}

export function Kpi({ label, value, accent }) {
  return (
    <div className="dr-kpi" style={accent ? { '--k': accent } : undefined}>
      <div className="dr-kpi-value">{value}</div>
      <div className="dr-kpi-label">{label}</div>
    </div>
  )
}

export function Empty({ children, big = false }) {
  return (
    <div className={`drx-empty${big ? ' big' : ''}`}>
      <svg width={big ? 34 : 20} height={big ? 34 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 14h6" />
      </svg>
      <span>{children}</span>
    </div>
  )
}

export function StatusPill({ status }) {
  const s = STATUS_LABEL[status] ? status : 'pending'
  return <span className={`drx-pill ${s}`}>{STATUS_LABEL[s]}</span>
}

export function StatusBar({ done = 0, wip = 0, pending = 0 }) {
  const total = done + wip + pending
  if (!total) return null
  const pct = (n) => `${(n / total) * 100}%`
  const donePct = Math.round((done / total) * 100)
  return (
    <>
      <div className="drx-bar" role="img" aria-label={`${done} done, ${wip} in progress, ${pending} pending`}>
        <span className="ok" style={{ width: pct(done) }} />
        <span className="wip" style={{ width: pct(wip) }} />
        <span className="pending" style={{ width: pct(pending) }} />
      </div>
      <div className="drx-bar-caption">{donePct}% complete · {total} task{total === 1 ? '' : 's'}</div>
    </>
  )
}

export function ReporterBar({ names = [], emptyText }) {
  if (names.length === 0) {
    return (
      <div className="drx-notice">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
        </svg>
        {emptyText}
      </div>
    )
  }
  return (
    <div className="drx-reporters">
      <span className="drx-reporters-label">Reported by</span>
      {names.map((n) => (
        <span className="drx-person" key={n}><Avatar name={n} size={22} />{n}</span>
      ))}
    </div>
  )
}

export function TableWrap({ children }) {
  return (
    <div className="drx-tablewrap">
      <table className="sa-table">{children}</table>
    </div>
  )
}

export function NumberedList({ lines }) {
  return (
    <ol className="drx-ol">
      {lines.map((line, i) => <li key={i}>{line}</li>)}
    </ol>
  )
}

export function ProseList({ entries, empty = 'Nothing reported.' }) {
  if (!entries || entries.length === 0) return <Empty>{empty}</Empty>
  return (
    <div className="drx-prose">
      {entries.map((e, i) => (
        <div className="drx-prose-item" key={`${e.reporter}-${i}`}>
          <div className="drx-prose-who"><Avatar name={e.reporter || 'Report'} size={22} />{e.reporter || 'Report'}</div>
          <ul>
            {e.lines.map((line, j) => <li key={j}>{line}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}
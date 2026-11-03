import { useEffect } from 'react'
import { Loader2, AlertCircle, RefreshCw, X } from 'lucide-react'

export function Spinner({ size = 16 }) {
  return <Loader2 size={size} className="owa-spin" aria-label="Loading" />
}

export function Card({ title, subtitle, actions, children, className = '', pad = true }) {
  return (
    <section className={`owa-card ${className}`}>
      {(title || actions) && (
        <header className="owa-card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="owa-card-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'owa-card-body' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, tone = '' }) {
  return (
    <div className={`owa-stat ${tone}`}>
      <span className="owa-stat-label">{label}</span>
      <strong className="owa-stat-value">{value}</strong>
      {hint && <span className="owa-stat-hint">{hint}</span>}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`owa-badge owa-badge-${tone}`}>{children}</span>
}

export function Empty({ icon: Icon = AlertCircle, title, text, action }) {
  return (
    <div className="owa-empty">
      <Icon size={34} />
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action}
    </div>
  )
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="owa-error" role="alert">
      <AlertCircle size={18} />
      <span>{error}</span>
      {onRetry && (
        <button className="owa-btn owa-btn-ghost" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="owa-modal-overlay" onMouseDown={onClose}>
      <div
        className={`owa-modal ${wide ? 'owa-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="owa-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        {title && <h2>{title}</h2>}
        {subtitle && <p className="owa-modal-sub">{subtitle}</p>}
        <div className="owa-modal-body">{children}</div>
        {footer && <div className="owa-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="owa-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Toolbar({ children }) {
  return <div className="owa-toolbar">{children}</div>
}

export function Table({ columns, rows, empty = 'Nothing here yet.', rowKey = (r, i) => r.id || i }) {
  if (!rows.length) return <div className="owa-table-empty">{empty}</div>
  return (
    <div className="owa-table-wrap">
      <table className="owa-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row, index) : row[col.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const STATUS_LABELS = {
  created: 'Created',
  initializing: 'Initializing',
  authenticating: 'Authenticating',
  qr_ready: 'Scan QR',
  ready: 'Connected',
  disconnected: 'Disconnected',
  failed: 'Failed',
  action_required: 'Action required',
}

export function statusTone(status) {
  if (status === 'ready') return 'ok'
  if (status === 'qr_ready' || status === 'authenticating') return 'info'
  if (status === 'initializing' || status === 'created') return 'warn'
  if (status === 'failed' || status === 'action_required') return 'bad'
  return 'neutral'
}

export function fmtTime(value) {
  if (!value) return '—'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export function fmtNumber(value) {
  return typeof value === 'number' ? value.toLocaleString() : value ?? 0
}

export function errorMessage(error) {
  return error?.message || 'Something went wrong'
}

import { Fragment } from 'react'

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="eh-page-head">
      <div className="eh-page">
        <h2>{title}</h2>
        {subtitle && <div className="eh-sub">{subtitle}</div>}
      </div>
      {actions && <div className="eh-actions">{actions}</div>}
    </div>
  )
}

const TINT = ['#efefff', '#f4f0ff', '#e7f7ef', '#fdf1f6', '#fdf6e8', '#ebf6fd']

export function MetricCard({ icon, number, label, trend, color, onClick, index }) {
  const c = color || 'var(--eh-primary)'
  const tint = TINT[(index ?? 0) % TINT.length]
  return (
    <div className="eh-metric" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      {icon && (
        <div className="eh-m-icon" style={{ background: tint, color: c }}>{icon}</div>
      )}
      <div>
        <div className="eh-m-num">{number}</div>
        <div className="eh-m-lbl">{label}</div>
      </div>
      {trend !== undefined && trend !== null && (
        <div className={`eh-m-trend ${trend >= 0 ? 'up' : 'down'}`}>
          <span>{trend >= 0 ? '▲' : '▼'}</span>
          <span>{Math.abs(trend)}%</span>
          <span style={{ color: 'var(--eh-ink-faint)' }}>vs last month</span>
        </div>
      )}
    </div>
  )
}

export function SectionCard({ title, sub, actions, children, flush, bodyStyle, headRight }) {
  return (
    <div className="eh-section">
      {(title || actions || headRight) && (
        <div className="eh-section-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="eh-section-sub">{sub}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{headRight}{actions}</div>
        </div>
      )}
      <div className={`eh-section-body${flush ? ' flush' : ''}`} style={bodyStyle}>{children}</div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search...', style }) {
  return (
    <div className="eh-search" style={style}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Select({ value, onChange, children, style }) {
  return (
    <select className="eh-select" value={value} onChange={e => onChange(e.target.value)} style={style}>
      {children}
    </select>
  )
}

export function Avatar({ name, color, size = 36 }) {
  const initials = name ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?'
  return (
    <span className="eh-avatar" style={{ width: size, height: size, borderRadius: size / 3, fontSize: size * 0.34, background: color || 'linear-gradient(135deg, var(--eh-primary), var(--eh-secondary))' }}>
      {initials}
    </span>
  )
}

export function Badge({ children, tone = 'primary' }) {
  const map = {
    primary: { bg: 'var(--eh-primary-soft)', c: 'var(--eh-primary)' },
    secondary: { bg: 'var(--eh-secondary-soft)', c: 'var(--eh-secondary)' },
    success: { bg: 'var(--eh-success-soft)', c: 'var(--eh-success)' },
    danger: { bg: 'var(--eh-danger-soft)', c: 'var(--eh-danger)' },
    warn: { bg: 'var(--eh-warn-soft)', c: '#9a8200' },
    muted: { bg: '#f1f2f7', c: 'var(--eh-ink-soft)' },
  }
  const t = map[tone] || map.primary
  return <span className="eh-badge" style={{ background: t.bg, color: t.c }}>{children}</span>
}

export function Empty({ children, icon }) {
  return (
    <div style={{ textAlign: 'center', padding: '42px 20px', color: 'var(--eh-ink-soft)' }}>
      {icon && <div style={{ fontSize: 30, marginBottom: 8, opacity: .5 }}>{icon}</div>}
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  )
}

export function StatusPill({ status }) {
  const map = {
    Completed: 'success', Closed: 'success', Approved: 'success', Done: 'success',
    Draft: 'muted', Pending: 'warn', Submitted: 'warn', Upcoming: 'warn',
    Postponed: 'warn', Rejected: 'danger', Cancelled: 'danger',
  }
  return <Badge tone={map[status] || 'muted'}>{status || '—'}</Badge>
}

export function RowActions({ onEdit, onDelete, onView }) {
  return (
    <div className="eh-row" style={{ gap: 4, justifyContent: 'flex-end' }}>
      {onView && <ActionBtn title="View" onClick={onView}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></ActionBtn>}
      {onEdit && <ActionBtn title="Edit" onClick={onEdit}><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></ActionBtn>}
      {onDelete && <ActionBtn title="Delete" onClick={onDelete} danger><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></ActionBtn>}
    </div>
  )
}
function ActionBtn({ children, onClick, title, danger }) {
  return (
    <button title={title} onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: danger ? 'var(--eh-danger)' : 'var(--eh-ink-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'var(--eh-danger-soft)' : 'var(--eh-tint-1)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  )
}

export function TableManager({ columns, data, onRowClick, groupLabel }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c.accessor || c.header}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {groupLabel && data.length > 0 && renderGroups(data, groupLabel, columns, onRowClick)}
          {!groupLabel && data.map((row, i) => (
            <tr key={row.id ?? i} onClick={() => onRowClick?.(row)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--eh-tint-1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
              {columns.map(c => <td key={c.accessor || c.header}>{c.render ? c.render(row) : row[c.accessor] ?? '—'}</td>)}
            </tr>
          ))}
          {!groupLabel && data.length === 0 && (
            <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: 'var(--eh-ink-soft)' }}>No data found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
function renderGroups(data, groupLabel, columns, onRowClick) {
  const groups = []
  for (const row of data) {
    const key = groupLabel(row)
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) groups.push({ key, rows: [row] })
    else last.rows.push(row)
  }
  return groups.map((g, gi) => (
    <Fragment key={gi}>
      <tr>
        <td colSpan={columns.length} style={{ padding: '9px 14px', background: 'var(--eh-tint-1)', borderBottom: '1px solid var(--eh-line)', fontSize: 12, fontWeight: 700, color: 'var(--eh-ink-soft)' }}>{g.key}</td>
      </tr>
      {g.rows.map((row, i) => (
        <tr key={row.id ?? i} onClick={() => onRowClick?.(row)}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--eh-tint-1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
          {columns.map(c => <td key={c.accessor || c.header}>{c.render ? c.render(row) : row[c.accessor] ?? '—'}</td>)}
        </tr>
      ))}
    </Fragment>
  ))
}

import { useEffect, useMemo } from 'react'
import { X, ArrowRight, Inbox, ExternalLink, ListFilter } from 'lucide-react'
import { statusLabel, statusMeta, PLAN_COLORS, isRenewalDue } from './meta.js'
import { formatINR, formatDate } from './formUtils.js'
import { AppliedDate, RenewalDate } from './DateTags.jsx'

function applyFilters(rows, f = {}) {
  let list = rows
  if (f.status) list = list.filter((r) => r.status === f.status)
  if (f.plan) list = list.filter((r) => (r.membership_type || 'Other') === f.plan)
  if (f.renewal) list = list.filter((r) => isRenewalDue(r))
  if (f.from) list = list.filter((r) => (r.created_at || '').slice(0, 10) >= f.from)
  if (f.to) list = list.filter((r) => (r.created_at || '').slice(0, 10) <= f.to)
  return list
}

function drillTitle(f = {}) {
  const parts = []
  if (f.status) parts.push(statusLabel(f.status))
  if (f.renewal) parts.push('Renewals due')
  if (f.plan) parts.push(`${f.plan} plan`)
  if (f.from && f.to && f.from === f.to) parts.push(formatDate(f.from))
  else if (f.from || f.to) {
    parts.push(`${f.from ? formatDate(f.from) : '…'} → ${f.to ? formatDate(f.to) : '…'}`)
  }
  return parts.length ? parts.join(' · ') : 'All applications'
}

export default function DrillListModal({ rows, filters, onClose, onOpen, onOpenList }) {
  const list = useMemo(() => applyFilters(rows, filters), [rows, filters])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filterBits = []
  if (filters.status) filterBits.push(statusMeta(filters.status))
  if (filters.renewal) filterBits.push({ label: 'Renewals due', dot: '#dc2626', soft: '#fee2e2', text: '#b91c1c' })
  if (filters.plan) filterBits.push({ label: filters.plan, dot: PLAN_COLORS[filters.plan] || '#9aa0a6', soft: '#f1f3f4', text: '#5f6368' })
  if (filters.from || filters.to) {
    filterBits.push({ label: 'Date range', dot: '#0ea5e9', soft: '#e0f2fe', text: '#0369a1' })
  }

  return (
    <div className="drill-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="drill-modal" role="dialog" aria-modal="true" aria-label={drillTitle(filters)}>
        <div className="drill-head">
          <span className="drill-icon"><ListFilter size={17} /></span>
          <div className="drill-head-main">
            <h3>{drillTitle(filters)}</h3>
            <div className="drill-bits">
              {filterBits.map((b, i) => (
                <span key={i} className="drill-bit" style={{ background: b.soft, color: b.text }}>
                  <i style={{ background: b.dot }} /> {b.label}
                </span>
              ))}
            </div>
          </div>
          <button type="button" className="drill-close" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="drill-list">
          {list.length === 0 ? (
            <div className="drill-empty">
              <Inbox size={34} />
              <p>No applications match this filter.</p>
            </div>
          ) : (
            list.map((r) => {
              const m = statusMeta(r.status)
              return (
                <button key={r.id} type="button" className="drill-row" onClick={() => onOpen(r)}>
                  <span className="recent-avatar">{r.full_name ? r.full_name.charAt(0).toUpperCase() : '?'}</span>
                  <span className="drill-main">
                    <strong>{r.full_name}</strong>
                    <small>{r.ref}</small>
                    <span className="drill-dates">
                      <AppliedDate iso={r.created_at} />
                      <RenewalDate row={r} />
                    </span>
                  </span>
                  <span
                    className="plan-tag"
                    style={{ '--pc': PLAN_COLORS[r.membership_type] || '#9aa0a6' }}
                  >
                    {r.membership_type || '—'}
                  </span>
                  <span className="drill-fee mono">{formatINR(r.membership_fee)}</span>
                  <span className="admin-badge" style={{ background: m.soft, color: m.text }}>
                    {m.label}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="drill-foot">
          <span className="drill-foot-info">
            {list.length} of {rows.length} applications
            {list.length > 0 && ` · ${formatINR(list.reduce((s, r) => s + (Number(r.membership_fee) || 0), 0))} total fee`}
          </span>
          <span className="drill-actions">
            <button type="button" className="drill-btn drill-btn-ghost" onClick={onClose}>
              Close
            </button>
            <button type="button" className="drill-btn drill-btn-primary" onClick={onOpenList}>
              <ExternalLink size={14} /> Open in Applications <ArrowRight size={14} />
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

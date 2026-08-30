import { useMemo } from 'react'

const cards = [
  { key: 'total', label: 'Total Events', color: 'var(--eh-primary)' },
  { key: 'today', label: "Today's Events", color: '#3485d4' },
  { key: 'upcoming', label: 'Upcoming Events', color: 'var(--eh-secondary)' },
  { key: 'completed', label: 'Completed', color: 'var(--eh-success)' },
  { key: 'submitted', label: 'Submitted', color: '#0891b2' },
  { key: 'draft', label: 'Draft', color: 'var(--eh-ink-soft)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--eh-danger)' },
]

export default function SummaryCards({ summary }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 10,
    }}>
      {cards.map(c => {
        const val = summary[c.key] ?? 0
        return (
          <div
            key={c.key}
            style={{
              background: 'var(--eh-surface-2)',
              border: '1px solid var(--eh-line)',
              borderRadius: 14,
              boxShadow: '0 1px 2px rgba(15,17,40,.04)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'box-shadow .15s, transform .15s',
              cursor: 'default',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--eh-tint-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 800,
              color: c.color,
              flexShrink: 0,
            }}>
              {val}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: c.color }}>{val}</div>
              <div style={{ fontSize: 10, color: 'var(--eh-ink-soft)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

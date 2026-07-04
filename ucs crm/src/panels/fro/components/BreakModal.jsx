const BREAK_TYPES = [
  { id: 'tea', label: 'Tea Break', icon: '☕', desc: 'Short break' },
  { id: 'lunch', label: 'Lunch Break', icon: '🍽️', desc: 'Meal break' },
  { id: 'custom', label: 'Custom Break', icon: '⏱️', desc: 'Other' },
]

export default function BreakModal({ onSelect, onClose, todayBreakSeconds, fmt }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: 320, padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,.15)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Take a Break</div>
        <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Today's break: <strong>{fmt(todayBreakSeconds)}</strong>
        </div>

        {BREAK_TYPES.map(bt => (
          <button key={bt.id} onClick={() => onSelect(bt.id)}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, fontFamily: 'inherit', transition: 'all .12s', textAlign: 'left' }}
            onMouseOver={e => e.currentTarget.style.borderColor = '#f59e0b'}
            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--line)'}>
            <span style={{ fontSize: 20 }}>{bt.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{bt.label}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{bt.desc}</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ink-soft)' }}>arrow_forward_ios</span>
          </button>
        ))}

        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <button onClick={onClose}
            style={{ padding: '6px 20px', border: '1px solid var(--line)', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

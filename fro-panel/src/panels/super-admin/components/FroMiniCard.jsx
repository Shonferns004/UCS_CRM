import { fmt, STATUS_META } from './froShared'

export function FroMiniCard({ fro, onCardClick }) {
  if (!fro) return null
  const meta = STATUS_META[fro.status] || STATUS_META.offline
  const workerName = fro.worker?.name || 'Unknown'
  const initials = workerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const totalActive = (fro.performance?.today_talk_seconds || 0) + (fro.performance?.today_idle_seconds || 0)
  const productivity = totalActive > 0 ? Math.round(((fro.performance?.today_talk_seconds || 0) / totalActive) * 100) : null
  const callTimer = fro.status === 'on_call' && (fro.computed?.call_duration_seconds != null ? fmt(fro.computed.call_duration_seconds) : null)
  const breakTimer = fro.status === 'break' && (fro.computed?.break_duration_seconds != null ? fmt(fro.computed.break_duration_seconds) : null)
  const PRIMARY = '#1F332B'
  const MINT_DEEP = '#2A6B45'
  const RED_DEEP = '#C0473C'

  return (
    <div className="fro-mini-card" onClick={() => onCardClick(fro)}
      style={{ borderLeft: `4px solid ${meta.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PRIMARY }}>{workerName}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{fro.worker?.login_id || ''}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: meta.color }}>{meta.label}</span>
        </span>
      </div>
      {fro.status === 'on_call' && callTimer && (
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#dc2626' }}>call</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', flex: 1 }}>{fro.current_donor_name}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{callTimer}</span>
        </div>
      )}
      {fro.status === 'break' && breakTimer && (
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fefce8', border: '1px solid #fde68a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#d97706' }}>free_breakfast</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', flex: 1 }}>{(fro.performance?.today_break_seconds || 0) > 3600 ? 'Break 🔴' : 'On Break'}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{breakTimer}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10, color: '#94a3b8' }}>
        <span> <strong style={{ color: PRIMARY }}>{fro.performance?.today_calls || 0}</strong></span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}> <strong style={{ color: PRIMARY }}>{fmt(fro.performance?.today_talk_seconds || 0)}</strong></span>
        {productivity !== null && (
          <span style={{ color: productivity < 50 ? RED_DEEP : MINT_DEEP, fontWeight: 600 }}> {productivity}%</span>
        )}
      </div>
    </div>
  )
}

import { fmt, STATUS_META } from './froShared'

export function FroMiniCard({ fro, onCardClick }) {
  if (!fro) return null
  const meta = STATUS_META[fro.status] || STATUS_META.offline
  const workerName = fro.worker?.name || 'Unknown'
  const initials = workerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const talk = fro.performance?.today_talk_seconds || 0
  // Idle today, including a period still running (server-derived).
  const idle = fro.performance?.today_idle_seconds || 0
  // Talk as a share of the accounted-for day — idle is what dilutes it.
  const productivity = talk + idle > 0 ? Math.round((talk / (talk + idle)) * 100) : null
  const callTimer = fro.status === 'on_call' && (fro.computed?.call_duration_seconds != null ? fmt(fro.computed.call_duration_seconds) : null)
  // How long this idle stretch has been going (null unless the timer is out).
  const idleTimer = fro.status === 'idle' && fro.computed?.idle_duration_seconds != null
    ? fmt(fro.computed.idle_duration_seconds)
    : null
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
      {fro.status === 'idle' && idleTimer && (
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#b91c1c' }}>timer_off</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', flex: 1 }}>Idle — awaiting disposition</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>{idleTimer}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10, color: '#94a3b8' }}>
        <span> <strong style={{ color: PRIMARY }}>{fro.performance?.today_calls || 0}</strong></span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}> <strong style={{ color: PRIMARY }}>{fmt(fro.performance?.today_talk_seconds || 0)}</strong></span>
        <span title="Idle today" style={{ fontVariantNumeric: 'tabular-nums' }}>
          idle <strong style={{ color: idle > 0 ? RED_DEEP : PRIMARY }}>{fmt(idle)}</strong>
        </span>
        {productivity !== null && (
          <span style={{ color: productivity < 50 ? RED_DEEP : MINT_DEEP, fontWeight: 600 }}> {productivity}%</span>
        )}
      </div>
    </div>
  )
}

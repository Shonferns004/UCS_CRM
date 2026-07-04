import { useCall } from '../CallContext'

function fmt(seconds) {
  if (seconds == null) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function CallTimer() {
  const { isOnCall, elapsed, todayStats, activeCall, endCall } = useCall()

  if (isOnCall) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 10px', borderRadius: 6, background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', border: '1px solid #fecaca' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }} />
        <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#dc2626' }}>call</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeCall?.donorName}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 700, color: '#dc2626', minWidth: 45 }}>
          {fmt(elapsed)}
        </span>
        <button onClick={endCall}
          style={{ padding: '2px 10px', border: '1px solid #dc2626', borderRadius: 4, background: '#fff', color: '#dc2626', fontSize: 9, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', lineHeight: '18px', whiteSpace: 'nowrap' }}>
          End
        </button>
      </div>
    )
  }

  if (todayStats.calls === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 10, color: '#166534', whiteSpace: 'nowrap' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>phone_in_talk</span>
      <span style={{ fontWeight: 600 }}>{todayStats.calls}</span>
      <span>calls</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(todayStats.totalSeconds)}</span>
    </div>
  )
}

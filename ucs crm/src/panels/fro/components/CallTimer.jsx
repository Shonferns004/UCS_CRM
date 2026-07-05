import { useState, useEffect } from 'react'
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
  const { isOnCall, elapsed, todayStats, activeCall, endCall, onBreak, breakElapsed, toggleBreak, isBreakOvertime } = useCall()
  const [sliding, setSliding] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (onBreak) {
      setSliding(true)
      setExpanded(false)
      const t = setTimeout(() => setExpanded(true), 400)
      return () => clearTimeout(t)
    } else {
      setSliding(false)
      setExpanded(false)
    }
  }, [onBreak])

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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      {todayStats.skippedDonors > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 10px', borderRadius: 6, background: '#fefce8', border: '1px solid #fde68a', fontSize: 11, color: '#92400e', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600 }}>{'\u23F3'}{todayStats.skippedDonors} skip · {fmt(todayStats.idleSeconds)}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: 36 }}>
        {/* Break time trail - shows behind the button */}
        <div style={{
          overflow: 'hidden',
          transition: 'width .4s ease, opacity .3s ease',
          width: expanded ? 80 : 0,
          opacity: expanded ? 1 : 0,
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px 6px 14px',
            borderRadius: '8px 0 0 8px',
            background: isBreakOvertime ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' : 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
            border: `1px solid ${isBreakOvertime ? '#fecaca' : '#fde68a'}`,
            borderRight: 'none',
            height: 36,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: isBreakOvertime ? '#dc2626' : '#92400e' }}>schedule</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 700, color: isBreakOvertime ? '#dc2626' : '#92400e', minWidth: 40 }}>
              {onBreak ? fmt(breakElapsed) : '00:00'}
            </span>
          </div>
        </div>

        {/* Play/Pause button */}
        <button
          onClick={toggleBreak}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: isBreakOvertime ? '#dc2626' : '#d97706',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform .4s ease, background .2s',
            transform: sliding ? 'translateX(0)' : 'translateX(0)',
            boxShadow: '0 2px 6px rgba(0,0,0,.15)',
            position: 'relative',
            zIndex: 2,
            flexShrink: 0,
          }}
          onMouseOver={e => e.currentTarget.style.transform = sliding ? 'translateX(0) scale(1.05)' : 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = sliding ? 'translateX(0) scale(1)' : 'scale(1)'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            {onBreak ? (
              <><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>
            ) : (
              <polygon points="8,5 8,19 20,12" />
            )}
          </svg>
        </button>
      </div>
    </div>
  )
}

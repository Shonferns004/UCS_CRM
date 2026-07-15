import { useState, useEffect } from 'react'
import { useUcs } from '../../../store'
import { supabase } from '../../../config/supabase'
import { api } from '../../../api/auth'
import { fmt, STATUS_META } from '../components/froShared'
import { FroDetailModal, FroDeepDetailModal } from '../components/FroModals'

export default function LiveFroStatus() {
  const { user } = useUcs()
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFro, setSelectedFro] = useState(null)
  const [deepFro, setDeepFro] = useState(null)

  const loadStatuses = async () => {
    try {
      const data = await api('/fro/status', { _prefix: 'ucs' })
      setStatuses(data || [])
    } catch { setStatuses([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadStatuses()
    const interval = setInterval(loadStatuses, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel('fro_live_status_sa_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'fro_live_status' },
        () => loadStatuses()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const onlineCount = statuses.filter(s => s.status === 'on_call' || s.status === 'online').length

  const statusDot = (status) => {
    const meta = STATUS_META[status] || STATUS_META.offline
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block',
          animation: status === 'on_call' || status === 'break' ? 'pulse 1s ease-in-out infinite' : 'none' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>{meta.label}</span>
      </span>
    )
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>Loading FRO statuses...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>radio</span>
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Live FRO Status</h3>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{onlineCount} online · {statuses.length} total FROs</div>
        </div>
      </div>

      {statuses.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: .3 }}>📡</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No FROs active</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>FROs will appear here when they log in and start working.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {statuses.map(fs => {
            const meta = STATUS_META[fs.status] || STATUS_META.offline
            const workerName = fs.worker?.name || 'Unknown'
            const initials = workerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
            const totalActive = (fs.performance?.today_talk_seconds || 0) + (fs.performance?.today_idle_seconds || 0)
            const productivity = totalActive > 0 ? Math.round(((fs.performance?.today_talk_seconds || 0) / totalActive) * 100) : null
            return (
              <div key={fs.id} className="card" style={{
                marginBottom: 0, padding: '14px 16px',
                borderLeft: `4px solid ${meta.color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#8b5cf6' }} onClick={() => setSelectedFro(fs)}>{workerName}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{fs.worker?.login_id || ''}</div>
                  </div>
                  {statusDot(fs.status)}
                </div>

                {fs.status === 'on_call' && (
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#dc2626' }}>call</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', flex: 1 }}>{fs.current_donor_name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                        {fs.computed?.call_duration_seconds != null ? fmt(fs.computed.call_duration_seconds) : (fs.call_started_at ? fmt(Math.floor((Date.now() - new Date(fs.call_started_at).getTime()) / 1000)) : '00:00')}
                      </span>
                    </div>
                  </div>
                )}

                {fs.status === 'break' && (
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: (fs.performance?.today_break_seconds || 0) > 3600 ? '#fef2f2' : '#fefce8', border: `1px solid ${(fs.performance?.today_break_seconds || 0) > 3600 ? '#fecaca' : '#fde68a'}`, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: (fs.performance?.today_break_seconds || 0) > 3600 ? '#dc2626' : '#d97706' }}>free_breakfast</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: (fs.performance?.today_break_seconds || 0) > 3600 ? '#991b1b' : '#92400e', flex: 1 }}>
                        On Break{(fs.performance?.today_break_seconds || 0) > 3600 ? ' 🔴' : ''}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (fs.performance?.today_break_seconds || 0) > 3600 ? '#dc2626' : '#d97706', fontVariantNumeric: 'tabular-nums' }}>
                        {fs.computed?.break_duration_seconds != null ? fmt(fs.computed.break_duration_seconds) : (fs.break_started_at ? fmt(Math.floor((Date.now() - new Date(fs.break_started_at).getTime()) / 1000)) : '00:00')}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, color: 'var(--ink-soft)' }}>
                  <span> <strong style={{ color: 'var(--ink)' }}>{fs.performance?.today_calls || 0}</strong></span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>Talk: <strong style={{ color: 'var(--ink)' }}>{fmt(fs.performance?.today_talk_seconds || 0)}</strong></span>
                  {(fs.performance?.today_skipped || 0) > 0 && (
                    <>
                      <span> <strong style={{ color: '#d97706' }}>{fs.performance?.today_skipped}</strong></span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>Idle: <strong style={{ color: '#d97706' }}>{fmt(fs.performance?.today_idle_seconds || 0)}</strong></span>
                    </>
                  )}
                  {(fs.performance?.today_break_seconds || 0) > 0 && (
                    <><span style={{ fontSize: 12 }}></span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>Break: <strong style={{ color: (fs.performance?.today_break_seconds || 0) > 3600 ? '#dc2626' : '#d97706' }}>{fmt(fs.performance?.today_break_seconds || 0)}</strong>{(fs.performance?.today_break_seconds || 0) > 3600 && ' 🔴'}</span></>
                  )}
                  {productivity !== null && (
                    <span style={{ color: productivity < 50 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                      {productivity}% prod.
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>
                  Last seen: {fs.updated_at ? new Date(fs.updated_at).toLocaleTimeString('en-IN') : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedFro && <FroDetailModal fro={selectedFro} onClose={() => setSelectedFro(null)} onShowDeep={() => setDeepFro(selectedFro)} />}
      {deepFro && <FroDeepDetailModal fro={deepFro} onClose={() => setDeepFro(null)} />}
    </div>
  )
}

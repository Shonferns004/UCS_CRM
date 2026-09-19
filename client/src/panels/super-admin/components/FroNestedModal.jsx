import { useState, useEffect } from 'react'
import { fmt, STATUS_META, StatBox } from './froShared'

const MINT = '#8CCDA4'
const MINT_DEEP = '#2A6B45'
const MINT_LIGHT = '#EAF7EE'
const PRIMARY = '#1F332B'

function FroNestedDetail({ fro }) {
  if (!fro) return null
  const meta = STATUS_META[fro.status] || STATUS_META.offline
  const workerName = fro.worker?.name || 'Unknown'
  const totalActive = (fro.performance?.today_talk_seconds || 0) + (fro.performance?.today_idle_seconds || 0)
  const productivity = totalActive > 0 ? Math.round(((fro.performance?.today_talk_seconds || 0) / totalActive) * 100) : 0
  const callTimer = fro.status === 'on_call' && (fro.computed?.call_duration_seconds != null ? fmt(fro.computed.call_duration_seconds) : null)
  const breakTimer = fro.status === 'break' && (fro.computed?.break_duration_seconds != null ? fmt(fro.computed.break_duration_seconds) : null)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
            {workerName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: PRIMARY }}>{workerName}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{fro.worker?.login_id || ''} · {fro.worker?.ngo_name || ''}</div>
          </div>
        </div>
        <div style={{ padding: '5px 14px', borderRadius: 99, background: meta.bg, border: `1px solid ${meta.border}` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: meta.color }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
            {meta.label}
          </span>
        </div>
      </div>
      {fro.status === 'on_call' && callTimer && (
        <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#dc2626' }}>call</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', flex: 1 }}>{fro.current_donor_name || 'On Call'}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{callTimer}</span>
        </div>
      )}
      {fro.status === 'break' && breakTimer && (
        <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fefce8', border: '1px solid #fde68a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#d97706' }}>free_breakfast</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', flex: 1 }}>Break</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{breakTimer}</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Today Collection</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#059669', lineHeight: 1.2 }}>₹{Number(fro.performance?.today_collection || 0).toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: '#fefce8', borderRadius: 10, padding: '12px 14px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Data Used</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', lineHeight: 1.2 }}>{fro.performance?.data_used || 0} <span style={{ fontSize: 12, fontWeight: 600 }}>MB</span></div>
        </div>
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Today Calls</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', lineHeight: 1.2 }}>{fro.performance?.today_calls || 0}</div>
        </div>
        <div style={{ background: '#faf5ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e9d5ff' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Leads</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed', lineHeight: 1.2 }}>{fro.performance?.today_skipped || 0}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <StatBox label="Talk Time" value={fmt(fro.performance?.today_talk_seconds || 0)} icon="" />
        <StatBox label="Idle" value={fmt(fro.performance?.today_idle_seconds || 0)} icon="" />
        <StatBox label="Break" value={fmt(fro.performance?.today_break_seconds || 0)} icon="" />
        <StatBox label="Productivity" value={`${productivity}%`} icon="" />
      </div>
      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 10, textAlign: 'center' }}>
        Last seen: {fro.updated_at ? new Date(fro.updated_at).toLocaleTimeString('en-IN') : '—'}
      </div>
    </>
  )
}

export function FroNestedModal({ froList, onClose }) {
  const [selId, setSelId] = useState(null)
  const validList = Array.isArray(froList) ? froList : []
  const selected = selId ? validList.find(f => f && f.id === selId) : (validList[0] || null)
  useEffect(() => { if (validList.length > 0 && !selId) setSelId(validList[0].id) }, [validList])
  return (
    <div className="nd-modal-overlay" onClick={onClose}>
      <div className="nd-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 880, height: '80vh', maxHeight: 700, display: 'flex', flexDirection: 'column' }}>
        <div className="nd-modal-head" style={{ borderColor: `${MINT}50`, flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ color: MINT_DEEP, fontSize: 22 }}>groups</span>
          <h3 className="nd-modal-title">FRO Live Detail</h3>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            {validList.filter(f => f && (f.status === 'online' || f.status === 'on_call')).length}/{validList.length} active
          </span>
          <button className="nd-modal-close" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 280, borderRight: '1px solid #EAF3EC', overflowY: 'auto', flexShrink: 0 }}>
            {validList.map(f => {
              if (!f) return null
              const m = STATUS_META[f.status] || STATUS_META.offline
              const nm = f.worker?.name || f.worker?.login_id || 'Unknown'
              const init = nm.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
              const isSel = f.id === selId
              return (
                <div key={f.id} onClick={() => setSelId(f.id)} style={{
                  padding: '10px 12px', cursor: 'pointer',
                  borderLeft: `3px solid ${isSel ? m.color : 'transparent'}`,
                  background: isSel ? MINT_LIGHT : 'transparent',
                  borderBottom: '1px solid #F0F7F2', transition: 'background 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{init}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: PRIMARY }}>{nm}</div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{f.worker?.login_id || ''}</div>
                    </div>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 9, color: '#64748b', paddingLeft: 38 }}>
                    <span>₹{Number(f.performance?.today_collection || 0).toLocaleString('en-IN')}</span>
                    <span>{f.performance?.today_calls || 0}</span>
                    <span>{f.performance?.data_used || 0}MB</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <FroNestedDetail key={selected?.id} fro={selected} />
          </div>
        </div>
      </div>
    </div>
  )
}

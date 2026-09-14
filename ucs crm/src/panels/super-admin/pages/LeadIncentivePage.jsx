import { useState, useCallback, useEffect } from 'react'
import { api } from '../../../api/auth'
import { useRealtime } from '../../../hooks/useRealtime'
import LeadIncentive from '../../../components/LeadIncentive'

const fmt = (n) => {
  const v = Number(n)
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN')
}

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const fmtDay = (d) => {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

const TabBtn = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: '9px 18px', borderRadius: 999, border: '1.5px solid var(--line)',
    background: active ? 'var(--ink)' : 'var(--card-bg)',
    color: active ? '#fff' : 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  }}>{children}</button>
)

const btnStyle = (bg = 'var(--ink)', fg = '#fff') => ({
  padding: '7px 14px', borderRadius: 9, border: 'none', background: bg, color: fg,
  fontWeight: 700, fontSize: 12, cursor: 'pointer',
})

const statStyle = {
  borderRadius: 10, padding: '9px 12px', background: 'var(--bg)',
  border: '1.5px solid var(--line)', textAlign: 'center', minWidth: 92, flex: 1,
}

export default function LeadIncentivePage() {
  const [tab, setTab] = useState('live')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const loadHistory = useCallback(() => {
    api('/incentive/lead/champion/history', { _prefix: 'ucs' })
      .then(h => setHistory(Array.isArray(h) ? h : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useRealtime('lead_champion_announcements', { event: '*', onInsert: loadHistory, onUpdate: loadHistory, onDelete: loadHistory })
  useEffect(() => {
    const t = setInterval(loadHistory, 20000)
    return () => clearInterval(t)
  }, [loadHistory])

  const removeAnnouncement = async (row) => {
    if (busyId) return
    if (!window.confirm(
      `Stop this lead incentive competition NOW and delete it permanently?\n` +
      `Champion: ${row.fro_name} (${row.announcement_date || 'today'}).\n` +
      'This instantly removes the champion banner and FRO popup, and deletes the champion notification from every panel (FRO, Accounts, HR, Admin, Super Admin). This cannot be undone.'
    )) return
    setBusyId(row.id)
    try {
      await api(`/incentive/lead/champion/${row.id}`, { method: 'DELETE', _prefix: 'ucs' })
      loadHistory()
    } catch (e) {
      console.error(e)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <TabBtn active={tab === 'live'} onClick={() => setTab('live')}>🟢 Live</TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>📜 History ({history.length})</TabBtn>
      </div>

      {tab === 'live' ? <LeadIncentive /> : <HistoryList history={history} loading={loading} busyId={busyId} onDelete={removeAnnouncement} />}
    </div>
  )
}

function HistoryList({ history, loading, busyId, onDelete }) {
  // Per-date leaderboard (fetched once per date from the live daily summary).
  const [openDate, setOpenDate] = useState(null)
  const [lbCache, setLbCache] = useState({})

  useEffect(() => {
    if (!openDate || lbCache[openDate] !== undefined) return
    let alive = true
    api(`/incentive/lead/lead-summary?date=${openDate}`, { _prefix: 'ucs' })
      .then(r => { if (alive) setLbCache(p => ({ ...p, [openDate]: Array.isArray(r?.fros) ? r.fros : [] })) })
      .catch(() => { if (alive) setLbCache(p => ({ ...p, [openDate]: [] })) })
    return () => { alive = false }
  }, [openDate, lbCache])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>Loading history…</div>
  }

  if (history.length === 0) {
    return (
      <div style={{
        padding: 48, textAlign: 'center', borderRadius: 16, border: '1.5px dashed var(--line)',
        color: 'var(--ink-soft)', fontSize: 13, background: 'var(--card-bg)',
      }}>
        No champion announcements yet — announce the first one in the Live tab!
      </div>
    )
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const liveRows = history.filter(r => String(r.announcement_date).slice(0, 10) === todayStr)
  const anyLive = liveRows.length > 0

  return (
    <>
      <style>{pulseStyle}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14,
        background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px solid #22c55e',
      }}>
        <span style={{ fontSize: 16 }}>🔴</span>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>
          <b>LIVE NOW:</b> {anyLive
            ? `🏆 ${liveRows.length} range champion${liveRows.length > 1 ? 's' : ''} active on every panel today — ${liveRows.map(r => `${r.fro_name}${r.slab_label ? ` (${r.slab_label})` : ''}`).join(', ')}`
            : 'Today has no live range-champion announcement yet'}
        </div>
      </div>
      {history.map(row => {
        const isLive = String(row.announcement_date).slice(0, 10) === todayStr
        const champIds = history
          .filter(h => String(h.announcement_date).slice(0, 10) === String(row.announcement_date).slice(0, 10))
          .map(h => h.fro_worker_id)
        return (
        <div key={row.id} style={{
          border: isLive ? '2px solid #22c55e' : '1.5px solid var(--line)',
          borderRadius: 16, padding: 18, background: isLive ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'var(--card-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{row.fro_name}</span>
                {isLive && (
                  <span style={{
                    padding: '4px 12px', borderRadius: 999, background: '#22c55e', color: '#fff',
                    fontSize: 11, fontWeight: 900, letterSpacing: .5, whiteSpace: 'nowrap', animation: 'li-pulse 1.4s ease-in-out infinite',
                  }}>● LIVE NOW</span>
                )}
                {row.slab_label && (
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: '#fff7ed', color: '#c2410c' }}>
                    {row.slab_label}
                  </span>
                )}
                <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: '#fef3c7', color: '#b45309' }}>
                  {fmtDay(row.announcement_date)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                Announced {fmtDate(row.created_at || row.announced_at)}
              </div>
            </div>
            <button
              onClick={() => onDelete(row)}
              disabled={busyId === row.id}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fef2f2',
                color: '#b91c1c', fontSize: 12, fontWeight: 800, cursor: busyId === row.id ? 'wait' : 'pointer',
              }}
            >
              {busyId === row.id ? 'Deleting…' : '🗑 Hard Delete'}
            </button>
            <button
              onClick={() => setOpenDate(openDate === row.announcement_date ? null : row.announcement_date)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fcd34d', background: '#fffbeb',
                color: '#b45309', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {openDate === row.announcement_date ? '📊 Close Leaderboard' : '📊 Leaderboard'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {stat('Qualified Leads', row.qualified_leads, '#16a34a')}
            {stat('Amount', `₹${fmt(row.total_amount)}`)}
            {stat('Lead Inc.', `₹${fmt(row.lead_incentive)}`)}
            {stat('Slab Bonus', `₹${fmt(row.slab_bonus)}`, '#b45309')}
            {stat('Champion', `₹${fmt(row.champion_bonus)}`, '#f59e0b')}
            {stat('Total', `₹${fmt(row.total_incentive)}`, '#b45309')}
          </div>

          {row.message ? (
            <div style={{
              padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#fffdf5,#fef3c7)',
              border: '1.5px solid #fde68a', fontSize: 13, lineHeight: 1.55, color: '#92400e', fontWeight: 600,
            }}>
              💬 {row.message}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No message attached</div>
          )}

          {openDate === row.announcement_date && (
            <LeaderboardPanel date={row.announcement_date} rows={lbCache[row.announcement_date] || []} champIds={champIds} />
          )}
        </div>
        )
      })}
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center' }}>
        <span style={{ color: '#16a34a', fontWeight: 800 }}>● LIVE NOW</span> = every range-champion announcement for today, shown on every panel. Deleting it removes the banner + FRO popup + notifications too.
      </div>
    </div>
    </>
  )
}

const pulseStyle = `
@keyframes li-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
`

const medals = ['🥇', '🥈', '🥉']

function LeaderboardPanel({ date, rows, champIds }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ border: '1.5px dashed var(--line)', borderRadius: 12, padding: 16, marginTop: 12, fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', background: 'var(--bg)' }}>
        No leaderboard data for {fmtDay(date)} (the day's standings are computed from verified leads)
      </div>
    )
  }
  return (
    <div style={{ border: '1px dashed #fcd34d', borderRadius: 12, marginTop: 12, overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg,#fff3d6,#fef3c7)', borderBottom: '1px dashed #fcd34d', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#92400e' }}>📊 Leaderboard · {fmtDay(date)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: '#b45309' }}>ranked by total incentive</span>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {rows.map((f, i) => {
          const isChamp = champIds.includes(f.fro_id)
          return (
            <div key={f.fro_id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              borderBottom: '1px solid var(--line)', background: isChamp ? '#dcfce7' : 'transparent',
            }}>
              <span style={{ width: 26, fontSize: 13, textAlign: 'center', flexShrink: 0 }}>
                {isChamp ? '🏆' : (medals[i] || <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{i + 1}</span>)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: isChamp ? 800 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.fro_name}
              </span>
              <span style={{ width: 96, fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.slab ? `₹${fmt(f.slab.min_amount)}–₹${fmt(f.slab.max_amount)}` : '—'}
              </span>
              <span style={{ width: 44, fontSize: 11.5, fontWeight: 700, color: '#16a34a', textAlign: 'center', flexShrink: 0 }}>{f.qualified_leads || 0} ✓</span>
              <span style={{ width: 82, fontSize: 12, fontWeight: 700, color: '#b45309', textAlign: 'right', flexShrink: 0 }}>₹{fmt(f.total_incentive)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function stat(label, value, color) {
  return (
    <div style={statStyle}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: color || 'var(--ink)', marginTop: 3 }}>{value}</div>
    </div>
  )
}
import { useState, useCallback, useEffect } from 'react'
import { api } from '../../../api/auth'
import { useRealtime } from '../../../hooks/useRealtime'
import { toast } from '../../../components/Toast'
import LeadIncentive from '../../../components/LeadIncentive'

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  const [confirmDel, setConfirmDel] = useState(null)

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
    setBusyId(row.id)
    setConfirmDel(null)
    try {
      await api(`/incentive/lead/champion/${row.id}`, { method: 'DELETE', _prefix: 'ucs' })
      toast(`Competition ended & removed everywhere`, 'success')
      loadHistory()
    } catch (e) {
      toast(e.message || 'Failed to stop this competition', 'error')
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

      {tab === 'live' ? <LeadIncentive /> : (
        <>
          <LiveCompetitionsStrip />
          <HistoryList history={history} loading={loading} busyId={busyId} onDelete={row => setConfirmDel(row)} />
        </>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Stop this competition NOW?"
          body={`Champion: ${confirmDel.fro_name} (${confirmDel.announcement_date || 'today'}).`}
          note="This instantly removes the champion banner and FRO popup, and deletes the champion notification from every panel (FRO, Accounts, HR, Admin, Super Admin). This cannot be undone."
          confirmLabel={busyId === confirmDel.id ? 'Stopping…' : 'Yes, Stop it'}
          busy={busyId === confirmDel.id}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => removeAnnouncement(confirmDel)}
        />
      )}
    </div>
  )
}

// Proper in-app confirmation dialog (no browser alert/confirm popup).
function ConfirmDialog({ title, body, note, confirmLabel = 'Yes, do it', busy = false, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998, background: 'rgba(15,23,42,.55)',
      backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(420px, 100%)', borderRadius: 16, overflow: 'hidden',
        background: 'var(--card-bg)', boxShadow: '0 24px 60px rgba(0,0,0,.35)',
        animation: 'toast-in .25s ease',
      }}>
        <div style={{
          padding: '14px 18px', background: 'linear-gradient(135deg,#7f1d1d,#dc2626)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⏹</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{title}</div>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{body}</div>
          {note && (
            <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-soft)', background: 'var(--bg)', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>{note}</div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={onCancel} disabled={busy} style={{
              flex: 1, padding: '11px 16px', borderRadius: 10, border: '1.5px solid var(--line)',
              background: 'var(--card-bg)', color: 'var(--ink)', fontWeight: 700, fontSize: 13.5,
              cursor: busy ? 'wait' : 'pointer',
            }}>
              Cancel
            </button>
            <button onClick={onConfirm} disabled={busy} style={{
              flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(90deg,#b91c1c,#dc2626)', color: '#fff',
              fontWeight: 800, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer',
            }}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Today's running range competitions with a per-range Stop/Delete button. A
// stopped range is hidden from FRO live view + its popups/banners removed
// everywhere — until the admin configures / applies a value / announces again.
function LiveCompetitionsStrip() {
  const [live, setLive] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [confirmSlab, setConfirmSlab] = useState(null)
  const [confirmAll, setConfirmAll] = useState(false)

  const load = useCallback(() => {
    const date = todayLocal()
    api(`/incentive/lead/leaderboard?date=${date}`, { _prefix: 'ucs' })
      .then(r => setLive(Array.isArray(r?.ranges) ? r : null))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime('lead_champion_announcements', { event: '*', onInsert: load, onUpdate: load, onDelete: load })
  useRealtime('incentive_slabs', { event: '*', onInsert: load, onUpdate: load, onDelete: load })
  useEffect(() => {
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const stopRange = async () => {
    const slab = confirmSlab
    if (!slab || busy) return
    setBusy(slab.slab_id)
    setError('')
    try {
      await api(`/incentive/lead/slabs/${slab.slab_id}/stop?date=${todayLocal()}`, { method: 'POST', _prefix: 'ucs' })
      toast(`⏹ ${slab.slab_label} competition stopped`, 'success')
      setConfirmSlab(null)
      load()
    } catch (e) {
      toast(e.message || 'Failed to stop this range', 'error')
    } finally {
      setBusy(null)
    }
  }

  const stopAllRanges = async () => {
    if (busy) return
    setBusy('all')
    setError('')
    try {
      const r = await api(`/incentive/lead/slabs/stop-all?date=${todayLocal()}`, { method: 'POST', _prefix: 'ucs' })
      toast(`⏹ All competitions stopped (${r?.stopped_slabs || 0} range(s))`, 'success')
      setConfirmAll(false)
      load()
    } catch (e) {
      toast(e.message || 'Failed to stop all ranges', 'error')
    } finally {
      setBusy(null)
    }
  }

  const ranges = Array.isArray(live?.ranges) ? live.ranges : []
  const liveCount = ranges.length

  return (
    <div style={{ border: '2px solid #f59e0b', borderRadius: 16, overflow: 'hidden', background: 'var(--card-bg)', marginBottom: 16 }}>
      <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg,#451a03,#b45309,#f59e0b)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🏆</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
            Lead Incentive · {liveCount} range{liveCount !== 1 ? 's' : ''} live
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>
            First FRO to hit a range's Minimum Lead Amount (by verified time) wins that range
          </div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 900, letterSpacing: .5, whiteSpace: 'nowrap', animation: 'li-pulse 1.4s ease-in-out infinite' }}>● LIVE NOW</span>
        {liveCount > 0 && (
          <button
            onClick={() => setConfirmAll(true)}
            disabled={busy === 'all'}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#7f1d1d',
              color: '#fff', fontSize: 12, fontWeight: 800, cursor: busy === 'all' ? 'wait' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {busy === 'all' ? '⏹ Stopping all…' : '🗑 Delete All'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 14px', background: '#fee2e2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>{error}</div>
      )}

      {ranges.length === 0 ? (
        <div style={{ padding: '18px 16px', fontSize: 12.5, color: 'var(--ink-soft)' }}>
          No live lead competition is running today. Configure ranges in the 🟢 Live tab (or Apply to All Ranges) to start one.
        </div>
      ) : (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ranges.map(r => {
            const leader = r.champion
              ? { name: r.champion.fro_name, won: true }
              : (r.fros && r.fros.length ? { name: r.fros[0].fro_name, won: false } : null)
            return (
              <div key={r.slab_id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
                borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', flex: '0 0 auto', minWidth: 100 }}>
                  {r.slab_label}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fff7ed', border: '1px solid #fcd34d', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  Min Lead ₹{fmt(r.min_lead_amount)}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  ₹{fmt(r.lead_rate)}/lead
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: leader?.won ? 800 : 600, color: leader?.won ? '#166534' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {leader ? `${leader.name}${leader.won ? ' 🏆' : ` · ${r.fros[0].qualified_leads} ✓`}` : '🏁 no lead yet'}
                </span>
                <button
                  onClick={() => setConfirmSlab({ slab_id: r.slab_id, slab_label: r.slab_label })}
                  disabled={busy === r.slab_id}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fef2f2',
                    color: '#b91c1c', fontSize: 11.5, fontWeight: 800, cursor: busy === r.slab_id ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {busy === r.slab_id ? '⏹ Stopping…' : '⏹ Stop Competition'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ padding: '8px 16px', borderTop: '1px dashed var(--line)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center' }}>
        Stopping a range removes it from the FRO live view + clears its popups everywhere for today. Reconfigure it (or Apply to All Ranges) to restart.
      </div>

      {confirmSlab && (
        <ConfirmDialog
          title="Stop this competition NOW?"
          body={`Range: ${confirmSlab.slab_label}.`}
          note="This hides the range from the FRO leaderboard for today, deletes its champion banner/popups, and clears its rule notifications from every panel. The range stays configured — configure it or Apply to All Ranges to restart."
          confirmLabel="⏹ Yes, Stop it"
          busy={busy === confirmSlab.slab_id}
          onCancel={() => setConfirmSlab(null)}
          onConfirm={stopRange}
        />
      )}

      {confirmAll && (
        <ConfirmDialog
          title="Stop ALL competitions NOW?"
          body={`${liveCount} range(s) are live today.`}
          note="This hides every range from the FRO leaderboard for today, deletes all champion banners/popups, and clears all rule notifications from every panel. Ranges stay configured — configure any range or Apply to All Ranges to restart."
          confirmLabel="🗑 Yes, Delete All"
          busy={busy === 'all'}
          onCancel={() => setConfirmAll(false)}
          onConfirm={stopAllRanges}
        />
      )}
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

  const todayStr = todayLocal()
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
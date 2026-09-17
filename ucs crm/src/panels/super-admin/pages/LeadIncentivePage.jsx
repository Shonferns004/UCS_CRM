import { useState, useCallback, useEffect, useRef } from 'react'
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
          padding: '14px 18px', background: '#7f1d1d',
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
              background: '#b91c1c', color: '#fff',
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
    api(`/incentive/lead/leaderboard?date=${date}&includeWon=1`, { _prefix: 'ucs' })
      .then(r => setLive(Array.isArray(r?.ranges) ? r : null))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime('lead_champion_announcements', { event: '*', onInsert: load, onUpdate: load, onDelete: load })
  useRealtime('incentive_slabs', { event: '*', onInsert: load, onUpdate: load, onDelete: load })
  useRealtime('fro_donor_logs', { event: '*', onInsert: load, onUpdate: load, onDelete: load })
  useEffect(() => {
    const t = setInterval(load, 5000)
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
      <div style={{ padding: '12px 16px', background: '#b45309', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🏆</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
            Lead Incentive · {liveCount} range{liveCount !== 1 ? 's' : ''} live
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>
            First FRO to collect the range's Win On amount wins the flat prize
          </div>
        </div>
        {liveCount > 0
          ? <span style={{ padding: '4px 12px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 900, letterSpacing: .5, whiteSpace: 'nowrap', animation: 'li-pulse 1.4s ease-in-out infinite' }}>● LIVE NOW</span>
          : <span style={{ padding: '4px 12px', borderRadius: 999, background: 'rgba(255,255,255,.18)', color: '#ffe4b8', fontSize: 11, fontWeight: 900, letterSpacing: .5, whiteSpace: 'nowrap' }}>● NO LIVE RANGE</span>}
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
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ranges.map(r => {
            const leader = r.champion
              ? { name: r.champion.fro_name, won: true }
              : (r.fros && r.fros.length ? { name: r.fros[0].fro_name, won: false } : null)
            const ranked = (r.fros || []).slice(0, 5)
            return (
              <div key={r.slab_id} style={{
                borderRadius: 12, border: r.champion ? '2px solid #22c55e' : '1.5px solid var(--line)',
                background: r.champion ? '#f0fdf4' : 'var(--bg)', overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', flex: '0 0 auto' }}>
                    {r.slab_label}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fff7ed', border: '1px solid #fcd34d', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    🎯 Win On ₹{fmt(r.amount_to_win ?? 1500)}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    🏆 Prize ₹{fmt(r.incentive_amount ?? 0)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: leader?.won ? 800 : 600, color: leader?.won ? '#166534' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.champion
                      ? `🏆 Winner: ${r.champion.fro_name}`
                      : (leader ? `${leader.name} leading · ₹${fmt(r.fros[0].total_amount || 0)}` : '🏁 no lead yet')}
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

                {r.champion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', background: 'rgba(255,255,255,.65)', borderTop: '1px dashed #bbf7d0' }}>
                    <Avatar url={r.champion.photo_url} name={r.champion.fro_name} size={24} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.champion.fro_name}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>₹{fmt(r.champion.crossing_amount ?? r.champion.hit_amount ?? r.champion.total_amount)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>{r.champion.qualified_leads || 0} ✓</span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: '#166534' }}>🏆 Won +₹{fmt(r.champion.slab_bonus || r.champion.total_incentive || 0)}</span>
                  </div>
                )}

                {!r.champion && ranked.length > 0 && (
                  <div style={{ borderTop: '1px dashed var(--line)', padding: '4px 11px 8px' }}>
                    {ranked.map((f, i) => (
                      <div key={f.fro_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                        <span style={{ width: 18, fontSize: 11, textAlign: 'center', flexShrink: 0, fontWeight: 800, color: 'var(--ink-soft)' }}>
                          {['🥇', '🥈', '🥉'][i] || (i + 1)}
                        </span>
                        <Avatar url={f.photo_url} name={f.fro_name} size={20} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: f.is_winner ? 800 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.fro_name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', flexShrink: 0 }}>₹{fmt(f.total_amount)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>{f.qualified_leads} ✓</span>
                      </div>
                    ))}
                  </div>
                )}
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

  // Auto-open the leaderboard for the most recent date (today if live) so the
  // Top 5 persons + their leads are always visible in History without clicks.
  useEffect(() => {
    if (openDate || history.length === 0) return
    const today = todayLocal()
    const liveToday = history.some(r => String(r.announcement_date).slice(0, 10) === today)
    const latest = liveToday
      ? today
      : String([...history].sort((a, b) => String(b.announcement_date).localeCompare(String(a.announcement_date)))[0]?.announcement_date || '').slice(0, 10)
    if (latest) setOpenDate(latest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, openDate])

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
        background: '#f0fdf4', border: '2px solid #22c55e',
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
          borderRadius: 16, padding: 18, background: isLive ? '#f0fdf4' : 'var(--card-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <Avatar
                  url={(lbCache[row.announcement_date] || []).find(f => champIds.includes(f.fro_id))?.photo_url}
                  name={row.fro_name}
                  size={30}
                />
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
            {stat('Amount', `₹${fmt(row.total_amount)}`)}
            {stat('Verified Leads', row.qualified_leads || 0, '#16a34a')}
            {stat('Prize', `₹${fmt(row.slab_bonus || row.total_incentive || 0)}`, '#16a34a')}
          </div>

          {row.message ? (
            <div style={{
              padding: '10px 14px', borderRadius: 10, background: '#fffdf5',
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

const initialsOf = (name) => String(name || 'F')
  .split(' ')
  .slice(0, 2)
  .map(s => s[0]).join('').toUpperCase()

function Avatar({ url, name, size = 34 }) {
  const [err, setErr] = useState(false)
  useEffect(() => { setErr(false) }, [url])
  if (url && !err) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        border: '2px solid #f59e0b', background: 'var(--bg)',
      }}>
        <img src={url} alt={name} onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#b45309', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, border: '2px solid #fbbf24',
    }}>{initialsOf(name)}</div>
  )
}

function LeaderboardPanel({ date, rows, champIds }) {
  const [limit, setLimit] = useState(5)
  const [collapsed, setCollapsed] = useState({})
  const [leadsCache, setLeadsCache] = useState({})
  const [loadingIds, setLoadingIds] = useState({})
  const loadedRef = useRef({})

  // Auto-load + show every visible (top 5) person's individual leads so the
  // winner's leads are visible right away — from the competition start window.
  useEffect(() => {
    const need = (rows || []).slice(0, limit).filter(f => loadedRef.current[f.fro_id] !== true)
    if (need.length === 0) return
    let alive = true
    setLoadingIds(p => {
      const n = { ...p }
      for (const f of need) n[f.fro_id] = true
      return n
    })
    Promise.all(need.map(f =>
      api(`/incentive/lead/lead-summary/fro/${f.fro_id}?date=${date}`, { _prefix: 'ucs' })
        .then(d => { if (alive) setLeadsCache(p => ({ ...p, [f.fro_id]: d || null })) })
        .catch(() => { if (alive) setLeadsCache(p => ({ ...p, [f.fro_id]: null })) })
        .finally(() => {
          loadedRef.current[f.fro_id] = true
          if (alive) setLoadingIds(p => { const n = { ...p }; delete n[f.fro_id]; return n })
        })
    ))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, rows.length, limit])

  if (!rows || rows.length === 0) {
    return (
      <div style={{ border: '1.5px dashed var(--line)', borderRadius: 12, padding: 16, marginTop: 12, fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', background: 'var(--bg)' }}>
        No leaderboard data for {fmtDay(date)} (the day's standings are computed from verified leads)
      </div>
    )
  }

  const visible = rows.slice(0, limit)
  const showAll = limit >= rows.length
  const champ = rows.find(f => champIds.includes(f.fro_id)) || null

  return (
    <div style={{ border: '1px dashed #fcd34d', borderRadius: 12, marginTop: 12, overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ padding: '8px 12px', background: '#fff3d6', borderBottom: '1px dashed #fcd34d', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#92400e' }}>📊 Top {visible.length} · {fmtDay(date)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: '#b45309' }}>every person's verified leads · from competition start</span>
      </div>

      {champ && (
        <div style={{ padding: '10px 14px', borderBottom: '1px dashed #fcd34d', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Avatar url={champ.photo_url} name={champ.fro_name} size={46} />
            <span style={{ position: 'absolute', bottom: -4, right: -6, fontSize: 18 }}>👑</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#166534' }}>🏆 Winner · {champ.fro_name}</div>
            <div style={{ fontSize: 11.5, color: '#15803d', marginTop: 2 }}>
              First FRO to collect the range's Win On amount wins the flat prize! Won +₹{fmt(champ.slab_bonus || champ.incentive_amount || champ.total_incentive || 0)}
            </div>
          </div>
          {champ.photo_url && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#166534' }}>+₹{fmt(champ.slab_bonus || champ.incentive_amount || champ.total_incentive || 0)}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a' }}>{champ.qualified_leads} collected ✓</span>
            </div>
          )}
        </div>
      )}

      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {visible.map((f, i) => (
          <LeaderboardRow
            key={f.fro_id}
            f={f}
            rank={i}
            isChamp={champIds.includes(f.fro_id)}
            open={!collapsed[f.fro_id]}
            loading={!!loadingIds[f.fro_id]}
            detail={leadsCache[f.fro_id]}
            onToggle={() => setCollapsed(p => ({ ...p, [f.fro_id]: !p[f.fro_id] }))}
          />
        ))}
      </div>
      {(rows.length > 5) && (
        <div style={{ padding: 8, borderTop: '1px dashed #fcd34d' }}>
          <button
            onClick={() => setLimit(showAll ? 5 : rows.length)}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 9, border: '1.5px solid #fcd34d',
              background: '#fffbeb', color: '#b45309', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            }}
          >
            {showAll ? '↑ Show top 5' : `↓ Show all (${rows.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

function LeaderboardRow({ f, rank, isChamp, open, loading, detail, onToggle }) {
  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: isChamp ? '#f0fdf4' : 'transparent' }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
      }}>
        <span style={{ width: 26, fontSize: 13, textAlign: 'center', flexShrink: 0 }}>
          {isChamp ? '🏆' : (medals[rank] || <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{rank + 1}</span>)}
        </span>
        <Avatar url={f.photo_url} name={f.fro_name} size={26} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: isChamp ? 800 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.fro_name}{isChamp ? ' 🏆' : ''}
        </span>
        <span style={{ width: 96, fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.slab ? `₹${fmt(f.slab.min_amount)}–₹${fmt(f.slab.max_amount)}` : '—'}
        </span>
        <span style={{ width: 44, fontSize: 11.5, fontWeight: 700, color: '#16a34a', textAlign: 'center', flexShrink: 0 }}>{f.qualified_leads || 0} ✓</span>
        {isChamp ? (
          <span style={{ width: 82, fontSize: 11.5, fontWeight: 800, color: '#166534', textAlign: 'right', flexShrink: 0 }}>🏆 Won +₹{fmt(f.slab_bonus || f.total_incentive || 0)}</span>
        ) : (
          <span style={{ width: 82, flexShrink: 0 }} />
        )}
        <span style={{ width: 18, textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '2px 12px 12px', borderTop: '1px dashed var(--line)' }}>
          {loading ? (
            <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>Loading {f.fro_name}'s leads…</div>
          ) : detail ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>
                {stat('Amount', `₹${fmt(detail.total_amount)}`)}
                {stat('Win On', `🎯 ₹${fmt(detail.amount_to_win ?? 1500)}`, '#b45309')}
                {stat('Prize', `₹${fmt(detail.slab_bonus || detail.incentive_amount || 0)}`, detail.slab_bonus > 0 ? '#16a34a' : '#b45309')}
              </div>
              {(detail.leads || []).length > 0 ? (
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg)', borderBottom: '1px solid var(--line)', fontSize: 10.5, fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>
                    <span style={{ width: 18 }} />
                    <span style={{ flex: 1 }}>Donor</span>
                    <span style={{ width: 84, textAlign: 'right' }}>Amount</span>
                    <span style={{ width: 40, textAlign: 'right' }}></span>
                  </div>
                  {(detail.leads || []).map((l, k) => (
                    <div key={l.id || k} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                      borderBottom: '1px solid var(--line)', background: l.qualified ? 'rgba(220,252,231,.35)' : 'transparent',
                      fontSize: 12,
                    }}>
                      <span style={{ width: 18, textAlign: 'center', fontWeight: 800, color: l.qualified ? '#16a34a' : '#94a3b8', flexShrink: 0 }}>{l.qualified ? '✓' : '✗'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.donor_name || `Donor ${l.donor_id || '—'}`}
                        {l.donor_mobile ? ` · ${l.donor_mobile}` : ''}
                      </span>
                      <span style={{ width: 84, textAlign: 'right', fontWeight: 800, color: l.qualified ? '#16a34a' : 'var(--ink-soft)', flexShrink: 0 }}>₹{fmt(l.amount)}</span>
                      <span style={{ width: 96, textAlign: 'right', fontSize: 11, color: 'var(--ink-soft)', flexShrink: 0 }}>{fmtDate(l.verified_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                  No leads inside this competition's window for {f.fro_name}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: '#b91c1c' }}>Failed to load this FRO's leads</div>
          )}
        </div>
      )}
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
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../api/auth'
import { ChartBar, ArrowsClockwise, GearSix, Stack, CaretRight, Plus, X, Trophy, Users, CalendarBlank, FileText } from '@phosphor-icons/react'

const fmt = (n) => {
  const v = Number(n)
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN')
}

// Value for <input type="datetime-local"> (no seconds, local time).
const toLocalInput = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

// Absolute UTC ISO for a filled datetime-local value so the backend stores the
// exact instant the admin picked regardless of its own timezone. Blank → null.
const toIso = (v) => (v ? new Date(v).toISOString() : null)

const pad2 = (n) => String(n).padStart(2, '0')
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const fmtSlabRange = (s) => `₹${fmt(s.min_amount)} – ₹${fmt(s.max_amount)}`

// A stale DB could hold duplicate rows for the same (min, max) range, which would
// make the UI list every range twice. Keep a single row per range — preferring an
// active one — so the screen never shows "double" ranges.
const uniqueByRange = (rows) => {
  const map = new Map()
  for (const s of rows || []) {
    const key = `${Number(s.min_amount)}-${Number(s.max_amount)}`
    const cur = map.get(key)
    if (!cur || (!cur.is_active && s.is_active)) map.set(key, s)
  }
  return [...map.values()]
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)',
  fontSize: 13.5, outline: 'none',
}

const btnStyle = (bg = 'var(--ink)', fg = '#fff') => ({
  padding: '8px 16px', borderRadius: 10, border: 'none', background: bg, color: fg,
  fontWeight: 700, fontSize: 13, cursor: 'pointer',
})

const slabInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)',
  fontSize: 13, outline: 'none', textAlign: 'right',
}

// ─── Exact color tokens from the reference design ─────────
const C = {
  primary: '#1677E8',
  dark: '#12233F',
  muted: '#65758B',
  line: '#DCE7F5',
  panelBg: '#FFFFFF',
  pageBg: '#F7FAFE',
  green: '#18A957',
  greenBg: '#EAF9F0',
  end: '#F2A23A',
  endBg: '#FFF5DF',
  ns: '#6C8EBF',
  nsBg: '#F1F6FC',
}

const STATUS_META = {
  running: { label: 'Running', color: C.green, bg: C.greenBg, accent: C.green },
  ended: { label: 'Ended', color: '#B7791F', bg: C.endBg, accent: C.end },
  not_started: { label: 'Not Started', color: C.ns, bg: C.nsBg, accent: C.ns },
}

// Range live status based on its Start/End window + a possible winner today.
const rangeStatus = (slab, wonById) => {
  if (!slab) return 'not_started'
  if (wonById[slab?.id]) return 'ended'
  if (!slab.started_at) return 'not_started'
  const s = new Date(slab.started_at).getTime()
  if (Number.isNaN(s) || s > Date.now()) return 'not_started'
  if (slab.ended_at) {
    const e = new Date(slab.ended_at).getTime()
    if (!Number.isNaN(e) && e <= Date.now()) return 'ended'
  }
  if (slab.stopped_date && String(slab.stopped_date).slice(0, 10) === todayLocal()) return 'ended'
  return 'running'
}

const LI_CSS = `
.li-wrap { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-sizing: border-box; color: ${C.dark}; background: ${C.pageBg}; max-width: 100%; margin: -24px; padding: 16px 20px; }
@media (max-width: 820px) { .li-wrap { margin: -12px -16px -40px; padding: 12px 16px 40px; } }
@media (max-width: 480px) { .li-wrap { margin: -8px -12px -40px; padding: 8px 12px 40px; } }
.li-wrap *, .li-wrap *:before, .li-wrap *:after { box-sizing: border-box; }
.li-wrap img { max-width: 100%; }
.li-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.9fr); gap: 16px; align-items: start; max-width: 100%; }
.li-col { min-width: 0; max-width: 100%; }
.li-panel { background: ${C.panelBg}; border: 1px solid ${C.line}; border-radius: 12px; box-shadow: 0 2px 10px rgba(30,80,140,.05); overflow: hidden; max-width: 100%; }
.li-table-scroll { overflow-x: auto; max-width: 100%; }
.li-table { width: 100%; min-width: 720px; table-layout: fixed; border-collapse: collapse; }
.li-table th { padding: 9px 10px; font-size: 11px; font-weight: 700; color: #52698A; background: #F8FAFD; border-bottom: 1px solid #E5EDF7; white-space: nowrap; }
.li-table td { padding: 9px 10px; font-size: 13px; }
.li-table tbody tr { border-bottom: 1px solid #F2F6FB; transition: background .15s ease; }
.li-table tbody tr:last-child { border-bottom: none; }
.li-table tbody tr:hover { background: #F8FBFF; }
.li-configure { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E2EAF5; background: #fff; color: #52698A; font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s ease, color .15s ease, border-color .15s ease; }
.li-configure:hover { background: #F4F9FF; color: ${C.primary}; border-color: #CDE4FF; }
@keyframes li-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.li-shimmer { background: linear-gradient(90deg, #F2F6FB 25%, #E8EEF6 37%, #F2F6FB 63%); background-size: 800px 100%; animation: li-shimmer 1.2s ease-in-out infinite; border-radius: 6px; }
@keyframes li-rot { to { transform: rotate(360deg); } }
.li-spin { animation: li-rot .7s linear infinite; }
@media (max-width: 1199px) { .li-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 480px) { .li-panel-head { flex-direction: column; align-items: stretch; } }
`

// ─── Avatar ───────────────────────────────────────────────
const initialsOf = (name) => String(name || 'F')
  .split(' ')
  .slice(0, 2)
  .map(s => s[0]).join('').toUpperCase()

function Avatar({ url, name, size = 28 }) {
  const [err, setErr] = useState(false)
  useEffect(() => { setErr(false) }, [url])
  const box = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    border: '1.5px solid #EAF1FB', background: '#EAF1FB',
  }
  if (url && !err) {
    return (
      <img src={url} alt={name} onError={() => setErr(true)}
        style={{ ...box, objectFit: 'cover', display: 'block' }} />
    )
  }
  return (
    <div style={{ ...box, color: '#4473B8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 700 }}>
      {initialsOf(name)}
    </div>
  )
}

// ─── Status pill ──────────────────────────────────────────
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.not_started
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
      borderRadius: 999, background: m.bg, color: m.color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
      {m.label}
    </span>
  )
}

// ─── Compact horizontal progress bar ──────────────────────
function MiniBar({ pct, color }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: '#EDF2F7', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, height: '100%', borderRadius: 999, background: color || C.primary, transition: 'width .3s ease' }} />
    </div>
  )
}

const RANK_META = [
  { color: '#A9760C', bg: '#FDF1D6' },
  { color: '#5E6B7E', bg: '#EEF2F6' },
  { color: '#9A5A22', bg: '#FBEDDE' },
]

// ─── Leaderboard member row (top 3) ───────────────────────
function MemberRow({ f, i, r, onSelect }) {
  const pct = r.winOn > 0 ? Math.min(100, Math.round(((Number(f.total_amount) || 0) / r.winOn) * 100)) : 0
  const rank = RANK_META[i] || RANK_META[2]
  return (
    <button type="button"
      onClick={() => onSelect && onSelect(f.fro_id)}
      title={f.is_winner ? `${f.fro_name} — winner` : `View ${f.fro_name}'s leads`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px',
        border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        transition: 'background .15s ease',
      }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: rank.bg, color: rank.color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0,
      }}>{i + 1}</span>
      <Avatar url={f.photo_url} name={f.fro_name} size={28} />
      <span style={{
        flex: '1 1 0', minWidth: 0, fontSize: 12.5, fontWeight: f.is_winner ? 700 : 600,
        color: f.is_winner ? '#168A4E' : C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {f.fro_name}{f.is_winner ? ' 🏆' : ''}
      </span>
      <span style={{ flex: '0 1 auto', fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
        ₹{fmt(f.total_amount)} <span style={{ color: '#B9C8DC' }}>/ ₹{fmt(r.winOn)}</span>
      </span>
      <div style={{ flex: '0 1 58px', minWidth: 40 }}>
        <MiniBar pct={pct} />
      </div>
      <span style={{ flexShrink: 0, width: 34, textAlign: 'right', fontSize: 11, fontWeight: 600, color: C.dark }}>{pct}%</span>
    </button>
  )
}

// ─── Leaderboard card empty state (not started / no activity) ───
function LeaderboardEmpty({ status }) {
  const isNs = status === 'not_started'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '30px 16px' }}>
      <span style={{ width: 36, height: 36, borderRadius: '50%', background: C.nsBg, color: C.ns, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Users size={18} />
      </span>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.dark, marginTop: 8 }}>
        {isNs ? 'Leaderboard will be visible once the range starts' : 'No verified collections yet'}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
        Be the first to make verified collections!
      </div>
    </div>
  )
}

// ─── Right panel: per-range compact leaderboard card ──────
function RangeCard({ r, onViewAll, onSelectFro }) {
  const meta = STATUS_META[r.status] || STATUS_META.not_started
  return (
    <div style={{ border: `1px solid ${C.line}`, borderLeft: `3px solid ${meta.accent}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #F2F6FB' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.slab_label}
          </span>
          <StatusPill status={r.status} />
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, color: C.muted }}>
          Win On <b style={{ color: C.dark, fontWeight: 600 }}>₹{fmt(r.winOn)}</b>
          <span style={{ margin: '0 5px', color: '#B9C8DC' }}>|</span>
          Prize <b style={{ color: C.dark, fontWeight: 600 }}>₹{fmt(r.prize)}</b>
        </div>
      </div>

      {r.top3.length > 0 ? (
        <>
          <div style={{ padding: '6px 0' }}>
            {r.top3.map((f, i) => <MemberRow key={`${r.slab_id}-${f.fro_id}`} f={f} i={i} r={r} onSelect={onSelectFro} />)}
          </div>
          {r.totalCount > 3 && (
            <div style={{ padding: '4px 12px 10px', textAlign: 'right' }}>
              <button type="button" onClick={() => onViewAll && onViewAll(r)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: 0, color: C.primary, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                View All ({r.totalCount}) <CaretRight size={12} weight="bold" />
              </button>
            </div>
          )}
        </>
      ) : (
        <LeaderboardEmpty status={r.status} />
      )}
    </div>
  )
}

// ─── Left panel: Incentive Ranges ─────────────────────────
function IncentiveRangesPanel({ ranges, loading, onConfigure, onAdd }) {
  return (
    <div className="li-panel">
      <div className="li-panel-head" style={{ padding: 16, borderBottom: '1px solid #EEF2F8', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: '#E8F3FF', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Stack size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.dark }}>Incentive Ranges</div>
          <div style={{ fontSize: 12.5, color: '#6B7C93', marginTop: 1 }}>Configure each range with Win On target and prize amount</div>
        </div>
        <button type="button" onClick={onAdd}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: C.primary, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          <Plus size={15} weight="bold" /> Add Range
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '10px 16px 14px' }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', borderBottom: '1px solid #F2F6FB' }}>
              <div className="li-shimmer" style={{ width: 24, height: 12, flexShrink: 0 }} />
              <div className="li-shimmer" style={{ flex: 1, height: 12 }} />
              <div className="li-shimmer" style={{ width: 92, height: 20, borderRadius: 999, flexShrink: 0 }} />
              <div className="li-shimmer" style={{ width: 64, height: 12, flexShrink: 0 }} />
              <div className="li-shimmer" style={{ width: 56, height: 12, flexShrink: 0 }} />
              <div className="li-shimmer" style={{ width: 100, height: 8, flexShrink: 0 }} />
              <div className="li-shimmer" style={{ width: 82, height: 28, borderRadius: 8, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      ) : ranges.length === 0 ? (
        <div style={{ padding: '58px 20px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, margin: '0 auto 12px', borderRadius: '50%', background: C.nsBg, color: C.ns, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stack size={22} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>No incentive ranges yet</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>Create your first incentive range to start tracking collections.</div>
          <button type="button" onClick={onAdd}
            style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: C.primary, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={15} weight="bold" /> Add Range
          </button>
        </div>
      ) : (
        <div className="li-table-scroll">
          <table className="li-table">
            <colgroup>
              <col style={{ width: 34 }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 75 }} />
              <col style={{ width: 125 }} />
              <col style={{ width: 105 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>#</th>
                <th style={{ textAlign: 'left' }}>Range (₹)</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Win On (₹)</th>
                <th style={{ textAlign: 'right' }}>Prize (₹)</th>
                <th style={{ textAlign: 'center' }}>Progress</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {ranges.map(r => (
                <tr key={r.slab_id}>
                  <td style={{ color: C.muted, fontWeight: 600 }}>{r.idx}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: C.dark, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.slab_label}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}><StatusPill status={r.status} /></td>
                  <td style={{ textAlign: 'right', color: C.muted }}>₹{fmt(r.winOn)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: C.dark }}>₹{fmt(r.prize)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <MiniBar pct={r.progressPct} color={r.status === 'ended' ? C.end : C.primary} />
                      </div>
                      <span style={{ width: 38, flexShrink: 0, textAlign: 'right', fontSize: 11.5, fontWeight: 600, color: C.dark }}>{r.progressPct}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" className="li-configure" onClick={() => onConfigure(r.slab)}>
                      <GearSix size={13} /> Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Right panel: Live Leaderboard ────────────────────────
function LiveLeaderboardPanel({ ranges, loading, error, onRefresh, onViewAll, onSelectFro }) {
  return (
    <div className="li-panel">
      <div className="li-panel-head" style={{ padding: 16, borderBottom: '1px solid #EEF2F8', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF7E8', color: '#B7791F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Trophy size={18} weight="fill" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.dark }}>Live Leaderboard</div>
          <div style={{ fontSize: 12.5, color: '#6B7C93', marginTop: 1 }}>Top performers based on verified collections</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block' }} /> Live
        </span>
      </div>

      {error ? (
        <div style={{ padding: '54px 20px', textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: '50%', background: '#FEF2F2', color: '#E5484D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>!</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>Unable to load leaderboard</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Please refresh and try again.</div>
          <button type="button" onClick={onRefresh}
            style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <ArrowsClockwise size={14} /> Refresh
          </button>
        </div>
      ) : loading ? (
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="li-shimmer" style={{ height: 152, borderRadius: 12 }} />
          ))}
        </div>
      ) : ranges.length === 0 ? (
        <div style={{ padding: '54px 20px', textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: '50%', background: C.nsBg, color: C.ns, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={18} /></div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.dark }}>No incentive ranges configured yet</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Configure a range to start the competition.</div>
        </div>
      ) : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ranges.map(r => <RangeCard key={r.slab_id} r={r} onViewAll={onViewAll} onSelectFro={onSelectFro} />)}
        </div>
      )}
    </div>
  )
}

// ─── Configure Range modal ────────────────────────────────
function ConfigureRangeModal({ slab, saving, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    amount_to_win: slab.amount_to_win ?? '',
    incentive_amount: slab.incentive_amount ?? '',
    started_at: toLocalInput(slab.started_at),
    ended_at: toLocalInput(slab.ended_at),
  }))
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    const amount_to_win = Number(form.amount_to_win)
    if (!(amount_to_win > 0)) { setError('Enter a valid Win On amount (must be more than ₹0)'); return }
    const incentive_amount = Number(form.incentive_amount)
    if (!(incentive_amount > 0)) { setError('Enter a valid Prize amount (must be more than ₹0)'); return }
    const started_at = form.started_at
    const ended_at = form.ended_at
    if (started_at && ended_at && !(new Date(ended_at).getTime() > new Date(started_at).getTime())) {
      setError('End Time must be after Start Time'); return
    }
    try {
      await onSave({ amount_to_win, incentive_amount, started_at: started_at || null, ended_at: ended_at || null })
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to save')
    }
  }

  const field = (label, hint, extra) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>
        {label} {hint && <span style={{ fontWeight: 500, color: C.muted }}>{hint}</span>}
      </label>
      {extra}
    </div>
  )

  const inputBox = (value, onChange, prefix, placeholder, opts = {}) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', background: '#fff', border: '1px solid #DCE7F5', borderRadius: 10, transition: 'border-color .15s ease' }}>
      {prefix ? <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>₹</span> : null}
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
        {...(opts.step ? { step: opts.step } : {})}
      />
    </div>
  )

  const dateInput = (value, onChange, alt) => (
    <input
      type="datetime-local"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', height: 40, padding: '0 10px', border: '1px solid #DCE7F5', borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 600, color: C.dark, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
      {...(alt ? { placeholder: alt } : {})}
    />
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99992, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(18,35,63,.18)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEF2F8', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: '#E8F3FF', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><GearSix size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>Configure Incentive Range</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{fmtSlabRange(slab)}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} weight="bold" /></button>
        </div>

        <div style={{ padding: '18px 20px 0' }}>
          {error && (
            <div style={{ padding: '9px 12px', borderRadius: 8, background: '#FEF2F2', color: '#C0392B', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{error}</div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>Range</label>
            <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 12px', background: '#F8FAFD', border: '1px solid #E5EDF7', borderRadius: 10, color: C.muted, fontSize: 13.5, fontWeight: 600 }}>
              {fmtSlabRange(slab)}
            </div>
          </div>

          {field('Win On Target', '(₹) — total verified collection to win', inputBox(form.amount_to_win, v => setForm(p => ({ ...p, amount_to_win: v })), true, '1500'))}
          {field('Prize', '(₹) — flat payout to the winner', inputBox(form.incentive_amount, v => setForm(p => ({ ...p, incentive_amount: v })), true, '0'))}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>Start Time</label>
            {dateInput(form.started_at, v => setForm(p => ({ ...p, started_at: v })))}
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>Verified leads count for this range only after this moment · empty = not started</div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>End Time <span style={{ fontWeight: 500, color: C.muted }}>(optional — runs to end of day)</span></label>
            {dateInput(form.ended_at, v => setForm(p => ({ ...p, ended_at: v })))}
          </div>
        </div>

        <div style={{ padding: '14px 20px 18px', borderTop: '1px solid #EEF2F8', display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ flex: 1, height: 40, borderRadius: 10, border: '1px solid #DCE7F5', background: '#fff', color: '#52698A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving}
            style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: C.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Range modal ──────────────────────────────────────
function AddRangeModal({ saving, onAdd, onClose }) {
  const [form, setForm] = useState({ min_amount: '', max_amount: '', incentive_amount: '', amount_to_win: '' })
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!(Number(form.min_amount) >= 0) || !(Number(form.max_amount) > 0)) {
      setError('Enter valid Min and Max amounts'); return
    }
    if (Number(form.min_amount) >= Number(form.max_amount)) {
      setError('Min must be less than Max'); return
    }
    try {
      await onAdd(form)
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to add range')
    }
  }

  const money = (value, onChange, placeholder) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', background: '#fff', border: '1px solid #DCE7F5', borderRadius: 10 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>₹</span>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }} />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99992, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(18,35,63,.18)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEF2F8', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: '#E8F3FF', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Plus size={16} weight="bold" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>Add Range</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Create a new incentive range</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} weight="bold" /></button>
        </div>

        <div style={{ padding: '18px 20px 0' }}>
          {error && (
            <div style={{ padding: '9px 12px', borderRadius: 8, background: '#FEF2F2', color: '#C0392B', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{error}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>Min Amount</label>
              {money(form.min_amount, v => setForm(p => ({ ...p, min_amount: v })), '0')}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>Max Amount</label>
              {money(form.max_amount, v => setForm(p => ({ ...p, max_amount: v })), '50000')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, marginBottom: 4 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>Win On</label>
              {money(form.amount_to_win, v => setForm(p => ({ ...p, amount_to_win: v })), '1500')}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.dark, display: 'block', marginBottom: 6 }}>Prize</label>
              {money(form.incentive_amount, v => setForm(p => ({ ...p, incentive_amount: v })), '0')}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>After saving, use <b style={{ fontWeight: 600 }}>Configure</b> on the row to set Win On target, prize and the Start/End competition window.</div>
        </div>

        <div style={{ padding: '14px 20px 18px', borderTop: '1px solid #EEF2F8', marginTop: 18, display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ flex: 1, height: 40, borderRadius: 10, border: '1px solid #DCE7F5', background: '#fff', color: '#52698A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving}
            style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: C.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Adding…' : 'Add Range'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── View All modal: every FRO in a range ─────────────────
function ViewAllModal({ range, onSelectFro, onClose }) {
  const meta = STATUS_META[range.status] || STATUS_META.not_started
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99991, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(18,35,63,.18)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEF2F8', background: '#F8FAFD', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF7E8', color: '#B7791F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trophy size={16} weight="fill" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{range.slab_label}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Win On ₹{fmt(range.winOn)} <span style={{ margin: '0 4px' }}>|</span> Prize ₹{fmt(range.prize)}</div>
          </div>
          <StatusPill status={range.status} />
          <button type="button" onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} weight="bold" /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '10px 0' }}>
          {range.members.map((f, i) => (
            <button type="button" key={`${range.slab_id}-${f.fro_id}`} onClick={() => onSelectFro && onSelectFro(f.fro_id)}
              className="li-configure"
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: C.dark, borderBottom: '1px solid #F2F6FB', fontSize: 13 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: (RANK_META[i] || RANK_META[2]).bg, color: (RANK_META[i] || RANK_META[2]).color,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{i + 1}</span>
              <Avatar url={f.photo_url} name={f.fro_name} size={30} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: f.is_winner ? 700 : 600, color: f.is_winner ? '#168A4E' : C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.fro_name}
                {f.is_winner ? ' 🏆' : ''}
              </span>
              <span style={{ flexShrink: 0, fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>₹{fmt(f.total_amount)} <span style={{ color: '#B9C8DC' }}>/ ₹{fmt(range.winOn)}</span></span>
              <div style={{ flex: '0 1 80px', minWidth: 48 }}>
                <MiniBar pct={range.winOn > 0 ? Math.min(100, (Number(f.total_amount) || 0) / range.winOn * 100) : 0} />
              </div>
              <span style={{ flexShrink: 0, width: 38, textAlign: 'right', fontSize: 11.5, fontWeight: 600 }}>{range.winOn > 0 ? Math.min(100, Math.round((Number(f.total_amount) || 0) / range.winOn * 100)) : 0}%</span>
              <CaretRight size={13} color="#B9C8DC" style={{ flexShrink: 0 }} />
            </button>
          ))}
          <div style={{ padding: '10px 20px', fontSize: 11.5, color: C.muted, textAlign: 'center' }}>
            Click a person to view their verified leads.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Slab Config (Target Slabs modal) ─────────────────────
function SlabConfig({ slabs, onAdd, onUpdate, onDelete, saving, embedded = false }) {
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ min_amount: '', max_amount: '', incentive_amount: '', amount_to_win: '' })
  const [error, setError] = useState('')

  const startEdit = (slab) => {
    setEditing(slab.id)
    setAdding(false)
    setForm({ min_amount: slab.min_amount, max_amount: slab.max_amount, incentive_amount: slab.incentive_amount, amount_to_win: slab.amount_to_win })
    setError('')
  }

  const startAdd = () => {
    setAdding(true)
    setEditing(null)
    setForm({ min_amount: '', max_amount: '', incentive_amount: '', amount_to_win: '' })
    setError('')
  }

  const cancel = () => { setEditing(null); setAdding(false); setError('') }

  const submit = async () => {
    setError('')
    if (!(Number(form.min_amount) >= 0) || !(Number(form.max_amount) > 0)) { setError('Enter valid min and max amounts'); return }
    if (Number(form.min_amount) >= Number(form.max_amount)) { setError('Min must be less than max'); return }
    try {
      if (editing) { await onUpdate(editing, form) } else { await onAdd(form) }
      cancel()
    } catch (e) { setError(e.message || 'Failed') }
  }

  const fmtSlab = (n) => {
    const v = Number(n)
    if (v >= 100000) return `₹${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`
    if (v >= 1000) return `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`
    return `₹${v}`
  }

  return (
    <div style={embedded ? { display: 'flex', flexDirection: 'column', gap: 12 } : { border: '1.5px solid var(--line)', borderRadius: 16, padding: 20, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: embedded ? 4 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Target Slabs</div>
        </div>
        {!adding && !editing && <button onClick={startAdd} style={btnStyle('#1677E8')}>+ Add Slab</button>}
      </div>

      {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, marginBottom: 16, padding: 14, borderRadius: 12, border: '1.5px dashed #93c5fd', background: '#f0f7ff' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Min Amount (₹)</label>
            <input type="number" style={slabInputStyle} value={form.min_amount} onChange={e => setForm(p => ({ ...p, min_amount: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Max Amount (₹)</label>
            <input type="number" style={slabInputStyle} value={form.max_amount} onChange={e => setForm(p => ({ ...p, max_amount: e.target.value }))} placeholder="20000" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Win On (₹)</label>
            <input type="number" style={slabInputStyle} value={form.amount_to_win} onChange={e => setForm(p => ({ ...p, amount_to_win: e.target.value }))} placeholder="1500" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Prize (₹)</label>
            <input type="number" style={slabInputStyle} value={form.incentive_amount} onChange={e => setForm(p => ({ ...p, incentive_amount: e.target.value }))} placeholder="0" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <button onClick={submit} disabled={saving} style={btnStyle('#16a34a')}>{saving ? '…' : 'Save'}</button>
            <button onClick={cancel} style={btnStyle('var(--line)', 'var(--ink)')}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Range</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Win On</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12 }}>Prize</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 12, width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {slabs.filter(s => s.is_active).map(slab => (
              editing === slab.id ? (
                <tr key={slab.id} style={{ borderBottom: '1px solid var(--line)', background: '#f0f7ff' }}>
                  <td style={{ padding: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" style={{ ...slabInputStyle, width: 100 }} value={form.min_amount} onChange={e => setForm(p => ({ ...p, min_amount: e.target.value }))} />
                      <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>to</span>
                      <input type="number" style={{ ...slabInputStyle, width: 100 }} value={form.max_amount} onChange={e => setForm(p => ({ ...p, max_amount: e.target.value }))} />
                    </div>
                  </td>
                  <td style={{ padding: 6 }}><input type="number" style={slabInputStyle} value={form.amount_to_win} onChange={e => setForm(p => ({ ...p, amount_to_win: e.target.value }))} /></td>
                  <td style={{ padding: 6 }}><input type="number" style={slabInputStyle} value={form.incentive_amount} onChange={e => setForm(p => ({ ...p, incentive_amount: e.target.value }))} /></td>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={submit} disabled={saving} style={{ ...btnStyle('#16a34a'), padding: '6px 12px', fontSize: 12 }}>{saving ? '…' : 'Save'}</button>
                      <button onClick={cancel} style={{ ...btnStyle('var(--line)', 'var(--ink)'), padding: '6px 12px', fontSize: 12 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={slab.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>{fmtSlab(slab.min_amount)} – {fmtSlab(slab.max_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ink-soft)' }}>₹{fmt(slab.amount_to_win ?? 1500)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1677E8' }}>₹{fmt(slab.incentive_amount)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => startEdit(slab)} style={{ ...btnStyle('var(--card-bg)', 'var(--ink)'), padding: '5px 10px', fontSize: 11, border: '1px solid var(--line)' }}>Edit</button>
                      <button onClick={() => onDelete(slab.id)} style={{ ...btnStyle('#fee2e2', '#b91c1c'), padding: '5px 10px', fontSize: 11, border: '1px solid #fecaca' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {slabs.filter(s => s.is_active).length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>No slabs configured — add the first one!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── FRO Detail Modal ─────────────────────────────────────
function FroDetailModal({ froId, date, champions, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api(`/incentive/lead/lead-summary/fro/${froId}?date=${date}`, { _prefix: 'ucs' })
      .then(data => { if (alive) setDetail(data) })
      .catch(e => { if (alive) setError(e.message || 'Failed to load detail') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [froId, date])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99993, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', borderRadius: 14, background: '#fff', border: '1px solid #DCE7F5', boxShadow: '0 24px 60px rgba(18,35,63,.18)', overflow: 'hidden' }}>
          <div style={{ padding: 40, textAlign: 'center', color: '#65758B', fontSize: 13 }}>Loading leads…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99993, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', borderRadius: 14, background: '#fff', border: '1px solid #DCE7F5', boxShadow: '0 24px 60px rgba(18,35,63,.18)', overflow: 'hidden' }}>
          <div style={{ padding: 24, textAlign: 'center', color: '#C0392B', fontSize: 13 }}>{error}</div>
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 20 }}>
            <button onClick={onClose} style={btnStyle('#E2EAF5', '#52698A')}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  if (!detail) return null

  const isChampion = (champions || []).some(c => c.fro_id === detail.fro_id)
  const slabLabel = detail.slab ? `₹${fmt(detail.slab.min_amount)} – ₹${fmt(detail.slab.max_amount)}` : '—'
  const winOn = detail.amount_to_win ?? detail.slab?.amount_to_win ?? 1500
  const prize = detail.incentive_amount ?? detail.slab?.incentive_amount ?? 0

  const stat = (label, value, color) => (
    <div style={{ borderRadius: 12, padding: '12px 14px', background: '#F8FAFD', border: '1.5px solid #E5EDF7', textAlign: 'center', minWidth: 110, flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#65758B', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: color || '#12233F', marginTop: 4 }}>{value}</div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99993, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', borderRadius: 14, background: '#fff', border: '1px solid #DCE7F5', boxShadow: '0 24px 60px rgba(18,35,63,.18)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEF2F8', background: '#F8FAFD', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#12233F' }}>
              {detail.fro_name}
              {isChampion && <span style={{ marginLeft: 6, fontSize: 13 }}>🏆</span>}
            </div>
            <div style={{ fontSize: 12, color: '#65758B' }}>{fmtDate(detail.date)} · Lead detail</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 50, background: '#fff', border: '1px solid #E2EAF5', fontWeight: 700, color: '#65758B', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 20px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {stat('Target', `₹${fmt(detail.target)}`)}
            {stat('Slab', slabLabel)}
            {stat('Leads', detail.total_leads)}
            {stat('Amount', `₹${fmt(detail.total_amount)}`)}
            {stat('Win On', `🎯 ₹${fmt(winOn)}`, '#B45309')}
            {stat('Prize', `₹${fmt(prize)}`, '#1677E8')}
            {isChampion && stat('Won', '✓ Champion', '#18A957')}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, color: '#12233F', marginBottom: 8 }}>
            Individual Leads ({detail.leads?.length || 0})
          </div>
          {detail.leads && detail.leads.length > 0 ? (
            <div style={{ border: '1.5px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Donor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Mobile</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Amount</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 11 }}>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.leads.map((lead, i) => (
                      <tr key={lead.id || i} style={{ borderBottom: '1px solid var(--line)', background: lead.qualified ? 'rgba(220,252,231,.35)' : 'transparent' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 50, background: lead.qualified ? '#dcfce7' : '#f1f5f9', fontSize: 12, fontWeight: 800, color: lead.qualified ? '#16a34a' : '#94a3b8' }}>
                            {lead.qualified ? '✓' : '✗'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--ink)' }}>{lead.donor_name || `Donor #${lead.donor_id || '—'}`}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{lead.donor_mobile || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: lead.qualified ? '#16a34a' : 'var(--ink-soft)' }}>₹{fmt(lead.amount)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{fmtDate(lead.verified_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12, border: '1.5px dashed var(--line)', borderRadius: 12 }}>
              No leads for this date
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────
export default function LeadIncentive() {
  const [slabs, setSlabs] = useState([])
  const [summary, setSummary] = useState(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [slabsLoading, setSlabsLoading] = useState(true)
  const [summaryError, setSummaryError] = useState(null)
  const [savingSlab, setSavingSlab] = useState(false)
  const [announced, setAnnounced] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [detailFroId, setDetailFroId] = useState(null)
  const [slabsOpen, setSlabsOpen] = useState(false)
  const [configureSlab, setConfigureSlab] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [viewAll, setViewAll] = useState(null)

  const uniqueSlabs = useMemo(() => uniqueByRange(slabs), [slabs])

  // Ranges that already produced a winner today (announced champions) — STOP-AFTER-WIN.
  const wonSlabById = useMemo(() => {
    const map = {}
    for (const a of announced || []) {
      if (a && a.slab_id) map[a.slab_id] = true
    }
    for (const c of summary?.champions || []) {
      if (c && c.slab_id) map[c.slab_id] = true
    }
    return map
  }, [announced, summary])

  // Aggregate each award range with live status + leaderboard members + progress.
  const rangeRows = useMemo(() => {
    const champs = summary?.champions || []
    const fros = summary?.fros || []
    return (uniqueSlabs || [])
      .filter(s => s.is_active)
      .sort((a, b) => (Number(a.min_amount) || 0) - (Number(b.min_amount) || 0))
      .map((slab, idx) => {
        const members = fros
          .filter(f => f.slab && String(f.slab.id) === String(slab.id))
          .sort((a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0))
          .map(f => ({ ...f, is_winner: champs.some(c => String(c.fro_id) === String(f.fro_id) && String(c.slab_id) === String(slab.id)) }))
        const champion = champs.find(c => String(c.slab_id) === String(slab.id)) || null
        const winOn = Number(slab.amount_to_win) || 1500
        const prize = Number(slab.incentive_amount) || 0
        const leaderAmount = members.length ? (Number(members[0].total_amount) || 0) : 0
        const progressPct = winOn > 0 ? Math.min(100, Math.round((leaderAmount / winOn) * 100)) : 0
        return {
          slab_id: slab.id,
          slab,
          slab_label: fmtSlabRange(slab),
          idx: idx + 1,
          status: rangeStatus(slab, wonSlabById),
          won: !!champion,
          champion,
          members,
          top3: members.slice(0, 3),
          winOn,
          prize,
          leaderAmount,
          progressPct,
          totalCount: members.length,
        }
      })
  }, [uniqueSlabs, summary, wonSlabById])

  const loadSlabs = useCallback(async () => {
    try {
      setSlabsLoading(true)
      const data = await api('/incentive/lead/slabs', { _prefix: 'ucs' })
      if (Array.isArray(data)) setSlabs(data)
    } catch { /* ignore */ }
    finally { setSlabsLoading(false) }
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true)
      setSummaryError(null)
      const data = await api(`/incentive/lead/lead-summary?date=${date}`, { _prefix: 'ucs' })
      if (data) setSummary(data)
    } catch {
      setSummaryError('Failed to load the leaderboard data')
    }
    finally { setLoading(false) }
  }, [date])

  const loadAnnouncement = useCallback(async () => {
    try {
      const r = await api(`/incentive/lead/champion/current?date=${date}`, { _prefix: 'ucs' })
      setAnnounced(Array.isArray(r?.champions) ? r.champions : [])
    } catch { /* ignore */ }
  }, [date])

  useEffect(() => { loadSlabs() }, [loadSlabs])
  useEffect(() => { loadSummary(); loadAnnouncement() }, [loadSummary, loadAnnouncement])

  // Keep the leaderboard fresh while the page is open.
  useEffect(() => {
    const t = setInterval(() => { loadSummary(); loadAnnouncement() }, 20000)
    return () => clearInterval(t)
  }, [loadSummary, loadAnnouncement])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadSlabs(), loadSummary(), loadAnnouncement()])
    } finally { setRefreshing(false) }
  }

  const addSlab = async (form) => {
    setSavingSlab(true)
    try {
      await api('/incentive/lead/slabs', {
        method: 'POST', _prefix: 'ucs',
        body: JSON.stringify({
          min_amount: Number(form.min_amount),
          max_amount: Number(form.max_amount),
          incentive_amount: Number(form.incentive_amount) || 0,
          amount_to_win: Number(form.amount_to_win) || 1500,
        }),
      })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  const updateSlab = async (id, form) => {
    setSavingSlab(true)
    try {
      await api(`/incentive/lead/slabs/${id}`, {
        method: 'PUT', _prefix: 'ucs',
        body: JSON.stringify({
          min_amount: Number(form.min_amount),
          max_amount: Number(form.max_amount),
          incentive_amount: Number(form.incentive_amount) || 0,
          amount_to_win: Number(form.amount_to_win) || 1500,
        }),
      })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  // Per-range configure save: touches this slab's Prize + Win On amount + Start/End window
  const updateSlabRates = async (slab, { amount_to_win, incentive_amount, started_at, ended_at }) => {
    setSavingSlab(true)
    try {
      await api(`/incentive/lead/slabs/${slab.id}`, {
        method: 'PUT', _prefix: 'ucs',
        body: JSON.stringify({
          min_amount: Number(slab.min_amount),
          max_amount: Number(slab.max_amount),
          incentive_amount: Number(incentive_amount) || 0,
          amount_to_win: Number(amount_to_win) || 1500,
          started_at: toIso(started_at),
          ended_at: toIso(ended_at),
        }),
      })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  const deleteSlab = async (id) => {
    if (!window.confirm('Remove this slab?')) return
    setSavingSlab(true)
    try {
      await api(`/incentive/lead/slabs/${id}`, { method: 'DELETE', _prefix: 'ucs' })
      await loadSlabs()
      loadSummary()
    } finally { setSavingSlab(false) }
  }

  return (
    <div className="li-wrap">
      <style>{LI_CSS}</style>

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Finance <span style={{ margin: '0 4px', color: '#B9C8DC' }}>›</span> Lead Incentive
      </div>

      {/* Page header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#E8F3FF', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ChartBar size={22} weight="fill" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.dark, letterSpacing: -0.2, lineHeight: 1.1 }}>Lead Incentive</h1>
            <div style={{ marginTop: 3, fontSize: 13, color: '#6B7C93', lineHeight: 1.45 }}>
              Manage incentive ranges and view top performers based on verified collections.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 9, background: '#fff', color: '#52698A' }}>
            <CalendarBlank size={16} />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
          <button type="button" onClick={refresh}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.line}`, background: '#fff', color: C.dark, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            <ArrowsClockwise size={15} className={refreshing ? 'li-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={() => setSlabsOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.line}`, background: '#fff', color: C.dark, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            <FileText size={15} /> Target Slabs <CaretRight size={12} weight="bold" color="#B9C8DC" />
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="li-grid">
        <div className="li-col">
          <IncentiveRangesPanel
            ranges={rangeRows}
            loading={slabsLoading}
            onConfigure={setConfigureSlab}
            onAdd={() => setAddOpen(true)}
          />
        </div>
        <div className="li-col">
          <LiveLeaderboardPanel
            ranges={rangeRows}
            loading={loading}
            error={summaryError}
            onRefresh={refresh}
            onViewAll={setViewAll}
            onSelectFro={setDetailFroId}
          />
        </div>
      </div>

      {/* Configure Range modal */}
      {configureSlab && (
        <ConfigureRangeModal
          slab={configureSlab}
          saving={savingSlab}
          onSave={payload => updateSlabRates(configureSlab, payload)}
          onClose={() => setConfigureSlab(null)}
        />
      )}

      {/* Add Range modal */}
      {addOpen && (
        <AddRangeModal saving={savingSlab} onAdd={addSlab} onClose={() => setAddOpen(false)} />
      )}

      {/* View All modal */}
      {viewAll && (
        <ViewAllModal range={viewAll} onSelectFro={setDetailFroId} onClose={() => setViewAll(null)} />
      )}

      {/* FRO Detail modal */}
      {detailFroId && (
        <FroDetailModal
          froId={detailFroId}
          date={date}
          champions={summary?.champions || []}
          onClose={() => setDetailFroId(null)}
        />
      )}

      {/* Target Slabs modal */}
      {slabsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99990, background: 'rgba(18,35,63,.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px 16px', overflow: 'auto' }} onClick={() => setSlabsOpen(false)}>
          <div style={{ width: 'min(700px,100%)', borderRadius: 14, background: '#fff', border: `1px solid ${C.line}`, boxShadow: '0 24px 60px rgba(18,35,63,.18)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: '#1677E8' }}>
              <FileText size={17} color="#fff" />
              <div style={{ flex: 1, color: '#fff', fontSize: 14, fontWeight: 800 }}>Target Slabs</div>
              <button onClick={() => setSlabsOpen(false)} style={{ width: 30, height: 30, borderRadius: 50, background: 'rgba(255,255,255,.22)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: 16, maxHeight: '78vh', overflowY: 'auto' }}>
              <SlabConfig slabs={uniqueSlabs} onAdd={addSlab} onUpdate={updateSlab} onDelete={deleteSlab} saving={savingSlab} embedded />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../../../api/auth'
import { useRealtime } from '../../../hooks/useRealtime'
import {
  Trophy, ClockCounterClockwise, Plus, X, PencilSimple, Trash,
  Camera, Sparkle, PaperPlaneTilt, CheckCircle, CaretRight, ArrowsClockwise,
  CalendarBlank, FileText,
} from '@phosphor-icons/react'

// ─── Tokens (Sir ka Incentive visual language) ────────────
const C = {
  text: '#10213D',
  muted: '#6D7E95',
  line: '#DCE7F5',
  pageBg: '#F7FAFE',
  blue: '#2F7DF4',
}

const NGO_META = [
  { key: 'all', label: 'All NGOs', bg: '#F0F7FF', border: '#9CC8FF', accent: '#3B82F6' },
  { key: 'bsct', label: 'BSCT', bg: '#F0FBFD', border: '#BCE8F3', accent: '#24A7C7' },
  { key: 'aflf', label: 'AFLF', bg: '#F7F3FF', border: '#DCCBFF', accent: '#8B5CF6' },
  { key: 'mann', label: 'MANN', bg: '#FFF3F8', border: '#F7C7DD', accent: '#EC4899' },
]

const RANK_META = [
  { color: '#A9760C', bg: '#FDF1D6' },
  { color: '#5E6B7E', bg: '#EEF2F6' },
  { color: '#9A5A22', bg: '#FBEDDE' },
]

const SI_CSS = `
.si-scope, .si-scope *, .si-scope *:before, .si-scope *:after { box-sizing: border-box; }
.si-scope { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: ${C.text}; max-width: 100%; }
.si-scope img { max-width: 100%; }
.si-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; max-width: 100%; }
.si-col { min-width: 0; max-width: 100%; }
.si-panel { background: #fff; border: 1px solid ${C.line}; border-radius: 12px; padding: 12px; max-width: 100%; }
.si-selectors { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.si-selectors > * { min-width: 0; }
.si-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
.si-noscroll::-webkit-scrollbar { display: none; width: 0; height: 0; }
@keyframes si-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.si-shimmer { background: linear-gradient(90deg, #F2F6FB 25%, #E8EEF6 37%, #F2F6FB 63%); background-size: 800px 100%; animation: si-shimmer 1.2s ease-in-out infinite; border-radius: 6px; }
@keyframes si-rot { to { transform: rotate(360deg); } }
.si-spin { animation: si-rot .7s linear infinite; }
@media (max-width: 1199px) {
  .si-grid { grid-template-columns: minmax(0, 1fr); }
  .si-selectors { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .si-grid { grid-template-columns: minmax(0, 1fr); }
  .si-selectors { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`

const fmt = (n) => {
  const v = Number(n)
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-IN')
}
const money = (v) => `₹${fmt(v)}`
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const toLocalInput = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}
const initialsOf = (name) => String(name || 'S')
  .split(' ')
  .slice(0, 2)
  .map((s) => s[0]).join('').toUpperCase()

const matchNgoId = (ngos, key) => {
  if (key === 'all') return null
  const found = (ngos || []).find((n) => String(n.name || '').toUpperCase().includes(key.toUpperCase() === 'AFLF' ? 'AFL' : key.toUpperCase()))
  return found ? found.id : null
}

// ─── Avatar ───────────────────────────────────────────────
function Avatar({ url, name, size = 30 }) {
  const [err, setErr] = useState(false)
  useEffect(() => { setErr(false) }, [url])
  const box = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    border: '1.5px solid #EAF1FB', background: '#EAF1FB', objectFit: 'cover',
  }
  if (url && !err) {
    return <img src={url} alt={name} onError={() => setErr(true)} style={{ ...box, display: 'block' }} />
  }
  return (
    <div style={{ ...box, color: '#4473B8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700 }}>
      {initialsOf(name)}
    </div>
  )
}

// ─── Top-3 performer row ──────────────────────────────────
function TopRow({ p, i, max }) {
  const rank = RANK_META[i] || RANK_META[2]
  const pct = max > 0 ? Math.min(100, Math.round((Number(p.collected) || 0) / max * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%', background: rank.bg, color: rank.color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{i + 1}</span>
      <Avatar url={p.photo_url} name={p.name} size={30} />
      <span style={{
        flex: '1 1 0', minWidth: 0, fontSize: 13, fontWeight: 600, color: C.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{p.name}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{money(p.collected)}</span>
      <span style={{ flex: '0 1 64px', minWidth: 40, height: 6, borderRadius: 999, background: '#EDF2F7', overflow: 'hidden', flexShrink: 0 }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 999, background: p.accent || C.blue, transition: 'width .3s ease' }} />
      </span>
    </div>
  )
}

// ─── One NGO leaderboard card (Top 3 only) ────────────────
function NgoCard({ meta, rows, onViewAll }) {
  const top3 = (rows || []).slice(0, 3)
  const max = top3.length ? Math.max(...top3.map((p) => Number(p.collected) || 0)) : 0
  return (
    <div style={{ border: '1px solid #E5EDF7', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
      <div style={{
        padding: '8px 12px', background: meta.bg, borderBottom: '1px solid #EEF2F8',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.label}
        </span>
        <button type="button" onClick={onViewAll}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', padding: 0, color: C.blue, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          View All <CaretRight size={12} weight="bold" />
        </button>
      </div>
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, margin: '4px 0 2px' }}>Top 3 performers</div>
        {top3.length === 0 ? (
          <div style={{ padding: '14px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>No verified collections yet</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>Top 3 performers will appear here.</div>
          </div>
        ) : (
          top3.map((p, i) => <TopRow key={`${meta.key}-${p.worker_id || i}`} p={{ ...p, accent: meta.accent }} i={i} max={max} />)
        )}
      </div>
    </div>
  )
}

// ─── Winner celebration composer (mirrors Lead Incentive History) ───
function WinnerComposer({ inc, onSent }) {
  const [photo, setPhoto] = useState(null)
  const [message, setMessage] = useState(inc.congrats_message || inc.message || '')
  const [aiBusy, setAiBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const pickPhoto = (file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Photo must be JPG, PNG or WEBP'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Photo must be under 5MB'); return }
    setError('')
    const reader = new FileReader()
    reader.onload = () => setPhoto({ dataUrl: reader.result, mime: file.type })
    reader.readAsDataURL(file)
  }

  const aiWrite = async () => {
    setAiBusy(true)
    setError('')
    try {
      const r = await api(`/incentive/special/${inc.id}/congrats`, { method: 'POST', _prefix: 'ucs' })
      if (r?.message) setMessage(r.message)
    } catch (e) { setError(e.message || 'AI write failed') }
    finally { setAiBusy(false) }
  }

  const send = async () => {
    setSending(true)
    setError('')
    try {
      let file_base64 = null
      let mime_type = null
      if (photo) {
        const parts = String(photo.dataUrl).split(',')
        file_base64 = parts[1] || null
        mime_type = photo.mime
      }
      await api(`/incentive/special/${inc.id}/celebrate`, {
        method: 'POST', _prefix: 'ucs',
        body: JSON.stringify({ file_base64, mime_type, message: message.trim() || '' }),
      })
      onSent()
    } catch (e) { setError(e.message || 'Send failed') }
    finally { setSending(false) }
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${C.line}`, background: '#F8FAFD' }}>
      {error && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: '#FEF2F2', color: '#C0392B', fontSize: 11.5, fontWeight: 600, marginBottom: 10 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <button type="button" onClick={() => fileRef.current && fileRef.current.click()} disabled={sending} aria-label="Upload winner photo"
          style={{ width: 56, height: 56, borderRadius: 10, border: photo ? 'none' : '1.5px dashed #B9C8DC', background: photo ? 'transparent' : '#fff', color: '#6C8EBF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, overflow: 'hidden', padding: 0 }}>
          {photo ? (
            <img src={photo.dataUrl} alt="Winner" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <Camera size={20} />
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
          onChange={(e) => { pickPhoto(e.target.files && e.target.files[0]); e.target.value = '' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={sending} rows={2}
            placeholder="Write a congratulation… or let AI write it"
            style={{ width: '100%', minHeight: 56, padding: '8px 10px', border: '1px solid #DCE7F5', borderRadius: 10, background: '#fff', fontSize: 12.5, color: C.text, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={aiWrite} disabled={aiBusy || sending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          <Sparkle size={14} /> {aiBusy ? 'Writing…' : 'AI Write'}
        </button>
        <button type="button" onClick={send} disabled={sending}
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          <PaperPlaneTilt size={14} /> {sending ? 'Sending…' : 'Send to all panels'}
        </button>
      </div>
    </div>
  )
}

const STATUS_META = {
  active: { label: 'LIVE', bg: '#EAF9F0', text: '#18A957' },
  won: { label: 'WON', bg: '#FFF5DF', text: '#B7791F' },
  verified: { label: 'VERIFIED', bg: '#E8F3FF', text: '#1477E8' },
  ended: { label: 'ENDED', bg: '#F1F6FC', text: '#6C8EBF' },
  cancelled: { label: 'CANCELLED', bg: '#FDECEC', text: '#D92D20' },
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.ended
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
      borderRadius: 999, background: m.bg, color: m.text, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.text, display: 'inline-block' }} />
      {m.label}
    </span>
  )
}

// ─── One history row (all business actions preserved) ─────
function HistoryRow({ inc, busyId, onEdit, onCancel, onArchive, onDelete, onSent }) {
  const meta = STATUS_META[inc.status] || STATUS_META.ended
  const isArchived = !!inc.archived_at
  const smallBtn = (border, bg, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${border}`, background: bg, color,
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  })
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: '10px 12px', opacity: isArchived ? 0.72 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inc.title}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inc.ngo_name || 'All NGOs'} · {money(inc.target_amount)} target · {money(inc.incentive_amount)} reward
          </div>
        </div>
        <StatusPill status={inc.status} />
        {!isArchived && inc.status === 'active' && (
          <>
            <button type="button" onClick={() => onEdit(inc)} title="Edit incentive" aria-label={`Edit ${inc.title}`}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid #E2EAF5', background: '#fff', color: '#52698A', cursor: 'pointer' }}>
              <PencilSimple size={13} />
            </button>
            <button type="button" onClick={() => onCancel(inc.id)} disabled={busyId === inc.id} style={smallBtn('#FECACA', '#FEF2F2', '#B91C1C')}>
              {busyId === inc.id ? '…' : 'Cancel'}
            </button>
          </>
        )}
        {!isArchived && inc.status !== 'active' && (
          <button type="button" onClick={() => onArchive(inc.id)} disabled={busyId === inc.id} style={smallBtn('#E2EAF5', '#fff', '#52698A')}>
            {busyId === inc.id ? '…' : 'Archive'}
          </button>
        )}
        <button type="button" onClick={() => onDelete(inc)} disabled={busyId === inc.id} title="Delete incentive" aria-label={`Delete ${inc.title}`}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}>
          <Trash size={13} />
        </button>
      </div>

      {(inc.status === 'won' || inc.status === 'verified') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#FFFDF5', border: '1px solid #FDE9C0' }}>
          <Trophy size={15} weight="fill" color="#B7791F" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inc.winner_name || 'Winner'} · won {money(inc.incentive_amount)}
          </div>
        </div>
      )}

      {inc.status === 'won' && !inc.celebrated_at && (
        <WinnerComposer key={inc.id} inc={inc} onSent={onSent} />
      )}

      {inc.celebrated_at && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#F8FAFD', border: '1px solid #EEF2F8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#18A957', marginBottom: 8 }}>
            <CheckCircle size={13} /> Sent to all panels
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {inc.winner_photo_url && (
              <img src={inc.winner_photo_url} alt={inc.winner_name} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
            )}
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
              {inc.congrats_message || inc.message || 'Celebration sent to all panels.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Create / Edit incentive modal ────────────────────────
function IncentiveModal({ initial, ngoOptions, saving, error, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    ngo_id: initial?.ngo_id || '',
    title: initial?.title || '',
    message: initial?.message || '',
    target_amount: initial?.target_amount ?? '',
    incentive_amount: initial?.incentive_amount ?? '',
    start_at: toLocalInput(initial?.start_at || new Date(Date.now() + 5 * 60000)),
    end_at: toLocalInput(initial?.end_at || new Date(Date.now() + 24 * 3600 * 1000)),
  }))
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const label = (t) => (
    <label style={{ fontSize: 11.5, fontWeight: 700, color: C.text, display: 'block', marginBottom: 6 }}>{t}</label>
  )
  const box = {
    width: '100%', boxSizing: 'border-box', padding: '0 12px', height: 38,
    borderRadius: 9, border: `1px solid ${C.line}`, background: '#fff',
    color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99992, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'auto' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(18,35,63,.18)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEF2F8', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: '#fff' }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF7E8', color: '#B7791F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trophy size={16} weight="fill" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{initial ? 'Edit Incentive' : 'Create Incentive'}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Reward top performers for an NGO</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} weight="bold" />
          </button>
        </div>

        <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ padding: '9px 12px', borderRadius: 8, background: '#FEF2F2', color: '#C0392B', fontSize: 12, fontWeight: 600 }}>{error}</div>
          )}
          <div>
            {label('NGO')}
            <select value={form.ngo_id} onChange={(e) => set('ngo_id', e.target.value)} style={box}>
              <option value="">All NGOs</option>
              {ngoOptions.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
          <div>
            {label('Title')}
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. BSCT Collection Race" style={box} />
          </div>
          <div>
            {label('Message')}
            <textarea value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Whoever collects the fastest…" rows={2}
              style={{ ...box, height: 'auto', minHeight: 56, padding: '8px 12px', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {label('Target (₹)')}
              <input type="number" value={form.target_amount} onChange={(e) => set('target_amount', e.target.value)} placeholder="12000" style={box} />
            </div>
            <div>
              {label('Reward (₹)')}
              <input type="number" value={form.incentive_amount} onChange={(e) => set('incentive_amount', e.target.value)} placeholder="500" style={box} />
            </div>
          </div>
          <div>
            {label('Start Date/Time')}
            <input type="datetime-local" value={form.start_at} onChange={(e) => set('start_at', e.target.value)} style={box} />
          </div>
          <div>
            {label('End Date/Time')}
            <input type="datetime-local" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} style={box} />
          </div>
        </div>

        <div style={{ padding: '14px 20px 18px', display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ flex: 1, height: 38, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: '#33475F', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={() => onSave(form)} disabled={saving}
            style={{ flex: 1, height: 38, borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── View All modal (full leaderboard, dashboard stays Top 3) ───
function ViewAllModal({ meta, rows, onClose }) {
  const max = rows.length ? Math.max(...rows.map((p) => Number(p.collected) || 0)) : 0
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99991, background: 'rgba(18,35,63,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)', maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(18,35,63,.18)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F8', background: meta.bg, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trophy size={16} weight="fill" color={meta.accent} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{meta.label} · Leaderboard</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{rows.length} performer{rows.length !== 1 ? 's' : ''}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} weight="bold" />
          </button>
        </div>
        <div className="si-noscroll" style={{ overflowY: 'auto', padding: '6px 18px 14px' }}>
          {rows.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: C.muted }}>No verified collections yet.</div>
          )}
          {rows.map((p, i) => <TopRow key={p.worker_id || i} p={{ ...p, accent: meta.accent }} i={i} max={max} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────
export default function SpecialIncentives() {
  const [tab, setTab] = useState('dashboard')
  const [history, setHistory] = useState([])
  const [ngos, setNgos] = useState([])
  const [selected, setSelected] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [modal, setModal] = useState(null) // null | { mode: 'create' } | { mode: 'edit', inc }
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [viewAll, setViewAll] = useState(null) // ngo meta key

  const loadHistory = useCallback(async () => {
    try {
      setLoadError(null)
      const h = await api('/incentive/special')
      setHistory(Array.isArray(h) ? h : [])
    } catch (e) {
      setLoadError(e.message || 'Failed to load')
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => {
    let alive = true
    api('/ngos').then((list) => { if (alive) setNgos(Array.isArray(list) ? list : []) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Realtime only (no polling).
  const reloadTimer = useRef(null)
  const reloadSoon = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => { loadHistory() }, 1200)
  }, [loadHistory])
  useEffect(() => () => clearTimeout(reloadTimer.current), [])
  useRealtime('special_incentives', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: reloadSoon })
  useRealtime('special_incentive_progress', { event: '*', onInsert: reloadSoon, onUpdate: reloadSoon, onDelete: reloadSoon })

  // Resolve the four fixed NGO buckets to real ids.
  const buckets = useMemo(() => NGO_META.map((m) => ({
    ...m,
    ngo_id: matchNgoId(ngos, m.key),
  })), [ngos])

  const activeOf = useCallback((key, ngo_id) => (history || []).filter((i) =>
    i.status === 'active' && !i.archived_at && (key === 'all' ? true : String(i.ngo_id) === String(ngo_id))
  ), [history])

  // Leaderboard rows per bucket (active incentives only).
  const boards = useMemo(() => {
    const out = {}
    const rowOf = (r, ngoLabel) => ({
      worker_id: r.worker_id,
      name: r.workers?.name || 'Unknown',
      photo_url: r.photo_url || null,
      collected: Number(r.collected_amount) || 0,
      ngo: ngoLabel,
    })
    for (const b of buckets) {
      const incs = b.key === 'all'
        ? (history || []).filter((i) => i.status === 'active' && !i.archived_at)
        : activeOf(b.key, b.ngo_id)
      const merged = []
      for (const inc of incs) {
        for (const r of inc.leaderboard || []) {
          if ((Number(r.collected_amount) || 0) <= 0) continue
          merged.push(rowOf(r, inc.ngo_name || b.label))
        }
      }
      merged.sort((a, b2) => (b2.collected || 0) - (a.collected || 0))
      // De-dupe performers appearing in several races (keep their best).
      const seen = new Set()
      out[b.key] = merged.filter((p) => {
        if (seen.has(p.worker_id)) return false
        seen.add(p.worker_id)
        return true
      })
    }
    return out
  }, [buckets, history, activeOf])

  const filteredHistory = useMemo(() => {
    if (selected === 'all') return history
    const b = buckets.find((x) => x.key === selected)
    if (!b || !b.ngo_id) return []
    return (history || []).filter((i) => String(i.ngo_id) === String(b.ngo_id))
  }, [history, selected, buckets])

  const celebrated = useMemo(
    () => (history || []).filter((i) => i.celebrated_at),
    [history]
  )

  // Nothing live anywhere → leaderboard shows nothing at all.
  const hasLive = buckets.some((b) => (boards[b.key] || []).length > 0)

  const refresh = async () => {
    setLoading(true)
    await loadHistory()
  }

  const saveModal = async (form) => {
    if (!String(form.title).trim()) { setModalError('Title is required'); return }
    if (!(Number(form.target_amount) > 0)) { setModalError('Target must be more than zero'); return }
    if (!(Number(form.incentive_amount) > 0)) { setModalError('Reward must be more than zero'); return }
    if (!form.start_at || !form.end_at || !(new Date(form.end_at).getTime() > new Date(form.start_at).getTime())) {
      setModalError('End date-time must be after start date-time'); return
    }
    setModalSaving(true)
    setModalError('')
    try {
      const payload = {
        title: String(form.title).trim(),
        message: String(form.message || ''),
        ngo_id: form.ngo_id || null,
        target_amount: Number(form.target_amount),
        incentive_amount: Number(form.incentive_amount),
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
      }
      if (modal?.mode === 'edit') {
        await api(`/incentive/special/${modal.inc.id}`, { method: 'PUT', _prefix: 'ucs', body: JSON.stringify(payload) })
      } else {
        await api('/incentive/special', { method: 'POST', _prefix: 'ucs', body: JSON.stringify(payload) })
      }
      setModal(null)
      loadHistory()
    } catch (e) {
      setModalError(e.message || 'Failed to save')
    } finally { setModalSaving(false) }
  }

  const cancelInc = async (id) => {
    if (busyId) return
    if (!window.confirm('Cancel this incentive? It will be closed with no winner.')) return
    setBusyId(id)
    try {
      await api(`/incentive/special/${id}/cancel`, { method: 'POST', _prefix: 'ucs', body: JSON.stringify({}) })
      loadHistory()
    } catch (e) { console.error(e) }
    finally { setBusyId(null) }
  }

  const archiveInc = async (id) => {
    if (busyId) return
    if (!window.confirm('Archive this incentive? Its winner and photo popups will stop showing on all panels.')) return
    setBusyId(id)
    try {
      await api(`/incentive/special/${id}/archive`, { method: 'POST', _prefix: 'ucs', body: JSON.stringify({}) })
      loadHistory()
    } catch (e) { console.error(e) }
    finally { setBusyId(null) }
  }

  const removeInc = async (inc) => {
    if (busyId) return
    const msg = inc.status === 'active'
      ? 'Stop this incentive on all FRO panels and delete it permanently? All live popups will be removed immediately. This cannot be undone.'
      : 'Delete this incentive permanently? This cannot be undone.'
    if (!window.confirm(msg)) return
    setBusyId(inc.id)
    try {
      await api(`/incentive/special/${inc.id}`, { method: 'DELETE', _prefix: 'ucs' })
      loadHistory()
    } catch (e) { console.error(e) }
    finally { setBusyId(null) }
  }

  const ngoOptions = useMemo(
    () => (ngos || []).filter((n) => (n.name || '').trim().toUpperCase() !== 'OTHER').map((n) => ({ id: n.id, name: n.name })),
    [ngos]
  )

  const tabBtn = (key, label) => {
    const isActive = tab === key
    return (
      <button key={key} type="button" onClick={() => setTab(key)}
        style={{
          padding: '7px 16px', borderRadius: 999, border: `1px solid ${C.line}`,
          background: isActive ? C.blue : '#fff',
          color: isActive ? '#fff' : C.text,
          fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>{label}</button>
    )
  }

  return (
    <div className="si-scope">
      <style>{SI_CSS}</style>

      {/* Header (sticky — stays visible while scrolling) */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg, #F7FAFE)',
        padding: '12px 0', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: '#FFF7E8', color: '#B7791F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Trophy size={20} weight="fill" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 27, fontWeight: 700, color: C.text, letterSpacing: -0.2, lineHeight: 1.15 }}>Sir ka Incentive</h1>
          <div style={{ marginTop: 2, fontSize: 13, color: C.muted, lineHeight: 1.4 }}>Track and reward top performers for each NGO.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tabBtn('dashboard', 'Dashboard')}
          {tabBtn('gallery', `Photo Gallery${celebrated.length ? ` (${celebrated.length})` : ''}`)}
          <button type="button" onClick={() => { setModalError(''); setModal({ mode: 'create' }) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            <Plus size={15} weight="bold" /> Create New
          </button>
        </div>
      </div>

      {tab === 'dashboard' ? (
        <>
          {/* Main grid */}
          <div className="si-grid">
            <div className="si-col">
              <div className="si-panel">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF7E8', color: '#B7791F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Trophy size={16} weight="fill" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>Leaderboard</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Top 3 performers for each NGO</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.text, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <CalendarBlank size={14} /> This Month
                  </span>
                </div>

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="si-shimmer" style={{ height: 148, borderRadius: 10 }} />
                    ))}
                  </div>
                ) : loadError ? (
                  <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Unable to load leaderboard</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{loadError}</div>
                    <button type="button" onClick={refresh}
                      style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <ArrowsClockwise size={14} /> Retry
                    </button>
                  </div>
                ) : !hasLive ? null : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {buckets.map((b) => (
                      <NgoCard key={b.key} meta={b} rows={boards[b.key] || []} onViewAll={() => setViewAll(b.key)} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="si-col">
              <div className="si-panel">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: '#E8F3FF', color: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ClockCounterClockwise size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>History</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>All incentives across NGOs</div>
                  </div>
                  <button type="button" onClick={() => { setModalError(''); setModal({ mode: 'create' }) }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    <Plus size={14} weight="bold" /> New
                  </button>
                </div>

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="si-shimmer" style={{ height: 64, borderRadius: 10 }} />
                    ))}
                  </div>
                ) : loadError ? (
                  <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Unable to load history</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{loadError}</div>
                    <button type="button" onClick={refresh}
                      style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #E2EAF5', background: '#fff', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <ArrowsClockwise size={14} /> Retry
                    </button>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 60, height: 60, borderRadius: '50%', background: '#E8F3FF', color: '#6C8EBF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={28} />
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 12 }}>History will appear here</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>
                      Select an NGO or create a new incentive<br />to see the history.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filteredHistory.map((inc) => (
                      <HistoryRow
                        key={inc.id}
                        inc={inc}
                        busyId={busyId}
                        onEdit={(row) => { setModalError(''); setModal({ mode: 'edit', inc: row }) }}
                        onCancel={cancelInc}
                        onArchive={archiveInc}
                        onDelete={removeInc}
                        onSent={() => loadHistory()}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="si-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF7E8', color: '#B7791F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Camera size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>Photo Gallery</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Posted winner celebrations</div>
            </div>
          </div>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="si-shimmer" style={{ height: 190, borderRadius: 10 }} />
              ))}
            </div>
          ) : celebrated.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 60, height: 60, borderRadius: '50%', background: '#E8F3FF', color: '#6C8EBF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={28} />
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 12 }}>No celebrations posted yet</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Winner photos will appear here once posted from History.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {celebrated.map((inc) => (
                <div key={inc.id} style={{ border: '1px solid #E5EDF7', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                  {inc.winner_photo_url ? (
                    <img src={inc.winner_photo_url} alt={inc.winner_name} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: 150, background: '#F1F6FC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6C8EBF', fontSize: 13, fontWeight: 700 }}>
                      {initialsOf(inc.winner_name)}
                    </div>
                  )}
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.winner_name || 'Winner'}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.title}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal && (
        <IncentiveModal
          initial={modal.mode === 'edit' ? modal.inc : null}
          ngoOptions={ngoOptions}
          saving={modalSaving}
          error={modalError}
          onSave={saveModal}
          onClose={() => setModal(null)}
        />
      )}

      {viewAll && (() => {
        const meta = buckets.find((b) => b.key === viewAll) || buckets[0]
        return <ViewAllModal meta={meta} rows={boards[meta.key] || []} onClose={() => setViewAll(null)} />
      })()}
    </div>
  )
}

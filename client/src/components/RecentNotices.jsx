import { useState, useEffect, useCallback } from 'react'
import { API_BASE as BASE } from '../lib/apiBase'

// An extension match is a guess: it says "this looks like an image", not "this
// loaded". A notice can carry a PDF, a doc, or an object whose signed URL expired
// between fetch and render, and every one of those currently renders as the
// browser's broken-image glyph with no explanation. Callers pass the mime type
// when they have one and fall back to the extension otherwise.
const isImageMedia = (url, type) => {
  const t = String(type || '').toLowerCase()
  const u = String(url || '').toLowerCase()
  if (t) return t.startsWith('image/')
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|$)/.test(u)
}

// Non-image attachments used to be dropped on the floor: the list only ever
// rendered media that looked like an image, so a PDF notice showed title and
// body with no sign there was anything attached.
const isFileMedia = (url, type) => {
  const t = String(type || '').toLowerCase()
  if (t && !t.startsWith('image/')) return true
  return !!url && !isImageMedia(url, type)
}

const TARGET_LABELS = {
  all: null,
  admin: 'Admin',
  accounts: 'Accounts',
  hr: 'HR',
  recruiter: 'Recruiter',
  fro: 'FRO',
  event_head: 'Event Head',
}

// Rotating left-accent colors so consecutive notices are easy to tell apart
// without turning the list into a rainbow.
const ACCENTS = ['#16a34a', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#db2777']

function getToken() {
  try { return localStorage.getItem('ucs_token') } catch { return null }
}

function getRole() {
  try {
    const u = localStorage.getItem('ucs_user')
    if (u) return JSON.parse(u).role
  } catch { return null }
}

// The list truncates content at 120 chars, which was the whole of what an FRO
// could ever read: there was no way to see the rest, and no way to see the image
// at full size. This is that view - full body, full-resolution attachment, and a
// link for non-image files. Clicking the backdrop or Escape closes it.
function NoticeDetail({ notice, broken, onBroken, onClose }) {
  const { title, content, description, media_url, media_type, media_name, created_at, created_by_name } = notice
  const body = description || content || ''
  const isImage = !!media_url && !isFileMedia(media_url, media_type)

  const fullDate = (() => {
    if (!created_at) return ''
    try {
      return new Date(created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return '' }
  })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Notice'}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 99990, background: 'rgba(15,23,42,.55)',
        backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        width: 'min(600px, 100%)', maxHeight: '90vh', overflowY: 'auto',
        background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.35)',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          aria-label="Close notice"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'var(--line, #f1f5f9)', color: 'var(--ink, #0f172a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          }}
        >✕</button>

        <div style={{ padding: '20px 22px 8px' }}>
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
            color: '#2563eb', background: '#eff6ff', padding: '4px 10px', borderRadius: 999,
          }}>Notice</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink, #0f172a)', marginTop: 8, lineHeight: 1.35, paddingRight: 34 }}>
            {title}
          </div>
        </div>

        {media_url && (
          isImage ? (
            broken ? (
              <div style={{ margin: '14px 22px 0', padding: '14px 16px', fontSize: 12.5, color: '#9a3412', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10 }}>
                This image could not be loaded. It may have been removed, or the link may have expired — reopen the notice to retry.
              </div>
            ) : (
              <img
                src={media_url}
                alt={media_name || title || 'notice attachment'}
                onError={onBroken}
                style={{
                  display: 'block', margin: '14px 22px 0', width: 'calc(100% - 44px)',
                  maxHeight: '52vh', objectFit: 'contain', borderRadius: 12,
                  border: '1px solid var(--line, #e2e8f0)', background: '#f8fafc',
                }}
              />
            )
          ) : (
            <a
              href={media_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, margin: '14px 22px 0',
                padding: '11px 14px', borderRadius: 10, textDecoration: 'none',
                background: '#f8fafc', border: '1px solid var(--line, #e2e8f0)',
                color: '#1e40af', fontSize: 12.5, fontWeight: 700,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>attach_file</span>
              {media_name || 'Open attachment'}
              <span style={{ marginLeft: 'auto', fontWeight: 500, color: '#64748b' }}>opens in a new tab</span>
            </a>
          )
        )}

        {body && (
          <div style={{ padding: '16px 22px 0', fontSize: 13.5, color: 'var(--ink-soft, #475569)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {body}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '14px 22px 18px', fontSize: 11, color: '#94a3b8', fontWeight: 600, flexWrap: 'wrap' }}>
          {fullDate && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>{fullDate}
            </span>
          )}
          {created_by_name && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12 }}>✍️</span>{created_by_name}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            display: 'block', width: 'calc(100% - 44px)', margin: '0 22px 22px', padding: '11px 0',
            borderRadius: 10, border: 'none', background: 'var(--ink, #0f172a)', color: '#fff',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Close</button>
      </div>
    </div>
  )
}

// One IST calendar day per notice. 'en-CA' yields YYYY-MM-DD, the format the
// date input speaks, so the filter is a plain string compare.
const dayKey = (iso) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) } catch { return '' }
}
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export default function RecentNotices({ limit = 5, title = 'Recent Notices', containerStyle, fill = false }) {
  const [allNotices, setAllNotices] = useState([])
  // Fresh every day: the filter opens on today, so only today's notices show
  // and an empty day reads "No notices". Picking a past date views that day.
  const [dateFilter, setDateFilter] = useState(todayKey)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editForms, setEditForms] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [openNotice, setOpenNotice] = useState(null)
  const [brokenMedia, setBrokenMedia] = useState({})
  const role = getRole()
  const isAdmin = role === 'super_admin'
  const canDelete = role === 'super_admin' || role === 'admin' || role === 'hr' || role === 'master' || role === 'fro' || role === 'worker'

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }

    const params = role ? `?target_role=${role}` : ''
    fetch(`${BASE}/notices${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : d?.data || []
        setAllNotices(list)
      })
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => setLoading(false))
  }, [role])

  // Day view: only the notices created on the selected IST day, newest first.
  const notices = allNotices
    .filter(n => n.created_at && dayKey(n.created_at) === dateFilter)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)

  const handleDelete = async (id) => {
    const token = getToken()
    if (!token) return
    setDeletingId(id)
    try {
      const res = await fetch(`${BASE}/notices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setAllNotices(prev => prev.filter(n => n.id !== id))
        setToast('Notice deleted successfully')
      }
    } catch {}
    setDeletingId(null)
  }

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  // Opening a notice counts as reading it. The endpoint already exists and the
  // popup calls it on dismiss, so without this an FRO who reads a notice here
  // still gets the same one thrown at them as an unread popup.
  const openDetail = useCallback(async (n) => {
    setOpenNotice(n)
    if (n?.id == null) return
    try {
      const token = getToken()
      if (!token) return
      await fetch(`${BASE}/notices/${n.id}/seen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch { /* best-effort */ }
  }, [])

  useEffect(() => {
    if (!openNotice) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpenNotice(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNotice])

  const toggleEditMode = useCallback(() => {
    setEditMode(prev => {
      if (!prev) {
        const forms = {}
        notices.forEach(n => { forms[n.id] = { title: n.title, content: n.content } })
        setEditForms(forms)
      }
      return !prev
    })
  }, [notices])

  const handleEditChange = (id, field, value) => {
    setEditForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleSave = async (id) => {
    const token = getToken()
    if (!token) return
    setSavingId(id)
    try {
      const res = await fetch(`${BASE}/notices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForms[id])
      })
      if (res.ok) {
        setAllNotices(prev => prev.map(n => n.id === id ? { ...n, ...editForms[id] } : n))
      }
    } catch {}
    setSavingId(null)
  }

  const cardStyle = {
    background: 'var(--paper, #fff)',
    border: '1px solid var(--line, #e2e8f0)',
    borderRadius: 14,
    padding: '18px 20px',
    boxShadow: '0 1px 2px rgba(30,77,59,0.04), 0 6px 18px -10px rgba(30,77,59,0.08)',
    // Seal the card: the corner brackets (and any child overflow) must never
    // escape and trip a page-level horizontal scrollbar.
    overflow: 'hidden',
    ...containerStyle,
  }

  const editBtn = {
    background: editMode ? '#dcfce7' : '#f1f5f9',
    border: 'none', cursor: 'pointer',
    width: 30, height: 30, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: editMode ? '#15803d' : '#64748b', transition: 'all .15s'
  }

  // Row chrome lives in a style tag so hover can affect child buttons
  // (delete-on-hover isn't expressible with inline styles). The green
  // L-corners gently pulse and snap outward on hover. The list keeps
  // wheel/touch scrolling but draws NO scrollbar at all (vertical included —
  // the user found the slim bar ugly); overflow-x stays sealed shut.
  const CHROME_CSS = `
    .rn-row { position: relative; transition: box-shadow .15s, border-color .15s; }
    .rn-row:hover { border-color: #e2e8f0; box-shadow: 0 4px 14px rgba(15,23,42,.07); }
    .rn-corner {
      position: absolute; width: 12px; height: 12px; pointer-events: none;
      border: 0 solid #16a34a; opacity: .5;
      animation: rnPulse 2.8s ease-in-out infinite;
      transition: opacity .18s, transform .18s;
    }
    .rn-corner.tl { top: 4px; left: 4px; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 3px; }
    .rn-corner.tr { top: 4px; right: 4px; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 3px; }
    .rn-corner.bl { bottom: 4px; left: 4px; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 3px; }
    .rn-corner.br { bottom: 4px; right: 4px; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 3px; }
    .rn-row:hover .rn-corner { animation: none; opacity: 1; }
    .rn-row:hover .rn-corner.tl { transform: translate(-2px, -2px); }
    .rn-row:hover .rn-corner.tr { transform: translate(2px, -2px); }
    .rn-row:hover .rn-corner.bl { transform: translate(-2px, 2px); }
    .rn-row:hover .rn-corner.br { transform: translate(2px, 2px); }
    @keyframes rnPulse { 0%, 100% { opacity: .35; } 50% { opacity: .85; } }
    .rn-row .rn-del { opacity: 0; transition: opacity .15s, color .15s, background .15s; }
    .rn-row:hover .rn-del, .rn-row .rn-del:focus-visible { opacity: 1; }
    @media (hover: none) { .rn-row .rn-del { opacity: .55; } }
    .rn-list { overflow-x: hidden !important; scrollbar-width: none; -ms-overflow-style: none; }
    .rn-list::-webkit-scrollbar { width: 0; height: 0; display: none; }
  `

  // Shimmer skeleton instead of a blank gap while the fetch runs — same card
  // chrome and row shape as the loaded list so nothing jumps when data lands.
  if (loading) return (
    <div style={cardStyle}>
      <style>{CHROME_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div className="sk" style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0 }} />
        <div className="sk" style={{ width: 132, height: 14, borderRadius: 6 }} />
        <div className="sk" style={{ width: 28, height: 16, borderRadius: 99 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ position: 'relative', display: 'flex', gap: 10, padding: '10px 13px', borderRadius: 10, background: '#fff', border: '1px solid #f1f5f9', alignItems: 'center' }}>
            <span className="rn-corner tl" style={{ animation: 'none', opacity: .35 }} />
            <span className="rn-corner tr" style={{ animation: 'none', opacity: .35 }} />
            <span className="rn-corner bl" style={{ animation: 'none', opacity: .35 }} />
            <span className="rn-corner br" style={{ animation: 'none', opacity: .35 }} />
            <div className="sk" style={{ width: 40, height: 40, borderRadius: 9, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sk" style={{ height: 10, width: `${52 + (i % 3) * 14}%`, borderRadius: 5, marginBottom: 6 }} />
              <div className="sk" style={{ height: 8, width: `${68 - (i % 2) * 18}%`, borderRadius: 5, marginBottom: 5 }} />
              <div className="sk" style={{ height: 7, width: '28%', borderRadius: 5 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={cardStyle}>
      <style>{CHROME_CSS}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #16a34a 0%, #4ade80 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(22,163,74,0.25)',
          }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 16 }}>campaign</span>
          </span>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink, #0f172a)', letterSpacing: '-.01em' }}>{title}</h3>
          {notices.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#15803d',
              background: '#dcfce7', borderRadius: 99, padding: '2px 10px',
            }}>
              {notices.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="date"
            aria-label="Show notices from this date"
            value={dateFilter}
            max={todayKey()}
            onChange={e => setDateFilter(e.target.value || todayKey())}
            style={{
              fontSize: 11, fontWeight: 600, color: '#475569',
              border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '4px 7px', background: '#fff', cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          {dateFilter !== todayKey() && (
            <button
              onClick={() => setDateFilter(todayKey())}
              title="Back to today's notices"
              style={{
                fontSize: 10, fontWeight: 700, color: '#15803d',
                background: '#dcfce7', border: 'none', borderRadius: 99,
                padding: '4px 9px', cursor: 'pointer',
              }}
            >
              Today
            </button>
          )}
          {isAdmin && notices.length > 0 && (
            <button
              onClick={toggleEditMode}
              title={editMode ? 'Done editing' : 'Edit notices'}
              style={editBtn}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{editMode ? 'check' : 'edit'}</span>
            </button>
          )}
        </div>
      </div>

      {notices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '22px 0 12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#e2e8f0' }}>campaign</span>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '6px 0 0' }}>
            {dateFilter === todayKey() ? 'No notices for today' : 'No notices on this date'}
          </p>
        </div>
      ) : (
        <div className="rn-list" style={{ ...(fill ? { flex: 1, minHeight: 0 } : { maxHeight: 240 }), overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 7, paddingRight: 2 }}>
          {notices.map((n, i) => {
            const accent = ACCENTS[i % ACCENTS.length]
            return (
            <div key={n.id || i} className={isAdmin && editMode ? undefined : 'rn-row'} style={{
              position: 'relative',
              display: 'flex', gap: 10, padding: '10px 13px',
              borderRadius: 10, background: '#fff', border: '1px solid #f1f5f9',
              alignItems: 'center',
              // In edit mode the row holds real inputs and buttons, so a row-wide
              // click target would swallow their clicks. Keep it inert there.
              cursor: isAdmin && editMode ? 'default' : 'pointer',
              ...(isAdmin && editMode ? {} : { role: 'button', tabIndex: 0, 'aria-label': `Open notice: ${n.title || ''}` }),
            }}
              onClick={(e) => {
                if (isAdmin && editMode) return
                // Let the delete/save buttons and the image do their own thing.
                if (e.target.closest('button, a, img')) return
                openDetail(n)
              }}
              onKeyDown={(e) => {
                if (isAdmin && editMode) return
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(n) }
              }}
            >
              {/* Green L-brackets on all four corners — idle: gentle pulse
                  (staggered per row); hover: snap outward. */}
              <span className="rn-corner tl" style={{ animationDelay: `${(i % 6) * 0.25}s` }} />
              <span className="rn-corner tr" style={{ animationDelay: `${(i % 6) * 0.25}s` }} />
              <span className="rn-corner bl" style={{ animationDelay: `${(i % 6) * 0.25}s` }} />
              <span className="rn-corner br" style={{ animationDelay: `${(i % 6) * 0.25}s` }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                {isAdmin && editMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input value={editForms[n.id]?.title || ''} onChange={e => handleEditChange(n.id, 'title', e.target.value)}
                      style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 7, padding: '5px 9px', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                    />
                    <textarea value={editForms[n.id]?.content || ''} onChange={e => handleEditChange(n.id, 'content', e.target.value)} rows={2}
                      style={{ fontSize: 11.5, color: '#475569', border: '1px solid #cbd5e1', borderRadius: 7, padding: '5px 9px', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.3, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{n.title}</span>
                      {TARGET_LABELS[n.target_role] && (
                        <span style={{
                          fontSize: 8.5, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                          background: `${accent}12`, color: accent, border: `1px solid ${accent}26`,
                          whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '.2px',
                        }}>
                          {TARGET_LABELS[n.target_role]}
                        </span>
                      )}
                    </div>
                    {n.content && (
                      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.content}
                      </div>
                    )}
                    <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 11, lineHeight: 1 }}>schedule</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.created_at ? new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                        {n.created_by_name ? ` · by ${n.created_by_name}` : ''}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {!(isAdmin && editMode) && (
                n.media_url && brokenMedia[n.id] ? (
                  <span style={{ flexShrink: 0, fontSize: 9, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 6px' }}>
                    Failed
                  </span>
                ) : isFileMedia(n.media_url, n.media_type) ? (
                  <button
                    onClick={() => openDetail(n)}
                    title={n.media_name || 'Attachment'}
                    style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 9, border: `1px solid ${accent}26`, background: `${accent}0f`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>attach_file</span>
                  </button>
                ) : n.media_url ? (
                  <img
                    src={n.media_url}
                    alt={n.media_name || n.title || 'notice attachment'}
                    loading="lazy"
                    onClick={() => openDetail(n)}
                    onError={() => setBrokenMedia(prev => ({ ...prev, [n.id]: true }))}
                    style={{ flexShrink: 0, width: 40, height: 40, objectFit: 'cover', borderRadius: 9, border: '1px solid #eef2f7', cursor: 'zoom-in', boxShadow: '0 1px 3px rgba(15,23,42,.08)' }}
                  />
                ) : null
              )}
              {isAdmin && (editMode ? (
                <button
                  onClick={() => handleSave(n.id)}
                  disabled={savingId === n.id}
                  title="Save"
                  style={{
                    background: savingId === n.id ? '#dcfce7' : '#16a34a',
                    border: 'none', cursor: savingId === n.id ? 'wait' : 'pointer',
                    padding: '5px 11px', borderRadius: 7, flexShrink: 0, alignSelf: 'center',
                    color: '#fff', fontSize: 10.5, fontWeight: 700, fontFamily: 'inherit',
                    boxShadow: savingId === n.id ? 'none' : '0 2px 6px rgba(22,163,74,0.25)', transition: 'background .15s',
                  }}
                >
                  {savingId === n.id ? 'Saving' : 'Save'}
                </button>
              ) : canDelete ? (
                <button
                  className="rn-del"
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  title="Delete notice"
                  style={{
                    width: 26, height: 26, padding: 0,
                    background: 'none', border: 'none', cursor: deletingId === n.id ? 'wait' : 'pointer',
                    borderRadius: 7, flexShrink: 0, alignSelf: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#cbd5e1',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'transparent' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {deletingId === n.id ? 'hourglass_top' : 'delete'}
                  </span>
                </button>
              ) : null)}
            </div>
            )
          })}
        </div>
      )}

      {openNotice && (
        <NoticeDetail
          notice={openNotice}
          broken={brokenMedia[openNotice.id]}
          onBroken={() => setBrokenMedia(prev => ({ ...prev, [openNotice.id]: true }))}
          onClose={() => setOpenNotice(null)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1200,
          background: '#16a34a', color: '#fff', padding: '11px 22px', borderRadius: 12,
          fontSize: 13, fontWeight: 700, boxShadow: '0 10px 30px rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>check_circle</span>
          {toast}
        </div>
      )}
    </div>
  )
}

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

export default function RecentNotices({ limit = 5, title = 'Recent Notices', containerStyle }) {
  const [notices, setNotices] = useState([])
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
        setNotices(Array.isArray(d) ? d.slice(0, limit) : d?.data?.slice(0, limit) || [])
      })
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => setLoading(false))
  }, [limit, role])

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
        setNotices(prev => prev.filter(n => n.id !== id))
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
        setNotices(prev => prev.map(n => n.id === id ? { ...n, ...editForms[id] } : n))
      }
    } catch {}
    setSavingId(null)
  }

  if (loading) return null

  const cardStyle = {
    background: 'var(--paper, #fff)',
    border: '1px solid var(--line, #e2e8f0)',
    borderRadius: 14,
    padding: '18px 20px',
    boxShadow: '0 1px 2px rgba(30,77,59,0.04), 0 6px 18px -10px rgba(30,77,59,0.08)',
    ...containerStyle,
  }

  const editBtn = {
    background: editMode ? '#dcfce7' : '#f1f5f9',
    border: 'none', cursor: 'pointer',
    width: 30, height: 30, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: editMode ? '#15803d' : '#64748b', transition: 'all .15s'
  }

  return (
    <div style={cardStyle}>
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

      {notices.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, margin: '18px 0 6px' }}>No notices yet</p>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
          {notices.map((n, i) => (
            <div key={n.id || i} style={{
              display: 'flex', gap: 10, padding: '11px 13px',
              borderRadius: 10, background: '#f8fafc', border: '1px solid #eef2f7', alignItems: 'flex-start',
              transition: 'border-color .15s, background .15s, box-shadow .15s',
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
              onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(30,77,59,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#eef2f7'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: i % 2 === 0 ? '#e8f5ee' : '#eff6ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ color: i % 2 === 0 ? '#16a34a' : '#3b82f6', fontSize: 17 }}>
                  {i % 2 === 0 ? 'notifications' : 'campaign'}
                </span>
              </div>
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', lineHeight: 1.35 }}>
                      {n.title}
                      {TARGET_LABELS[n.target_role] && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: '#dcfce7', color: '#15803d', whiteSpace: 'nowrap',
                        }}>
                          {TARGET_LABELS[n.target_role]}
                        </span>
                      )}
                    </div>
                    {n.content && (
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>
                        {n.content.length > 120 ? n.content.slice(0, 120) + '\u2026' : n.content}
                      </div>
                    )}
                    {n.media_url && brokenMedia[n.id] ? (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '5px 9px' }}>
                        Image could not be loaded
                      </div>
                    ) : isFileMedia(n.media_url, n.media_type) ? (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>attach_file</span>
                        {n.media_name || 'Attachment'}
                      </div>
                    ) : (
                      <img
                        src={n.media_url}
                        alt={n.media_name || n.title || 'notice attachment'}
                        onClick={() => openDetail(n)}
                        onError={() => setBrokenMedia(prev => ({ ...prev, [n.id]: true }))}
                        style={{ marginTop: 6, width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid #eef2f7', cursor: 'zoom-in' }}
                      />
                    )}
                    <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600, marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
                      {n.created_at ? new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                      {n.created_by_name && (
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>by {n.created_by_name}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
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
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  title="Delete notice"
                  style={{
                    width: 26, height: 26, padding: 0,
                    background: 'none', border: 'none', cursor: deletingId === n.id ? 'wait' : 'pointer',
                    borderRadius: 7, flexShrink: 0, alignSelf: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#cbd5e1', transition: 'all .15s'
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
          ))}
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

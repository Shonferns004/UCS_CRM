import { useState, useEffect, useCallback } from 'react'

const BASE = import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api'

const TARGET_LABELS = {
  all: null,
  admin: 'NGO Admin',
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

export default function RecentNotices({ limit = 5, title = 'Recent Notices' }) {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editForms, setEditForms] = useState({})
  const [savingId, setSavingId] = useState(null)
  const role = getRole()

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
      }
    } catch {}
    setDeletingId(null)
  }

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

  return (
    <div className="nd-card nd-appear" style={{ animationDelay: '0.8s', marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="nd-section-title" style={{ color: '#000', fontSize: 14 }}>{title}</h3>
        {notices.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#3B82F6',
              background: 'rgba(59,130,246,0.15)', borderRadius: 99, padding: '3px 10px',
            }}>
              {notices.length}
            </span>
            <button
              onClick={toggleEditMode}
              title={editMode ? 'Done editing' : 'Edit notices'}
              style={{
                background: editMode ? 'rgba(59,130,246,0.15)' : 'none',
                border: 'none', cursor: 'pointer',
                padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: editMode ? '#3B82F6' : '#94a3b8', transition: 'color 0.15s'
              }}
              onMouseEnter={e => { if (!editMode) e.currentTarget.style.color = '#3B82F6' }}
              onMouseLeave={e => { if (!editMode) e.currentTarget.style.color = '#94a3b8' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
            </button>
          </span>
        )}
      </div>
      {notices.length === 0 ? (
        <p className="nd-muted" style={{ fontSize: 12 }}>No notices yet</p>
      ) : (
        <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
          {notices.map((n, i) => (
            <div key={n.id || i} style={{
              display: 'flex', gap: 8, padding: '8px 10px',
              borderRadius: 8, marginBottom: 6,
              background: '#EFF6FF', border: '1px solid #BFDBFE', alignItems: 'flex-start'
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                background: i % 2 === 0 ? '#3B82F6' : '#60A5FA',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 16 }}>
                  {i % 2 === 0 ? 'priority_high' : 'campaign'}
                </span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                {editMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input value={editForms[n.id]?.title || ''} onChange={e => handleEditChange(n.id, 'title', e.target.value)}
                      style={{ fontSize: 12.5, fontWeight: 700, color: '#1E3A5F', border: '1px solid #BFDBFE', borderRadius: 4, padding: '3px 6px', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                    />
                    <textarea value={editForms[n.id]?.content || ''} onChange={e => handleEditChange(n.id, 'content', e.target.value)} rows={2}
                      style={{ fontSize: 11, color: '#475569', border: '1px solid #BFDBFE', borderRadius: 4, padding: '3px 6px', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E3A5F', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {n.title}
                      {TARGET_LABELS[n.target_role] && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: '#DBEAFE', color: '#2563EB', whiteSpace: 'nowrap',
                        }}>
                          {TARGET_LABELS[n.target_role]}
                        </span>
                      )}
                    </div>
                    {n.content && (
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.4 }}>
                        {n.content.length > 100 ? n.content.slice(0, 100) + '\u2026' : n.content}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#60A5FA', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {n.created_at ? new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                      {n.created_by_name && (
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>
                          by {n.created_by_name}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              {editMode ? (
                <button
                  onClick={() => handleSave(n.id)}
                  disabled={savingId === n.id}
                  title="Save"
                  style={{
                    background: savingId === n.id ? 'rgba(59,130,246,0.15)' : '#3B82F6',
                    border: 'none', cursor: savingId === n.id ? 'wait' : 'pointer',
                    padding: '3px 8px', borderRadius: 4, flexShrink: 0, alignSelf: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit'
                  }}
                >
                  {savingId === n.id ? 'Saving' : 'Save'}
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(n)}
                  disabled={deletingId === n.id}
                  title="Delete notice"
                  style={{
                    background: 'none', border: 'none', cursor: deletingId === n.id ? 'wait' : 'pointer',
                    padding: 2, borderRadius: 4, flexShrink: 0, alignSelf: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', transition: 'color 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {deletingId === n.id ? 'hourglass_top' : 'delete'}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#FFFFFF', width: '100%', maxWidth: '400px',
            borderRadius: '16px', boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '28px 28px 20px', textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: '#FEE2E2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#EF4444' }}>delete</span>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                Delete Notice?
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#6B7280', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong style={{ color: '#111827' }}>"{confirmDelete.title}"</strong>? This action cannot be undone.
              </p>
            </div>
            <div style={{
              padding: '16px 28px 24px', display: 'flex', gap: '10px', justifyContent: 'center'
            }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#FFFFFF', color: '#111827', border: '1px solid #E5E7EB',
                cursor: 'pointer', flex: 1
              }}>Cancel</button>
              <button onClick={() => { handleDelete(confirmDelete.id); setConfirmDelete(null); }} style={{
                padding: '10px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                background: '#EF4444', color: '#FFFFFF', border: 'none',
                cursor: 'pointer', flex: 1
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

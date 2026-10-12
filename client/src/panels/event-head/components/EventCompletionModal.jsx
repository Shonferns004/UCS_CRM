import { useState, useEffect } from 'react'
import { fetchEventSocial, saveEventSocial, completeEventWithSocial } from '../store'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', accent: '#C13584' },
  { id: 'facebook', label: 'Facebook', accent: '#1877F2' },
  { id: 'youtube', label: 'YouTube', accent: '#FF0000' },
]
const STATUSES = ['Pending', 'Uploaded', 'Not Applicable']

const blankPlatform = (platform) => ({
  platform,
  status: 'Pending',
  url: '',
  upload_date: '',
  upload_time: '',
  not_applicable_reason: '',
})

const fromServer = (rows) => {
  const byId = {}
  for (const r of rows || []) byId[r.platform] = r
  return PLATFORMS.map(p => {
    const r = byId[p.id] || {}
    return {
      platform: p.id,
      status: STATUSES.includes(r.status) ? r.status : 'Pending',
      url: r.url || '',
      upload_date: r.upload_date ? String(r.upload_date).slice(0, 10) : '',
      upload_time: r.upload_time ? String(r.upload_time).slice(0, 5) : '',
      not_applicable_reason: r.not_applicable_reason || '',
    }
  })
}

// A platform counts as resolved when it is Uploaded with an upload date and
// time, or explicitly Not Applicable with a reason. Mirrors the server rule.
export const isPlatformResolved = (p) => {
  if (p.status === 'Uploaded') return !!(p.upload_date && p.upload_time)
  if (p.status === 'Not Applicable') return !!p.not_applicable_reason
  return false
}

const Field = ({ label, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-soft)', marginBottom: 5 }}>{label}</label>
    {children}
  </div>
)
const INPUT = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', background: '#fff' }

export default function EventCompletionModal({ event, onClose, onCompleted }) {
  const [rows, setRows] = useState(() => PLATFORMS.map(p => blankPlatform(p.id)))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [problems, setProblems] = useState([])
  const eventId = event?.id

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchEventSocial(eventId)
      .then(res => { if (!cancelled) setRows(fromServer(res?.platforms || res)) })
      .catch(e => { if (!cancelled) setError(e?.message || 'Could not load social media details') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [eventId])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && !saving && !completing) onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose, saving, completing])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 2600)
    return () => clearTimeout(t)
  }, [notice])

  const update = (platform, patch) => {
    setRows(prev => prev.map(r => r.platform === platform ? { ...r, ...patch } : r))
    setProblems(prev => prev.filter(p => p.platform !== platform))
  }

  const resolved = rows.filter(isPlatformResolved).length
  const allResolved = resolved === PLATFORMS.length

  const doSave = async () => {
    setSaving(true); setError(''); setNotice('')
    try {
      const res = await saveEventSocial(eventId, rows)
      setRows(fromServer(res?.platforms || res))
      setNotice('Progress saved.')
    } catch (e) {
      setError(e?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const doComplete = async () => {
    setCompleting(true); setError(''); setProblems([]); setNotice('')
    try {
      const res = await completeEventWithSocial(eventId, rows)
      const ev = res?.event || { ...event, status: 'Completed' }
      if (onCompleted) onCompleted(ev)
      else { setNotice('Event marked completed.'); setCompleting(false) }
    } catch (e) {
      setError(e?.message || 'Failed to mark the event completed')
      const perPlatform = e?.data?.problems || e?.problems
      if (Array.isArray(perPlatform)) setProblems(perPlatform)
      setCompleting(false)
    }
  }

  const busy = saving || completing

  return (
    <div className="modal-overlay" onClick={() => { if (!busy) onClose() }} style={{ zIndex: 2200, padding: 20 }}>
      <div className="modal" style={{ maxWidth: 720, borderRadius: 16, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(0,0,0,0.24)' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <h3 style={{ margin: 0 }}>Event Completion &amp; Social Media Tracking</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              {event?.name || 'Event'}{event?.ngo_name ? ' · ' + event.ngo_name : ''}{event?.sector_name ? ' · ' + event.sector_name : ''}
            </div>
          </div>
          <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => { if (!busy) onClose() }}>✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {notice && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--eh-success-soft)', color: 'var(--eh-success)', fontSize: 13, fontWeight: 600 }}>{notice}</div>}
          {error && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 500 }}>{error}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--tint)', overflow: 'hidden' }}>
              <div style={{ width: (resolved / PLATFORMS.length * 100) + '%', height: '100%', background: allResolved ? 'var(--eh-success)' : '#7B5EA7', transition: 'width .2s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: allResolved ? 'var(--eh-success)' : 'var(--ink-soft)' }}>{resolved} of {PLATFORMS.length} resolved</span>
          </div>

          {loading ? (
            <div className="loading" style={{ padding: 30 }}>Loading…</div>
          ) : rows.map(p => {
            const meta = PLATFORMS.find(x => x.id === p.platform) || {}
            const pr = problems.find(x => x.platform === p.platform)
            const ok = isPlatformResolved(p)
            return (
              <div key={p.platform} style={{ border: '1px solid var(--line)', borderLeft: `4px solid ${meta.accent}`, borderRadius: 12, padding: 14, marginBottom: 12, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{meta.label}</span>
                  {ok && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--eh-success)' }}>✓ done</span>}
                  <span style={{ marginLeft: 'auto' }}>
                    <select value={p.status} onChange={e => update(p.platform, { status: e.target.value })} className="eh-select" style={{ fontSize: 12 }}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </span>
                </div>

                {pr && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{pr.message}</div>}

                {p.status === 'Uploaded' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Upload Date * (dd-mm-yyyy)">
                      <input type="date" style={INPUT} value={p.upload_date} onChange={e => update(p.platform, { upload_date: e.target.value })} />
                    </Field>
                    <Field label="Upload Time *">
                      <input type="time" style={INPUT} value={p.upload_time} onChange={e => update(p.platform, { upload_time: e.target.value })} />
                    </Field>
                  </div>
                )}

                {p.status === 'Not Applicable' && (
                  <Field label="Reason *">
                    <textarea style={{ ...INPUT, resize: 'vertical', minHeight: 52 }} value={p.not_applicable_reason} onChange={e => update(p.platform, { not_applicable_reason: e.target.value })} placeholder="Why this platform does not apply" />
                  </Field>
                )}

                {p.status === 'Pending' && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Choose Uploaded or Not Applicable.</div>
                )}
              </div>
            )
          })}
        </div>

        <div className="modal-actions" style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-sm" onClick={doSave} disabled={busy}>{saving ? 'Saving…' : 'Save Progress'}</button>
          <button
            className="btn btn-primary"
            onClick={doComplete}
            disabled={busy || !allResolved}
            title={allResolved ? '' : 'Resolve all three platforms first'}
          >
            {completing ? 'Completing…' : 'Mark Completed & Download Daily Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

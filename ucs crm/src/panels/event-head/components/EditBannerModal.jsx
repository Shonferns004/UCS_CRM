import { useState, useRef, useEffect } from 'react'
import { replaceMedia, updateMedia, updateEvent } from '../store'

const pad2 = (n) => String(n).padStart(2, '0')
const fmtDay = (d) => d ? String(d).slice(0, 10) : ''
const toDateInput = (ev) => ev && ev.date ? String(ev.date).slice(0, 10) : ''
const toTimeInput = (t) => t ? String(t).slice(0, 5) : ''

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-soft)', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}
const INPUT = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', background: '#fff' }

export default function EditBannerModal({ media, event, onClose, onSaved }) {
  const [heading, setHeading] = useState(media?.title || media?.name || '')
  const [description, setDescription] = useState(media?.description || '')
  const [year, setYear] = useState(media?.year != null ? String(media.year) : (event?.date ? String(new Date(event.date).getFullYear()) : ''))
  const [date, setDate] = useState(toDateInput(event))
  const [startTime, setStartTime] = useState(toTimeInput(event?.start_time))
  const [endTime, setEndTime] = useState(toTimeInput(event?.end_time))
  const [newFile, setNewFile] = useState(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { if (!confirmReplace) onClose() } }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose, confirmReplace])

  if (!media) return null

  const isImage = /image\//i.test(media.type || '') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(media.url || '')

  const save = async () => {
    setSaving(true); setError('')
    try {
      const meta = { title: heading || null, description: description || null }
      if (year) meta.year = Number(year)
      const res = await updateMedia(media.event_id ?? event?.id, media.id, meta)
      if (date && event) {
        const evUpdates = { date }
        if (startTime) evUpdates.start_time = startTime
        if (endTime) evUpdates.end_time = endTime
        if (startTime && endTime && endTime < startTime) { setError('End time must be after start time'); setSaving(false); return }
        await updateEvent(event.id, evUpdates)
      }
      if (newFile) {
        const fd = new FormData()
        fd.append('file', newFile, newFile.name)
        if (heading) fd.append('title', heading)
        if (description) fd.append('description', description)
        if (year) fd.append('year', Number(year))
        if (media.media_type) fd.append('media_type', media.media_type)
        else fd.append('media_type', 'Banner')
        await replaceMedia(media.event_id ?? event?.id, media.id, fd)
      }
      onSaved && onSaved(res)
    } catch (e) {
      setError(e.message || 'Failed to save banner')
      console.error(e)
    } finally { setSaving(false) }
  }

  const pickFile = (f) => { setNewFile(f); setConfirmReplace(!!f) }

  return (
    <div className="modal-overlay" onClick={() => { if (!saving && !confirmReplace) onClose() }} style={{ zIndex: 2200, padding: 20 }}>
      <div className="modal" style={{ maxWidth: 700, borderRadius: 16, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(0,0,0,0.24)' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <h3>Edit Banner</h3>
          <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => { if (!saving && !confirmReplace) onClose() }}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>
          {error && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 500 }}>{error}</div>}
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Editing: <b>{event?.name || 'Event'}</b> {event?.ngo_name ? '· ' + event.ngo_name : ''} {event?.sector_name ? '· ' + event.sector_name : ''}</div>

          {/* Existing banner preview */}
          <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#eceef0', height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isImage
              ? <img src={media.url} alt={media.title || media.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none' }} />
              : <div style={{ fontSize: 44 }}>📄</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
            <Field label="Banner Heading"><input style={INPUT} value={heading} onChange={e => setHeading(e.target.value)} /></Field>
            <Field label="Year"><input type="number" style={INPUT} value={year} onChange={e => setYear(e.target.value)} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
            <Field label="Event Date"><input type="date" style={INPUT} value={date} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Start Time"><input type="time" style={INPUT} value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
            <Field label="End Time"><input type="time" style={INPUT} value={endTime} onChange={e => setEndTime(e.target.value)} /></Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Description"><textarea style={{ ...INPUT, resize: 'vertical', minHeight: 64 }} value={description} onChange={e => setDescription(e.target.value)} /></Field>
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Replace Banner</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-sm" type="button" onClick={() => fileRef.current?.click()} disabled={!!newFile}>{newFile ? newFile.name : 'Choose New File'}</button>
              {newFile && <button className="btn btn-sm btn-icon" onClick={() => { setNewFile(null); setConfirmReplace(false); if (fileRef.current) fileRef.current.value = '' }}>✕</button>}
              <input ref={fileRef} type="file" hidden onChange={e => pickFile(e.target.files[0] || null)} accept="image/*,.pdf,.doc,.docx" />
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Optional — only if you want a new banner image/file.</span>
            </div>
          </div>
        </div>
        <div className="modal-actions" style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {!confirmReplace ? (
            <>
              <button className="btn btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </>
          ) : (
            <>
              <span style={{ marginRight: 'auto', fontSize: 13, color: 'var(--ink)' }}>Replace the existing banner?</span>
              <button className="btn btn-sm" onClick={() => { setConfirmReplace(false); setNewFile(null); if (fileRef.current) fileRef.current.value = '' }} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setConfirmReplace(false); save() }} disabled={saving}>{saving ? 'Saving…' : 'Replace'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

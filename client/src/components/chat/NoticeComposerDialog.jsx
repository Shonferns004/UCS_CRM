import { useState, useEffect, useRef, useCallback } from 'react'
import { isAuthError } from './chatApi'
import { validateChatFile, isImageMime, humanFileSize } from './chatIdentity'
import { CloseIcon, MegaphoneIcon, AlertIcon } from './chatIcons'

const MAX_TITLE = 120
const MAX_IMAGES = 8

/**
 * Notice composer — Super Admin, Accounts and Admin, group rooms only.
 *
 * A notice is a broadcast, not a message: it may carry a headline, the body
 * text and up to eight images, and every member of the room gets it as a
 * one-time popup. That is why it lives behind its own dialog instead of the
 * normal composer — the extra fields have no home in a chat bubble's input,
 * and sending one has consequences (a popup on every screen) that a keystroke
 * should not be able to trigger.
 *
 * The title is optional on purpose: a body-only or image-only notice is a
 * legitimate announcement, and forcing a headline produced filler titles.
 *
 * The server re-checks all of it (group-only, admin-only, title ≤ 120 when
 * present, images only); the checks here are so the user is told before the
 * round trip, not to enforce anything.
 */
export default function NoticeComposerDialog({ conversation, onClose, onSend }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const [fileError, setFileError] = useState('')
  const [previews, setPreviews] = useState([])
  const [saving, setSaving] = useState(false)

  const dialogRef = useRef(null)
  const titleRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!nodes?.length) return
      const list = Array.from(nodes).filter((n) => !n.disabled && n.offsetParent !== null)
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // One object URL per selected image; every URL has to be revoked when the
  // selection changes or the dialog closes, or each cancelled notice leaks
  // its images for the session.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  const attach = useCallback(
    (pickedList) => {
      const picked = Array.from(pickedList || [])
      if (!picked.length) return
      const room = MAX_IMAGES - files.length
      if (room <= 0) {
        setFileError(`A notice can carry at most ${MAX_IMAGES} images`)
        return
      }
      const accepted = []
      let err = ''
      for (const f of picked) {
        if (accepted.length >= room) {
          err = `Only ${room} more image${room === 1 ? '' : 's'} fit (max ${MAX_IMAGES})`
          break
        }
        const v = validateChatFile(f)
        if (!v.ok) {
          err = `${f.name}: ${v.reason}`
          continue
        }
        if (!isImageMime(f.type)) {
          err = `${f.name}: a notice can only carry images`
          continue
        }
        accepted.push(f)
      }
      if (accepted.length) setFiles((prev) => [...prev, ...accepted])
      setFileError(err)
    },
    [files.length]
  )

  const removeFile = useCallback((index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setFileError('')
    // Clearing the input lets the same file be re-picked after a full remove.
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  const canSend =
    (trimmedBody.length > 0 || files.length > 0) && !fileError && !saving

  async function submit(e) {
    e?.preventDefault?.()
    if (!canSend) return
    setSaving(true)
    try {
      // onSend owns the request (and any toast), matching the chat composer's
      // contract — the dialog only closes on the way out.
      await onSend({ title: trimmedTitle || null, body: trimmedBody, files })
      onClose()
    } catch (err) {
      // Shown only if a caller chooses to rethrow; ChatWorkspace's send does
      // not, so this is the safety net rather than the main path.
      const msg = isAuthError(err)
        ? err.message || 'You cannot post notices in this group.'
        : err?.message || 'Could not send the notice.'
      setFileError(msg)
      setSaving(false)
    }
  }

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-notice-dialog-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-dialog-head">
          <span className="chat-notice-dialog-icon" aria-hidden="true">
            <MegaphoneIcon size={16} />
          </span>
          <h3 className="chat-dialog-title" id="chat-notice-dialog-title">
            Post a notice
          </h3>
          <button type="button" className="chat-iconbtn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <form className="chat-dialog-body" style={{ paddingTop: 12 }} onSubmit={submit}>
          <p className="chat-state-sub" style={{ marginBottom: 12 }}>
            Everyone in <strong>{conversation?.title || 'this group'}</strong> sees this once as a
            popup. It stays in the chat afterwards.
          </p>

          <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
            Title <span style={{ fontWeight: 500, color: 'var(--chat-muted)' }}>(optional)</span>
          </label>
          <div className="chat-field" style={{ marginBottom: 12 }}>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Office closed on Monday"
              maxLength={MAX_TITLE}
              aria-label="Notice title (optional)"
              style={{ width: '100%' }}
            />
          </div>

          <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
            Details
          </label>
          <textarea
            className="chat-notice-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What should everyone know?"
            rows={4}
            maxLength={4000}
            aria-label="Notice details"
          />

          <label className="chat-field-label" style={{ display: 'block', margin: '12px 0 6px' }}>
            Images ({files.length}/{MAX_IMAGES})
          </label>
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="chat-btn"
              onClick={() => fileRef.current?.click()}
              disabled={files.length >= MAX_IMAGES}
            >
              {files.length ? 'Add more images' : 'Choose images'}
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={(e) => {
                attach(e.target.files)
                // Reset so re-picking the same file after a remove fires change.
                e.target.value = ''
              }}
              tabIndex={-1}
            />
          </div>

          {files.length > 0 && (
            <div className="chat-notice-drafts">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="chat-notice-draft">
                  {previews[i] && <img src={previews[i]} alt="" className="chat-notice-draft-img" />}
                  <div className="chat-notice-draft-meta">
                    <span className="chat-person-name">{f.name}</span>
                    <br />
                    <span className="chat-person-role">{humanFileSize(f.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="chat-iconbtn"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${f.name}`}
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {fileError && (
            <p
              className="chat-state-sub"
              style={{ color: 'var(--chat-danger)', display: 'flex', gap: 6, alignItems: 'center' }}
            >
              <AlertIcon size={14} />
              {fileError}
            </p>
          )}

          <p className="chat-state-sub" style={{ marginTop: 12 }}>
            Add a title, details or at least one image.
          </p>
        </form>

        <div className="chat-dialog-foot">
          <button type="button" className="chat-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="chat-btn chat-btn-primary"
            onClick={submit}
            disabled={!canSend}
          >
            {saving ? 'Sending…' : 'Send notice'}
          </button>
        </div>
      </div>
    </div>
  )
}

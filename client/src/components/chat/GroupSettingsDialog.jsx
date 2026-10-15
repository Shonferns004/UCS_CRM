import { useState, useEffect, useRef, useCallback } from 'react'
import { Avatar } from '../ui'
import { chatApi, isAuthError } from './chatApi'
import { roleLabel } from './chatIdentity'
import { ChatState } from './ChatState'
import { CloseIcon, LockIcon } from './chatIcons'

/**
 * Group settings dialog — Super Admin, Accounts and Admin only.
 *
 * Three jobs, each backed by its own endpoint so partial saves are possible:
 *   1. rename the room
 *   2. change who may post: post_policy (role-based) and write_mode
 *      (per-member tick list, honoured only when write_mode='selected')
 *   3. delete the group outright
 *
 * The member tick list is read from GET /conversations/:id/participants and
 * written back as [{uid, can_post}] on PATCH. Admins are shown but their
 * ticks are locked — the server always lets them post regardless.
 */
export default function GroupSettingsDialog({ me, conversation, onClose, onUpdated, onDeleted }) {
  const [participants, setParticipants] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  const [title, setTitle] = useState(conversation?.title || '')
  const [postPolicy, setPostPolicy] = useState(conversation?.post_policy || 'everyone')
  const [writeMode, setWriteMode] = useState(conversation?.write_mode || 'everyone')
  const [ticks, setTicks] = useState(() => new Map())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const titleRef = useRef(null)

  const load = useCallback(() => {
    let live = true
    setState('loading')
    setError('')
    chatApi
      .getGroupParticipants(me, conversation.id)
      .then((list) => {
        if (!live) return
        const rows = Array.isArray(list) ? list : []
        setParticipants(rows)
        setTicks(new Map(rows.map((p) => [p.uid, p.can_post])))
        setState('ready')
      })
      .catch((e) => {
        if (!live) return
        setError(
          isAuthError(e)
            ? 'You do not have access to group settings.'
            : e.message || 'Could not load members.'
        )
        setState(isAuthError(e) ? 'locked' : 'error')
      })
    return () => {
      live = false
    }
  }, [me, conversation.id])

  useEffect(() => load(), [load])

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

  const isAdmin = (role) => role === 'super_admin' || role === 'accounts' || role === 'admin'
  const canSubmit = title.trim().length > 0 && !saving

  const toggleTick = (uid, locked) => {
    if (locked) return
    setTicks((prev) => {
      const next = new Map(prev)
      next.set(uid, !next.get(uid))
      return next
    })
  }

  const save = (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSaving(true)
    const members = participants.map((p) => ({
      uid: p.uid,
      canPost: isAdmin(p.role) ? true : !!ticks.get(p.uid),
    }))
    chatApi
      .updateGroupSettings(me, conversation.id, {
        title: title.trim(),
        postPolicy,
        writeMode,
        members,
      })
      .then((dto) => {
        onUpdated?.(dto)
        onClose()
      })
      .catch((err) => {
        setError(err.message || 'Could not save settings.')
      })
      .finally(() => setSaving(false))
  }

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setDeleteError('')
    chatApi
      .deleteConversation(me, conversation.id)
      .then(() => {
        onDeleted?.(conversation.id)
        onClose()
      })
      .catch((err) => {
        setDeleteError(err.message || 'Could not delete the group.')
        setConfirmDelete(false)
      })
      .finally(() => setDeleting(false))
  }

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-group-settings-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-dialog-head">
          <h3 className="chat-dialog-title" id="chat-group-settings-title">
            Group settings
          </h3>
          <button
            ref={closeRef}
            type="button"
            className="chat-iconbtn"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <form className="chat-dialog-body" style={{ paddingTop: 12 }} onSubmit={save}>
          {state === 'loading' && <p className="chat-state-sub">Loading members…</p>}

          {state === 'locked' && (
            <ChatState
              kind="locked"
              icon={LockIcon}
              title="Settings are not available"
              sub={error}
            />
          )}

          {state === 'error' && (
            <ChatState
              kind="error"
              title="Could not load members"
              sub={error}
              actionLabel="Try again"
              onAction={load}
            />
          )}

          {state === 'ready' && (
            <>
              <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Group name
              </label>
              <div className="chat-field" style={{ marginBottom: 12 }}>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Group name"
                  maxLength={80}
                  aria-label="Group name"
                  style={{ width: '100%' }}
                />
              </div>

              <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Who can post
              </label>
              <div style={{ marginBottom: 12 }}>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="post_policy"
                    checked={postPolicy === 'everyone'}
                    onChange={() => setPostPolicy('everyone')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">Everyone in the group</span>
                    <br />
                    <span className="chat-person-role">All members can send messages</span>
                  </span>
                </label>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="post_policy"
                    checked={postPolicy === 'admins_only'}
                    onChange={() => setPostPolicy('admins_only')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">Admins only</span>
                    <br />
                    <span className="chat-person-role">
                      Super Admin, Accounts and Admin can post; others read
                    </span>
                  </span>
                </label>
              </div>

              <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Individual chat permission
              </label>
              <div style={{ marginBottom: 12 }}>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="write_mode"
                    checked={writeMode === 'everyone'}
                    onChange={() => setWriteMode('everyone')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">All members</span>
                    <br />
                    <span className="chat-person-role">
                      Everyone above the role gate may post
                    </span>
                  </span>
                </label>
                <label className="chat-pickrow">
                  <input
                    type="radio"
                    name="write_mode"
                    checked={writeMode === 'selected'}
                    onChange={() => setWriteMode('selected')}
                  />
                  <span className="chat-pickrow-body">
                    <span className="chat-person-name">Only selected members</span>
                    <br />
                    <span className="chat-person-role">
                      Tick who can chat below; everyone else reads
                    </span>
                  </span>
                </label>
              </div>

              <label className="chat-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Members ({participants.length})
              </label>
              <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
                {participants.map((p) => {
                  const locked = isAdmin(p.role)
                  const checked = locked || (writeMode === 'everyone' ? true : !!ticks.get(p.uid))
                  return (
                    <label key={p.uid} className="chat-pickrow">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked || writeMode === 'everyone'}
                        onChange={() => toggleTick(p.uid, locked)}
                        aria-label={`${p.name} can chat`}
                      />
                      <Avatar name={p.name} size={32} />
                      <span className="chat-pickrow-body">
                        <span className="chat-person-name">{p.name}</span>
                        <br />
                        <span className="chat-person-role">{roleLabel(p.role)}</span>
                      </span>
                    </label>
                  )
                })}
                {participants.length === 0 && (
                  <p className="chat-state-sub">No members found.</p>
                )}
              </div>

              {error && (
                <p className="chat-state-sub" style={{ color: 'var(--danger, #b91c1c)' }}>
                  {error}
                </p>
              )}
            </>
          )}
        </form>

        <div
          className="chat-dialog-foot"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <button
            type="button"
            className="chat-btn chat-btn-danger"
            onClick={remove}
            disabled={deleting || saving}
          >
            {deleting
              ? 'Deleting…'
              : confirmDelete
                ? 'Really delete? This cannot be undone'
                : 'Delete group'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="chat-btn" onClick={onClose}>
              Cancel
            </button>
            {state === 'ready' && (
              <button
                type="button"
                className="chat-btn chat-btn-primary"
                onClick={save}
                disabled={!canSubmit}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
        {deleteError && (
          <p
            className="chat-state-sub"
            style={{ color: 'var(--danger, #b91c1c)', padding: '0 16px 12px', margin: 0 }}
          >
            {deleteError}
          </p>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { Avatar } from '../ui'
import { chatApi, isAuthError } from './chatApi'
import { roleLabel } from './chatIdentity'
import { ChatState } from './ChatState'
import { CloseIcon, LockIcon, CheckIcon } from './chatIcons'

/**
 * Read-only member roster for a group room, openable by any participant.
 *
 * Fetches GET /conversations/:id/participants and renders each person with
 * their name, role and a small "can chat" badge when the room uses the
 * 'selected' write mode. Admins are always shown as can-chat.
 */
export default function GroupMembersPanel({ me, conversation, onClose }) {
  const [participants, setParticipants] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  const dialogRef = useRef(null)

  const load = useCallback(() => {
    let live = true
    setState('loading')
    setError('')
    chatApi
      .getGroupParticipants(me, conversation.id)
      .then((list) => {
        if (!live) return
        setParticipants(Array.isArray(list) ? list : [])
        setState('ready')
      })
      .catch((e) => {
        if (!live) return
        setError(
          isAuthError(e)
            ? 'You do not have access to this group.'
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
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const isAdmin = (role) => role === 'super_admin' || role === 'accounts' || role === 'admin'
  const showWriteBadge = conversation?.write_mode === 'selected'

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-group-members-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-dialog-head">
          <h3 className="chat-dialog-title" id="chat-group-members-title">
            Members — {conversation?.title || 'Group'}
          </h3>
          <button
            type="button"
            className="chat-iconbtn"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="chat-dialog-body" style={{ paddingTop: 12 }}>
          {state === 'loading' && <p className="chat-state-sub">Loading members…</p>}

          {state === 'locked' && (
            <ChatState kind="locked" icon={LockIcon} title="Not available" sub={error} />
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
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {participants.map((p) => {
                const admin = isAdmin(p.role)
                return (
                  <div
                    key={p.uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--chat-border, #e5e7eb)',
                    }}
                  >
                    <Avatar name={p.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--chat-muted, #6b7280)' }}>
                        {roleLabel(p.role)}
                        {p.uid === me.uid ? ' · you' : ''}
                      </div>
                    </div>
                    {showWriteBadge && (
                      <span
                        title={p.can_post || admin ? 'Can chat' : 'Read-only'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background:
                            p.can_post || admin
                              ? 'rgba(16,185,129,.12)'
                              : 'rgba(107,114,128,.1)',
                          color: p.can_post || admin ? '#059669' : '#6b7280',
                        }}
                      >
                        {p.can_post || admin ? (
                          <>
                            <CheckIcon size={12} /> Can chat
                          </>
                        ) : (
                          'Read-only'
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
              {participants.length === 0 && (
                <p className="chat-state-sub">No members found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

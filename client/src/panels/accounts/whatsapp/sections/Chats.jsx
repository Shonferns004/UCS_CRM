import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  BellOff,
  CheckCheck,
  Copy,
  File,
  Paperclip,
  Pencil,
  Pin,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
} from 'lucide-react'
import { Badge, Empty, ErrorNote, Field, Spinner, STATUS_LABELS, errorMessage } from '../ui'
import { gateway } from '../gateway'

const MEDIA_TYPES = ['image', 'sticker', 'video', 'audio', 'voice', 'document']
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024

function asDate(value) {
  if (!value) return null
  const millis = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value)
  if (Number.isNaN(millis)) return null
  return new Date(millis)
}

function fmt(value) {
  const date = asDate(value)
  return date ? date.toLocaleString() : '—'
}

function mediaKind(file) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

function normalizeMessages(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.messages || []
  return [...rows].sort((a, b) => (asDate(a.timestamp || a.createdAt)?.getTime() || 0) - (asDate(b.timestamp || b.createdAt)?.getTime() || 0))
}

function MessageMedia({ sessionId, chatId, message }) {
  const isMedia = MEDIA_TYPES.includes(message.type)
  const [state, setState] = useState({ url: null, failed: false })

  useEffect(() => {
    if (!isMedia) return undefined
    let alive = true
    let objectUrl = null
    setState({ url: null, failed: false })
    gateway
      .messageMedia(sessionId, chatId, message.id)
      .then(async (response) => {
        if (!response.ok) throw new Error(`media ${response.status}`)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        if (!alive) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setState({ url, failed: false })
      })
      .catch(() => {
        if (alive) setState({ url: null, failed: true })
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [sessionId, chatId, message.id, isMedia])

  if (!isMedia) return null
  if (state.failed) return <div className="owa-small" style={{ opacity: 0.7 }}>[{message.type} not available]</div>
  if (!state.url) return <div className="owa-small" style={{ opacity: 0.7 }}>Loading {message.type}…</div>

  if (message.type === 'image' || message.type === 'sticker') {
    return (
      <div className="owa-msg-media">
        <img src={state.url} alt={message.type} onClick={() => window.open(state.url, '_blank')} />
      </div>
    )
  }
  if (message.type === 'video') {
    return (
      <div className="owa-msg-media">
        <video src={state.url} controls />
      </div>
    )
  }
  if (message.type === 'audio' || message.type === 'voice') {
    return (
      <div className="owa-msg-media">
        <audio src={state.url} controls />
      </div>
    )
  }
  return (
    <div className="owa-msg-media">
      <a href={state.url} download={message.metadata?.media?.filename || message.id}>
        <File size={14} /> Download attachment
      </a>
    </div>
  )
}

export default function ChatsSection() {
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState('')
  const [chats, setChats] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageLoading, setMessageLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [attach, setAttach] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [busyMessage, setBusyMessage] = useState(null)
  const [chatActionBusy, setChatActionBusy] = useState(false)
  const [error, setError] = useState('')
  const messagesEnd = useRef(null)
  const fileInput = useRef(null)

  useEffect(() => {
    gateway
      .listSessions()
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setSessions(list)
        const ready = list.find((session) => session.status === 'ready')
        setSessionId((current) => current || ready?.id || list[0]?.id || '')
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const loadChats = useCallback(
    async (silent = false) => {
      if (!sessionId) return
      if (!silent) setChatLoading(true)
      try {
        const data = await gateway.listChats(sessionId)
        setChats(Array.isArray(data) ? data : [])
        setError('')
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        if (!silent) setChatLoading(false)
      }
    },
    [sessionId],
  )

  useEffect(() => {
    setActiveChat(null)
    setMessages([])
    loadChats()
  }, [loadChats])

  const loadMessages = useCallback(
    async (chat) => {
      if (!sessionId || !chat) return
      setMessageLoading(true)
      try {
        const data = await gateway.listMessages(sessionId, chat.id, { limit: 80 })
        setMessages(normalizeMessages(data))
        setError('')
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setMessageLoading(false)
      }
    },
    [sessionId],
  )

  useEffect(() => {
    if (!activeChat) return undefined
    loadMessages(activeChat)
    const timer = setInterval(() => loadMessages(activeChat), 12000)
    return () => clearInterval(timer)
  }, [activeChat, loadMessages])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const selectChat = (chat) => {
    setActiveChat(chat)
    setReplyTo(null)
    // Opening a conversation is the natural "read" action; failure is not worth a toast.
    gateway.markRead(sessionId, chat.id).catch(() => {})
  }

  const pickFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('Attachment is too large. Maximum 6 MB.')
      return
    }
    const kind = mediaKind(file)
    const reader = new FileReader()
    reader.onerror = () => setError('Could not read that file.')
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const base64 = dataUrl.split(',')[1] || ''
      setAttach({
        file,
        kind,
        base64,
        mimetype: file.type || 'application/octet-stream',
        filename: file.name,
        preview: kind === 'image' ? dataUrl : null,
      })
    }
    reader.readAsDataURL(file)
  }

  const sendMessage = async () => {
    const text = draft.trim()
    if ((!text && !attach) || !activeChat) return
    setSending(true)
    setError('')
    try {
      if (attach) {
        const payload = {
          chatId: activeChat.id,
          base64: attach.base64,
          mimetype: attach.mimetype,
          filename: attach.filename,
        }
        // Audio carries no caption on either engine.
        if (attach.kind !== 'audio' && text) payload.caption = text
        if (replyTo?.waMessageId) payload.quotedMessageId = replyTo.waMessageId
        await gateway.sendMedia(sessionId, attach.kind, payload)
      } else if (replyTo?.waMessageId) {
        await gateway.reply(sessionId, activeChat.id, replyTo.waMessageId, text)
      } else {
        await gateway.sendText(sessionId, activeChat.id, text)
      }
      setDraft('')
      setAttach(null)
      setReplyTo(null)
      await loadMessages(activeChat)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const runMessageAction = async (message, action) => {
    if (!activeChat) return
    setBusyMessage(message.id)
    setError('')
    try {
      await action()
      await loadMessages(activeChat)
      await loadChats(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyMessage(null)
    }
  }

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message.body || '')
    } catch {
      /* clipboard unavailable */
    }
  }

  const editMessage = (message) => {
    const next = window.prompt('Edit message', message.body || '')
    if (next === null || !next.trim()) return
    runMessageAction(message, () =>
      gateway.editMessage(sessionId, activeChat.id, message.waMessageId || message.id, next.trim()),
    )
  }

  const deleteMessage = (message) => {
    if (!window.confirm('Delete this message for everyone?')) return
    runMessageAction(message, () =>
      gateway.deleteMessage(sessionId, activeChat.id, message.waMessageId || message.id, true),
    )
  }

  const runChatAction = async (action, options = {}) => {
    if (!activeChat) return
    if (options.confirm && !window.confirm(options.confirm)) return
    setChatActionBusy(true)
    setError('')
    try {
      await action()
      if (!options.keepChat) {
        await loadChats(true)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setChatActionBusy(false)
    }
  }

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return chats
    return chats.filter(
      (chat) =>
        String(chat.name || '').toLowerCase().includes(query) ||
        String(chat.id || '').toLowerCase().includes(query),
    )
  }, [chats, search])

  const activeSession = sessions.find((session) => session.id === sessionId)

  return (
    <div className="owa-page">
      <ErrorNote error={error} onRetry={() => loadChats()} />

      <div className="owa-card">
        <div className="owa-card-body">
          <div className="owa-toolbar">
            <Field label="Session">
              <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} style={{ minWidth: 240 }}>
                {sessions.length === 0 && <option value="">No sessions</option>}
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} — {STATUS_LABELS[session.status] || session.status}
                  </option>
                ))}
              </select>
            </Field>
            <button className="owa-btn" onClick={() => loadChats()} disabled={chatLoading || !sessionId}>
              {chatLoading ? <Spinner size={14} /> : <Search size={14} />} Load chats
            </button>
            {activeSession && activeSession.status !== 'ready' && (
              <Badge tone="warn">Session is {STATUS_LABELS[activeSession.status] || activeSession.status} — start it to send messages</Badge>
            )}
          </div>
        </div>
      </div>

      {!sessionId ? (
        <Empty icon={Search} title="No session selected" text="Create and start a session first." />
      ) : (
        <div className="owa-chat-grid">
          <div className="owa-chat-list">
            <div className="owa-chat-list-head">
              <div className="owa-search" style={{ width: '100%' }}>
                <Search size={14} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search chats"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="owa-chat-items">
              {chatLoading && chats.length === 0 ? (
                <div className="owa-empty"><Spinner size={20} /></div>
              ) : filteredChats.length === 0 ? (
                <div className="owa-table-empty">No chats available.</div>
              ) : (
                filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={`owa-chat-item ${activeChat?.id === chat.id ? 'active' : ''}`}
                    onClick={() => selectChat(chat)}
                  >
                    <span className="owa-chat-item-top">
                      <strong>{chat.name || chat.id}</strong>
                      <span>{fmt(chat.timestamp)}</span>
                    </span>
                    <small>
                      {chat.pinned ? '📌 ' : ''}
                      {chat.archived ? '🗄 ' : ''}
                      {chat.lastMessage || chat.id}
                    </small>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="owa-thread">
            {activeChat ? (
              <>
                <div className="owa-thread-head">
                  <div>
                    <h3>{activeChat.name || activeChat.id}</h3>
                    <small className="owa-mono">{activeChat.id}</small>
                  </div>
                  <div className="owa-thread-actions">
                    <Badge tone={activeChat.isGroup ? 'info' : 'neutral'}>{activeChat.isGroup ? 'Group' : 'Direct'}</Badge>
                    <button
                      className="owa-icon-btn"
                      title="Mark as read"
                      disabled={chatActionBusy}
                      onClick={() => runChatAction(() => gateway.markRead(sessionId, activeChat.id), { keepChat: true })}
                    >
                      <CheckCheck size={13} />
                    </button>
                    <button
                      className="owa-icon-btn"
                      title={activeChat.pinned ? 'Unpin chat' : 'Pin chat'}
                      disabled={chatActionBusy}
                      onClick={() => runChatAction(() => gateway.pinChat(sessionId, activeChat.id, !activeChat.pinned))}
                    >
                      <Pin size={13} />
                    </button>
                    <button
                      className="owa-icon-btn"
                      title={activeChat.muted ? 'Unmute chat' : 'Mute for 8 hours'}
                      disabled={chatActionBusy}
                      onClick={() =>
                        runChatAction(() =>
                          gateway.muteChat(sessionId, activeChat.id, activeChat.muted ? null : Date.now() + 8 * 3600 * 1000),
                        )
                      }
                    >
                      <BellOff size={13} />
                    </button>
                    <button
                      className="owa-icon-btn"
                      title={activeChat.archived ? 'Unarchive chat' : 'Archive chat'}
                      disabled={chatActionBusy}
                      onClick={() => runChatAction(() => gateway.archiveChat(sessionId, activeChat.id, !activeChat.archived))}
                    >
                      <Archive size={13} />
                    </button>
                    <button
                      className="owa-icon-btn danger"
                      title="Delete chat"
                      disabled={chatActionBusy}
                      onClick={() =>
                        runChatAction(
                          async () => {
                            await gateway.deleteChat(sessionId, activeChat.id)
                            setActiveChat(null)
                            setMessages([])
                          },
                          { confirm: 'Delete this chat? The conversation is removed from the WhatsApp account.' },
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="owa-messages">
                  {messageLoading && messages.length === 0 ? (
                    <div className="owa-empty"><Spinner size={20} /></div>
                  ) : messages.length === 0 ? (
                    <div className="owa-table-empty">No messages in this chat yet.</div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className={`owa-msg ${message.direction === 'outgoing' ? 'out' : ''}`}>
                        <MessageMedia sessionId={sessionId} chatId={activeChat.id} message={message} />

                        {message.body ? (
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.body}</div>
                        ) : message.type && !MEDIA_TYPES.includes(message.type) ? (
                          <div className="owa-small" style={{ opacity: 0.75 }}>[{message.type}]</div>
                        ) : null}

                        <div className="owa-msg-meta">
                          <span>{fmt(message.createdAt || message.timestamp)}</span>
                          {message.status && <span>{message.status}</span>}
                        </div>

                        <div className="owa-msg-actions">
                          {message.waMessageId && (
                            <button title="Reply" onClick={() => setReplyTo(message)}><Reply size={12} /></button>
                          )}
                          <button
                            title="React 👍"
                            disabled={busyMessage === message.id}
                            onClick={() =>
                              runMessageAction(message, () =>
                                gateway.react(sessionId, activeChat.id, message.waMessageId || message.id, '👍'),
                              )
                            }
                          >
                            <Smile size={12} />
                          </button>
                          {message.body && (
                            <button title="Copy" onClick={() => copyMessage(message)}><Copy size={12} /></button>
                          )}
                          {message.direction === 'outgoing' && message.type === 'text' && (
                            <button title="Edit" disabled={busyMessage === message.id} onClick={() => editMessage(message)}>
                              <Pencil size={12} />
                            </button>
                          )}
                          {message.direction === 'outgoing' && (
                            <button title="Delete" disabled={busyMessage === message.id} onClick={() => deleteMessage(message)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEnd} />
                </div>

                <div className="owa-composer-wrap">
                  {attach && (
                    <div className="owa-composer-tools">
                      <div className="owa-attachment-chip">
                        {attach.preview ? <img src={attach.preview} alt="preview" /> : <File size={16} />}
                        <strong>{attach.filename}</strong>
                        <span>{Math.round(attach.file.size / 1024)} KB · {attach.kind}</span>
                        <button className="owa-icon-btn" title="Remove attachment" onClick={() => setAttach(null)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                  {replyTo && (
                    <div className="owa-composer-tools">
                      <div className="owa-reply-banner">
                        <Reply size={13} />
                        <span>Replying to: {replyTo.body || `[${replyTo.type}]`}</span>
                        <button className="owa-icon-btn" title="Cancel reply" onClick={() => setReplyTo(null)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="owa-composer-tools">
                    <input
                      ref={fileInput}
                      type="file"
                      className="owa-file-input"
                      onChange={pickFile}
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                    />
                    <button className="owa-icon-btn" title="Attach file" onClick={() => fileInput.current?.click()}>
                      <Paperclip size={14} />
                    </button>
                    <span className="owa-small owa-muted">Image, video, audio or document · max 6 MB</span>
                  </div>
                  <div className="owa-composer">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={attach ? 'Caption for the attachment…' : 'Type a message…'}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          sendMessage()
                        }
                      }}
                    />
                    <button
                      className="owa-btn owa-btn-primary"
                      onClick={sendMessage}
                      disabled={sending || (!draft.trim() && !attach)}
                    >
                      {sending ? <Spinner size={14} /> : <Send size={14} />} Send
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <Empty icon={Search} title="Select a chat" text="Pick a conversation on the left to read and reply." />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

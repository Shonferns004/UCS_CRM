import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUcs } from '../../store'
import { toast } from '../Toast'
import { Avatar } from '../ui'
import { chatApi, isAuthError } from './chatApi'
import { resolveChatIdentity, isChatAdmin } from './chatIdentity'
import { useTypingIn, useUnreadCount, announceUnreadChanged } from './useChatRealtime'
import ConversationList from './ConversationList'
import MessageThread from './MessageThread'
import ChatComposer from './ChatComposer'
import ChatSearch from './ChatSearch'
import ReadOnlyBanner from './ReadOnlyBanner'
import PeoplePicker from './PeoplePicker'
import GroupCreateDialog from './GroupCreateDialog'
import GroupSettingsDialog from './GroupSettingsDialog'
import GroupMembersPanel from './GroupMembersPanel'
import { ChatState, ChatThreadSkeleton } from './ChatState'
import { ChatIcon, BackIcon, SearchIcon, SettingsIcon, TrashIcon } from './chatIcons'
import './chat.css'

/**
 * The whole chat feature, as one embeddable surface.
 *
 * Every host panel mounts this same component and only differs in which
 * capabilities the resolved identity grants. Below 768px it switches to a single
 * pane driven by `data-view`, because the two-column grid is unusable at phone
 * widths and a squeezed thread is worse than a deliberate drill-down.
 */
export default function ChatWorkspace() {
  const { user } = useUcs()
  const me = useMemo(() => resolveChatIdentity(user), [user])
  const navigate = useNavigate()

  // Below 768px the two-column grid collapses to a single pane, so the back
  // control has to mean "show the conversation list again". At wider widths the
  // list is already visible next to the thread and going "back" has to mean
  // leaving Community for the page the user came from. Tracked as state rather
  // than read once, so rotating or resizing the window switches the behaviour
  // live instead of leaving a stale target.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e) => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    setNarrow(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const [conversations, setConversations] = useState([])
  const [listStatus, setListStatus] = useState('loading')
  const [listError, setListError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('list')
  const [filter, setFilter] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [optimistic, setOptimistic] = useState([])
  const [unreadKey, setUnreadKey] = useState(0)
  // Deleting a personal chat is armed per conversation: switching rooms drops
  // the armed state so a stray second click cannot delete the next DM.
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deletingChat, setDeletingChat] = useState(false)

  const active = conversations.find((c) => c.id === activeId) || null
  const typers = useTypingIn(activeId)
  const { refresh: refreshUnread } = useUnreadCount(me, unreadKey)

  /**
   * Whether the composer should render for the active room.
   *
   * Three independent gates, checked in order of cheapness:
   *   1. the role must be a writer at all;
   *   2. an admins-only group keeps the composer for the three admin roles;
   *   3. a "selected members" group shows it only for the caller when the
   *      server reported my_can_post=true (admins always get the composer so
   *      they can untick themselves or others).
   * Checking it here rather than in the composer keeps the read path untouched
   * — a non-admin can still open and read the room, they just get no input box.
   */
  const canWriteHere = useMemo(() => {
    if (!me.canPost || !active) return false
    if (active.kind !== 'group') return true
    if (active.post_policy === 'admins_only') return isChatAdmin(me.role)
    if (active.write_mode === 'selected') return isChatAdmin(me.role) || !!active.my_can_post
    return true
  }, [me, active])

  // ---- conversation list --------------------------------------------------
  const loadConversations = useCallback(async () => {
    if (!me?.uid) return
    setListStatus('loading')
    setListError('')
    try {
      const list = await chatApi.listConversations(me)
      const arr = Array.isArray(list) ? list : []
      setConversations(arr)
      setListStatus('ready')
      // Land on the first group the user is actually in. The old slug-based
      // preference for a seeded "community" room meant anyone not in that room
      // (e.g. an HR user added only to a Notices group) saw an empty rail.
      setActiveId((prev) => {
        if (prev && arr.some((c) => c.id === prev)) return prev
        return arr.find((c) => c.kind === 'group')?.id || arr[0]?.id || null
      })
    } catch (e) {
      setListError(e.message || 'Could not load conversations.')
      setListStatus(isAuthError(e) ? 'locked' : 'error')
    }
  }, [me])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Same fetch as loadConversations but without the loading state: used when a
  // conversation:created frame arrives for a room we were just seated in, so
  // the rail gains the row in place with no skeleton flash and no re-selection.
  const refreshConversations = useCallback(async () => {
    if (!me?.uid) return
    try {
      const list = await chatApi.listConversations(me)
      if (Array.isArray(list)) setConversations(list)
    } catch {
      // A background refresh failing is not worth interrupting the open room;
      // the next load (navigation, reconnect) retries it.
    }
  }, [me])

  // Keep previews, ordering and unread counts live without refetching the list.
  useEffect(() => {
    if (!me?.uid) return
    return chatApi.subscribe((evt) => {
      if (evt.type === 'conversation:created' && evt.conversation_id) {
        // A room we were just seated in (a group created by an admin, or a DM
        // opened against us). Our socket is not in its room yet, so rejoin and
        // silently refresh the rail - otherwise the row only appears on reload.
        chatApi.rejoinRooms()
        refreshConversations()
      }
      if (evt.type === 'message:new' && evt.message) {
        const m = evt.message
        setConversations((prev) => {
          const i = prev.findIndex((c) => c.id === m.conversation_id)
          if (i === -1) return prev
          const next = prev.slice()
          const conv = next[i]
          next[i] = {
            ...conv,
            last_message: {
              id: m.id,
              sender_name: m.sender_name,
              body: m.deleted_at
                ? 'This message was deleted'
                : m.notice_title
                  ? // A notice's headline is what the rail should tease.
                    m.notice_title
                  : m.attachment && !m.body
                    ? m.attachment.name
                    : m.body,
              created_at: m.created_at,
              deleted: !!m.deleted_at,
            },
            unread_count:
              m.sender_uid === me.uid
                ? conv.unread_count
                : m.conversation_id === activeId
                  ? 0
                  : (conv.unread_count || 0) + 1,
          }
          // Most recent activity floats to the top, group room pinned separately.
          return [...next.filter((_, idx) => idx !== i), next[i]]
        })
        setUnreadKey((k) => k + 1)
      }
      if (evt.type === 'message:update' && evt.message) {
        const m = evt.message
        setConversations((prev) =>
          prev.map((c) =>
            c.id === m.conversation_id && c.last_message?.id === m.id
              ? {
                  ...c,
                  last_message: {
                    ...c.last_message,
                    body: m.deleted_at
                      ? 'This message was deleted'
                      : m.notice_title
                        ? m.notice_title
                        : m.attachment && !m.body
                          ? m.attachment.name
                          : m.body,
                    deleted: !!m.deleted_at,
                  },
                }
              : c
          )
        )
      }
      if (evt.type === 'conversation:update' && evt.conversation) {
        // A rename or policy flip made by another admin, or by ourselves via
        // the settings dialog. Replace the rail entry in place.
        const convo = evt.conversation
        setConversations((prev) => prev.map((c) => (c.id === convo.id ? { ...c, ...convo } : c)))
      }
      if (evt.type === 'conversation:deleted' && evt.conversation_id) {
        const id = evt.conversation_id
        // Drop the room from the rail; if it was open, go back to the list so
        // the thread pane does not keep rendering a conversation that no longer
        // exists server-side.
        setConversations((prev) => prev.filter((c) => c.id !== id))
        setActiveId((prev) => (prev === id ? null : prev))
      }
    })
  }, [me, activeId, refreshConversations])

  // ---- selection ----------------------------------------------------------
  const select = useCallback((c) => {
    setActiveId(c.id)
    setView('thread')
    setSearchOpen(false)
    setHighlightId(null)
    setOptimistic([])
    // Opening a room clears its badge immediately; the server call follows.
    setConversations((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, unread_count: 0 } : x))
    )
    setUnreadKey((k) => k + 1)
  }, [])

  const handleMarkRead = useCallback(    async (convoId, messageId) => {
      if (!convoId || !messageId) return
      // Wait for the server to actually move the read cursor BEFORE re-reading
      // the totals. Refreshing in parallel races the POST and can come back
      // with the count the user just cleared, which is what left the badge
      // showing a stale number.
      try {
        await chatApi.markRead(me, convoId, messageId)
      } catch {
        // A failed cursor write is not worth interrupting the read view over;
        // the next message, focus or mount will retry it.
      }
      setUnreadKey((k) => k + 1)
      // Nudge every other copy of the total (the sidebar badge), not just ours.
      announceUnreadChanged()
    },
    [me]
  )

  // ---- back ----------------------------------------------------------------
  // "Back" has to mean the obvious thing per layout, and navigate(-1) on its own
  // did not: on a wide layout it followed browser history, so opening Community
  // from the sidebar and pressing back threw the user out to the Dashboard
  // instead of back to the conversation list they were just reading.
  const goBack = useCallback(() => {
    if (narrow) {
      // Phone: the list is a separate pane, so just reveal it again. Keep the
      // selection so re-opening the room is instant.
      setView('list')
      return
    }
    if (activeId) {
      // Desktop: the rail is already on screen, so close the thread and show
      // the "Select a conversation" placeholder rather than leaving Community.
      setActiveId(null)
      setView('list')
      return
    }
    // Nothing left to step back to inside the app, so honour history.
    navigate(-1)
  }, [narrow, activeId, navigate])

  // ---- sending ------------------------------------------------------------
  const send = useCallback(
    async ({ body, file, files = null, noticeTitle = null, isNotice = false }) => {
      if (!active) return
      const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const list = (Array.isArray(files) && files.length ? files : null) || (file ? [file] : [])
      const asAttachment = (f, i) => ({
        id: `tmp-att-${clientId}-${i}`,
        name: f.name,
        mime: f.type,
        size: f.size,
        url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : '#',
      })
      const entry = {
        id: `tmp-${clientId}`,
        client_id: clientId,
        conversation_id: active.id,
        sender_uid: me.uid,
        sender_name: me.name,
        sender_role: me.role,
        body,
        // Carried so a notice keeps its headline while it is still spinning,
        // and so a retry re-sends it as a notice rather than a plain message.
        is_notice: isNotice || !!noticeTitle,
        notice_title: noticeTitle || null,
        created_at: new Date().toISOString(),
        attachment: list[0] ? asAttachment(list[0], 0) : null,
        gallery: list.length ? list.map(asAttachment) : null,
        pending: true,
        failed: false,
        // Kept so a retry can re-send the same files without re-picking them.
        _files: list,
      }
      setOptimistic((prev) => [...prev, entry])

      try {
        const saved = await chatApi.sendMessage(me, active.id, {
          body,
          files: list,
          clientId,
          noticeTitle,
          isNotice: isNotice || !!noticeTitle,
        })
        // Reconcile from the HTTP response rather than waiting on the socket.
        // The realtime frame still arrives and is matched by client_id, so this
        // is idempotent — but if the socket is down the bubble still stops
        // spinning instead of hanging on "pending" forever.
        if (saved?.id) {
          setOptimistic((prev) =>
            prev.map((m) => (m.client_id === clientId ? { ...m, ...saved, pending: false, failed: false } : m))
          )
        }
      } catch (e) {
        setOptimistic((prev) =>
          prev.map((m) => (m.client_id === clientId ? { ...m, pending: false, failed: true } : m))
        )
        if (isAuthError(e)) {
          toast(e.message || 'You are not allowed to post here.', 'error')
        } else if (e?.message?.toLowerCase().includes('upload')) {
          // The server returns 503 with a descriptive message when file
          // storage is misconfigured (STORAGE_NOT_CONFIGURED). Surface it so
          // the user knows the text-only retry will work but the file will not.
          toast(e.message, 'error')
        }
      }
    },
    [active, me]
  )

  const retry = useCallback(
    async (message) => {
      const entry = optimistic.find((m) => m.client_id === message.client_id)
      if (!entry || !active) return
      setOptimistic((prev) =>
        prev.map((m) => (m.client_id === entry.client_id ? { ...m, pending: true, failed: false } : m))
      )
      try {
        await chatApi.sendMessage(me, active.id, {
          body: entry.body,
          files: entry._files || [],
          clientId: entry.client_id,
          // A failed notice must retry as a notice, or the headline it was
          // composed with silently becomes a plain message.
          noticeTitle: entry.notice_title || null,
          isNotice: !!entry.is_notice,
        })
      } catch {
        setOptimistic((prev) =>
          prev.map((m) => (m.client_id === entry.client_id ? { ...m, pending: false, failed: true } : m))
        )
      }
    },
    [optimistic, active, me]
  )

  // ---- new direct message -------------------------------------------------
  const startDirect = useCallback(
    async (person) => {
      setPickerOpen(false)
      try {
        const convo = await chatApi.createDirect(me, person.id)
        setConversations((prev) => {
          const exists = prev.find((c) => c.id === convo.id)
          return exists ? prev.map((c) => (c.id === convo.id ? convo : c)) : [convo, ...prev]
        })
        select(convo)
        // The socket joined its rooms on connect and this room did not exist
        // then, so tell it to re-resolve or neither side gets live messages.
        chatApi.rejoinRooms()
      } catch (e) {
        toast(e.message || 'Could not open that conversation.', 'error')
      }
    },
    [me, select]
  )

  // ---- new group room -----------------------------------------------------
  const startGroup = useCallback(
    async ({ title, postPolicy, members }) => {
      setGroupOpen(false)
      try {
        const convo = await chatApi.createGroup(me, { title, postPolicy, members })
        setConversations((prev) => {
          const exists = prev.find((c) => c.id === convo.id)
          return exists ? prev.map((c) => (c.id === convo.id ? convo : c)) : [convo, ...prev]
        })
        select(convo)
        // Same reason as startDirect: the room did not exist when the socket
        // connected, so neither side would get live messages without a rejoin.
        chatApi.rejoinRooms()
      } catch (e) {
        toast(e.message || 'Could not create the group.', 'error')
      }
    },
    [me, select]
  )

  // ---- delete a personal chat ---------------------------------------------
  // Two-press confirm (arm, then delete) like the group-settings dialog.
  // Chat admins only — the server enforces the same rule and the broadcast
  // drops the chat from the other person's rail too.
  const removeDirect = useCallback(() => {
    if (!active || active.kind !== 'direct' || deletingChat) return
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    setDeletingChat(true)
    chatApi
      .deleteConversation(me, active.id)
      .then(() => {
        setConversations((prev) => prev.filter((c) => c.id !== active.id))
        setActiveId((prev) => (prev === active.id ? null : prev))
        toast('Chat deleted.', 'success')
      })
      .catch((err) => {
        toast(err.message || 'Could not delete the chat.', 'error')
        setDeleteArmed(false)
      })
      .finally(() => setDeletingChat(false))
  }, [active, me, deleteArmed, deletingChat])

  // ---- render -------------------------------------------------------------
  if (!me?.uid) {
    return (
      <div className="chat-page chat-scope">
        <ChatState kind="locked" title="Sign in to use Community" sub="Your session has expired." />
      </div>
    )
  }

  if (listStatus === 'locked') {
    return (
      <div className="chat-page chat-scope">
        <ChatState
          kind="locked"
          title="Community is not available for your account"
          sub={listError || 'Ask a Super Admin to add you to the community room.'}
        />
      </div>
    )
  }

  const showThreadPane = !!active

  return (
    <div className="chat-page chat-scope">
      <div className="chat-workspace" data-view={view}>
        <aside className="chat-rail" aria-label="Conversations">
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={select}
            filter={filter}
            onFilter={setFilter}
            loading={listStatus === 'loading'}
            error={listStatus === 'error' ? listError : ''}
            onRetry={loadConversations}
            canDm={me.canDm}
            canCreateGroup={me.canCreateGroup}
            onNewMessage={() => setPickerOpen(true)}
            onNewGroup={() => setGroupOpen(true)}
            loadingNode={<ChatThreadSkeleton rows={6} />}
          />
        </aside>

        <section className="chat-thread" aria-label="Conversation">
          {showThreadPane ? (
            <>
              <header className="chat-thread-head">
                <button
                  type="button"
                  className="chat-iconbtn chat-backbtn"
                  onClick={goBack}
                  aria-label={narrow ? 'Back to conversations' : 'Close conversation'}
                  title={narrow ? 'Back to conversations' : 'Close conversation'}
                >
                  <BackIcon />
                </button>

                {active.kind === 'group' ? (
                  <span
                    className="avatar"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'var(--chat-navy)',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    <ChatIcon size={19} />
                  </span>
                ) : (
                  <Avatar name={active.title} size={36} />
                )}

                <div className="chat-thread-head-body">
                  <h2 className="chat-thread-title">
                    {active.title || (active.kind === 'group' ? 'Group' : 'Conversation')}
                  </h2>
                  <div className="chat-thread-sub">
                    {active.kind === 'group' ? (
                      <button
                        type="button"
                        onClick={() => setMembersOpen(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          font: 'inherit',
                          color: 'inherit',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                        title="View members"
                      >
                        {active.member_count || 0} members
                      </button>
                    ) : (
                      'Direct message'
                    )}
                    {active.kind === 'group' &&
                      active.post_policy === 'admins_only' &&
                      ' · admins post only'}
                    {active.kind === 'group' &&
                      active.post_policy !== 'admins_only' &&
                      active.write_mode === 'selected' &&
                      ' · selected members only'}
                  </div>
                </div>

                <button
                  type="button"
                  className="chat-iconbtn"
                  onClick={() => {
                    setSearchOpen((v) => !v)
                    setHighlightId(null)
                  }}
                  aria-label="Search messages"
                  title="Search messages"
                  aria-expanded={searchOpen}
                >
                  <SearchIcon size={18} />
                </button>

                {/* Gear only appears on groups the caller can actually manage,
                    so DMs and read-only rooms stay clean. */}
                {active.kind === 'group' && isChatAdmin(me.role) && (
                  <button
                    type="button"
                    className="chat-iconbtn"
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Group settings"
                    title="Group settings"
                  >
                    <SettingsIcon size={18} />
                  </button>
                )}

                {/* Personal chats are deletable by chat admins. First press
                    arms the control, second press deletes. */}
                {active.kind === 'direct' && isChatAdmin(me.role) && (
                  <button
                    type="button"
                    className="chat-iconbtn"
                    data-danger="true"
                    data-armed={deleteArmed ? 'true' : undefined}
                    onClick={removeDirect}
                    disabled={deletingChat}
                    aria-label="Delete this chat"
                    title={
                      deleteArmed
                        ? 'Click again to permanently delete this chat'
                        : 'Delete chat'
                    }
                  >
                    <TrashIcon size={18} />
                  </button>
                )}
              </header>

              {searchOpen && (
                <ChatSearch
                  conversation={active}
                  me={me}
                  onClose={() => setSearchOpen(false)}
                  onJump={(m) => setHighlightId(m.id)}
                />
              )}

              <MessageThread
                conversation={active}
                me={me}
                optimistic={optimistic}
                highlightId={highlightId}
                onJumpHandled={() => setHighlightId(null)}
                onMarkRead={handleMarkRead}
                onRetry={retry}
              />

              <div style={{ flexShrink: 0 }}>
                {typers.length > 0 && (
                  <div className="chat-typing" role="status" aria-live="polite">
                    {typers.length === 1
                      ? `${typers[0]} is typing…`
                      : `${typers.length} people are typing…`}
                  </div>
                )}
                {canWriteHere ? (
                  <ChatComposer conversation={active} me={me} onSend={send} />
                ) : (
                  <ReadOnlyBanner
                    reason={
                      active.kind === 'group' && active.post_policy === 'admins_only' ? (
                        <>
                          <strong>Admins post only.</strong> Only Super Admin, Accounts and
                          Admin can send messages in this group.
                        </>
                      ) : null
                    }
                  />
                )}
              </div>
            </>
          ) : (
            <ChatState
              title="Select a conversation"
              sub="Pick a group or person from the list to start reading."
            />
          )}
        </section>
      </div>

      {pickerOpen && (
        <PeoplePicker me={me} onClose={() => setPickerOpen(false)} onPicked={startDirect} />
      )}

      {groupOpen && (
        <GroupCreateDialog me={me} onClose={() => setGroupOpen(false)} onCreated={startGroup} />
      )}

      {settingsOpen && active && active.kind === 'group' && (
        <GroupSettingsDialog
          me={me}
          conversation={active}
          onClose={() => setSettingsOpen(false)}
          onUpdated={(dto) => {
            setConversations((prev) => prev.map((c) => (c.id === dto.id ? { ...c, ...dto } : c)))
          }}
          onDeleted={(convoId) => {
            setConversations((prev) => prev.filter((c) => c.id !== convoId))
            setActiveId((prev) => (prev === convoId ? null : prev))
            toast('Group deleted.', 'success')
          }}
        />
      )}

      {membersOpen && active && active.kind === 'group' && (
        <GroupMembersPanel
          me={me}
          conversation={active}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </div>
  )
}

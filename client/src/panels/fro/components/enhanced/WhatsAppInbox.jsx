import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getConversations, getMessages, sendMessage as sendMsgApi, createConversation, markRead,
  searchMessages, uploadMedia, getMyAccounts, updateConversationStatus, retryMessage,
  updateLabels, getLabels,
} from '../../api/whatsappEnhanced'
import { parseFilter } from '../../../../hooks/useRealtime'
import { onDbChange } from '../../../../lib/socket'
import { useIsMobile } from '../../../../hooks/useIsMobile'
import ConversationList, { ConversationFilters } from './ConversationList'
import { MessageList } from './MessageBubble'
import MessageComposer from './MessageComposer'
import CallOverlay from './CallOverlay'
import CallHistoryPanel from './CallHistoryPanel'
import IncomingCallBanner from './IncomingCallBanner'
import { getCallingStatus, getActiveCalls } from '../../api/whatsappCalling'
import QuickReplyBar from './QuickReplyBar'
import TemplateBar from './TemplateBar'
import MessageSearchModal from './MessageSearch'
import { MediaUploadPreview } from './MediaPreview'

// Statuses the standalone inbox lets a thread move through. Sent to the server
// only when the user picks one, so the list stays unpinned by default.
const CONVERSATION_STATUSES = ['open', 'pending', 'resolved', 'closed']

const PROJECT_TABS = [
  { id: 'all', label: 'All' },
  { id: 'bsct', label: 'Being Sevak', color: '#3b82f6' },
  { id: 'aflf', label: 'Ashray Life', color: '#22c55e' },
  { id: 'mann', label: 'Mann Care', color: '#ec4899' },
]

const PROJECT_TAB_COLORS = {
  bsct: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  aflf: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
  mann: { bg: '#fce7f3', text: '#db2777', border: '#f9a8d4' },
}

// An FRO must only ever see conversations that have been explicitly assigned
// to them. Keep this check in the UI as a defence-in-depth guard in case an
// API response accidentally includes an unassigned conversation.
//
// An UNASSIGNED conversation (assigned_agent_id null) is deliberately visible:
// getAgentConversations() returns unassigned threads scoped to the caller's own
// projects so a shared inbox has something to pick up, and treating null as
// "not mine" hid precisely those rows, leaving the list permanently empty.
function isAssignedToCurrentAgent(conversation, agentId) {
  const assignedAgentId = conversation?.assigned_agent_id
    ?? conversation?.assignedAgentId
    ?? conversation?.assigned_to_agent_id
    ?? conversation?.agent_id

  if (assignedAgentId == null) return true
  return String(assignedAgentId) === String(agentId)
}

export default function WhatsAppInbox({ waUser, onLogout, compact, agentToken, activeProject }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const messagesContainerRef = useRef(null)
  const lastScrolledConversationRef = useRef(null)
  const handledRouteTargetRef = useRef('')
  const isMobile = useIsMobile()

  const [activeConv, setActiveConv] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [showCallOverlay, setShowCallOverlay] = useState(false)
  const [showCallHistory, setShowCallHistory] = useState(false)
  const [callHint, setCallHint] = useState('')
  const [incomingCall, setIncomingCall] = useState(null)
  const [activeTab, setActiveTab] = useState(activeProject || searchParams.get('project') || 'all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewConv, setShowNewConv] = useState(false)
  const [newConvPhone, setNewConvPhone] = useState('')
  const [newConvProject, setNewConvProject] = useState('')
  const [myAccounts, setMyAccounts] = useState([])
  const [sendingNew, setSendingNew] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [mediaFile, setMediaFile] = useState(null)
  // List filters. unreadOnly and statusFilter and activeLabel are server-side;
  // searchQuery is debounced into the request too, so the sidebar and the server
  // agree on the same result set instead of the UI hiding rows it was sent.
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [activeLabel, setActiveLabel] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [labels, setLabels] = useState([])
  const [threadLabels, setThreadLabels] = useState([])
  const [labelDraft, setLabelDraft] = useState('')
  const [headerBusy, setHeaderBusy] = useState(false)
  const [headerError, setHeaderError] = useState('')

  // The sidebars search box should not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // The surrounding panel owns the viewport sizing. Filling that space keeps the
  // inbox aligned with both the FRO and Accounts layouts.
  const height = '100%'

  const { data: conversations = [], isLoading: loadingConv } = useQuery({
    queryKey: ['wa-conversations', waUser?.id, activeTab, unreadOnly, statusFilter, activeLabel, debouncedSearch],
    queryFn: () => getConversations(
      waUser.id,
      agentToken,
      activeTab !== 'all' ? activeTab : undefined,
      { unread: unreadOnly, statuses: statusFilter ? [statusFilter] : [], search: debouncedSearch, label: activeLabel, limit: 100 },
    ),
    enabled: !!waUser?.id,
    refetchInterval: 15000,
  })

  // Label catalogue for the filter row, and the status counts that render as
  // "(n)" on the status chips. Both come from the same unfiltered set so the
  // chips keep showing totals while a filter is applied.
  const { data: allConversations = [] } = useQuery({
    queryKey: ['wa-conversations-all', waUser?.id, activeTab],
    queryFn: () => getConversations(waUser.id, agentToken, activeTab !== 'all' ? activeTab : undefined, { limit: 1000 }),
    enabled: !!waUser?.id,
    refetchInterval: 30000,
  })

  const statusCounts = useMemo(() => {
    const counts = {}
    for (const c of allConversations) {
      const s = c.status || 'open'
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [allConversations])

  const unreadTotal = useMemo(
    () => allConversations.reduce((n, c) => n + (c.unread_count || 0), 0),
    [allConversations],
  )

  const { data: labelList = [] } = useQuery({
    queryKey: ['wa-labels', waUser?.id, activeTab],
    queryFn: () => getLabels(activeTab !== 'all' ? activeTab : undefined, agentToken),
    enabled: !!waUser?.id,
    refetchInterval: 60000,
  })
  useEffect(() => { if (Array.isArray(labelList)) setLabels(labelList) }, [labelList])

  // Seed the thread's label editor whenever the open conversation changes.
  useEffect(() => {
    const raw = activeConv?.labels
    setThreadLabels(Array.isArray(raw) ? raw : String(raw || '').split(',').map(s => s.trim()).filter(Boolean))
    setLabelDraft('')
    setHeaderError('')
  }, [activeConv?.id, activeConv?.labels])

  useEffect(() => {
    if (!activeConv && myAccounts.length === 1) {
      setActiveTab(myAccounts[0].project)
    }
  }, [myAccounts])

  useEffect(() => {
    if (activeProject) {
      setActiveTab(activeProject)
      setActiveConv(null)
    }
  }, [activeProject])

  const filteredByTab = useMemo(() => conversations.filter(conversation =>
    isAssignedToCurrentAgent(conversation, waUser?.id)
  ), [conversations, waUser?.id])

  // A conversation can be reassigned while this screen is open. Do not leave
  // its thread accessible after it is no longer assigned to this FRO.
  useEffect(() => {
    if (activeConv && !filteredByTab.some(conversation => conversation.id === activeConv.id)) {
      setActiveConv(null)
    }
  }, [activeConv, filteredByTab])

  useEffect(() => {
    const phoneParam = searchParams.get('phone')
    const projectParam = searchParams.get('project')
    const routeTarget = `${projectParam || ''}:${phoneParam || ''}`
    if (projectParam && PROJECT_TAB_COLORS[projectParam]) {
      setActiveTab(projectParam)
      if (activeTab !== projectParam) return
    }
    setNewConvProject(projectParam || (activeTab !== 'all' ? activeTab : ''))
    if (!phoneParam) {
      handledRouteTargetRef.current = ''
      return
    }
    if (handledRouteTargetRef.current === routeTarget) return

    if (filteredByTab.length > 0) {
      const match = filteredByTab.find(c => {
        const p = c.contact?.phone_normalized || c.contact?.phone || ''
        return p.includes(phoneParam) || phoneParam.includes(p.replace(/[^0-9]/g, ''))
      })
      if (match) {
        setActiveConv(match)
        handledRouteTargetRef.current = routeTarget
      } else {
        setNewConvPhone(phoneParam)
        setShowNewConv(true)
        handledRouteTargetRef.current = routeTarget
      }
    } else if (!loadingConv) {
      setNewConvPhone(phoneParam)
      setShowNewConv(true)
      handledRouteTargetRef.current = routeTarget
    }
  }, [searchParams, filteredByTab, activeTab, loadingConv])

  const { data: messages = null } = useQuery({
    queryKey: ['wa-messages', activeConv?.id],
    queryFn: () => getMessages(activeConv.id, agentToken),
    enabled: !!activeConv?.id,
    refetchInterval: 5000,
  })
  const latestMessageKey = messages?.length
    ? `${messages.length}:${messages[messages.length - 1]?.id || messages[messages.length - 1]?.created_at || ''}`
    : ''

  useEffect(() => {
    if (activeProject && conversations.length) {
      setActiveTab(activeProject)
    }
  }, [activeProject, conversations])

  useEffect(() => {
    if (!waUser?.id && !agentToken) return
    getMyAccounts(agentToken).then(accounts => {
      if (accounts?.length) setMyAccounts(accounts)
    }).catch(() => {})
  }, [waUser?.id, agentToken])

  useEffect(() => {
    if (!activeConv?.id || !messages?.length || !messagesContainerRef.current) return

    const openedNewConversation = lastScrolledConversationRef.current !== activeConv.id
    lastScrolledConversationRef.current = activeConv.id
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: openedNewConversation ? 'auto' : 'smooth',
    })
  }, [activeConv?.id, latestMessageKey])

  useEffect(() => {
    if (!activeConv?.id) return
    return onDbChange({
      table: 'messages',
      event: 'INSERT',
      filter: parseFilter(`conversation_id=eq.${activeConv.id}`),
      onInsert: () => {
        queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })
      },
    })
  }, [activeConv?.id, queryClient])

  useEffect(() => {
    return onDbChange({
      table: 'conversations',
      event: '*',
      onInsert: () => queryClient.invalidateQueries({ queryKey: ['wa-conversations'] }),
      onUpdate: () => queryClient.invalidateQueries({ queryKey: ['wa-conversations'] }),
      onDelete: () => queryClient.invalidateQueries({ queryKey: ['wa-conversations'] }),
    })
  }, [queryClient])

  useEffect(() => {
    return onDbChange({
      table: 'messages',
      event: 'INSERT',
      onInsert: (payload) => {
        if (payload.new?.conversation_id && payload.new?.conversation_id !== activeConv?.id) {
          queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
        }
      },
    })
  }, [queryClient, activeConv?.id])

  const handleSelect = useCallback(async (conv) => {
    setActiveConv(conv)
    if (isMobile) setShowChat(true)
    setMediaFile(null)
    try { await markRead(conv.id, agentToken) } catch (e) { console.error('Error:', e.message); }
    queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
  }, [queryClient, agentToken, isMobile])

  const handleSend = useCallback(async (text) => {
    if (!activeConv) return
    console.log('[WhatsAppInbox] handleSend:', { convId: activeConv.id, text, hasToken: !!agentToken, project: activeConv.project })
    try {
      await sendMsgApi(activeConv.id, text, agentToken)
      queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })
      queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
    } catch (err) {
      console.error('[WhatsAppInbox] send failed:', err.message)
      throw err
    }
  }, [activeConv, agentToken, queryClient])

  const handleSendMedia = useCallback(async (files) => {
    if (!activeConv || !waUser) return
    const fileArr = Array.isArray(files) ? files : [files]
    for (const f of fileArr) {
      const r = await uploadMedia(f, agentToken)
      if (r?.file_url) {
        // Pass the mime explicitly: a voice note must go out as `audio`, and
        // sending it as `image` makes Meta reject the attachment.
        await sendMsgApi(activeConv.id, '', agentToken, r.file_url, r.file_type || f.type)
        await new Promise(r => setTimeout(r, 200))
      }
    }
    queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })
    queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
  }, [activeConv, waUser, agentToken, queryClient])

  const handleNewConv = useCallback(async () => {
    if (!newConvPhone.trim() || sendingNew || !waUser) return
    setSendingNew(true)
    try {
      const result = await createConversation(newConvPhone.trim(), agentToken, newConvProject || undefined)
      setShowNewConv(false)
      setNewConvPhone('')
      queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
      if (result.conversation) handleSelect(result.conversation)
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally {
      setSendingNew(false)
    }
  }, [newConvPhone, sendingNew, waUser, agentToken, queryClient, handleSelect])

  const handleQuickReply = async (text) => { await handleSend(text) }

  const refreshLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
    queryClient.invalidateQueries({ queryKey: ['wa-conversations-all'] })
    queryClient.invalidateQueries({ queryKey: ['wa-labels'] })
  }, [queryClient])

  // Optimistic status/labels so the select and chips react immediately, then
  // roll back to the server's row if the write is rejected (409 on a race, 403
  // on the role gate). Never leave the control showing a value the DB rejected.
  const runHeaderMutation = useCallback(async (optimistic, mutate) => {
    setHeaderBusy(true)
    setHeaderError('')
    const snapshot = activeConv
    setActiveConv(prev => (prev ? { ...prev, ...optimistic } : prev))
    try {
      await mutate()
      refreshLists()
      if (activeConv?.id) queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })
    } catch (err) {
      setActiveConv(snapshot)
      setHeaderError(err.message || 'Could not save')
    } finally {
      setHeaderBusy(false)
    }
  }, [activeConv, queryClient, refreshLists])

  const handleStatusChange = useCallback((status) => {
    if (!activeConv || status === (activeConv.status || 'open')) return
    runHeaderMutation(
      { status },
      () => updateConversationStatus(activeConv.id, status, agentToken),
    )
  }, [activeConv, agentToken, runHeaderMutation])

  const persistLabels = useCallback((next) => {
    const prev = activeConv?.labels
    return runHeaderMutation({ labels: next }, () => updateLabels(activeConv.id, next, agentToken))
      .then(() => { setThreadLabels(next); return prev })
  }, [activeConv, agentToken, runHeaderMutation])

  const handleAddLabel = useCallback(() => {
    const value = labelDraft.trim()
    if (!activeConv || !value) return
    const existing = threadLabels
    if (existing.some(l => l.toLowerCase() === value.toLowerCase())) { setLabelDraft(''); return }
    setLabelDraft('')
    persistLabels([...existing, value])
  }, [activeConv, labelDraft, threadLabels, persistLabels])

  const handleRemoveLabel = useCallback((label) => {
    if (!activeConv) return
    persistLabels(threadLabels.filter(l => l !== label))
  }, [activeConv, threadLabels, persistLabels])

  // Retry re-sends the SAME message row, so on success the only thing that
  // changed is status/wa_message_id — an invalidate is enough.
  const handleRetry = useCallback(async (message) => {
    if (!activeConv || !message?.id) return
    try {
      await retryMessage(activeConv.id, message.id, agentToken)
      queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })
      refreshLists()
    } catch (err) {
      setHeaderError(err.message || 'Retry failed')
    }
  }, [activeConv, agentToken, queryClient, refreshLists])

  const contact = activeConv?.contact || {}
  const activeName = contact.wa_profile_name || contact.phone || 'Select a conversation'
  const convProject = activeConv?.project || activeConv?.contact?.project || activeTab
  const activeProjectLabel = PROJECT_TABS.find(t => t.id === convProject)?.label || convProject.toUpperCase()
  const activeProjectColor = PROJECT_TAB_COLORS[convProject] || null
  const activeContactId = activeConv?.contact_id || contact.id

  // Ask Meta whether this donor can be called before the agent clicks, so the
  // button can explain itself instead of failing after the click.
  useEffect(() => {
    if (!activeConv?.id) { setCallHint(''); return undefined }
    let cancelled = false
    getCallingStatus(activeConv.id, agentToken)
      .then((s) => { if (!cancelled) setCallHint(s.available ? '' : (s.reason || 'Calling unavailable')) })
      .catch((e) => { if (!cancelled) setCallHint(e.message) })
    return () => { cancelled = true }
  }, [activeConv?.id, agentToken])

  // Poll for a ringing inbound call. Meta has no push channel into the tab, so
  // a short interval is what makes an incoming call appear without a reload.
  // Only the ids are compared so an already-seen call never re-rings.
  const seenCallIds = useRef(new Set())
  useEffect(() => {
    const project = activeProject || searchParams.get('project')
    if (!project) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const d = await getActiveCalls(project, agentToken)
        if (cancelled) return
        const ringing = (d?.calls || []).find(
          (c) => c.direction === 'inbound' && c.status === 'ringing' && !seenCallIds.current.has(c.id),
        )
        if (ringing) {
          seenCallIds.current.add(ringing.id)
          setIncomingCall(ringing)
        }
        for (const c of d?.calls || []) {
          if (c.status !== 'ringing') seenCallIds.current.delete(c.id)
        }
      } catch { /* polling must never break the inbox */ }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [activeProject, agentToken])

  return (
    <div style={{ display: 'flex', height, border: compact ? 'none' : '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
      {/* Sidebar */}
      <div style={{ width: isMobile ? '100%' : 280, borderRight: isMobile ? 'none' : '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, ...(isMobile && showChat ? { display: 'none' } : {}) }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name or number..."
              style={{ flex: 1, minWidth: 0, padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', outline: 'none' }} />
            <button
              onClick={() => setShowSearch(true)}
              title="Search inside messages"
              aria-label="Search inside messages"
              style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', color: '#6b7280' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </button>
          </div>
          <button onClick={() => { setShowNewConv(true); setNewConvProject(activeTab !== 'all' ? activeTab : (myAccounts.length === 1 ? myAccounts[0].project : '')) }}
            style={{ width: '100%', marginTop: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#25D366', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            + New Conversation
          </button>
          {/* Project switcher. The tabs and their colour map were always defined
              here; only the rendering was missing, so an FRO with accounts on
              more than one project had no way to switch. */}
          {myAccounts.length > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {myAccounts.map(a => {
                const colors = PROJECT_TAB_COLORS[a.project] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
                const active = activeTab === a.project
  return (
                  <button
                    key={a.project}
                    onClick={() => { setActiveTab(a.project); setActiveConv(null) }}
                    aria-pressed={active}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      cursor: 'pointer',
                      border: `1px solid ${active ? colors.border : '#e5e7eb'}`,
                      background: active ? colors.bg : '#fff',
                      color: active ? colors.text : '#6b7280',
                    }}>
                    {PROJECT_TABS.find(t => t.id === a.project)?.label || a.project.toUpperCase()}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <ConversationFilters
          unreadOnly={unreadOnly}
          onUnreadChange={setUnreadOnly}
          unreadTotal={unreadTotal}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          statusCounts={statusCounts}
          labels={labels}
          activeLabel={activeLabel}
          onLabelChange={setActiveLabel}
        />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ConversationList conversations={filteredByTab} activeId={activeConv?.id} onSelect={handleSelect} loading={loadingConv} />
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, ...(isMobile && !showChat ? { display: 'none' } : {}), ...(isMobile ? { width: '100%' } : {}) }}>
        {activeConv ? (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 10 }}>
              {isMobile && (
                <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', padding: 0, lineHeight: 1 }}>←</button>
              )}
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {activeName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{activeName}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {activeProjectColor && (
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: activeProjectColor.border?.replace('86efac', '#22c55e') || '#22c55e', flexShrink: 0 }} />
                  )}
                  {convProject ? activeProjectLabel : 'WhatsApp'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setShowCallHistory((v) => !v)}
                  title="Call history"
                  style={{
                    border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, cursor: 'pointer',
                    padding: '4px 7px', fontSize: 11, fontWeight: 600, color: showCallHistory ? '#2563eb' : '#374151',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.75-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.15-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                  </svg>
                  History
                </button>
                <button
                  onClick={() => setShowCallOverlay(true)}
                  disabled={!activeConv?.id}
                  title={callHint || 'Call this donor on WhatsApp'}
                  style={{
                    border: 'none', background: '#25D366', color: '#fff', borderRadius: 6,
                    cursor: activeConv?.id ? 'pointer' : 'not-allowed', opacity: activeConv?.id ? 1 : .5,
                    padding: '5px 9px', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.75-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.15-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                  </svg>
                  Call
                </button>
                <select
                  value={activeConv?.status || 'open'}
                  disabled={headerBusy}
                  onChange={e => handleStatusChange(e.target.value)}
                  aria-label="Conversation status"
                  title="Conversation status"
                  style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', outline: 'none' }}>
                  {CONVERSATION_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Labels: conversations.labels (text[]) with a PUT endpoint that
                predates this UI. Internal-only tags; never sent to WhatsApp. */}
            <div style={{ padding: '6px 14px', borderBottom: '1px solid #f1f5f9', background: '#fff', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: .3 }}>Labels</span>
              {threadLabels.length === 0 && <span style={{ fontSize: 11, color: '#9ca3af' }}>none</span>}
              {threadLabels.map(l => (
                <span key={l} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                  borderRadius: 4, padding: '2px 6px', background: '#eef2ff', color: '#4338ca',
                }}>
                  {l}
                  <button
                    onClick={() => handleRemoveLabel(l)}
                    disabled={headerBusy}
                    aria-label={`Remove label ${l}`}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#4338ca', fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
              <input
                value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabel() } }}
                placeholder="Add label, Enter"
                aria-label="Add label"
                style={{ flex: 1, minWidth: 110, fontSize: 11, padding: '3px 7px', border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none' }} />
            </div>
            {headerError && (
              <div style={{ padding: '6px 14px', fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                {headerError}
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <MessageList messages={messages} messagesContainerRef={messagesContainerRef} onRetry={handleRetry} />
            </div>
            {mediaFile && (
              <div style={{ padding: '4px 12px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
                <MediaUploadPreview file={mediaFile} onRemove={() => setMediaFile(null)} />
              </div>
            )}
            <QuickReplyBar onSend={handleQuickReply} />
            <TemplateBar conversationId={activeConv?.id} contactId={activeContactId} project={convProject} userId={waUser?.id} agentToken={agentToken} onSent={() => queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })} />
            <MessageComposer
              onSend={handleSend}
              onSendMedia={handleSendMedia}
              templateProps={{
                conversationId: activeConv?.id,
                contactId: activeContactId,
                project: convProject,
                userId: waUser?.id,
                agentToken,
                onSent: () => {
                  queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv?.id] })
                  queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
                },
              }}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', gap: 12 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#25D36620', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>WhatsApp Chat</div>
            <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>Select a conversation from the left or start a new one</div>
          </div>
        )}
      </div>

      {showNewConv && (
        <div className="modal-overlay" onClick={() => setShowNewConv(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>New Conversation</h3>
              <button onClick={() => setShowNewConv(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#6b7280', lineHeight: 1 }}>&times;</button>
            </div>
            <div className="modal-body">
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Phone Number</span>
                <input type="tel" value={newConvPhone} onChange={e => setNewConvPhone(e.target.value)} placeholder="e.g. 917506419340"
                  style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', outline: 'none' }} />
              </label>
              {myAccounts.length > 1 && (
                <label style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Send from</span>
                  <select value={newConvProject} onChange={e => setNewConvProject(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', background: '#fff', outline: 'none' }}>
                    <option value="">— Select number —</option>
                    {myAccounts.map(a => (
                      <option key={a.id} value={a.project}>{a.name} ({a.phone_number_id})</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="modal-actions" style={{ marginTop: 8 }}>
                <button onClick={() => setShowNewConv(false)}
                  style={{ padding: '9px 18px', fontSize: 13, fontWeight: 500, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleNewConv} disabled={sendingNew || !newConvPhone.trim() || (myAccounts.length > 1 && !newConvProject)}
                  style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, background: '#25D366', color: '#fff', cursor: sendingNew || !newConvPhone.trim() ? 'not-allowed' : 'pointer', opacity: sendingNew || !newConvPhone.trim() ? 0.6 : 1 }}>
                  {sendingNew ? 'Starting...' : 'Start Conversation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSearch && (
        <MessageSearchModal userId={waUser?.id} onClose={() => setShowSearch(false)}
          onSelectConversation={(convId) => { const conv = filteredByTab.find(c => c.id === convId); if (conv) handleSelect(conv) }} />
      )}

      {incomingCall && (
        <IncomingCallBanner
          call={incomingCall}
          conversation={filteredByTab.find((c) => c.id === incomingCall.conversation_id)
            || activeConv}
          project={convProject}
          agentToken={agentToken}
          onAnswered={() => { setIncomingCall(null); queryClient.invalidateQueries({ queryKey: ['wa-conversations'] }) }}
          onDeclined={() => { setIncomingCall(null); queryClient.invalidateQueries({ queryKey: ['wa-conversations'] }) }}
        />
      )}

      {showCallOverlay && activeConv?.id && (        <CallOverlay
          conversationId={activeConv.id}
          contact={activeConv.contact || contact}
          project={convProject}
          agentToken={agentToken}
          onClose={() => setShowCallOverlay(false)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })}
        />
      )}

      {showCallHistory && convProject && (
        <CallHistoryPanel
          project={convProject}
          conversationId={activeConv?.id}
          agentToken={agentToken}
          onClose={() => setShowCallHistory(false)}
        />
      )}
    </div>
  )
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getConversations, getMessages, sendMessage as sendMsgApi, createConversation, markRead, searchMessages, uploadMedia, getMyAccounts, updateConversationLabels } from '../../api/whatsappEnhanced'
import { parseFilter } from '../../../../hooks/useRealtime'
import { onDbChange } from '../../../../lib/socket'
import { useIsMobile } from '../../../../hooks/useIsMobile'
import ConversationList from './ConversationList'
import { MessageList } from './MessageBubble'
import MessageComposer from './MessageComposer'
import QuickReplyBar from './QuickReplyBar'
import MessageSearchModal from './MessageSearch'
import { MediaUploadPreview } from './MediaPreview'

const PROJECT_TABS = [
  { id: 'all', label: 'All' },
  { id: 'bsct', label: 'Being Sevak', color: '#3b82f6' },
  { id: 'bsct2', label: 'BSCT2', color: '#8b5cf6' },
  { id: 'aflf', label: 'Ashray Life', color: '#22c55e' },
  { id: 'mann', label: 'Mann Care', color: '#ec4899' },
]

const PROJECT_TAB_COLORS = {
  bsct: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  bsct2: { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
  aflf: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
  mann: { bg: '#fce7f3', text: '#db2777', border: '#f9a8d4' },
}

const FALLBACK_PROJECT_COLOR = '#64748b'

// One chip in the inbox filter row. Projects get their own accent so BSCT /
// BSCT2 / AFLF / MANN stay tellable apart at a glance; the boolean filters
// (Unread / Groups / Favourites) use the WhatsApp teal.
function FilterChip({ active, color, onClick, children, count }) {
  const accent = color || '#00a884'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', fontSize: 11, fontWeight: 600,
        borderRadius: 14, whiteSpace: 'nowrap', flexShrink: 0,
        border: `1px solid ${active ? accent : '#e2e8f0'}`,
        background: active ? `${accent}1a` : '#fff',
        color: active ? accent : '#667781',
        cursor: 'pointer',
        transition: 'all .12s',
        fontFamily: 'inherit',
      }}
      onMouseOver={e => { if (!active) { e.currentTarget.style.background = '#f5f6f6'; e.currentTarget.style.borderColor = '#cbd5e1' } }}
      onMouseOut={e => { if (!active) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0' } }}
    >
      {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />}
      {children}
      {count > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, background: accent, color: '#fff',
          borderRadius: 999, minWidth: 15, height: 15, padding: '0 4px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}

// WhatsApp's 24-hour customer service window: a free-form (session) message may
// only be sent within 24 hours of the contact's last inbound message. Once it
// lapses only an approved template is allowed, so the composer is closed rather
// than letting Meta reject the send.
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000

// What a FRO is allowed to see: threads explicitly assigned to them, plus the
// unassigned threads sitting in one of the WhatsApp accounts they hold. The
// Accounts panel (WhatsApp Accounts) is the source of truth for a FRO's
// accounts, so an unassigned thread only shows when its project is one of them.
// Kept in the UI as defence-in-depth in case an API response leaks an
// unrelated conversation.
// A starred (favourite) thread carries 'favourite' in its labels jsonb; older
// rows have labels = null, so the Array.isArray guard is load-bearing.
function isFavConv(conversation) {
  return Array.isArray(conversation?.labels) && conversation.labels.includes('favourite')
}

function isVisibleToAgent(conversation, agentId, myProjects) {
  const assignedAgentId = conversation?.assigned_agent_id
    ?? conversation?.assignedAgentId
    ?? conversation?.assigned_to_agent_id
    ?? conversation?.agent_id

  if (assignedAgentId != null) return String(assignedAgentId) === String(agentId)

  // Unassigned thread: allowed only for the FRO's own accounts. If the account
  // list hasn't resolved yet, trust the API (it is already scoped server-side).
  if (myProjects.size === 0) return true

  const project = conversation?.project ?? conversation?.contact?.project
  return project != null && myProjects.has(project)
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
  const [activeTab, setActiveTab] = useState(activeProject || searchParams.get('project') || 'all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewConv, setShowNewConv] = useState(false)
  const [newConvPhone, setNewConvPhone] = useState('')
  const [newConvName, setNewConvName] = useState('')
  const [newConvProject, setNewConvProject] = useState('')
  // Name carried over from a My Leads WhatsApp deep-link. Used as a fallback so
  // the conversation shows the lead's name instead of a bare phone number.
  const [deepLink, setDeepLink] = useState({ phone: '', name: '' })
  const [myAccounts, setMyAccounts] = useState([])
  const [sendingNew, setSendingNew] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [mediaFile, setMediaFile] = useState(null)
  // Inbox filter: hide threads that have no unread messages.
  const [unreadOnly, setUnreadOnly] = useState(false)
  // Inbox filter: only WhatsApp group threads / only starred (favourite)
  // threads. Stackable with Unread and the project tabs.
  const [groupsOnly, setGroupsOnly] = useState(false)
  const [favsOnly, setFavsOnly] = useState(false)

  // The surrounding panel owns the viewport sizing. Filling that space keeps the
  // inbox aligned with both the FRO and Accounts layouts.
  const height = '100%'

  const { data: conversations = [], isLoading: loadingConv } = useQuery({
    queryKey: ['wa-conversations', waUser?.id, activeTab],
    queryFn: () => getConversations(waUser.id, agentToken, activeTab !== 'all' ? activeTab : undefined),
    enabled: !!waUser?.id,
    refetchInterval: 15000,
  })

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

  const filteredByTab = useMemo(() => {
    const myProjects = new Set((myAccounts || []).map(a => a?.project).filter(Boolean))
    return conversations.filter(conversation =>
      isVisibleToAgent(conversation, waUser?.id, myProjects)
    )
  }, [conversations, waUser?.id, myAccounts])

  // Project chips come from the accounts this FRO actually holds, so a chip for
  // an account they don't have is never shown.
  const projectChips = useMemo(() => {
    const seen = new Set()
    const chips = []
    for (const a of myAccounts || []) {
      const p = a?.project
      if (!p || seen.has(p)) continue
      seen.add(p)
      const meta = PROJECT_TABS.find(t => t.id === p)
      chips.push({ id: p, label: meta?.label || String(p).toUpperCase(), color: meta?.color || FALLBACK_PROJECT_COLOR })
    }
    return chips
  }, [myAccounts])

  const unreadByProject = useMemo(() => {
    const counts = {}
    for (const c of filteredByTab) {
      if ((c.unread_count || 0) > 0) {
        const p = c.project || c.contact?.project || ''
        counts[p] = (counts[p] || 0) + 1
      }
    }
    return counts
  }, [filteredByTab])

  const unreadTotal = useMemo(
    () => filteredByTab.reduce((n, c) => n + ((c.unread_count || 0) > 0 ? 1 : 0), 0),
    [filteredByTab],
  )

  const groupTotal = useMemo(
    () => filteredByTab.reduce((n, c) => n + (c.is_group ? 1 : 0), 0),
    [filteredByTab],
  )

  const favTotal = useMemo(
    () => filteredByTab.reduce((n, c) => n + (isFavConv(c) ? 1 : 0), 0),
    [filteredByTab],
  )

  // All three quick filters (Unread / Groups / Favourites) stack: each one
  // narrows whatever the project tab already selected.
  const visibleConv = useMemo(() => {
    let list = filteredByTab
    if (unreadOnly) list = list.filter(c => (c.unread_count || 0) > 0)
    if (groupsOnly) list = list.filter(c => c.is_group)
    if (favsOnly) list = list.filter(isFavConv)
    return list
  }, [filteredByTab, unreadOnly, groupsOnly, favsOnly])

  // Star toggle: optimistic (the row flips instantly across every cached
  // project tab), rolled back by an invalidation if the API rejects it.
  const handleToggleFavorite = useCallback(async (conv) => {
    const labels = Array.isArray(conv.labels) ? [...conv.labels] : []
    const idx = labels.indexOf('favourite')
    if (idx >= 0) labels.splice(idx, 1)
    else labels.push('favourite')

    queryClient.setQueriesData(
      { queryKey: ['wa-conversations'] },
      old => (Array.isArray(old) ? old.map(c => (c.id === conv.id ? { ...c, labels } : c)) : old),
    )
    try {
      await updateConversationLabels(conv.id, labels, agentToken)
    } catch (err) {
      console.error('Failed to update favourites:', err)
      queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
    }
  }, [queryClient, agentToken])

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
    const nameParam = searchParams.get('name')
    const routeTarget = `${projectParam || ''}:${phoneParam || ''}`
    if (projectParam && PROJECT_TAB_COLORS[projectParam]) {
      setActiveTab(projectParam)
      if (activeTab !== projectParam) return
    }
    setNewConvProject(projectParam || (activeTab !== 'all' ? activeTab : ''))
    if (!phoneParam) {
      handledRouteTargetRef.current = ''
      setDeepLink({ phone: '', name: '' })
      return
    }
    if (nameParam) setDeepLink({ phone: phoneParam, name: nameParam })
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
        setNewConvName(nameParam || '')
        setShowNewConv(true)
        handledRouteTargetRef.current = routeTarget
      }
    } else if (!loadingConv) {
      setNewConvPhone(phoneParam)
      setNewConvName(nameParam || '')
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
        // A chat the FRO is already looking at should not raise the unread chip.
        // The webhook bumped unread_count; clear it for this open thread only.
        markRead(activeConv.id, agentToken)
          .then(() => queryClient.invalidateQueries({ queryKey: ['wa-conversations'] }))
          .catch(() => {})
      },
    })
  }, [activeConv?.id, agentToken, queryClient])

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
      const mediaUrl = r?.url || r?.file_url
      if (mediaUrl) {
        await sendMsgApi(activeConv.id, '', agentToken, mediaUrl, f.type)
      }
    }
    queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })
    queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
  }, [activeConv, waUser, agentToken, queryClient])

  const handleNewConv = useCallback(async () => {
    if (!newConvPhone.trim() || sendingNew || !waUser) return
    setSendingNew(true)
    try {
      const result = await createConversation(newConvPhone.trim(), agentToken, newConvProject || undefined, newConvName.trim() || undefined)
      setShowNewConv(false)
      setNewConvPhone('')
      setNewConvName('')
      queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
      if (result.conversation) {
        handleSelect({
          ...result.conversation,
          contact: result.contact || result.conversation.contact,
        })
      }
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally {
      setSendingNew(false)
    }
  }, [newConvPhone, newConvName, sendingNew, waUser, agentToken, queryClient, handleSelect])

  const handleQuickReply = async (text) => { await handleSend(text) }

  // Read the window off the live list row, not the selected snapshot, so a new
  // inbound message that reopens the window is picked up by the 15s refetch.
  const liveActiveConv = activeConv
    ? (conversations.find(c => c.id === activeConv.id) || activeConv)
    : null
  const lastInboundMs = liveActiveConv?.last_inbound_at
    ? new Date(liveActiveConv.last_inbound_at).getTime()
    : null
  const windowClosed = !!liveActiveConv
    && (!lastInboundMs || Date.now() - lastInboundMs > SERVICE_WINDOW_MS)

  const contact = liveActiveConv?.contact || activeConv?.contact || {}
  // Only trust the deep-linked name when the open thread is for that same number,
  // so selecting another conversation from the list does not mislabel it.
  const deepLinkApplies = !!deepLink.name && !!deepLink.phone && (() => {
    const activePhone = String(contact.phone_normalized || contact.phone || '').replace(/\D/g, '')
    return !!activePhone && (activePhone.includes(deepLink.phone) || deepLink.phone.includes(activePhone))
  })()
  const activeName = contact.wa_profile_name || (deepLinkApplies ? deepLink.name : '') || contact.phone || 'Select a conversation'
  const convProject = activeConv?.project || activeConv?.contact?.project || activeTab
  const activeProjectLabel = PROJECT_TABS.find(t => t.id === convProject)?.label || convProject.toUpperCase()
  const activeProjectColor = PROJECT_TAB_COLORS[convProject] || null
  const activeContactId = activeConv?.contact_id || contact.id

  return (
    <div className="wa-inbox" style={{ display: 'flex', height, border: compact ? 'none' : '1px solid #e9edef', overflow: 'hidden', background: '#fff', borderRadius: compact ? 0 : 10 }}>
      {/* Sidebar */}
      <div style={{ width: isMobile ? '100%' : 300, borderRight: isMobile ? 'none' : '1px solid #e9edef', display: 'flex', flexDirection: 'column', flexShrink: 0, ...(isMobile && showChat ? { display: 'none' } : {}) }}>
        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #e9edef', background: '#fff' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search or start a new chat"
              style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12.5, border: 'none', borderRadius: 8, boxSizing: 'border-box', outline: 'none', background: '#f0f2f5', color: '#111b21' }} />
          </div>
          <button onClick={() => { setShowNewConv(true); setNewConvProject(activeTab !== 'all' ? activeTab : (myAccounts.length === 1 ? myAccounts[0].project : '')) }}
            style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, fontWeight: 600, background: '#00a884', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background .15s' }}
            onMouseOver={e => { e.currentTarget.style.background = '#008069' }}
            onMouseOut={e => { e.currentTarget.style.background = '#00a884' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Conversation
          </button>
        </div>
        {/* Filter row: project chips (driven by the accounts this FRO holds)
            plus the Unread / Groups / Favourites quick filters. Projects
            switch the server-side query; the quick filters are client-side
            view filters that stack on top of it. */}
        <div className="wa-scroll" style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #e9edef', overflowX: 'auto', background: '#fff' }}>
          <FilterChip active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
            All
          </FilterChip>
          {projectChips.map(p => (
            <FilterChip
              key={p.id}
              color={p.color}
              active={activeTab === p.id}
              count={unreadByProject[p.id] || 0}
              onClick={() => setActiveTab(p.id)}
            >
              {p.label}
            </FilterChip>
          ))}
          <FilterChip active={unreadOnly} count={unreadTotal} onClick={() => setUnreadOnly(v => !v)}>
            Unread
          </FilterChip>
          <FilterChip active={groupsOnly} count={groupTotal} onClick={() => setGroupsOnly(v => !v)}>
            Groups
          </FilterChip>
          <FilterChip active={favsOnly} count={favTotal} onClick={() => setFavsOnly(v => !v)}>
            Favourites
          </FilterChip>
        </div>
        <div className="wa-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          <ConversationList
            conversations={visibleConv}
            activeId={activeConv?.id}
            onSelect={handleSelect}
            loading={loadingConv}
            searchQuery={searchQuery}
            emptyText={
              groupsOnly ? 'No group conversations'
              : favsOnly ? 'No favourite conversations'
              : unreadOnly ? 'No unread conversations'
              : undefined
            }
            onToggleFavorite={handleToggleFavorite}
          />
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, ...(isMobile && !showChat ? { display: 'none' } : {}), ...(isMobile ? { width: '100%' } : {}) }}>
        {activeConv ? (
          <>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #e9edef', background: '#f0f2f5', display: 'flex', alignItems: 'center', gap: 12, minHeight: 58, boxShadow: '0 1px 2px rgba(11,20,26,.06)', zIndex: 2 }}>
              {isMobile && (
                <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#54656f', padding: 0, lineHeight: 1 }}>←</button>
              )}
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#00a884,#008069)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0, boxShadow: '0 1px 3px rgba(0,128,105,.35)' }}>
                {activeName.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#111b21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeName}</div>
                <div style={{ fontSize: 11.5, color: '#667781', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {activeProjectColor && (
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: activeProjectColor.border?.replace('86efac', '#22c55e') || '#22c55e', flexShrink: 0 }} />
                  )}
                  {convProject ? `${activeProjectLabel} · WhatsApp` : 'WhatsApp'}
                </div>
              </div>
            </div>
            <div className="wa-wallpaper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <MessageList messages={messages} messagesContainerRef={messagesContainerRef} />
            </div>
            {mediaFile && (
              <div style={{ padding: '6px 12px', borderTop: '1px solid #e9edef', background: '#fff' }}>
                <MediaUploadPreview file={mediaFile} onRemove={() => setMediaFile(null)} />
              </div>
            )}
            {!windowClosed && <QuickReplyBar onSend={handleQuickReply} />}
            {windowClosed && (
              <div style={{ padding: '8px 14px', background: '#fff7ed', borderTop: '1px solid #fed7aa', color: '#9a3412', fontSize: 12, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                The 24-hour window is closed — send an approved template to reply.
              </div>
            )}
            <MessageComposer
              onSend={handleSend}
              onSendMedia={handleSendMedia}
              disabled={windowClosed}
              templateProps={{
                conversationId: activeConv?.id,
                contactId: activeContactId,
                project: convProject,
                userId: waUser?.id,
                agentToken,
                onSent: () => queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] }),
              }}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', gap: 14 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(0,168,132,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="#00a884"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#111b21' }}>WhatsApp Chat</div>
            <div style={{ fontSize: 12.5, color: '#667781', textAlign: 'center', maxWidth: 280, lineHeight: 1.55 }}>Select a conversation from the left, or start a new one to reach your donors</div>
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
    </div>
  )
}

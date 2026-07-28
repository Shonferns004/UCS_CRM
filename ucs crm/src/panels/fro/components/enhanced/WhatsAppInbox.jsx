import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getConversations,
  getMessages,
  sendMessage as sendMsgApi,
  createConversation,
  markRead,
  searchMessages,
  uploadMedia,
  getMyAccounts,
} from '../../api/whatsappEnhanced'
import { supabase } from '../../lib/supabase'
import ConversationList from './ConversationList'
import { MessageList } from './MessageBubble'
import MessageComposer from './MessageComposer'
import QuickReplyBar from './QuickReplyBar'
import TemplateBar from './TemplateBar'
import MessageSearchModal from './MessageSearch'
import { MediaUploadPreview } from './MediaPreview'

const PROJECT_TABS = [
  { id: 'all', label: 'All' },
  { id: 'bsct', label: 'Being Sevak', color: '#3b82f6' },
  { id: 'aflf', label: 'Ashray Life', color: '#22c55e' },
  { id: 'maan', label: 'Mann Care', color: '#ec4899' },
]

const PROJECT_TAB_COLORS = {
  bsct: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  aflf: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
  maan: { bg: '#fce7f3', text: '#db2777', border: '#f9a8d4' },
}

// An FRO must only ever see conversations that have been explicitly assigned
// to them. Keep this check in the UI as a defence-in-depth guard in case an
// API response accidentally includes an unassigned conversation.
function isAssignedToCurrentAgent(conversation, agentId) {
  const assignedAgentId = conversation?.assigned_agent_id
    ?? conversation?.assignedAgentId
    ?? conversation?.assigned_to_agent_id
    ?? conversation?.agent_id

  return assignedAgentId != null
    && String(assignedAgentId) === String(agentId)
}

export default function WhatsAppInbox({ waUser, onLogout, compact, agentToken, activeProject }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const messagesContainerRef = useRef(null)
  const lastScrolledConversationRef = useRef(null)
  const handledRouteTargetRef = useRef('')

  const [activeConv, setActiveConv] = useState(null)
  const [activeTab, setActiveTab] = useState(activeProject || searchParams.get('project') || 'all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewConv, setShowNewConv] = useState(false)
  const [newConvPhone, setNewConvPhone] = useState('')
  const [newConvProject, setNewConvProject] = useState('')
  const [myAccounts, setMyAccounts] = useState([])
  const [sendingNew, setSendingNew] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [mediaFile, setMediaFile] = useState(null)

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
    if (agentToken) {
      getMyAccounts(agentToken).then(accounts => {
        if (accounts?.length) setMyAccounts(accounts)
      }).catch(() => {})
      return undefined
    }
    ;(async () => {
      const { data: assigns } = await supabase
        .from('agent_phone_assignments')
        .select('account_id')
        .eq('user_id', waUser.id)
      if (assigns?.length) {
        const ids = assigns.map(a => a.account_id)
        const { data } = await supabase
          .from('whatsapp_accounts')
          .select('id, name, phone_number_id, project')
          .in('id', ids)
        if (data) setMyAccounts(data)
      }
    })()
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
    const channel = supabase
      .channel(`wa-messages-${activeConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConv.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeConv?.id, queryClient])

  useEffect(() => {
    const channel = supabase
      .channel('wa-conversations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.new?.conversation_id && payload.new?.conversation_id !== activeConv?.id) {
          queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient, activeConv?.id])

  const handleSelect = useCallback(async (conv) => {
    setActiveConv(conv)
    setMediaFile(null)
    try { await markRead(conv.id, agentToken) } catch (e) { console.error('Error:', e.message); }
    queryClient.invalidateQueries({ queryKey: ['wa-conversations'] })
  }, [queryClient, agentToken])

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
    const contact = activeConv.contact || {}
    const phoneNumber = contact.phone_normalized || contact.phone || ''
    const mimeType = (f) => f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'document'
    for (const f of fileArr) {
      const r = await uploadMedia(f, agentToken)
      if (r?.file_url) {
        const { data: msg } = await supabase.from('messages').insert({
          conversation_id: activeConv.id,
          contact_id: activeConv.contact_id,
          user_id: waUser.id,
          direction: 'outbound',
          message_type: mimeType(f),
          media_url: r.file_url,
          media_mime_type: f.type,
          status: 'queued',
        }).select('id').maybeSingle()
        if (msg && phoneNumber) {
          const baseUrl = import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api'
          fetch(baseUrl + '/whatsapp/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}) },
            body: JSON.stringify({
              conversationId: activeConv.id,
              contactId: activeConv.contact_id,
              mediaUrl: r.file_url,
              mediaMimeType: f.type,
              userId: waUser.id,
              phoneNumber,
              messageId: msg.id,
            }),
          }).catch((err) => { console.error('Error:', err.message); })
        }
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

  const contact = activeConv?.contact || {}
  const activeName = contact.wa_profile_name || contact.phone || 'Select a conversation'
  const convProject = activeConv?.project || activeConv?.contact?.project || activeTab
  const activeProjectLabel = PROJECT_TABS.find(t => t.id === convProject)?.label || convProject.toUpperCase()
  const activeProjectColor = PROJECT_TAB_COLORS[convProject] || null
  const activeContactId = activeConv?.contact_id || contact.id

  return (
    <div style={{ display: 'flex', height, border: compact ? 'none' : '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
      {/* Sidebar */}
      <div style={{ width: 280, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', outline: 'none' }} />
          <button onClick={() => { setShowNewConv(true); setNewConvProject(activeTab !== 'all' ? activeTab : (myAccounts.length === 1 ? myAccounts[0].project : '')) }}
            style={{ width: '100%', marginTop: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#25D366', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            + New Conversation
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ConversationList conversations={filteredByTab} activeId={activeConv?.id} onSelect={handleSelect} loading={loadingConv} searchQuery={searchQuery} />
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeConv ? (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {activeName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{activeName}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {activeProjectColor && (
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: activeProjectColor.border?.replace('86efac', '#22c55e') || '#22c55e', flexShrink: 0 }} />
                  )}
                  {convProject ? activeProjectLabel : 'WhatsApp'}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <MessageList messages={messages} messagesContainerRef={messagesContainerRef} />
            </div>
            {mediaFile && (
              <div style={{ padding: '4px 12px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
                <MediaUploadPreview file={mediaFile} onRemove={() => setMediaFile(null)} />
              </div>
            )}
            <QuickReplyBar onSend={handleQuickReply} />
            <TemplateBar conversationId={activeConv?.id} contactId={activeContactId} project={convProject} userId={waUser?.id} agentToken={agentToken} onSent={() => queryClient.invalidateQueries({ queryKey: ['wa-messages', activeConv.id] })} />
            <MessageComposer onSend={handleSend} onSendMedia={handleSendMedia} />
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
    </div>
  )
}

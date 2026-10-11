import { useState, useEffect } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WhatsAppInbox from '../components/enhanced/WhatsAppInbox'
import { API_BASE as apiBase } from '../../../lib/apiBase'

const waQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
})

function InboxSkeleton() {
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 420, overflow: 'hidden', background: '#fff', border: '1px solid #e5e7eb' }}>
      <div style={{ width: 280, padding: 14, borderRight: '1px solid #e5e7eb', boxSizing: 'border-box', flexShrink: 0 }}>
        <div className="sk" style={{ height: 34, marginBottom: 8 }} />
        <div className="sk" style={{ height: 34, marginBottom: 16 }} />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div className="sk" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="sk" style={{ height: 12, width: index % 2 ? '58%' : '72%', marginBottom: 7 }} />
              <div className="sk" style={{ height: 10, width: '45%' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 58, padding: '0 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sk" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <div>
            <div className="sk" style={{ width: 150, height: 13, marginBottom: 6 }} />
            <div className="sk" style={{ width: 84, height: 10 }} />
          </div>
        </div>
        <div style={{ flex: 1, padding: '22px 28px', background: '#f9fafb' }}>
          <div className="sk" style={{ width: '34%', maxWidth: 250, height: 44, marginBottom: 12 }} />
          <div className="sk" style={{ width: '46%', maxWidth: 330, height: 54, marginLeft: 'auto', marginBottom: 12 }} />
          <div className="sk" style={{ width: '28%', maxWidth: 210, height: 40 }} />
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
          <div className="sk" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <div className="sk" style={{ flex: 1, height: 36, borderRadius: 18 }} />
          <div className="sk" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        </div>
      </div>
    </div>
  )
}

function AutoLoginLoader({ project, onReady, onError }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const ucsToken = localStorage.getItem('ucs_token')
      if (!ucsToken) {
        if (!cancelled) { setError('Not authenticated'); setLoading(false); onError?.('Not authenticated') }
        return
      }

      // Always clear stale agents and re-fetch on page load
      localStorage.removeItem('wa_agents')
      let agent = null
      // Tracked locally rather than read back from `error` state, which is still
      // the previous value inside this tick and would clobber a specific
      // message with the generic one below.
      let failure = null

      // Auto-login
      try {
        const res = await fetch(`${apiBase}/fro/whatsapp/auto-login`, {
          headers: { Authorization: `Bearer ${ucsToken}` },
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          const sessionList = data.sessions || data.agents || []
          if (sessionList.length) {
            const agents = sessionList.map(s => ({
              agentUserId: s.agentId,
              accountName: s.account?.name,
              project: s.project,
              whatsappUserId: s.account?.id,
              token: s.token,
            }))
            localStorage.setItem('wa_agents', JSON.stringify(agents))
            agent = project ? agents.find(a => a.project === project) : agents[0]
          }
          // An empty session list is only one of several reasons this page can
          // be empty. The backend names which one; report that instead of
          // asserting that no agents are assigned, which was wrong whenever the
          // call actually failed.
          if (!agent) {
            failure = data.reason === 'agent_lookup_failed'
              ? 'Could not load your WhatsApp agent assignments (server error). Please contact admin.'
              : 'No WhatsApp accounts are assigned to you. Contact admin to assign a WhatsApp number.'
          }
        } else {
          failure = data?.message
            ? `WhatsApp unavailable: ${data.message}`
            : `WhatsApp auto-login failed (HTTP ${res.status}).`
        }
      } catch {
        failure = 'Could not reach the WhatsApp service. Check your connection.'
      }

      if (!cancelled) {
        if (agent) {
          onReady(agent)
        } else {
          const msg = failure || 'No WhatsApp agents assigned. Contact admin.'
          setError(msg)
          onError?.(msg)
        }
        setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [project])

  if (loading) {
    return <InboxSkeleton />
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
        <div style={{ width: 360, padding: 32, background: '#fff', borderRadius: 12, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>WhatsApp Unavailable</div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{error}</div>
        </div>
      </div>
    )
  }

  return null
}

function WhatsAppChatInner() {
  const [searchParams] = useSearchParams()
  const { project: urlProject } = useParams()
  const project = urlProject || searchParams.get('project') || ''

  const [agent, setAgent] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setAgent(null)
    setError('')
  }, [project])

  if (!agent && !error) {
    return (
      <AutoLoginLoader
        project={project}
        onReady={(a) => setAgent(a)}
        onError={(msg) => setError(msg)}
      />
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
        <div style={{ width: 360, padding: 32, background: '#fff', borderRadius: 12, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>WhatsApp Unavailable</div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{error}</div>
        </div>
      </div>
    )
  }

  return <WhatsAppInbox waUser={{ id: agent.agentUserId, role: 'agent' }} agentToken={agent.token} activeProject={agent.project} />
}

export default function WhatsAppChat() {
  return (
    <div className="whatsapp-chat-page">
      <QueryClientProvider client={waQueryClient}>
        <WhatsAppChatInner />
      </QueryClientProvider>
    </div>
  )
}

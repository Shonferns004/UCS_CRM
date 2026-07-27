import { useState, useEffect } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WhatsAppInbox from '../components/enhanced/WhatsAppInbox'

const waQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
})

function AutoLoginLoader({ project, onReady, onError }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const apiBase = import.meta.env.VITE_API_URL || 'https://ucs-crm-backend.vercel.app/api'
      const ucsToken = localStorage.getItem('ucs_token')
      if (!ucsToken) {
        if (!cancelled) { setError('Not authenticated'); setLoading(false); onError?.('Not authenticated') }
        return
      }

      // Always clear stale agents and re-fetch on page load
      localStorage.removeItem('wa_agents')
      let agent = null

      // Auto-login
      try {
        const res = await fetch(`${apiBase}/fro/whatsapp/auto-login`, {
          headers: { Authorization: `Bearer ${ucsToken}` },
        })
        if (res.ok) {
          const data = await res.json()
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
        }
      } catch { /* silent */ }

      if (!cancelled) {
        if (agent) {
          onReady(agent)
        } else {
          const msg = 'No WhatsApp agents assigned. Contact admin.'
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
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 180px)', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #d1d5db', borderTopColor: '#25D366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, color: '#6b7280' }}>Connecting to WhatsApp...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 180px)', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
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
      <div style={{ display: 'flex', height: 'calc(100vh - 180px)', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
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
    <QueryClientProvider client={waQueryClient}>
      <WhatsAppChatInner />
    </QueryClientProvider>
  )
}

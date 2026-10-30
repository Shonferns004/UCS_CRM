import { useSearchParams, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WhatsAppInbox from '../components/enhanced/WhatsAppInbox'
import { useUcs } from '../../../store'

const waQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
})

function WhatsAppChatInner() {
  const [searchParams] = useSearchParams()
  const { project: urlProject } = useParams()
  const { user } = useUcs()
  const project = urlProject || searchParams.get('project') || ''

  if (!user?.id) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
        <div style={{ width: 360, padding: 32, background: '#fff', borderRadius: 12, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>WhatsApp Unavailable</div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>Not authenticated</div>
        </div>
      </div>
    )
  }

  return <WhatsAppInbox waUser={{ id: user.id, role: 'fro' }} activeProject={project || undefined} />
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

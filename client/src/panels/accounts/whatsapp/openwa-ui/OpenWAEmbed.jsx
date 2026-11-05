import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { useUcs } from '../../../../store'
import i18n from './i18n'
import { ToastProvider } from './components/Toast'
import { RoleProvider } from './components/RoleProvider'
import { NumberCheckProvider } from './components/NumberCheckProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Chats } from './pages/Chats'
import { Sessions } from './pages/Sessions'
import { Dashboard } from './pages/Dashboard'
import { MessageTester } from './pages/MessageTester'
import { Webhooks } from './pages/Webhooks'
import { Templates } from './pages/Templates'
import { NumberChecker } from './pages/NumberChecker'
import Plugins from './pages/Plugins'
import { Logs } from './pages/Logs'
import { SmartReplies } from './pages/SmartReplies'
import { setApiBaseUrl } from './services/api'
import { API_BASE } from '../../../../lib/apiBase'
import './theme.css'

// One cache per mounted page. Polling in the pages/hooks replaces the gateway socket, whose API key
// the browser must never hold.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})

const ADMIN_ROLES = new Set([
  'master',
  'super_admin',
  'superadmin',
  'super admin',
  'admin',
  'administrator',
  'accounts',
  'accountant',
])

export default function OpenWAEmbed({ page = 'chats', onNavigate, fro = false, lockedSessionId, initialPhone, defaultMessageType }) {
  const { user } = useUcs()
  const admin = ADMIN_ROLES.has(String(user?.role || '').trim().toLowerCase())

  // RoleProvider reads these from sessionStorage at mount. Seed them before it renders so the
  // vendored pages see the CRM user's role and the gateway engine without a login screen.
  // An FRO opens the same Chats page through the session-scoped proxy, with operator rights.
  useMemo(() => {
    try {
      sessionStorage.setItem('openwa_user_role', admin ? 'admin' : fro ? 'operator' : 'viewer')
      // Must match the gateway's ENGINE_TYPE (openwa/.env). It gates engine-specific UI: live history
      // reads and channel listing are whatsapp-web.js-only, group creation and status fonts are
      // Baileys-only. There is no validate call in this embed to refresh it from the server.
      sessionStorage.setItem('openwa_engine_type', 'baileys')
      sessionStorage.setItem('openwa_key_scoped', 'false')
    } catch {
      /* storage unavailable */
    }
    return true
  }, [admin, fro])

  // The same API layer serves the admin pages and the FRO chats page; the FRO proxy
  // only forwards the assigned session and chat-side routes.
  useMemo(() => {
    setApiBaseUrl(fro ? `${API_BASE}/openwa-fro/gateway` : `${API_BASE}/openwa/gateway`)
    return true
  }, [fro])

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <RoleProvider>
            <NumberCheckProvider>
              <ErrorBoundary>
                <div className="openwa-chat-embed" data-theme="light">
                {page === 'overview' ? (
                  <Dashboard
                    onViewSession={() => onNavigate?.('sessions')}
                    onViewLogs={() => onNavigate?.('logs')}
                  />
                ) : page === 'sessions' ? (
                  <Sessions />
                ) : page === 'message-tester' ? (
                  <MessageTester defaultMessageType={defaultMessageType} />
                ) : page === 'webhooks' ? (
                  <Webhooks />
                ) : page === 'templates' ? (
                  <Templates />
                ) : page === 'number-checker' ? (
                  <NumberChecker onNavigate={onNavigate} />
                ) : page === 'plugins' ? (
                  <Plugins />
                ) : page === 'smart-replies' ? (
                  <SmartReplies />
                ) : page === 'logs' ? (
                  <Logs />
                ) : (
                  <Chats lockedSessionId={lockedSessionId} fro={fro} initialPhone={initialPhone} />
                )}
              </div>
              </ErrorBoundary>
            </NumberCheckProvider>
          </RoleProvider>
        </ToastProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

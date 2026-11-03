import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  UserCheck,
  Webhook,
  Layers,
  Megaphone,
  Sparkles,
  ScrollText,
  Blocks,
} from 'lucide-react'
import { useUcs } from '../../../store'
import { gateway } from './gateway'
import { Spinner } from './ui'
const OpenWAEmbed = lazy(() => import('./openwa-ui/OpenWAEmbed'))
import './styles.css'

const ADMIN_ROLES = new Set(['master', 'super_admin', 'superadmin', 'super admin', 'admin', 'administrator', 'accounts', 'accountant'])

const NAV = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sessions', label: 'Sessions', icon: Smartphone },
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'number-checker', label: 'Number Checker', icon: UserCheck },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'templates', label: 'Templates', icon: Layers },
  { id: 'smart-replies', label: 'Smart replies', icon: Sparkles, adminOnly: true },
  { id: 'message-tester', label: 'Broadcast Message', icon: Megaphone },
  { id: 'plugins', label: 'Plugins', icon: Blocks, adminOnly: true },
  { id: 'logs', label: 'Logs', icon: ScrollText, adminOnly: true },
]

function isAdminRole(role) {
  return ADMIN_ROLES.has(String(role || '').trim().toLowerCase())
}

export default function OpenWADashboard() {
  const { user } = useUcs()
  const admin = isAdminRole(user?.role)
  const [section, setSection] = useState('overview')
  const [online, setOnline] = useState(null)

  const checkHealth = useCallback(async () => {
    try {
      await gateway.health()
      setOnline(true)
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const timer = setInterval(checkHealth, 20000)
    return () => clearInterval(timer)
  }, [checkHealth])

  const items = useMemo(
    () => NAV.filter((item) => !item.adminOnly || admin),
    [admin],
  )

  const active = items.find((item) => item.id === section) || items[0]
  // Dashboard, Sessions, Chats and Broadcast are the vendored OpenWA pages; they bring their own
  // header and full-height layout, so the WhatsApp topbar and content padding step aside.
  const fullBleed = ['overview', 'sessions', 'chats', 'number-checker', 'webhooks', 'templates', 'smart-replies', 'message-tester', 'plugins', 'logs'].includes(active?.id)

  return (
    <div className="owa">
      <aside className="owa-nav">
        <div className="owa-brand">
          <span className="owa-brand-mark">W</span>
          <div>
            <strong>WhatsApp</strong>
            <small>OpenWA Gateway</small>
          </div>
        </div>
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={active?.id === id ? 'active' : ''}
            onClick={() => setSection(id)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
        <div className="owa-nav-foot">UCS CRM · Accounts</div>
      </aside>

      <main className="owa-main">
        {!fullBleed && (
          <header className="owa-topbar">
            <div>
              <h1>{active?.label || 'WhatsApp'}</h1>
              <p>WhatsApp sessions, chats and gateway tools</p>
            </div>
            <span className={`owa-conn ${online === null ? '' : online ? 'on' : 'off'}`}>
              <i />
              {online === null ? 'Checking gateway…' : online ? 'Gateway online' : 'Gateway offline'}
            </span>
          </header>
        )}

        <div
          className={`owa-content ${
            active?.id === 'chats' ? 'owa-content-full' : fullBleed ? 'owa-content-flush' : ''
          }`}
        >
          {active?.id === 'overview' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading dashboard…</span></div>}>
              <OpenWAEmbed page="overview" onNavigate={setSection} />
            </Suspense>
          )}
          {active?.id === 'sessions' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading sessions…</span></div>}>
              <OpenWAEmbed page="sessions" />
            </Suspense>
          )}
          {active?.id === 'chats' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading chats…</span></div>}>
              <OpenWAEmbed page="chats" />
            </Suspense>
          )}
          {active?.id === 'number-checker' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading number checker…</span></div>}>
              <OpenWAEmbed page="number-checker" onNavigate={setSection} />
            </Suspense>
          )}
          {active?.id === 'webhooks' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading webhooks…</span></div>}>
              <OpenWAEmbed page="webhooks" />
            </Suspense>
          )}
          {active?.id === 'templates' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading templates…</span></div>}>
              <OpenWAEmbed page="templates" />
            </Suspense>
          )}
          {active?.id === 'smart-replies' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading smart replies…</span></div>}>
              <OpenWAEmbed page="smart-replies" />
            </Suspense>
          )}
          {active?.id === 'message-tester' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading broadcast…</span></div>}>
              <OpenWAEmbed page="message-tester" defaultMessageType="bulk" />
            </Suspense>
          )}
          {active?.id === 'plugins' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading plugins…</span></div>}>
              <OpenWAEmbed page="plugins" />
            </Suspense>
          )}
          {active?.id === 'logs' && (
            <Suspense fallback={<div className="owa-empty"><Spinner size={22} /><span>Loading logs…</span></div>}>
              <OpenWAEmbed page="logs" />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  )
}

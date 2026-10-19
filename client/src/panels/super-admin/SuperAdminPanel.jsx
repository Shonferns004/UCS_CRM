import { useState, useRef, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom'
import { useUcs } from '../../store'
import { themes, applyTheme } from '../hr/theme'
import SettingsDrawer from '../../components/SettingsDrawer'
import NotificationDrawer from '../../components/NotificationDrawer'
import ToastContainer from '../../components/Toast'
import SpecialIncentive from '../../components/SpecialIncentive'
import LeadChampionCelebration from '../../components/LeadChampionCelebration'
import NoticePopup from '../../components/NoticePopup'
import { api } from '../../api/auth'
import { requestNotifPermission, showDesktopNotification } from '../../utils/desktopNotif'
import { CHAT_NOTIFICATION_TYPE } from '../../components/chat/chatNotificationTypes'
import { useRealtime } from '../../hooks/useRealtime'
import { GridFour, Users, Database } from '@phosphor-icons/react'
import Dashboard from './pages/Dashboard'
import Workers from './pages/Workers'
import WorkerDetail from './pages/WorkerDetail'
import DataManagement from './pages/DataManagement'
import Events from './pages/Events'
import SpecialIncentives from './pages/SpecialIncentives'
import LeadIncentivePage from './pages/LeadIncentivePage'
import IncentivesPage from './pages/IncentivesPage'
import IncentiveSetup from '../accounts/pages/IncentiveSetup'
import { Clipboard, CurrencyCircleDollar, BuildingOffice, Trophy, Bug } from '@phosphor-icons/react'
import ChatWorkspace from '../../components/chat/ChatWorkspace'
import ChatNavBadge from '../../components/chat/ChatNavBadge'
import { ChatIcon } from '../../components/chat/chatIcons'
import { EMBED_PANELS, injectEmbedCss } from './embedPanels'
// import HrRecruitmentReport from './pages/HrRecruitmentReport'
import DailyReportsOverview from './pages/DailyReportsOverview'

const NAV = [
  { id: 'dashboard', path: '/sa/dashboard', label: 'Dashboard', eyebrow: 'Super Admin', icon: GridFour },
  { id: 'data-management', path: '/sa/data-management', label: 'Data Management', eyebrow: 'Data', icon: Database },
  { id: 'employees', path: '/sa/employees', label: 'Volunteers', eyebrow: 'People', icon: Users },
  { id: 'ngo-admin', path: '/sa/ngo-admin', label: 'Admin', eyebrow: 'Admin', icon: BuildingOffice },
  { id: 'accounts', path: '/sa/accounts', label: 'Accounts', eyebrow: 'Finance', icon: CurrencyCircleDollar },
  { id: 'hr', path: '/sa/hr', label: 'HR', eyebrow: 'People', icon: Users },
  { id: 'incentives', path: '/sa/incentives', label: 'Incentives', eyebrow: 'Finance', icon: Trophy },
  { id: 'chat', path: '/sa/chat', label: 'UCS Chat', eyebrow: 'Team', icon: ChatIcon },
  { id: 'daily-reports', path: '/sa/daily-reports', label: 'Reports', eyebrow: 'Reports', icon: Clipboard },
  { id: 'developers', path: '/sa/developers', label: 'Developers', eyebrow: 'Team', icon: Bug },
]

const navMap = {}
NAV.forEach(n => { navMap[n.id] = n })

// Flat sidebar order under Dashboard (no group headers).
// Any NAV id can be placed here; ids omitted are not shown.
const SIDEBAR_ORDER = [
  'employees',
  'data-management',
  'incentives',
  'chat',
  'daily-reports',
  'developers',
]

function Sidebar({ mobileOpen }) {
  const location = useLocation()

  // Segment-aware, so /sa/fro-idle does not light up /sa/fro.
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Flat sidebar entry: a single link straight to the page — or, for an
  // embedded panel, straight to that panel's dashboard.
  const renderItem = (id) => {
    const n = navMap[id]
    if (!n) return null
    const Icon = n.icon
    const embed = EMBED_PANELS[id]
    const to = embed ? `${n.path}/${embed.home || embed.items[0].path}` : n.path
    // Light up for the dashboard link AND for deep links into the panel
    // (isActive is segment-aware, so /sa/fro-idle never lights /sa/fro).
    const active = isActive(to) || (embed && isActive(n.path))
    return (
      <NavLink key={n.id} to={to} className={`sa-nav-item${active ? ' active' : ''}`}>
        <Icon className="sa-nav-icon" size={16} />
        <span className="sa-nav-label">{n.label}</span>
        {n.id === 'chat' && <ChatNavBadge />}
      </NavLink>
    )
  }

  const dash = navMap['dashboard']
  const DashIcon = dash.icon

  return (
    <aside className={`sa-sidebar${mobileOpen ? ' open' : ''}`}>
      <div className="sa-sidebar-header">
        <div className="sa-logo">SA</div>
        <div><div className="sa-logo-text">UFS</div><div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: .5, textTransform: 'uppercase' }}>Super Admin</div></div>
      </div>
      <nav className="sa-nav">
        <NavLink to={dash.path} end className={`sa-nav-item${isActive(dash.path) ? ' active' : ''}`}>
          <DashIcon className="sa-nav-icon" size={16} />
          <span className="sa-nav-label">{dash.label}</span>
        </NavLink>
        {SIDEBAR_ORDER.map(renderItem)}
      </nav>
    </aside>
  )
}

function PageShell({ children }) {
  const { user, logout } = useUcs()
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [allNotifs, setAllNotifs] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [themeName, setThemeName] = useState(() => {
    try { return localStorage.getItem('sa_theme') || 'sky' } catch { return 'sky' }
  })
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('sa_dark') === 'true' } catch { return false }
  })
  const menuRef = useRef(null)
  let _initSeenNotifs = []; try { _initSeenNotifs = JSON.parse(localStorage.getItem('sa_seen_notifs') || '[]'); } catch { /* corrupted */ }
  const seenNotifIds = useRef(new Set(_initSeenNotifs))
  const location = useLocation()

  useEffect(() => {
    if (themes[themeName]) {
      applyTheme(themes[themeName], '.panel-sa')
      const t = themes[themeName]
      const el = document.querySelector('.panel-sa') || document.documentElement
      el.style.setProperty('--bg', t.sand)
      el.style.setProperty('--bg-card', t.paper)
      el.style.setProperty('--text', t.ink)
      el.style.setProperty('--text-soft', t['ink-soft'])
      el.style.setProperty('--border', t.line)
      el.style.setProperty('--primary', t.sage)
      el.style.setProperty('--primary-hover', t.sage)
      el.style.setProperty('--danger', t.danger)
      el.style.setProperty('--bg-sidebar', t.ink)
    }
    localStorage.setItem('sa_theme', themeName)
  }, [themeName])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('sa_dark', dark)
  }, [dark])

  const loadNotifications = () => {
    const uid = user?.id;
    // The env-configured Super Admin signs in with id 0 and has no workers row.
    // notification_log.worker_id is a uuid with a foreign key into workers(id), so
    // no notification row can ever belong to them, and asking for
    // /notifications/0 makes postgres raise `invalid input syntax for type uuid`.
    // Chat notifications are deliberately not delivered to this account; the
    // unread badge on the Community nav item covers the gap.
    if (uid === null || uid === undefined || uid === 0) return;
    api(`/notifications/${uid}`, { _prefix: 'ucs' })
      .then(data => {
        const all = data || [];
        const unread = all.filter(n => !n.read_at);
        setAllNotifs(unread);
        unread.forEach(n => {
          if (!seenNotifIds.current.has(n.id)) {
            seenNotifIds.current.add(n.id);
            localStorage.setItem('sa_seen_notifs', JSON.stringify([...seenNotifIds.current]));
            showDesktopNotification(n.title, n.body);
          }
        });
      })
      .catch((err) => { console.error('Error:', err.message); });
  };

  useEffect(() => {
    loadNotifications();
    requestNotifPermission();
  }, [user?.id]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    if (showMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  useEffect(() => { setMobileSidebar(false) }, [location.pathname])

  const isIframeRoute = ['/sa/accounts', '/sa/ngo-admin', '/sa/hr'].some(p => location.pathname.startsWith(p))
  // Community manages its own scrolling (rail + thread scroll independently), so
  // the host must not also scroll it. Without this the shell's overflow-y:auto
  // and the chat's internal panes fight each other and you get two scrollbars.
  const isChatRoute = location.pathname.startsWith('/sa/chat')
  // The Volunteers page has its own approved header spec (92px, navy title,
  // 46px avatar). The topbar is shared by every SA page, so the taller variant
  // is opted into per-route instead of restyling the shell everywhere.
  const isWorkersRoute = location.pathname === '/sa/employees'
  // Volunteer profile renders a full-bleed surface: the content body drops its
  // padding for this route only (via an opt-in class) so the page's container
  // sits flush against the sidebar, topbar, right and bottom edges. The page
  // carries its own inner inset, so no other SA page's layout moves.
  const isProfileRoute = /^\/sa\/employees\/[^/]+$/.test(location.pathname)
  const meta = NAV.find(n => location.pathname === n.path || location.pathname.startsWith(n.path + '/'))
  const userName = user?.name || 'Super Admin'
  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const drawerSections = [
    { label: 'Notifications', type: 'notifications', items: allNotifs },
  ];

  return (
    <div className="app">
      <ToastContainer />
      <SpecialIncentive />
      <LeadChampionCelebration />
      <NoticePopup />
      <div className={`sa-sidebar-overlay${mobileSidebar ? ' open' : ''}`} onClick={() => setMobileSidebar(false)} />
      <Sidebar mobileOpen={mobileSidebar} />
      <div className="main">
        <header className={`topbar${isWorkersRoute ? ' topbar-workers' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="sa-hamburger sa-top-hamburger" onClick={() => setMobileSidebar(o => !o)} aria-label="Toggle menu">
              <span /><span /><span />
            </button>
            <div>
              <div className="eyebrow">{meta?.eyebrow || 'Super Admin'}</div>
              <h2>{meta?.label || 'Dashboard'}</h2>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div className="topbar-user" ref={menuRef} onClick={() => setShowMenu(!showMenu)}>
              <div className="avatar">{initials}</div>
              {showMenu && (
                <div className="user-menu">
                  <div className="user-menu-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'default' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{userName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Super Admin</div>
                  </div>
                  <div className="user-menu-divider" />
                  <div className="user-menu-item" style={{ cursor: 'default' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{dark ? '☀️ Light' : '🌙 Dark'}</span>
                    <label className="dm-toggle" style={{ marginLeft: 'auto' }}>
                      <input type="checkbox" checked={dark} onChange={() => setDark(!dark)} />
                      <span className="dm-slider"></span>
                    </label>
                  </div>
                  <div className="user-menu-divider" />
                  <div className="user-menu-item" onClick={() => { setShowMenu(false); setShowSettings(true); }} style={{ cursor: 'pointer' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    Settings
                  </div>
                  <div className="user-menu-divider" />
                  <button className="user-menu-item" onClick={() => { setShowMenu(false); logout() }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
          <NotificationDrawer topOffset={48}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            sections={drawerSections}
            onItemClick={(item) => {
              setDrawerOpen(false)
              // A chat notification points at a room, so make it actionable:
              // clicking it should land on Community rather than just closing.
              if (item?.type === CHAT_NOTIFICATION_TYPE) navigate('/sa/chat')
            }}
          />
          <SettingsDrawer
            open={showSettings}
            onClose={() => setShowSettings(false)}
            themes={themes}
            themeName={themeName}
            onThemeChange={(key) => setThemeName(key)}
          />
        </header>
        <div
          className={`content-body${isChatRoute ? ' content-body-chat' : ''}${isProfileRoute ? ' content-body-profile' : ''}`}
          style={{
            maxWidth: 'none',
            padding: isIframeRoute || isChatRoute ? 0 : undefined,
            marginRight: drawerOpen ? 320 : 0,
            transition: 'margin-right .25s ease',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function WorkerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <WorkerDetail workerId={id} onBack={() => navigate('/sa/employees')} />
}

function EmployeePage() {
  const navigate = useNavigate()
  return <Workers onViewWorker={(id) => navigate(`/sa/employees/${id}`)} />
}

// Shows another panel's *page* inside the Super Admin layout. The part of the
// URL after /sa/<panel>/ picks the page, so /sa/ngo-admin/station-mgmt loads the
// Admin panel's Stations page. The iframe stays hidden until its own
// sidebar/topbar have been stripped, so there is no flash of a second layout.
function PanelFrame({ panel }) {
  const location = useLocation()
  const ref = useRef(null)
  const [ready, setReady] = useState(false)
  const cfg = EMBED_PANELS[panel]
  const prefix = `/sa/${panel}`
  const rest = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length).replace(/^\/+/, '') : ''
  const sub = rest || cfg.items[0].path
  const src = `${cfg.base}/${sub}`

  useEffect(() => { setReady(false) }, [src])

  const onLoad = () => {
    injectEmbedCss(ref.current)
    setReady(true)
  }

  return (
    <iframe
      ref={ref}
      key={src}
      src={src}
      title={`${cfg.label} - ${sub}`}
      onLoad={onLoad}
      style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none', opacity: ready ? 1 : 0, transition: 'opacity .15s' }}
    />
  )
}

export default function SuperAdminPanel() {
  return (
    <PageShell>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="data-management" element={<DataManagement />} />
        <Route path="employees" element={<EmployeePage />} />
        <Route path="employees/:id" element={<WorkerDetailPage />} />
        <Route path="events" element={<Events />} />
        <Route path="accounts/*" element={<PanelFrame panel="accounts" />} />
        <Route path="ngo-admin/*" element={<PanelFrame panel="ngo-admin" />} />
        <Route path="hr/*" element={<PanelFrame panel="hr" />} />
        {/* <Route path="hr-report" element={<HrRecruitmentReport />} /> */}
        <Route path="daily-reports" element={<DailyReportsOverview />} />
        <Route path="developers/*" element={<PanelFrame panel="developers" />} />
        <Route path="incentives" element={<IncentivesPage />}>
          <Route index element={<Navigate to="sir" replace />} />
          <Route path="sir" element={<SpecialIncentives />} />
          <Route path="lead" element={<LeadIncentivePage />} />
          {/* Shared third tab: the Daily AKI slab editor. */}
          <Route path="setup" element={<IncentiveSetup />} />
        </Route>
        <Route path="special-incentive" element={<Navigate to="../incentives/sir" replace />} />
        <Route path="lead-incentive" element={<Navigate to="../incentives/lead" replace />} />
        <Route path="chat" element={<ChatWorkspace />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PageShell>
  )
}

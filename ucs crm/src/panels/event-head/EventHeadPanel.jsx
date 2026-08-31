import { useState, useEffect, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useUcs } from '../../store'
import { Grid, Cal, Plus, Clock, FileTxt, Bell, Users, Plane, Brief, Star, Eye, Settings as SettingsIcon } from './icons'
import { themes, applyTheme } from './theme'
import SettingsDrawer from '../../components/SettingsDrawer'
import NotificationDrawer from '../../components/NotificationDrawer'
import { api } from '../../api/auth'
import { markNotifRead, deleteNotif } from './store'
import { requestNotifPermission, showDesktopNotification } from '../../utils/desktopNotif'
import { useRealtime } from '../../hooks/useRealtime'
import Overview from './components/Overview'
import EventDashboard from './pages/EventDashboard'
import CreateEvent from './pages/CreateEvent'
import MonthlyPlanner from './pages/MonthlyPlanner'
import EventChecklist from './pages/EventChecklist'
import AssetRegister from './pages/AssetRegister'
import MaterialRegister from './pages/MaterialRegister'
import BeneficiaryDistribution from './pages/BeneficiaryDistribution'
import VolunteerManagement from './pages/VolunteerManagement'

import AttendanceManagement from './pages/AttendanceManagement'
import EventReports from './pages/EventReports'
import ApprovalWorkflow from './pages/ApprovalWorkflow'
import NotificationsPage from './pages/Notifications'
import EventsPage from './pages/EventsPage'
import MyEvents from './pages/MyEvents'
import NGOs from './pages/NGOs'
import Sectors from './pages/Sectors'
import Activities from './pages/Activities'
import ActivityDetail from './pages/ActivityDetail'
import EventDetail from './pages/EventDetail'
import MediaManagement from './pages/MediaManagement'

const NAV = [
  { id:'dashboard',      path:'/event-head/dashboard',        label:'Dashboard',             icon:Grid, section:'Overview' },
  { id:'events',         path:'/event-head/events',           label:'Events',                icon:Cal, section:'Programs' },
  { id:'monthly-planner',path:'/event-head/monthly-planner',  label:'Calendar',              icon:Cal, section:'Programs' },
  { id:'ngos',           path:'/event-head/ngos',             label:'NGOs',                  icon:Brief, section:'Programs' },
  { id:'sectors',        path:'/event-head/sectors',          label:'Sectors',               icon:Grid, section:'Programs' },
  { id:'activities',     path:'/event-head/activities',       label:'Activities',            icon:Star, section:'Programs' },
  { id:'event',          path:'/event-head/events',           label:'Event',                 icon:Cal, section:'Programs' },
  { id:'create',         path:'/event-head/create',           label:'+ Create Event',        icon:Plus, section:'Programs' },
  { id:'checklist',      path:'/event-head/checklist',        label:'Event Checklist',       icon:Clock, section:'Manage' },
  { id:'events-list',    path:'/event-head/events-list',      label:'My Events',             icon:Cal, section:'Manage' },
  { id:'media',          path:'/event-head/media-management', label:'Media / Banners',       icon:Eye, section:'Manage' },
  { id:'reports',        path:'/event-head/reports',          label:'Event Reports',         icon:FileTxt, section:'Reporting' },
  { id:'approvals',      path:'/event-head/approvals',        label:'Approval Workflow',     icon:SettingsIcon, section:'Reporting' },
  { id:'notifications',  path:'/event-head/notifications',    label:'Notifications',         icon:Bell, section:'Reporting' },
]

const SECTIONS = [
  { id:'Overview', label:'Overview' },
  { id:'Programs', label:'Programs' },
  { id:'Manage', label:'Planning & Manage' },
  { id:'Reporting', label:'Reporting' },
]

function Sidebar({ open, onClose }) {
  const location = useLocation()
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')
  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">E</div>
          <div><h1>UFS</h1><span>Event Manager</span></div>
        </div>
        <nav className="sidebar-nav">
          {SECTIONS.map(s => (
            <div key={s.id}>
              <div className="user-menu-label" style={{padding:'16px 12px 4px',fontSize:10,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--ink-soft)',fontWeight:600}}>{s.label}</div>
              {NAV.filter(n => n.section === s.id).map(n => { const Icon = n.icon
                const active = isActive(n.path)
                return (
                  <NavLink key={n.id} to={n.path} onClick={onClose}
                    className={`snav-item ${active ? 'active' : ''}`}>
                    <span className="ico"><Icon size={18} /></span>
                    <span>{n.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}

export default function EventHeadPanel() {
  const { user, logout } = useUcs()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [themeName, setThemeName] = useState(() => localStorage.getItem('eh_theme') || 'sky')
  const [allNotifs, setAllNotifs] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuRef = useRef(null)
  let _initSeenNotifs = []; try { _initSeenNotifs = JSON.parse(localStorage.getItem('eh_seen_notifs') || '[]'); } catch { /* corrupted */ }
  const seenNotifIds = useRef(new Set(_initSeenNotifs))
  let _initClearedNotifs = []; try { _initClearedNotifs = JSON.parse(localStorage.getItem('eh_cleared_notifs') || '[]'); } catch { /* corrupted */ }
  const clearedNotifIds = useRef(new Set(_initClearedNotifs))

  const loadNotifications = () => {
    const uid = user?.id;
    if (!uid) return;
    api(`/notifications/${uid}`, { _prefix: 'ucs' })
      .then(data => {
        const all = (data || []).filter(n => !clearedNotifIds.current.has(n.id));
        setAllNotifs(all);
        const unread = all.filter(n => !n.read_at);
        unread.forEach(n => {
          if (!seenNotifIds.current.has(n.id)) {
            seenNotifIds.current.add(n.id);
            localStorage.setItem('eh_seen_notifs', JSON.stringify([...seenNotifIds.current]));
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

  useRealtime('notification_log', {
    filter: `worker_id=eq.${user?.id}`,
    onInsert: () => loadNotifications(),
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (themes[themeName]) {
      applyTheme(themes[themeName], '.panel-event-head')
      const t = themes[themeName]
      const el = document.querySelector('.panel-event-head') || document.documentElement
      el.style.setProperty('--bg', t.sand); el.style.setProperty('--card-bg', t.paper); el.style.setProperty('--sage-light', t['sage-soft'])
    }
    localStorage.setItem('eh_theme', themeName)
  }, [themeName])

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    if (showMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const handleMarkRead = async (id) => {
    try {
      await markNotifRead(id)
      loadNotifications()
    } catch (e) { console.error('markNotifRead:', e) }
  }

  const handleClear = async (id) => {
    clearedNotifIds.current.add(id)
    localStorage.setItem('eh_cleared_notifs', JSON.stringify([...clearedNotifIds.current]))
    setAllNotifs(all => all.filter(n => n.id !== id))
    try {
      await deleteNotif(id)
    } catch (e) {
      console.error('deleteNotif failed, falling back to markAsRead:', e)
      try { await markNotifRead(id) } catch (e2) { console.error('markNotifRead fallback also failed:', e2) }
    }
  }

  const meta = [...NAV].reverse().find(n => location.pathname === n.path || location.pathname.startsWith(n.path + '/'))
  const userName = user?.name || 'Event Manager'
  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const drawerSections = [
    { label: 'Notifications', type: 'notifications', items: allNotifs },
  ];

  return (
    <div className="app">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main">
        <header className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Toggle sidebar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <div className="eyebrow">{meta?.section || 'Dashboard'}</div>
              <h2>{meta?.label || 'Event Manager'}</h2>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className="eh-search" style={{ margin:0, maxWidth:280 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search events, NGOs, sectors…" style={{ background:'var(--eh-tint-1)', border:'none' }} />
            </div>
            <button className="eh-btn eh-btn-primary" style={{ marginRight:2 }} onClick={() => navigate('/event-head/create')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create Event
            </button>
            <div className="topbar-user" ref={menuRef} onClick={() => setShowMenu(!showMenu)}>
            <div className="avatar">{initials}</div>
            {showMenu && (
              <div className="user-menu">
                <div className="user-menu-item" style={{flexDirection:'column', alignItems:'flex-start', gap:2, cursor:'default'}}>
                  <div style={{fontWeight:600, fontSize:13}}>{userName}</div>
                  <div style={{fontSize:11, color:'var(--ink-soft)'}}>Event Manager</div>
                </div>
                <div className="user-menu-divider" />
                <div className="user-menu-item" onClick={() => { setShowMenu(false); setShowSettings(true); }} style={{cursor:'pointer'}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  Settings
                </div>
                <div className="user-menu-divider" />
                <button className="user-menu-item" onClick={() => { setShowMenu(false); logout() }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
          </div>
          <NotificationDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            sections={drawerSections}
            onItemClick={(item) => { if (!item.read_at) handleMarkRead(item.id); setDrawerOpen(false) }}
            onMarkRead={handleMarkRead}
            onClear={handleClear}
          />
          <SettingsDrawer
            open={showSettings}
            onClose={() => setShowSettings(false)}
            themes={themes}
            themeName={themeName}
            onThemeChange={(key) => setThemeName(key)}
          />
        </header>
        <div className="content-body">
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<EventDashboard />} />
            <Route path="monthly-planner" element={<MonthlyPlanner />} />
            <Route path="create" element={<CreateEvent />} />
            <Route path="checklist" element={<EventChecklist />} />
            <Route path="ngos" element={<NGOs />} />
            <Route path="sectors" element={<Sectors />} />
            <Route path="activities" element={<Activities />} />
            <Route path="activities/:id" element={<ActivityDetail />} />
            <Route path="assets" element={<AssetRegister />} />
            <Route path="materials" element={<MaterialRegister />} />
            <Route path="distribution" element={<BeneficiaryDistribution />} />
            <Route path="volunteers" element={<VolunteerManagement />} />
            <Route path="attendance" element={<AttendanceManagement />} />
            <Route path="media-management" element={<MediaManagement />} />

            <Route path="events-list" element={<MyEvents />} />
            <Route path="events-today" element={<EventsPage view="today" />} />
            <Route path="events-upcoming" element={<EventsPage view="upcoming" />} />
            <Route path="events-completed" element={<EventsPage view="completed" />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:id" element={<EventDetail />} />
            <Route path="reports" element={<EventReports />} />
            <Route path="approvals" element={<ApprovalWorkflow />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

import { useState, useCallback, useEffect, useRef } from 'react'
import { useUcs } from '../../store'
import { themes, applyTheme } from '../hr/theme'
import Dashboard from './pages/Dashboard'
import Donors from './pages/Donors'
import DonorDetail from './pages/DonorDetail'
import StationManagement from './pages/StationManagement'
import NewData from './pages/NewData'
import Alerts from './pages/Alerts'
import NgoAttendance from './pages/Attendance'

const ICONS = {
  dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
  alerts: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  donors: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  newData: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  station: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  attendance: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { id: 'alerts', label: 'Alerts', icon: ICONS.alerts },
  { id: 'donors', label: 'Donors', icon: ICONS.donors },
  { id: 'new-data', label: 'New Data', icon: ICONS.newData },
  { id: 'station-mgmt', label: 'Stations & FROs', icon: ICONS.station },
  { id: 'attendance', label: 'Attendance', icon: ICONS.attendance },
]

function Sidebar({ active, setActive, open, onClose }) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-mark">NA</div>
        <div><h1>UFS</h1><span>NGO Admin Panel</span></div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(n => (
          <button key={n.id} className={`snav-item ${active === n.id ? 'active' : ''}`}
            onClick={() => { setActive(n.id); onClose?.(); }}>
            <span className="ico">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default function NgoAdminPanel() {
  const { user, logout } = useUcs()
  const [active, setActive] = useState('dashboard')
  const [selectedDonor, setSelectedDonor] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [themeName, setThemeName] = useState(() => localStorage.getItem('ngoadmin_theme') || 'sky')
  const menuRef = useRef(null)

  useEffect(() => {
    if (themes[themeName]) {
      applyTheme(themes[themeName], '.panel-ngo-admin')
      const t = themes[themeName]
      const el = document.querySelector('.panel-ngo-admin') || document.documentElement
      el.style.setProperty('--bg', t.sand)
      el.style.setProperty('--card-bg', t.paper)
      el.style.setProperty('--sage-light', t['sage-soft'])
    }
    localStorage.setItem('ngoadmin_theme', themeName)
  }, [themeName])

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    if (showMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const handleNav = useCallback((id) => {
    setActive(id)
    setSelectedDonor(null)
    setSidebarOpen(false)
  }, [])

  const userName = user?.name || 'Admin'
  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const meta = NAV.find(n => n.id === active)

  return (
    <div className="app">
      <Sidebar active={active} setActive={handleNav} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
            <div className="eyebrow">{meta?.label || 'Dashboard'}</div>
            <h2>{meta?.label || 'Dashboard'}</h2>
          </div>
          <div className="topbar-user" ref={menuRef} onClick={() => setShowMenu(!showMenu)}>
            <div className="topbar-user-text">
              <div className="topbar-name">{userName}</div>
              <div className="topbar-role">NGO Admin</div>
            </div>
            <div className="avatar">{initials}</div>
            {showMenu && (
              <div className="user-menu">
                <div className="user-menu-item" style={{cursor:'default', fontSize:13, color:'#666'}}>
                  Theme: <select value={themeName} onClick={e=>e.stopPropagation()} onChange={e=>setThemeName(e.target.value)} style={{marginLeft:8, border:'1px solid #ddd', borderRadius:6, padding:'2px 8px'}}>
                    {Object.keys(themes).map(k => <option key={k} value={k}>{themes[k].name}</option>)}
                  </select>
                </div>
                <div className="user-menu-divider" />
                <button className="user-menu-item" onClick={() => { setShowMenu(false); logout() }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="content-body">
          {active === 'dashboard' && <Dashboard />}
          {active === 'alerts' && <Alerts />}
          {active === 'donors' && (selectedDonor ? (
            <DonorDetail donor={selectedDonor} onBack={() => setSelectedDonor(null)} />
          ) : (
            <Donors onSelect={setSelectedDonor} />
          ))}
          {active === 'new-data' && <NewData />}
          {active === 'station-mgmt' && <StationManagement />}
          {active === 'attendance' && <NgoAttendance />}
        </div>
      </div>
    </div>
  )
}

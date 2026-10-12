import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useUcs } from '../../store'
import SocialDailyReport from './pages/SocialDailyReport'
import ChatWorkspace from '../../components/chat/ChatWorkspace'
import ChatNavBadge from '../../components/chat/ChatNavBadge'
import ToastContainer from '../../components/Toast'

// Social Media Manager workspace. Mirrors the Developer panel's self-contained
// shell (inline styles, own toast host) but with just the report and community.

const NAV = [
  { id: 'daily-report', path: '/social/daily-report', label: 'Daily Report', icon: 'description' },
  { id: 'chat', path: '/social/chat', label: 'Community', icon: 'chat' },
]

const ICONS = {
  description: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>,
  chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/></svg>,
}

export default function SocialPanel() {
  const location = useLocation()
  const { user, logout } = useUcs()
  const [collapsed, setCollapsed] = useState(false)

  const activeNav = NAV.find((n) => location.pathname === n.path)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <ToastContainer />
      <aside style={{
        width: collapsed ? 56 : 220, flexShrink: 0, background: 'var(--card-bg)', borderRight: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', transition: 'width .2s', overflow: 'hidden',
      }}>
        <div style={{ padding: collapsed ? '16px 12px' : '16px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            SM
          </div>
          {!collapsed && <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Social Panel</div>
            <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>Content & Reach</div>
          </div>}
        </div>

        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV.map((item) => (
            <NavLink key={item.id} to={item.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 16px' : '10px 18px', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', textDecoration: 'none', transition: 'all .12s', borderLeft: '3px solid transparent' }}
              className={({ isActive }) => isActive ? 'nav-active' : ''}>
              <span style={{ flexShrink: 0, display: 'flex' }}>{ICONS[item.icon]}</span>
              {!collapsed && <span>{item.label}</span>}
              {item.id === 'chat' && <ChatNavBadge quiet />}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
          {!collapsed && (
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || user?.login_id}
            </div>
          )}
          <button onClick={logout} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: 'var(--ink-soft)', fontFamily: 'inherit' }}>
            {collapsed ? '...' : 'Sign out'}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '10px 20px', borderBottom: '1px solid var(--line)', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={() => setCollapsed((c) => !c)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-soft)', display: 'flex', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{activeNav?.label || 'Social Panel'}</div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <Routes>
            <Route index element={<Navigate to="daily-report" replace />} />
            <Route path="daily-report" element={<SocialDailyReport />} />
            <Route path="chat" element={<ChatWorkspace />} />
            <Route path="*" element={<Navigate to="/social/daily-report" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

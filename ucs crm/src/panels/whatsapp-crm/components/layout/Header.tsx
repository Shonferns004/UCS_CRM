import { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { Settings, LogOut, Bell } from 'lucide-react';

interface PhoneNumber {
  status: string;
  display_phone_number: string;
  quality_rating?: string;
}

const NAV = [
  { id: 'dashboard', path: '/wcrm', label: 'Dashboard', eyebrow: 'Overview' },
  { id: 'inbox', path: '/wcrm/inbox', label: 'Inbox', eyebrow: 'Messages' },
  { id: 'contacts', path: '/wcrm/contacts', label: 'Contacts', eyebrow: 'People' },
  { id: 'conversations', path: '/wcrm/conversations', label: 'Conversations', eyebrow: 'Chat' },
  { id: 'pipeline', path: '/wcrm/pipeline', label: 'Pipeline', eyebrow: 'Deals' },
  { id: 'automations', path: '/wcrm/automations', label: 'Automations', eyebrow: 'Workflows' },
  { id: 'workflows', path: '/wcrm/workflows', label: 'Workflows', eyebrow: 'Flows' },
  { id: 'phone-numbers', path: '/wcrm/phone-numbers', label: 'Phone Numbers', eyebrow: 'Numbers' },
  { id: 'templates', path: '/wcrm/templates', label: 'Templates', eyebrow: 'Messages' },
  { id: 'analytics', path: '/wcrm/analytics', label: 'Analytics', eyebrow: 'Reports' },
];

export function Header() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const meta = NAV.find(n =>
    n.id === 'dashboard'
      ? location.pathname === '/wcrm' || location.pathname === '/wcrm/'
      : location.pathname.startsWith(n.path)
  );

  const userName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.first_name || user?.email || 'User';
  const userRole = user?.role || 'Agent';
  const userInitials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    if (showMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">{meta?.eyebrow || 'Dashboard'}</div>
        <h2>{meta?.label || 'Dashboard'}</h2>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div className="topbar-user" ref={menuRef} onClick={() => setShowMenu(!showMenu)}>
          <div className="avatar" style={{ background: 'var(--sage-soft)', color: 'var(--sage)', width: 36, height: 36, cursor: 'pointer' }}>
            {userInitials}
          </div>
          {showMenu && (
            <div className="user-menu">
              <div className="user-menu-item" style={{flexDirection:'column', alignItems:'flex-start', gap: 2, cursor: 'default'}}>
                <div style={{fontWeight:600, fontSize:13}}>{userName}</div>
                <div style={{fontSize:11, color:'var(--ink-soft)'}}>{userRole}</div>
              </div>
              <div className="user-menu-divider" />
              <div className="user-menu-item" onClick={() => { setShowMenu(false); navigate('/wcrm/settings'); }}>
                <Settings size={15} />
                Settings
              </div>
              <div className="user-menu-divider" />
              <button className="user-menu-item" onClick={() => { setShowMenu(false); handleSignOut(); }}>
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

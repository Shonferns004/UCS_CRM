import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Bell, ChevronDown, LogOut } from 'lucide-react';

const titleMap = {
  '/dashboard': ['Dashboard', 'Overview'],
};

const roleLabelMap = {
  ADMIN: 'Administrator',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
};

function Header({ user, onLogout, onToggleSidebar }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notifRef = useRef(null);
  const location = useLocation();

  const pathname = location.pathname;
  let pageTitle = 'MetroPad Care';
  let breadcrumb = 'Dashboard';
  for (const [path, title] of Object.entries(titleMap)) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      [pageTitle, breadcrumb] = title;
      break;
    }
  }

  const role = user?.role || 'VIEWER';
  const roleClass = role.toLowerCase();
  const roleLabel = roleLabelMap[role] || role;
  const initials = (user?.name || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join('');

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = null;

  return (
    <header className="header">
      <div className="header-left">
        <button
          className="hamburger-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle menu"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
        <h1 className="header-title">{pageTitle}</h1>
        <span className="header-overline">{breadcrumb}</span>
      </div>
      <div className="header-right">
        <div className="header-notif" ref={notifRef}>
          <button
            className="header-icon-btn"
            aria-label="Notifications"
            onClick={() => { setNotifOpen(!notifOpen); setDropdownOpen(false); }}
          >
            <Bell size={18} strokeWidth={1.9} />
            <span className="header-icon-dot" />
          </button>
          <div className={`header-notif-dropdown${notifOpen ? ' show' : ''}`}>
            <div className="header-dropdown-title">Notifications</div>
            <div className="header-dropdown-empty">
              <Bell size={20} strokeWidth={1.7} />
              <span>No new notifications</span>
            </div>
          </div>
        </div>
        <div className="header-sep" />
        <div
          className="header-user"
          ref={dropdownRef}
          onClick={() => { setDropdownOpen(!dropdownOpen); setNotifOpen(false); }}
        >
          <span className="header-avatar">{initials}</span>
          <div className="header-user-meta">
            <span className="header-user-name">{user?.name || 'User'}</span>
            <span className={`header-user-role ${roleClass}`}>{roleLabel}</span>
          </div>
          <ChevronDown size={15} strokeWidth={2} className="header-user-chevron" />
          <div
            className={`header-user-dropdown${dropdownOpen ? ' show' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="header-dropdown-profile">
              <span className="header-avatar">{initials}</span>
              <div>
                <div className="header-dropdown-profile-name">{user?.name || 'User'}</div>
                <div className="header-dropdown-profile-role">{roleLabel}</div>
              </div>
            </div>
            <div className="header-dropdown-divider" />
            <button
              className="header-dropdown-item danger"
              onClick={() => {
                setDropdownOpen(false);
                onLogout();
              }}
            >
              <LogOut size={16} strokeWidth={1.9} />
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
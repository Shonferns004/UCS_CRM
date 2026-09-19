import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import * as stockIssueService from '../../services/stockIssue.service.js';
import {
  LayoutDashboard,
  TrainFront,
  MapPin,
  Cpu,
  RefreshCw,
  Boxes,
  AlertTriangle,
  Wrench,
  BarChart3,
  FileText,
  Users,
  ScrollText,
  Settings,
  ChevronRight,
} from 'lucide-react';

const navSections = [
  {
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    header: 'Metro Management',
    items: [
      { to: '/metro-lines', icon: TrainFront, label: 'Metro Lines' },
      { to: '/stations', icon: MapPin, label: 'Stations' },
    ],
  },
  {
    header: 'Machine Management',
    items: [
      { to: '/pad-stock', icon: Boxes, label: 'Pad Stock' },
      { to: '/machines', icon: Cpu, label: 'Machines' },
      { to: '/refills', icon: RefreshCw, label: 'Refill Management' },
      { to: '/stock-issues', icon: AlertTriangle, label: 'Stock Issues', badge: 'stockIssues' },
      { to: '/maintenance', icon: Wrench, label: 'Maintenance' },
    ],
  },
  {
    header: 'Analytics & System',
    items: [
      { to: '/monthly-data', icon: BarChart3, label: 'Monthly Data' },
      { to: '/reports', icon: FileText, label: 'Reports' },
    ],
  },
  {
    header: 'Administration',
    adminOnly: true,
    items: [
      { to: '/users', icon: Users, label: 'Users' },
      { to: '/audit-logs', icon: ScrollText, label: 'Audit Logs' },
    ],
  },
  {
    header: 'System',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [stockIssueCount, setStockIssueCount] = useState(null);
  const getLinkClass = ({ isActive }) =>
    `sidebar-link${isActive ? ' active' : ''}`;

  useEffect(() => {
    let cancelled = false;
    stockIssueService
      .getAll({ limit: 1, status: 'OPEN' })
      .then((res) => {
        if (!cancelled) setStockIssueCount(res?.meta?.total ?? null);
      })
      .catch(() => {
        if (!cancelled) setStockIssueCount(null);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div
        className={`sidebar-mobile-overlay${isOpen ? ' show' : ''}`}
        onClick={onClose}
      />
      <aside className={`sidebar${isOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-brand-row">
            <span className="sidebar-brand-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.2L18.5 9 12 12.8 5.5 9 12 4.2Zm-7 6.4 6 3.3v7.3l-6-3.3v-7.3Zm14 0v7.3l-6 3.3v-7.3l6-3.3Z" fill="#fff"/>
              </svg>
            </span>
            <span>
              <h1>METROPAD CARE</h1>
              <p>Machine Management</p>
            </span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navSections.filter((section) => !section.adminOnly || isAdmin).map((section, sIdx) => (
            <div className={`sidebar-section${section.items.length === 1 ? ' single' : ''}`} key={sIdx}>
              {section.header && (
                <div className="sidebar-section-header">
                  {section.header}
                </div>
              )}
              {section.items.map((item) => {
                const badgeCount = item.badge === 'stockIssues' ? stockIssueCount : null;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={getLinkClass}
                    end={item.to === '/'}
                    onClick={onClose}
                  >
                    <span className="sidebar-link-icon">
                      <item.icon size={17} strokeWidth={1.75} />
                    </span>
                    <span>{item.label}</span>
                    {badgeCount !== null && badgeCount > 0 && (
                      <span className="sidebar-link-badge">{badgeCount}</span>
                    )}
                    {section.items.length === 1 && (
                      <span className="sidebar-link-arrow">
                        <ChevronRight size={14} strokeWidth={2} />
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.35" />
            <circle cx="12" cy="12" r="5" fill="currentColor" />
          </svg>
          <span>Mumbai Metro Network</span>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
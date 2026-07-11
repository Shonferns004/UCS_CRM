import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, MessageCircle, Kanban, Bot,
  BarChart3, FileText, Phone, Headphones, Workflow,
} from 'lucide-react';

const NAV = [
  { id: 'dashboard', path: '/wcrm', label: 'Dashboard', icon: LayoutDashboard, eyebrow: 'Overview', sub: 'Your WhatsApp at a glance' },
  { id: 'inbox', path: '/wcrm/inbox', label: 'Inbox', icon: MessageSquare, eyebrow: 'Messages', sub: 'Incoming conversations' },
  { id: 'contacts', path: '/wcrm/contacts', label: 'Contacts', icon: Users, eyebrow: 'People', sub: 'Manage your contacts' },
  { id: 'conversations', path: '/wcrm/conversations', label: 'Conversations', icon: Headphones, eyebrow: 'Chat', sub: 'Active chat threads' },
  { id: 'pipeline', path: '/wcrm/pipeline', label: 'Pipeline', icon: Kanban, eyebrow: 'Deals', sub: 'Track your sales pipeline' },
  { id: 'automations', path: '/wcrm/automations', label: 'Automations', icon: Bot, eyebrow: 'Workflows', sub: 'Automated responses' },
  { id: 'workflows', path: '/wcrm/workflows', label: 'Workflows', icon: Workflow, eyebrow: 'Flows', sub: 'Build message flows' },
  { id: 'phone-numbers', path: '/wcrm/phone-numbers', label: 'Phone Numbers', icon: Phone, eyebrow: 'Numbers', sub: 'Manage connected numbers' },
  { id: 'templates', path: '/wcrm/templates', label: 'Templates', icon: FileText, eyebrow: 'Messages', sub: 'Message templates' },
  { id: 'analytics', path: '/wcrm/analytics', label: 'Analytics', icon: BarChart3, eyebrow: 'Reports', sub: 'Performance metrics' },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark" style={{background:'var(--sage)',borderRadius:10,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:18}}>W</div>
          <div><h1>WhatsApp</h1><span>CRM Panel</span></div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => {
            const Icon = n.icon;
            const active = n.id === 'dashboard'
              ? location.pathname === '/wcrm' || location.pathname === '/wcrm/'
              : location.pathname.startsWith(n.path);
            return (
              <NavLink
                key={n.id}
                to={n.path}
                className={`snav-item ${active ? 'active' : ''}`}
                onClick={() => onClose?.()}
              >
                <Icon className="ico" /> <span>{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

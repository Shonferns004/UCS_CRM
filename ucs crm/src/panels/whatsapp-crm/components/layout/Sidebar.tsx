import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Users, MessageCircle, Kanban, Bot, BarChart3, FileText, Settings, Headphones } from 'lucide-react';
import { cn } from '../../lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/wcrm', icon: LayoutDashboard, end: true },
  { name: 'Inbox', href: '/wcrm/inbox', icon: MessageSquare },
  { name: 'Contacts', href: '/wcrm/contacts', icon: Users },
  { name: 'Pipeline', href: '/wcrm/pipeline', icon: Kanban },
  { name: 'Automations', href: '/wcrm/automations', icon: Bot },
  { name: 'Templates', href: '/wcrm/templates', icon: FileText },
  { name: 'Analytics', href: '/wcrm/analytics', icon: BarChart3 },
  { name: 'Phone Numbers', href: '/wcrm/phone-numbers', icon: Headphones },
  { name: 'Settings', href: '/wcrm/settings', icon: Settings },
];

export function Sidebar() {
  return (
    <div className="flex w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <MessageCircle className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">WhatsApp CRM</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

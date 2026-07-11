import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, MessageCircle, Kanban, Bot,
  BarChart3, FileText, Phone, Headphones, Workflow,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/wcrm', icon: LayoutDashboard },
  { name: 'Inbox', href: '/wcrm/inbox', icon: MessageSquare },
  { name: 'Contacts', href: '/wcrm/contacts', icon: Users },
  { name: 'Conversations', href: '/wcrm/conversations', icon: Headphones },
  { name: 'Pipeline', href: '/wcrm/pipeline', icon: Kanban },
  { name: 'Automations', href: '/wcrm/automations', icon: Bot },
  { name: 'Workflows', href: '/wcrm/workflows', icon: Workflow },
  { name: 'Phone Numbers', href: '/wcrm/phone-numbers', icon: Phone },
  { name: 'Templates', href: '/wcrm/templates', icon: FileText },
  { name: 'Analytics', href: '/wcrm/analytics', icon: BarChart3 },
];

export function Sidebar() {
  return (
    <div className="flex w-64 flex-col border-r border-border bg-card overflow-hidden">
      {/* WhatsApp green gradient header */}
      <div
        className="relative flex h-16 items-center gap-3 px-6 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--wa-green)), hsl(var(--wa-teal)))',
        }}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white tracking-tight leading-tight">WhatsApp CRM</span>
          <span className="text-[10px] font-medium text-white/70 leading-tight">Business Suite</span>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/5" />
        <div className="absolute -right-2 -bottom-6 h-12 w-12 rounded-full bg-white/5" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        {navigation.map((item, idx) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/wcrm'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 wa-glow'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground hover:translate-x-0.5'
              )
            }
            style={{ animationDelay: `${idx * 30}ms` }}
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] transition-transform duration-200',
                    isActive ? 'scale-110' : 'group-hover:scale-105'
                  )}
                />
                <span className="truncate">{item.name}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer badge */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">System Online</span>
        </div>
      </div>
    </div>
  );
}

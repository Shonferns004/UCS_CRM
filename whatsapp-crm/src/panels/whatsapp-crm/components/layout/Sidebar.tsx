import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Users, MessageCircle, Kanban, Bot, BarChart3, FileText, Settings, Headphones, MoreVertical, LogOut, User, Mail, Shield, Phone, UserCog } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, end: true },
  { name: 'Inbox', href: '/inbox', icon: MessageSquare },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Team', href: '/team', icon: UserCog },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Automations', href: '/automations', icon: Bot },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Phone Numbers', href: '/phone-numbers', icon: Headphones },
  { name: 'Settings', href: '/settings', icon: Settings },
];

function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const [accounts, setAccounts] = useState<any[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: assign } = await supabase.from('agent_phone_assignments').select('account_id').eq('user_id', user.id);
      if (!assign?.length) return;
      const ids = assign.map((a: any) => a.account_id);
      const { data } = await supabase.from('whatsapp_accounts').select('name, phone_number_id').in('id', ids);
      if (data) setAccounts(data);
    })();
  }, [user?.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-80 rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00a884] text-2xl font-bold text-white">
            {(user?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
          </div>
          <p className="text-lg font-semibold text-[#111b21]">{user?.first_name} {user?.last_name}</p>
          <div className="flex items-center gap-2 text-sm text-[#667781]"><Mail className="h-4 w-4" /> {user?.email}</div>
          <div className="flex items-center gap-2 text-sm text-[#667781]"><Shield className="h-4 w-4" /> Role: <span className="capitalize font-medium text-[#111b21]">{user?.role}</span></div>
          {accounts.length > 0 && (
            <div className="w-full border-t pt-3 mt-1 space-y-2">
              <p className="text-xs font-medium text-[#667781] text-center">Assigned WhatsApp Account{accounts.length > 1 ? 's' : ''}</p>
              {accounts.map((a: any) => (
                <div key={a.phone_number_id} className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-3 py-2 text-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-[10px] font-bold text-white">
                    {(a.name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#111b21]">{a.name}</p>
                    <p className="text-[11px] text-[#667781]">{a.phone_number_id}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={onClose} className="mt-2 rounded-lg bg-[#00a884] px-6 py-1.5 text-sm font-medium text-white hover:bg-[#008f72]">Close</button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <div className="flex w-64 max-md:w-16 flex-col border-r bg-card">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <MessageCircle className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold max-md:hidden">WhatsApp CRM</span>
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
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="max-md:hidden">{item.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="relative border-t p-3">
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-muted-foreground hover:bg-accent">
            <MoreVertical className="h-5 w-5" />
            <span className="max-md:hidden text-sm">More</span>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute bottom-14 left-3 right-3 z-50 rounded-lg border bg-white shadow-lg">
                <button onClick={() => { setMenuOpen(false); setProfileOpen(true); }} className="flex w-full items-center gap-3 rounded-t-lg px-4 py-3 text-sm text-[#111b21] hover:bg-[#f0f2f5]">
                  <User className="h-4 w-4 text-[#667781]" /> Profile
                </button>
                <button onClick={() => { setMenuOpen(false); useAuthStore.getState().signOut(); navigate('/auth/login'); }} className="flex w-full items-center gap-3 rounded-b-lg px-4 py-3 text-sm text-red-500 hover:bg-[#f0f2f5]">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuDescription,
} from '../ui/DropdownMenu';
import { Settings, LogOut, ChevronDown } from 'lucide-react';

interface PhoneNumber {
  name: string;
  status: string;
  display_phone_number: string;
  quality_rating?: string;
}

function getInitials(first?: string, last?: string): string {
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first) return first[0].toUpperCase();
  return '?';
}

export function Header() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  useEffect(() => {
    (async () => {
      const { data: accts } = await supabase
        .from('whatsapp_accounts')
        .select('name, project, phone_number_id, access_token')
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      if (!accts || accts.length === 0) return;
      const results: PhoneNumber[] = [];
      for (const acct of accts) {
        try {
          const r = await fetch(`https://graph.facebook.com/v23.0/${acct.phone_number_id}?fields=display_phone_number,quality_rating,verified_name,code_verification_status`, {
            headers: { Authorization: `Bearer ${acct.access_token}` },
          });
          const data = await r.json();
          if (data.display_phone_number) {
            results.push({ name: acct.project.toUpperCase(), status: data.code_verification_status || 'verified', display_phone_number: data.display_phone_number, quality_rating: data.quality_rating });
          }
        } catch {}
      }
      setPhoneNumbers(results);
    })();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="relative flex h-14 items-center justify-between border-b bg-white px-4">
      <div className="flex items-center gap-3">
        {phoneNumbers.length > 0 ? (
          phoneNumbers.map((pn) => {
            const qualityDot = pn.quality_rating === 'GREEN' ? 'bg-green-500' : pn.quality_rating === 'YELLOW' ? 'bg-yellow-500' : 'bg-red-500';
            return (
              <div key={pn.display_phone_number} className="flex items-center gap-1.5 rounded-lg bg-[#f0f2f5] px-2 py-1">
                <span className="text-[11px] font-bold text-[#00a884] uppercase">{pn.name}</span>
                <span className="text-[11px] text-[#8696a0]">{pn.display_phone_number}</span>
                <span className={`h-2 w-2 rounded-full ${qualityDot}`} title={`Quality: ${pn.quality_rating || 'unknown'}`} />
              </div>
            );
          })
        ) : (
          <span className="text-sm text-[#8696a0]">No number connected</span>
        )}
      </div>

      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-[#f0f2f5]">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00a884] text-xs font-bold text-white">
                {getInitials(user?.first_name, user?.last_name)}
              </div>
              <span className="text-[13px] font-medium text-[#111b21]">
                {user?.first_name}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#667781]" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>
              {user?.first_name} {user?.last_name}
            </DropdownMenuLabel>
            <DropdownMenuDescription>{user?.email}</DropdownMenuDescription>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

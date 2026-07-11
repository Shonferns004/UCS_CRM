import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { Badge } from '../ui/Badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuDescription,
} from '../ui/DropdownMenu';
import { Settings, LogOut, ChevronDown, Phone, Wifi, WifiOff } from 'lucide-react';

interface PhoneNumber {
  status: string;
  display_phone_number: string;
  quality_rating?: string;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }> = {
  verified: { label: 'Connected', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  banned: { label: 'Banned', variant: 'error' },
  restricted: { label: 'Restricted', variant: 'error' },
};

function getInitials(first?: string, last?: string): string {
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first) return first[0].toUpperCase();
  return '?';
}

export function Header() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState<PhoneNumber | null>(null);

  useEffect(() => {
    supabase
      .from('whatsapp_phone_numbers')
      .select('status, display_phone_number, quality_rating')
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPhoneNumber(data);
      });
  }, []);

  const config = phoneNumber ? statusConfig[phoneNumber.status] : null;
  const isConnected = config?.variant === 'success';

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header
      className="relative flex h-14 items-center justify-between border-b border-border px-6"
      style={{
        background: 'hsl(var(--card) / 0.8)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Left — Phone status */}
      <div className="flex items-center gap-3">
        {phoneNumber ? (
          <div className="flex items-center gap-2.5 rounded-full bg-muted/50 px-3.5 py-1.5">
            <span
              className={`h-2 w-2 rounded-full transition-colors ${
                isConnected ? 'bg-green-500' : config?.variant === 'warning' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500 animate-pulse'
              }`}
            />
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {phoneNumber.display_phone_number}
            </span>
            <Badge variant={config?.variant || 'neutral'} className="text-[10px] px-1.5 py-0">
              {config?.label || phoneNumber.status}
            </Badge>
            {phoneNumber.quality_rating && (
              <span
                className={`h-2 w-2 rounded-full ${
                  phoneNumber.quality_rating === 'GREEN'
                    ? 'bg-green-500'
                    : phoneNumber.quality_rating === 'YELLOW'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                title={`Quality: ${phoneNumber.quality_rating}`}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-muted/50 px-3.5 py-1.5">
            <WifiOff className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground/50">No number connected</span>
          </div>
        )}
      </div>

      {/* Right — User dropdown */}
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="flex items-center gap-2.5 rounded-full px-2 py-1.5 transition-all duration-200 hover:bg-accent/60 cursor-pointer">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--wa-green)), hsl(var(--wa-teal)))',
                }}
              >
                {getInitials(user?.first_name, user?.last_name)}
              </div>
              <div className="hidden flex-col items-start sm:flex">
                <span className="text-sm font-medium leading-tight">
                  {user?.first_name} {user?.last_name}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">{user?.role}</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="wa-anim-pop">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.first_name} {user?.last_name}</span>
                <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/wcrm/settings')}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

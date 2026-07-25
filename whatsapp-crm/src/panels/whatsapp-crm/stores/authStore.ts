import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { loadMetaCredentials } from '../lib/metaCredentials';
import type { User } from 'shared';

const API_URL = import.meta.env.VITE_API_URL || 'https://ucs-crm-five.vercel.app/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsVerification: boolean }>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  signIn: async (email, password) => {
    const res = await fetch(`${API_URL}/whatsapp-crm/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    const mappedUser: User = {
      id: data.user.id,
      tenant_id: data.user.tenant_id || data.user.id,
      email: data.user.email,
      first_name: data.user.first_name || '',
      last_name: data.user.last_name || '',
      role: data.user.role as User['role'],
      status: data.user.status || 'active',
      created_at: data.user.created_at || new Date().toISOString(),
    };

    localStorage.setItem('ucs_token', data.token);
    localStorage.setItem('ucs_user', JSON.stringify(mappedUser));

    if (data.supabase) {
      localStorage.setItem('ucs_supabase_session', JSON.stringify(data.supabase));
      try {
        await supabase.auth.setSession({
          access_token: data.supabase.access_token,
          refresh_token: data.supabase.refresh_token,
        });
      } catch {}
    }

    set({ user: mappedUser, isAuthenticated: true, isLoading: false });
    loadMetaCredentials();
  },

  signUp: async (email, password) => {
    const res = await fetch(`${API_URL}/whatsapp-crm/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Registration failed');
    }
    return { needsVerification: true };
  },

  signOut: async () => {
    const token = localStorage.getItem('ucs_token');
    if (token) {
      try {
        await fetch(`${API_URL}/whatsapp-crm/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }

    localStorage.removeItem('ucs_token');
    localStorage.removeItem('ucs_user');
    localStorage.removeItem('ucs_supabase_session');
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchUser: async () => {
    try {
      const storedRaw = localStorage.getItem('ucs_user');
      const token = localStorage.getItem('ucs_token');

      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (storedRaw) {
        try {
          const parsed = JSON.parse(storedRaw) as User;

          const res = await fetch(`${API_URL}/whatsapp-crm/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              localStorage.setItem('ucs_user', JSON.stringify(data.user));
              set({ user: data.user, isAuthenticated: true, isLoading: false });
              loadMetaCredentials();
              return;
            }
          }

          if (res.status === 401) {
            localStorage.removeItem('ucs_token');
            localStorage.removeItem('ucs_user');
            localStorage.removeItem('ucs_supabase_session');
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          set({ user: parsed, isAuthenticated: true, isLoading: false });
          loadMetaCredentials();
          return;
        } catch {}
      }

      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

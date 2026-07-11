import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { loadMetaCredentials } from '../lib/metaCredentials';
import type { User } from 'shared';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string, orgName: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  signIn: async (email, password) => {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Login failed');
    if (data.token) localStorage.setItem('ucs_token', data.token);
    if (data.user) localStorage.setItem('ucs_user', JSON.stringify(data.user));
    await useAuthStore.getState().fetchUser();
  },

  signUp: async (email, password, firstName, lastName, orgName) => {
    const res = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName, org_name: orgName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Registration failed');
  },

  signOut: async () => {
    localStorage.removeItem('ucs_token');
    localStorage.removeItem('ucs_user');
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      const ucsToken = localStorage.getItem('ucs_token');
      const ucsUserRaw = localStorage.getItem('ucs_user');
      if (ucsToken && ucsUserRaw) {
        try {
          const ucsUser = JSON.parse(ucsUserRaw);
          const mappedUser: User = {
            id: ucsUser.id,
            tenant_id: ucsUser.tenant_id || ucsUser.id,
            email: ucsUser.email,
            first_name: ucsUser.first_name || ucsUser.name?.split(' ')[0],
            last_name: ucsUser.last_name || ucsUser.name?.split(' ').slice(1).join(' '),
            role: (['tenant_admin', 'agent', 'viewer'].includes(ucsUser.role) ? ucsUser.role : 'agent') as User['role'],
            status: 'active',
            created_at: new Date().toISOString(),
          };
          set({ user: mappedUser, isAuthenticated: true, isLoading: false });
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

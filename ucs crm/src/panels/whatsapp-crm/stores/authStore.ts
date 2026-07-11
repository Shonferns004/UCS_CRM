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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await useAuthStore.getState().fetchUser();
  },

  signUp: async (email, password, firstName, lastName, orgName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName, org_name: orgName },
      },
    });
    if (error) throw error;
  },

  signOut: async () => {
    try { await supabase.auth.signOut(); } catch {}
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      // First: try UCS CRM localStorage session
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

      // Second: try Supabase Auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error || !profile) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      set({ user: profile, isAuthenticated: true, isLoading: false });
      loadMetaCredentials();
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

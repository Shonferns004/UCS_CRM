import { create } from 'zustand';

type UserRole = 'super_admin' | 'tenant_admin' | 'agent' | 'viewer';

interface User {
  id: string;
  tenant_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string, orgName: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

function authUserToWcrmUser(authUser: any): User {
  const now = new Date().toISOString();
  const meta = authUser.user_metadata || {};
  const defaultTenant = authUser.id?.replace(/-/g, '').slice(0, 8) || 'default';
  return {
    id: authUser.id,
    tenant_id: meta.tenant_id || defaultTenant,
    email: authUser.email || meta.email || '',
    first_name: meta.first_name || '',
    last_name: meta.last_name || '',
    role: (meta.role as UserRole) || 'agent',
    status: 'active',
    created_at: authUser.created_at || now,
    updated_at: now,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  signIn: async (email, password) => {
    const { supabase } = await import('../lib/supabase');
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data?.user) {
      const user = authUserToWcrmUser(data.user);
      set({ user, isAuthenticated: true, isLoading: false });
    } else {
      await useAuthStore.getState().fetchUser();
    }
  },

  signUp: async (email, password, firstName, lastName, orgName) => {
    const { supabase } = await import('../lib/supabase');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName, org_name: orgName } },
    });
    if (error) throw error;
  },

  signOut: async () => {
    try {
      const { supabase } = await import('../lib/supabase');
      await supabase.auth.signOut();
    } catch {}
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      const { supabase } = await import('../lib/supabase');
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const user = authUserToWcrmUser(authUser);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

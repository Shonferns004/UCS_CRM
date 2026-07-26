import supabase from '../config/supabase.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getWorkerByLoginId } from '../models/workerModel.js';

function getTokenExpiry(req) {
  const clientType = req.headers['x-client-type'] || 'web';
  return clientType === 'flutter' ? '100y' : '24h';
}

export async function whatsappCrmLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    let userData = null;
    let supabaseSession = null;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!authError && authData?.user) {
      const { data: dbUser } = await supabase.rpc('get_whatsapp_user', { p_id: authData.user.id });
      userData = typeof dbUser === 'string' ? JSON.parse(dbUser) : dbUser;

      if (userData && userData.is_active === false) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }

      supabaseSession = authData.session;

      if (userData) {
        const emailConfirmed = !!authData.user.email_confirmed_at;
        let role = userData.role;
        if (emailConfirmed && (role === 'agent' || role === 'viewer')) {
          await supabase.rpc('promote_to_admin', { p_id: authData.user.id });
          role = 'admin';
        }
        userData.role = role;
      }
    }

    if (!userData) {
      const { data: agentData, error: agentErr } = await supabase.rpc('verify_agent', {
        p_email: email,
        p_password: password,
      });

      if (agentErr || !agentData) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      userData = typeof agentData === 'string' ? JSON.parse(agentData) : agentData;
    }

    if (!userData) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const expiry = getTokenExpiry(req);
    const tokenPayload = {
      id: userData.id,
      email: userData.email || email,
      role: userData.role || 'agent',
      name: userData.name || userData.first_name || email.split('@')[0],
      tenant_id: userData.tenant_id || userData.id,
    };

    if (userData.ngo_id) tokenPayload.ngo_id = userData.ngo_id;

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: expiry });

    const mappedUser = {
      id: userData.id,
      tenant_id: userData.tenant_id || userData.id,
      email: userData.email || email,
      first_name: userData.first_name || userData.name?.split(' ')[0] || '',
      last_name: userData.last_name || userData.name?.split(' ').slice(1).join(' ') || '',
      role: (['admin', 'agent', 'viewer', 'master'].includes(userData.role) ? userData.role : 'agent'),
      status: userData.is_active !== false ? 'active' : 'inactive',
      created_at: userData.created_at || new Date().toISOString(),
    };

    const response = { token, user: mappedUser };

    if (supabaseSession) {
      response.supabase = {
        access_token: supabaseSession.access_token,
        refresh_token: supabaseSession.refresh_token,
        expires_at: supabaseSession.expires_at,
      };
    }

    return res.json(response);
  } catch (error) {
    console.error('WhatsApp CRM login error:', error?.message);
    return res.status(500).json({ message: 'Login failed' });
  }
}

export async function whatsappCrmRegister(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: req.headers.origin || 'http://localhost:5173' },
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json({ message: 'Registration successful. Please check your email to verify.', user: data.user ? { id: data.user.id, email: data.user.email } : null });
  } catch (error) {
    console.error('WhatsApp CRM register error:', error?.message);
    return res.status(500).json({ message: 'Registration failed' });
  }
}

export async function whatsappCrmMe(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (userId === 'master') {
      return res.json({
        user: {
          id: 'master',
          tenant_id: 'master',
          email: req.user.email || 'admin',
          first_name: 'Master',
          last_name: 'Admin',
          role: 'master',
          status: 'active',
        }
      });
    }

    const { data: dbUser } = await supabase.rpc('get_whatsapp_user', { p_id: userId });
    const userData = typeof dbUser === 'string' ? JSON.parse(dbUser) : dbUser;

    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    const mappedUser = {
      id: userData.id,
      tenant_id: userData.tenant_id || userData.id,
      email: userData.email,
      first_name: userData.first_name || userData.name?.split(' ')[0] || '',
      last_name: userData.last_name || userData.name?.split(' ').slice(1).join(' ') || '',
      role: (['admin', 'agent', 'viewer', 'master'].includes(userData.role) ? userData.role : 'agent'),
      status: userData.is_active !== false ? 'active' : 'inactive',
      created_at: userData.created_at || new Date().toISOString(),
    };

    return res.json({ user: mappedUser });
  } catch (error) {
    console.error('WhatsApp CRM me error:', error?.message);
    return res.status(500).json({ message: 'Failed to load user' });
  }
}

export async function whatsappCrmLogout(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token && !token.startsWith('rpc_') && token !== 'master') {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded && decoded.email) {
            await supabase.auth.admin.signOut(decoded.id);
          }
        } catch {}
      }
    }
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    return res.json({ message: 'Logged out successfully' });
  }
}

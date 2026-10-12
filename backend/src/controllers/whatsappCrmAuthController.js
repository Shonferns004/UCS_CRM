import db from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { normalizeRole } from '../middleware/authMiddleware.js';
import { getWorkerByLoginId } from '../models/workerModel.js';

// Was '100y'. A year-long token is not revocable: neither logout nor deactivating
// the account stops it working, so the only remedy was rotating JWT_SECRET for
// every user at once. Matches the main CRM login.
const TOKEN_EXPIRY = '24h';

export async function whatsappCrmLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const masterEmail = process.env.WHATSAPP_MASTER_EMAIL;
    const masterPassword = process.env.WHATSAPP_MASTER_PASSWORD;

    if (masterEmail && masterPassword && email === masterEmail && password === masterPassword) {
      const masterUser = { id: 'master', email: masterEmail, role: 'master', first_name: 'Master', last_name: 'Admin', tenant_id: 'master' };
      const token = jwt.sign({ id: 'master', email: masterEmail, role: 'master', name: 'Master Admin', tenant_id: 'master' }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { ...masterUser, status: 'active', created_at: new Date().toISOString() } });
    }

    let userData = null;
    let authSession = null;

    const { data: authData, error: authError } = await db.auth.signInWithPassword({
      email,
      password,
    });

    if (!authError && authData?.user) {
      const { data: dbUser } = await db.rpc('get_whatsapp_user', { p_id: authData.user.id });
      userData = typeof dbUser === 'string' ? JSON.parse(dbUser) : dbUser;

      if (userData && userData.is_active === false) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }

      authSession = authData.session;

      // The silent agent|viewer -> admin promotion that used to sit here is gone,
      // and it was the most serious hole on this surface.
      //
      // It ran on nothing but "the email address is confirmed", which any
      // self-registered visitor can do. The effect was that visiting
      // /auth/register, confirming an email, and logging in produced role
      // 'admin' -- and 'admin' is one of the four roles whatsappScope treats as
      // the WhatsApp admin, i.e. unbounded access to every donor conversation in
      // the organisation. So the whole per-agent allotment model was one
      // self-signup away from being pointless.
      //
      // Roles now come from the database and are not escalated at login.
      userData.role = normalizeRole(userData.role) || 'agent';
    }

    if (!userData) {
      const { data: agentData, error: agentErr } = await db.rpc('verify_agent', {
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

    const expiry = TOKEN_EXPIRY;
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

    if (authSession) {
      response.supabase = {
        access_token: authSession.access_token,
        refresh_token: authSession.refresh_token,
        expires_at: authSession.expires_at,
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
    const { email, password, inviteCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Self-service signup used to be open to anyone who could reach the URL,
    // which is how an unprivileged visitor could obtain a CRM login at all. It
    // now requires an invite code the WhatsApp admin hands out. An unset
    // WHATSAPP_SIGNUP_INVITE_CODE closes registration entirely rather than
    // defaulting to open, so forgetting to configure it fails safe.
    const expected = (process.env.WHATSAPP_SIGNUP_INVITE_CODE || '').trim();
    if (!expected) {
      return res.status(403).json({ message: 'Self-registration is disabled. Ask your WhatsApp admin for an invite.' });
    }
    if (!inviteCode || String(inviteCode).trim() !== expected) {
      return res.status(403).json({ message: 'Invalid invite code' });
    }

    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: req.headers.origin || 'http://localhost:5173' },
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    // Every new signup lands as a plain agent: no role is taken from the request
    // body, and nothing is escalated. Promotion to admin is a deliberate act by
    // an existing admin, not a side effect of registering.
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

    const { data: dbUser } = await db.rpc('get_whatsapp_user', { p_id: userId });
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
            await db.auth.admin.signOut(decoded.id);
          }
        } catch {}
      }
    }
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    return res.json({ message: 'Logged out successfully' });
  }
}

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import db from '../config/db.js';

dotenv.config();

// Role aliases that appear in the users table (case / wording variants). Normalizes
// so guards like authenticateRole('super_admin', 'admin', 'hr') also match 'HR',
// 'HR-Recruiter', 'FRO', 'Event Head', etc. stored in the database.
const ROLE_ALIASES = {
  'hr': 'hr',
  'hr-recruiter': 'recruiter',
  'fro': 'fro',
  'accounts': 'accounts',
  'accountant': 'accounts',
  'admin': 'admin',
  'administrator': 'admin',
  'ngo admin': 'admin',
  'ngo_admin': 'admin',
  'super_admin': 'super_admin',
  'superadmin': 'super_admin',
  'super admin': 'super_admin',
  'super-admin': 'super_admin',
  'sa': 'super_admin',
  'master': 'master',
  'recruiter': 'recruiter',
  'telecaller': 'telecaller',
  'leads': 'leads',
  'team_lead': 'team_lead',
  'worker': 'worker',
  'event_head': 'event_head',
  'event manager': 'event_manager',
  'event_manager': 'event_manager',
  'event head': 'event_head',
  'ngo': 'ngo',
  'whatsapp_crm': 'whatsapp_crm',
  'digital': 'digital',
  'developer': 'developers',
  'developers': 'developers',
  'social': 'social',
  'social media': 'social',
  'social_media': 'social',
  'social-media': 'social',
  'social media manager': 'social',
  'agent': 'agent',
  'viewer': 'viewer',
};

export const normalizeRole = (role) => {
  if (role == null) return role;
  const s = String(role).trim().toLowerCase();
  return ROLE_ALIASES[s] || s;
};

const applyNormalizedRole = (decoded) => {
  if (decoded && decoded.role) decoded.role = normalizeRole(decoded.role);
  return decoded;
};

export const authenticateRole = (...allowedRoles) => {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    try {
      const decoded = applyNormalizedRole(jwt.verify(token, process.env.JWT_SECRET));
      if (!allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ message: `Access denied. Required role: ${allowedRoles.join(', ')}` });
      }
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
};

export const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { return res.status(401).json({ message: 'No token provided' }); }
  try {
    req.user = applyNormalizedRole(jwt.verify(token, process.env.JWT_SECRET));
    next();
  } catch { return res.status(401).json({ message: 'Invalid token' }); }
};

// ── WhatsApp admin (Phase D) ─────────────────────────────────────
// Grants the WhatsApp admin surface ONLY: account management, agent
// assignment, and keyword automations.
//
// Why this is a flag and not a role: an agent login is issued a token with
// role 'fro' (authController.js:178), so no role check can tell "Agent 1 who
// administers WhatsApp" apart from "any FRO". Giving the admin surface a real
// CRM role would have handed that person every other panel as well.
//
// So an agent's identity is read from crm_agents.whatsapp_admin and nothing
// else. The token is not modified and req.user.role is untouched, which is why
// this cannot leak into /accounts, /sa, /hr or any other module: those guards
// never look at crm_agents.
//
// Staff/admin logins keep their existing role-based access, so the accounts
// team and super admins are not affected by the flag either way.
export const requireWhatsAppAdmin = async (req, res, next) => {
  const role = normalizeRole(req.user?.role);

  // Existing staff paths (accounts / super_admin / master) are unchanged.
  if (WA_STAFF_ROLES.has(role)) return next();

  const agentId = req.user?.agent_user_id;
  if (!agentId) {
    return res.status(403).json({ message: 'WhatsApp admin access is required' });
  }

  try {
    const { data, error } = await db
      .from('crm_agents')
      .select('whatsapp_admin, is_active, label')
      .eq('id', agentId)
      .maybeSingle();
    if (error) throw error;
    // A deactivated agent must not keep admin access on an unexpired token.
    if (!data || !data.is_active || !data.whatsapp_admin) {
      return res.status(403).json({ message: 'WhatsApp admin access is required' });
    }
    req.whatsappAdmin = { agentId, label: data.label };
    return next();
  } catch {
    return res.status(503).json({ message: 'Could not verify WhatsApp admin access' });
  }
};

// Staff-side roles that keep access to the WhatsApp admin routes exactly as
// before this guard existed.
const WA_STAFF_ROLES = new Set(['super_admin', 'accounts', 'master']);

export const authenticateAdmin = authenticateRole('master', 'super_admin');
export const authenticateWorker = authenticateRole('worker', 'fro');

// ── UFS / Event Manager workspace ────────────────────────────────
// The client admits a user into EventHeadPanel when EITHER their role or their
// department matches (client/src/App.jsx ProtectedRoute: role list plus the
// `allowedRoles.includes(user.department)` fallback). An API guard that only
// looked at the role would 403 someone the UI already let in, and their team
// queue would silently render empty — so mirror both checks here.
const EVENT_TEAM_ROLES = new Set(['event_head', 'event_manager']);
// Resolver/admin roles keep full access even if their department happens to
// mention events, so they are never narrowed to the event team's queue.
const PRIVILEGED_ROLES = new Set(['super_admin', 'admin', 'master', 'accounts', 'user']);

export const isEventTeam = (user) => {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (PRIVILEGED_ROLES.has(role)) return false;
  if (EVENT_TEAM_ROLES.has(role)) return true;
  if (!user.department) return false;
  const dept = normalizeRole(String(user.department).trim().toLowerCase());
  return EVENT_TEAM_ROLES.has(dept) || dept.includes('event');
};

// Accounts/resolvers (full rights) OR the Event Manager team (own queue only).
export const authenticateAccountsOrEventTeam = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = applyNormalizedRole(jwt.verify(token, process.env.JWT_SECRET));
    const role = normalizeRole(decoded.role);
    if (role === 'accounts' || role === 'super_admin' || isEventTeam(decoded) || role === 'social' || role === 'digital') {
      req.user = decoded;
      return next();
    }
    return res.status(403).json({ message: 'Access denied' });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Salary calculator app — Accounts department or super admin only.
export const authenticateSalary = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { return res.status(401).json({ message: 'No token provided' }); }
  try {
    const decoded = applyNormalizedRole(jwt.verify(token, process.env.JWT_SECRET));
    if (decoded.role !== 'accounts' && decoded.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Accounts department or super admin only.' });
    }
    req.user = decoded;
    next();
  } catch { return res.status(401).json({ message: 'Invalid token' }); }
};

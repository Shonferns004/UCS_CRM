import db from '../config/db.js';
import jwt from 'jsonwebtoken';
import { resolveInboxScope } from '../services/froStationScope.js';

export async function whatsappAutoLogin(req, res) {
  try {
    const workerId = req.user.id;
    if (!workerId || workerId === 'master') {
      return res.status(400).json({ message: 'Worker identity required' });
    }

    const { data: agentsRaw, error: agentsErr } = await db
      .rpc('get_worker_agents', { p_worker_id: workerId });

    if (agentsErr) {
      console.error('[auto-login] get_worker_agents error:', agentsErr.message);
      return res.status(500).json({ message: 'Failed to load agents' });
    }

    const agents = typeof agentsRaw === 'string' ? JSON.parse(agentsRaw) : (agentsRaw || []);

    if (agents.length === 0) {
      return res.json({ sessions: [] });
    }

    const sessions = [];
    for (const agent of agents) {
      const token = jwt.sign(
        { id: agent.id, email: agent.email, role: 'agent', name: agent.name },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      if (agent.assigned_account_id && agent.assigned_account_name) {
        sessions.push({
          agentId: agent.id,
          agentEmail: agent.email,
          agentName: agent.name,
          project: agent.assigned_account_project,
          account: { id: agent.assigned_account_id, name: agent.assigned_account_name, project: agent.assigned_account_project, phone_number_id: agent.assigned_phone_number },
          token,
        });
      } else {
        const accounts = (agent.whatsapp_accounts || []).filter(a => a.is_active);
        for (const account of accounts) {
          sessions.push({
            agentId: agent.id,
            agentEmail: agent.email,
            agentName: agent.name,
            project: account.project,
            account: { id: account.id, name: account.name, project: account.project, phone_number_id: account.phone_number_id },
            token,
          });
        }
      }
    }

    // Derive the station scope once: it drives both the extra inboxes and the
    // "2-only" filter below.
    let scope = null;
    try {
      scope = await resolveInboxScope(workerId);
    } catch (e) {
      console.error('[auto-login] scope resolution failed:', e?.message || e);
    }

    // STATION-DERIVED INBOXES: assigning a station is what grants the FRO the
    // WhatsApp number that station maps to (BOD/BFD -> bsct2, AOD/AFD ->
    // aflf2, MOD/MFD -> mann 2). Surface a session for it here as well, so the
    // sidebar shows the inbox as soon as the station is assigned - without
    // requiring a separate grant under WhatsApp Accounts. Reuses an existing
    // agent identity/token; no new identity is minted.
    if (sessions.length > 0) {
      try {
        const identity = sessions[0];
        const known = new Set(sessions.map(s => String(s.project || '').toLowerCase()));
        for (const project of scope?.allowedProjects || []) {
          const proj = String(project || '').toLowerCase();
          if (!proj || known.has(proj)) continue;
          const { data: accounts } = await db
            .from('whatsapp_accounts')
            .select('id, name, project, phone_number_id')
            .eq('project', project)
            .eq('is_active', true)
            .limit(1);
          const account = accounts?.[0];
          if (!account) continue;
          sessions.push({
            agentId: identity.agentId,
            agentEmail: identity.agentEmail,
            agentName: identity.agentName,
            project: account.project,
            account: {
              id: account.id,
              name: account.name,
              project: account.project,
              phone_number_id: account.phone_number_id,
            },
            token: identity.token,
            stationDerived: true,
          });
          known.add(proj);
        }
      } catch (e) {
        console.error('[auto-login] station inboxes load failed:', e?.message || e);
      }
    }

    // "2-ONLY" RULE: a station carries only its numbered account. When the FRO
    // is scoped to a BOD/AOD/MOD station, the plain bsct / aflf / mann inbox
    // must not appear even if it was granted earlier under WhatsApp Accounts -
    // only the mapped "2" number shows. Temp grants are handled separately in
    // listMyAccounts and stay explicit.
    if (scope?.hasStations && scope.allowedProjects?.size > 0) {
      const hidden = new Set();
      if (scope.allowedProjects.has('bsct2')) hidden.add('bsct');
      if (scope.allowedProjects.has('aflf2')) hidden.add('aflf');
      if (scope.allowedProjects.has('mann 2')) hidden.add('mann');
      if (hidden.size > 0) {
        for (let i = sessions.length - 1; i >= 0; i--) {
          const proj = String(sessions[i]?.project || '').toLowerCase();
          if (hidden.has(proj)) sessions.splice(i, 1);
        }
      }
    }

    return res.json({ sessions });
  } catch (error) {
    console.error('[auto-login] error:', error?.message);
    return res.status(500).json({ message: 'Auto-login failed' });
  }
}

export async function whatsappLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const masterEmail = process.env.WHATSAPP_MASTER_EMAIL;
    const masterPassword = process.env.WHATSAPP_MASTER_PASSWORD;

    if (masterEmail && masterPassword && email === masterEmail && password === masterPassword) {
      const token = jwt.sign(
        { id: 'master', email: masterEmail, role: 'master', name: 'Master Admin' },
        process.env.JWT_SECRET,
        { expiresIn: '7d', algorithm: 'HS256' }
      );
      return res.json({
        success: true,
        token,
        role: 'master',
        user: {
          id: 'master',
          name: 'Master Admin',
          email: masterEmail,
          role: 'master',
        },
        account: null,
      });
    }

    let userData = null;
    let token = null;

    const { data: authData, error: authError } = await db.auth.signInWithPassword({
      email,
      password,
    });

    if (!authError && authData?.user) {
      const { data: dbUser } = await db
        .rpc('get_whatsapp_user', { p_id: authData.user.id });

      userData = typeof dbUser === 'string' ? JSON.parse(dbUser) : dbUser;
      token = authData.session?.access_token;
    }

    if (!userData) {
      const { data: agentData, error: agentErr } = await db
        .rpc('verify_agent', {
          p_email: email,
          p_password: password,
        });

      if (agentErr || !agentData) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      userData = typeof agentData === 'string' ? JSON.parse(agentData) : agentData;
      const agentExpiry = '100y';
      token = jwt.sign(
        { id: userData.id, email: userData.email, role: 'agent', name: userData.name },
        process.env.JWT_SECRET,
        { expiresIn: agentExpiry }
      );
    }

    const { data: assignment } = await db
      .from('agent_phone_assignments')
      .select('*, whatsapp_accounts!inner(id, name, project, phone_number_id)')
      .eq('user_id', userData.id)
      .maybeSingle();

    const account = assignment?.whatsapp_accounts || null;

    return res.json({
      success: true,
      token,
      user: {
        id: userData.id,
        name: userData.name || userData.first_name || email.split('@')[0],
        email: userData.email || email,
        role: userData.role || 'agent',
      },
      account,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed' });
  }
}

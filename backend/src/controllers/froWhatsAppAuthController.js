import db from '../config/db.js';
import jwt from 'jsonwebtoken';

export async function whatsappAutoLogin(req, res) {
  try {
    const workerId = req.user.id;
    if (!workerId || workerId === 'master') {
      return res.status(400).json({ message: 'Worker identity required' });
    }

    // get_worker_agents() only ever reads worker_agent_assignments, i.e. a named
    // agent USER linked to this FRO. An FRO granted a WhatsApp number directly,
    // via fro_whatsapp_assignments, is invisible to it and used to get zero
    // sessions despite holding a valid account grant. So when the agent list
    // comes back empty (or the function is missing entirely), fall back to the
    // FRO's own account grants. This reads records that already exist; it never
    // creates an agent, an assignment, or a conversation.
    let rpcError = null;
    const { data: agentsRaw, error: agentsErr } = await db
      .rpc('get_worker_agents', { p_worker_id: workerId });

    if (agentsErr) {
      // Do not fail the request outright. A missing/failed RPC used to be a hard
      // 500 here, which the client then reported as "no agents assigned" — the
      // two failures are unrelated and the message named the wrong one.
      rpcError = agentsErr.message;
      console.error('[auto-login] get_worker_agents error:', agentsErr.message);
    }

    const agents = agentsErr
      ? []
      : (typeof agentsRaw === 'string' ? JSON.parse(agentsRaw) : (agentsRaw || []));

    const sessions = [];
    if (agents.length > 0) {
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
    }

    if (sessions.length === 0) {
      // The FRO's own direct account grants. fro_worker_id references
      // workers(id), which is exactly what req.user.id is for an FRO login.
      const { data: froAssigns, error: froErr } = await db
        .from('fro_whatsapp_assignments')
        .select('whatsapp_account_id, whatsapp_accounts!inner(id, name, project, phone_number_id)')
        .eq('fro_worker_id', workerId)
        .eq('is_active', true);

      if (froErr) {
        console.error('[auto-login] fro_whatsapp_assignments error:', froErr.message);
        return res.status(500).json({ message: 'Failed to load WhatsApp assignments', detail: froErr.message });
      }

      const seenAccounts = new Set();
      for (const row of froAssigns || []) {
        const account = row.whatsapp_accounts;
        if (!account?.id || seenAccounts.has(account.id)) continue;
        seenAccounts.add(account.id);
        sessions.push({
          // The worker's own id, because this grant is keyed by workers(id).
          // getAgentConversations() matches it against fro_whatsapp_assignments.
          agentId: workerId,
          agentEmail: req.user.email || null,
          agentName: req.user.name || null,
          project: account.project,
          account: { id: account.id, name: account.name, project: account.project, phone_number_id: account.phone_number_id },
          token: jwt.sign(
            { id: workerId, email: req.user.email, role: 'agent', name: req.user.name },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
          ),
        });
      }
    }

    if (sessions.length === 0) {
      // Say which of the two unrelated failures this was, so the UI can stop
      // claiming "no agents assigned" when the real cause is a broken RPC.
      return res.json({
        sessions: [],
        reason: rpcError ? 'agent_lookup_failed' : 'no_assignments',
        detail: rpcError || null,
      });
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
        { expiresIn: '100y' }
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

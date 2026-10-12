import db from '../config/db.js';
import { getSenderPanel, getSenderName } from '../utils/panel.js';
import { isEventTeam, normalizeRole } from '../middleware/authMiddleware.js';

export const listTickets = async (req, res) => {
  try {
    const { status, department, category, priority, search, date_from, date_to } = req.query;
    let query = db
      .from('support_tickets')
      .select('*, workers!support_tickets_raised_by_fkey(name, login_id)')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (department) query = query.eq('department', department);
    if (category) query = query.eq('category', category);
    if (priority) query = query.eq('priority', priority);
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to) query = query.lte('created_at', date_to);
    if (search) {
      query = query.or(`subject.ilike.%${search}%,description.ilike.%${search}%,reference_id.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    const tickets = data || [];

    let comments = [];
    if (tickets.length) {
      const rc = await db
        .from('ticket_replies')
        .select('ticket_id, count')
        .neq('sender_type', 'resolution')
        .in('ticket_id', tickets.map(t => t.id));
      comments = rc.data || [];
    }
    const commentMap = Object.fromEntries(comments.map(c => [c.ticket_id, c.count]));
    return res.json(tickets.map(t => ({ ...t, comment_count: commentMap[t.id] || 0 })));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listMyTickets = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { data, error } = await db
      .from('support_tickets')
      .select('*')
      .eq('raised_by', workerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const tickets = data || [];

    // Reply counts come from a grouped aggregate, never an embed. db.js only
    // resolves to-one embeds (child -> parent FK), so a to-many embed such as
    // `ticket_replies(count)` throws "Could not resolve relationship
    // support_tickets -> ticket_replies" and 500s this whole list — which is why
    // the FRO's Raise Ticket page appeared empty and no team reply was visible.
    const countMap = {};
    if (tickets.length) {
      try {
        const rc = await db
          .from('ticket_replies')
          .select('ticket_id, count')
          .in('ticket_id', tickets.map(t => t.id));
        // Postgres COUNT returns bigint, which node-postgres hands back as a
        // string, so coerce it before it reaches JSON consumers doing maths.
        for (const c of rc.data || []) countMap[c.ticket_id] = Number(c.count);
      } catch (countError) {
        // A failed count must degrade to "no replies", never hide the tickets.
        console.warn('[tickets] reply counts unavailable:', countError.message);
      }
    }
    return res.json(tickets.map(t => ({ ...t, reply_count: countMap[t.id] || 0 })));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: ticket, error } = await db
      .from('support_tickets')
      .select('*, workers!support_tickets_raised_by_fkey(name, login_id), users!support_tickets_resolved_by_fkey(name)')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const { data: replies, error: replyError } = await db
      .from('ticket_replies')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    if (replyError) throw replyError;

    // Feedback/conversation is visible to the person who raised the ticket, to
    // the accounts team who resolves it, and to the UFS / Event Manager team
    // working its own queue — otherwise a responder sees "No replies yet" for
    // the thread it is replying in.
    const isResolverTeam = ['accounts', 'super_admin'].includes(req.user.role) || isEventTeam(req.user);
    const isRaiser = req.user.id === ticket.raised_by;
    // The resolve message (sender_type 'resolution') is private: only the person
    // who raised the ticket and the resolver who wrote it may see it — other
    // staff opening the same ticket must not see it.
    const visibleReplies = (replies || []).filter(r => {
      if (r.sender_type === 'resolution') {
        return isRaiser || (!!r.sender_id && String(r.sender_id) === String(req.user.id));
      }
      return isResolverTeam || isRaiser;
    });

    return res.json({ ...ticket, replies: visibleReplies });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const createTicket = async (req, res) => {
  try {
    const { department, category, subject, description, reference_id, priority, status, desk_number, ngo, raised_by_panel } = req.body;
    if (!subject) return res.status(400).json({ message: 'Subject is required' });
    if (!desk_number || !String(desk_number).trim()) return res.status(400).json({ message: 'Desk Number is required' });

    const { data, error } = await db
      .from('support_tickets')
      .insert({
        raised_by: req.user.id,
        department: department || 'accounts',
        category: category || 'other',
        subject,
        description: description || null,
        reference_id: reference_id || null,
        priority: priority || 'medium',
        status: status || 'open',
        desk_number: desk_number || null,
        ngo: ngo || null,
        raised_by_panel: raised_by_panel || null,
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Post the resolve message as a conversation line marked sender_type
// 'resolution'. getTicket filters those to the raiser and the resolver only —
// every other staff member viewing the same ticket must not see it. A failure
// here never fails the resolve itself.
const postResolutionReply = async (ticketId, user, resolution) => {
  try {
    const senderId = String(user?.id ?? '');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(senderId);
    await db.from('ticket_replies').insert({
      ticket_id: ticketId,
      // sender_id is a UUID FK — super admin auth uses id 0, which cannot be stored.
      sender_id: isUuid ? senderId : null,
      sender_type: 'resolution',
      sender_name: getSenderName(user) || 'Support',
      sender_panel: getSenderPanel(user),
      message: (resolution && String(resolution).trim()) || 'Ticket marked as resolved after the issue was fixed.',
    });
  } catch (err) {
    console.error('[tickets] failed to post resolve reply:', err.message);
  }
};

export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution, department, category, priority } = req.body;

    // The UFS / Event Manager team may only action tickets routed to its own
    // queue, and only their status/resolution — never re-route or re-categorise
    // an accounts/HR ticket. isEventTeam is the same rule the route guard uses,
    // so the guard and the scope can never disagree.
    const eventTeam = isEventTeam(req.user);
    if (eventTeam) {
      const { data: owned, error: ownedError } = await db
        .from('support_tickets')
        .select('department')
        .eq('id', id)
        .maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) return res.status(404).json({ message: 'Ticket not found' });
      if (owned.department !== 'event_head') {
        return res.status(403).json({ message: 'You can only update tickets routed to your team' });
      }
    }

    // Remember the previous status so re-saving an already-resolved ticket
    // never posts a second resolve message.
    let previousStatus;
    if (status === 'resolved') {
      const { data: prev } = await db.from('support_tickets').select('status').eq('id', id).maybeSingle();
      previousStatus = prev?.status;
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (resolution !== undefined) updates.resolution = resolution;
    if (!eventTeam) {
      if (department !== undefined) updates.department = department;
      if (category !== undefined) updates.category = category;
      if (priority !== undefined) updates.priority = priority;
    }
    if (status === 'resolved' || status === 'closed') {
      // resolved_by is FK'd to users(id). Accounts staff may authenticate as
      // workers (id lives in workers, not users) and super admin auth uses
      // id 0 — neither exists in users. Only store a value that satisfies the FK.
      const { data: resolver } = await db.from('users').select('id').eq('id', req.user.id).maybeSingle();
      updates.resolved_by = resolver ? resolver.id : null;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('support_tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Issue fixed → send the resolve message to the person who raised the
    // ticket (private line, only they and the resolver can see it).
    if (status === 'resolved' && previousStatus !== 'resolved') {
      await postResolutionReply(id, req.user, resolution);
    }
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const addReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const { data: ticket } = await db
      .from('support_tickets')
      .select('id')
      .eq('id', id)
      .single();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const { data, error } = await db
      .from('ticket_replies')
      .insert({
        ticket_id: id,
        sender_id: req.user.id,
        sender_type: req.user.role === 'fro' ? 'worker' : 'user',
        sender_name: getSenderName(req.user) || null,
        sender_panel: getSenderPanel(req.user),
        message,
      })
      .select()
      .single();

    if (error) throw error;

    await db
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    await db.from('ticket_replies').delete().eq('ticket_id', id);
    const { data, error } = await db.from('support_tickets').delete().eq('id', id).select('id').single();
    if (error) {
      if (String(error.code) === 'PGRST116') return res.status(404).json({ message: 'Ticket not found' });
      throw error;
    }
    if (!data) return res.status(404).json({ message: 'Ticket not found' });
    return res.json({ deleted: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getWorkers = async (req, res) => {
  try {
    const { data, error } = await db
      .from('workers')
      .select('id, name, login_id, department')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return res.json(data || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// -- "Ticket raised" popups ---------------------------------------------------
// TicketPopupHost in the client polls getPendingTicketPopups and pops the
// newest ticket the user's panel owns; ackTicketPopup records the shown ticket
// in ticket_popup_seen so each person sees it exactly once, on any device.

// Statuses a queue still has to act on. A ticket that reached a terminal
// state before the target panel ever saw it must not pop up later.
const OPEN_STATUSES = ['open', 'in_progress', 'under_review', 'pending'];
const DEV_CLOSED_STATUSES = ['resolved', 'closed', 'rejected'];

// Role (or users.department) -> the support_tickets.department that panel
// works. 'developers' routes to the developer_tickets stack instead.
const TARGET_DEPARTMENTS = {
  accounts: 'accounts',
  hr: 'hr',
  event_head: 'event_head',
  event_manager: 'event_head',
  digital: 'developers',
  developers: 'developers',
};

// Supervisors watch every queue through their own dashboards; popping each
// department's tickets at them would be noise, so they never get popups.
const NO_POPUP_ROLES = new Set(['super_admin', 'admin', 'master']);

const targetDepartment = (user) => {
  const role = normalizeRole(user?.role);
  const mapped = TARGET_DEPARTMENTS[role];
  if (mapped) return mapped;
  if (NO_POPUP_ROLES.has(role)) return null;
  if (isEventTeam(user)) return 'event_head';
  const raw = user?.department != null ? String(user.department).trim() : '';
  if (raw) {
    const byDept = TARGET_DEPARTMENTS[normalizeRole(raw.toLowerCase())];
    if (byDept) return byDept;
  }
  return null;
};

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

const readSeenIds = async (userId) => {
  try {
    const { rows } = await db._pool.query(
      'SELECT ticket_id FROM ticket_popup_seen WHERE user_id = $1',
      [String(userId)]
    );
    return new Set(rows.map(r => r.ticket_id));
  } catch (e) {
    // Table not created yet (boot race) must not 500 the panel; the client's
    // next poll retries once the bootstrap has run.
    console.warn('[tickets] popup seen lookup failed:', e?.message || String(e));
    return null;
  }
};

export const getPendingTicketPopups = async (req, res) => {
  try {
    const department = targetDepartment(req.user);
    if (!department) return res.json([]);

    let tickets = [];
    // Only recent tickets pop. Without this window, the first poll after a
    // login would parade every open ticket the person never acked — including
    // ones raised weeks ago — across their screen.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    if (department === 'developers') {
      const { data, error } = await db
        .from('developer_tickets')
        .select('id, subject, description, category, priority, status, reference_id, desk_number, ngo, raised_by_panel, raised_by_name, created_at')
        .not('status', 'in', DEV_CLOSED_STATUSES)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      tickets = (data || []).map(t => ({ ...t, _source: 'dev' }));
    } else {
      const { data, error } = await db
        .from('support_tickets')
        .select('*, workers!support_tickets_raised_by_fkey(name, login_id)')
        .eq('department', department)
        .in('status', OPEN_STATUSES)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      tickets = (data || []).map(t => ({ ...t, _source: 'sup' }));
    }

    const seen = await readSeenIds(req.user.id);
    if (seen === null) return res.json([]);

    const pending = tickets
      // Your own ticket and a same-panel raise (accounts -> accounts) are the
      // raiser's own business, not a "something new landed on your queue" ping
      // -- the accounts panel's old toast watcher applied the same rules.
      .filter(t => String(t.raised_by ?? '') !== String(req.user.id))
      .filter(t => !(t.raised_by_panel && String(t.raised_by_panel) === department))
      .filter(t => !seen.has(`${t._source === 'dev' ? 'dev' : 'sup'}:${t.id}`))
      .map(t => ({
        id: t.id,
        source: t._source,
        subject: t.subject,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        reference_id: t.reference_id,
        desk_number: t.desk_number,
        ngo: t.ngo,
        raised_by_panel: t.raised_by_panel,
        created_at: t.created_at,
        raiser: t.workers?.name || t.raised_by_name || null,
      }));

    return res.json(pending);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const ackTicketPopup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid ticket id' });
    const prefix = req.query.source === 'dev' ? 'dev' : 'sup';
    // ON CONFLICT DO NOTHING: two tabs dismissing the same popup both ack,
    // exactly one row lands.
    await db._pool.query(
      'INSERT INTO ticket_popup_seen (ticket_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [`${prefix}:${id}`, String(req.user.id)]
    );
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

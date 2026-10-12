// The /api/whatsapp-crm data surface.
//
// This whole router was `authenticate` + a raw req.body spread, with no role
// check anywhere: any logged-in CRM user of any role could list every
// conversation in the organisation with the donor's phone and profile name
// attached, read any message transcript by guessing or lifting a conversation_id
// (GET /messages took conversation_id from the query string with no scoping at
// all), and then PATCH any conversation -- including assigned_agent_id -- with
// arbitrary fields. tenant_id came from the query string rather than the token,
// so a caller could also read another tenant's rows.
//
// Nothing in the client calls these endpoints (the live inbox uses
// /api/fro/whatsapp/*), but "no client calls it" is not a control. So rather
// than delete a surface somebody may be about to build on, it now answers under
// exactly the same rule as the inbox:
//
//   an agent sees and writes only the donors allotted to them; the WhatsApp
//   admin sees everything.
//
// That rule is enforced in services/whatsappScope.js, which is resolved once per
// request by resolveWhatsAppCaller below and read from req.waCaller.

import db from '../config/db.js';
import { ScopeError, assertConversationAccess, loadAllotment, writableThreadOwner } from '../services/whatsappScope.js';
import { froActPairs } from './froController.js';

function fail(res, error) {
  if (error instanceof ScopeError) return res.status(error.status).json({ message: error.message });
  return res.status(500).json({ message: error.message });
}

/**
 * The conversation ids this caller may touch.
 *
 * An admin gets null, which every consumer reads as "no bound". For everyone
 * else this is the same allotment-plus-ownership filter the inbox uses, so the
 * two surfaces cannot disagree about who owns a donor.
 */
async function visibleConversationIds(req) {
  const caller = req.waCaller;
  if (!caller) throw new ScopeError('Not authenticated', 401);
  if (caller.isWaAdmin) return null;

  const { data: conversations, error } = await db
    .from('conversations')
    .select('id')
    .in('contact_id', (await scopeContactIds(req)));
  if (error) throw error;

  const ids = (conversations || []).map(c => c.id);
  if (ids.length === 0) return [];
  return ids;
}

async function scopeContactIds(req) {
  const caller = req.waCaller;
  if (caller.isWaAdmin) return [];
  const allotment = await loadAllotment(caller.workerId, froActPairs(req));
  return allotment.contactIds;
}

/** `in ()` must degrade to matching nothing, so the empty case short-circuits. */
function applyConversationIds(query, ids) {
  if (ids === null) return query;
  if (ids.length === 0) return query.eq('id', '__no_visible_conversations__');
  return query.in('id', ids);
}

export async function getMessages(req, res) {
  try {
    const { conversation_id, limit = 50, offset = 0, order = 'asc' } = req.query;
    // Without a conversation_id this used to return EVERY message in the system,
    // across every project, to any logged-in user.
    if (!conversation_id) {
      return res.status(400).json({ message: 'conversation_id is required' });
    }
    const caller = req.waCaller;
    await assertConversationAccess(caller, conversation_id, froActPairs(req));

    const { data, error } = await db
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: order === 'asc' })
      .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);
    if (error) return res.status(500).json({ message: 'Failed to fetch messages' });
    return res.json(data);
  } catch (error) {
    return fail(res, error);
  }
}

// The insert list is the whitelist. Spreading req.body let a caller set
// wa_message_id (which the webhook dedupe keys on), user_id, status or
// conversation_id to any value, fabricating delivery receipts.
const MESSAGE_WRITABLE = [
  'conversation_id', 'contact_id', 'user_id', 'direction', 'message_type',
  'body_text', 'media_id', 'media_url', 'media_mime_type', 'template_id',
  'template_params', 'interactive_payload', 'message_category',
];

function pick(source, keys) {
  const out = {};
  for (const k of keys) if (source?.[k] !== undefined) out[k] = source[k];
  return out;
}

export async function createMessage(req, res) {
  try {
    const caller = req.waCaller;
    const messageData = pick(req.body, MESSAGE_WRITABLE);
    if (!messageData.conversation_id) {
      return res.status(400).json({ message: 'conversation_id is required' });
    }
    await assertConversationAccess(caller, messageData.conversation_id, froActPairs(req));
    messageData.user_id = String(caller.userId ?? req.user?.id ?? '');

    const { data, error } = await db.from('messages').insert(messageData).select().single();
    if (error) return res.status(500).json({ message: 'Failed to create message' });
    return res.status(201).json(data);
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateMessage(req, res) {
  try {
    const { id } = req.params;
    const { data: existing, error: readErr } = await db
      .from('messages')
      .select('conversation_id')
      .eq('id', id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) return res.status(404).json({ message: 'Message not found' });
    await assertConversationAccess(req.waCaller, existing.conversation_id, froActPairs(req));

    const { data, error } = await db
      .from('messages')
      .update(pick(req.body, MESSAGE_WRITABLE))
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ message: 'Failed to update message' });
    return res.json(data);
  } catch (error) {
    return fail(res, error);
  }
}

export async function getMessageCounts(req, res) {
  try {
    const ids = await visibleConversationIds(req);
    if (ids !== null && ids.length === 0) {
      return res.json({ total: 0, totalToday: 0, dailyCounts: {}, monthlyCounts: {} });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    // tenant_id is vestigial on these tables and always NULL in practice, so it
    // was never a boundary. The real boundary is the conversation set.
    const scoped = (q) => (ids === null ? q : q.in('conversation_id', ids));

    const [{ count: totalAll }, { count: totalToday }] = await Promise.all([
      scoped(db.from('messages').select('*', { count: 'exact', head: true })),
      scoped(db.from('messages').select('*', { count: 'exact', head: true })).then(q => q.gte('created_at', todayStr)),
    ]);

    const categories = ['marketing', 'utility', 'authentication', 'service'];
    const dailyCounts = {};
    const monthlyCounts = {};

    for (const cat of categories) {
      const [{ count: dc }, { count: mc }] = await Promise.all([
        scoped(db.from('messages').select('*', { count: 'exact', head: true }).eq('message_category', cat)).then(q => q.gte('created_at', todayStr)),
        scoped(db.from('messages').select('*', { count: 'exact', head: true }).eq('message_category', cat)).then(q => q.gte('created_at', monthStart)),
      ]);
      dailyCounts[cat] = dc || 0;
      monthlyCounts[cat] = mc || 0;
    }

    return res.json({ total: totalAll || 0, totalToday: totalToday || 0, dailyCounts, monthlyCounts });
  } catch (error) {
    return fail(res, error);
  }
}

export async function getConversations(req, res) {
  try {
    const { status, contact_id, assigned_agent_id, limit = 50, offset = 0 } = req.query;
    let query = db
      .from('conversations')
      .select('*, contact:contacts(*)')
      .order('last_message_at', { ascending: false })
      .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);
    if (status) query = query.eq('status', status);
    if (contact_id) query = query.eq('contact_id', contact_id);
    if (assigned_agent_id) query = query.eq('assigned_agent_id', assigned_agent_id);

    query = applyConversationIds(query, await visibleConversationIds(req));

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: 'Failed to fetch conversations' });
    return res.json(data);
  } catch (error) {
    return fail(res, error);
  }
}

export async function getConversation(req, res) {
  try {
    const { id } = req.params;
    await assertConversationAccess(req.waCaller, id, froActPairs(req));
    const { data, error } = await db.from('conversations').select('*, contact:contacts(*)').eq('id', id).maybeSingle();
    if (error) return res.status(500).json({ message: 'Failed to fetch conversation' });
    if (!data) return res.status(404).json({ message: 'Conversation not found' });
    return res.json(data);
  } catch (error) {
    return fail(res, error);
  }
}

// assigned_agent_id is NOT writable here on purpose. It is the thread owner, and
// letting a body field move it would let any agent hand a donor to another agent
// -- or clear the owner and open the thread to whoever replies first.
const CONVERSATION_WRITABLE = ['contact_id', 'status', 'labels', 'project'];

export async function createConversation(req, res) {
  try {
    const caller = req.waCaller;
    const convData = pick(req.body, CONVERSATION_WRITABLE);
    if (!convData.contact_id) {
      return res.status(400).json({ message: 'contact_id is required' });
    }
    const contactIds = await scopeContactIds(req);
    if (!caller.isWaAdmin && !contactIds.includes(convData.contact_id)) {
      throw new ScopeError('Conversation not found', 404);
    }
    // The thread starts owned by whoever opened it -- where the owner id is one
    // conversations.assigned_agent_id can actually represent. Left NULL otherwise
    // (see writableThreadOwner): the column FKs users(id) and no agent id
    // satisfies that, so writing one unconditionally aborted the insert. NULL
    // simply means "unowned", which is the normal state for a thread an agent
    // has just opened.
    convData.assigned_agent_id = await writableThreadOwner(caller.userId ?? req.user?.id);

    const { data, error } = await db.from('conversations').insert(convData).select().single();
    if (error) return res.status(500).json({ message: 'Failed to create conversation' });
    return res.status(201).json(data);
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateConversation(req, res) {
  try {
    const { id } = req.params;
    await assertConversationAccess(req.waCaller, id, froActPairs(req));
    const { data, error } = await db
      .from('conversations')
      .update(pick(req.body, CONVERSATION_WRITABLE))
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ message: 'Failed to update conversation' });
    return res.json(data);
  } catch (error) {
    return fail(res, error);
  }
}

export async function getConversationCounts(req, res) {
  try {
    const ids = await visibleConversationIds(req);
    if (ids !== null && ids.length === 0) return res.json({ total: 0, open: 0, closed: 0 });

    const scoped = (q) => (ids === null ? q : q.in('id', ids));
    const [{ count: total }, { count: open }, { count: closed }] = await Promise.all([
      scoped(db.from('conversations').select('*', { count: 'exact', head: true })),
      scoped(db.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'open')),
      scoped(db.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'closed')),
    ]);

    return res.json({ total: total || 0, open: open || 0, closed: closed || 0 });
  } catch (error) {
    return fail(res, error);
  }
}

export async function getConversationByContact(req, res) {
  try {
    const { contact_id } = req.query;
    if (!contact_id) return res.status(400).json({ message: 'contact_id required' });
    const caller = req.waCaller;
    if (!caller.isWaAdmin && !(await scopeContactIds(req)).includes(contact_id)) {
      throw new ScopeError('Conversation not found', 404);
    }
    const { data, error } = await db.from('conversations').select('id').eq('contact_id', contact_id);
    if (error) return res.status(500).json({ message: 'Failed to fetch conversations' });
    return res.json(data);
  } catch (error) {
    return fail(res, error);
  }
}
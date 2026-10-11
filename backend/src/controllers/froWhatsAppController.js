import { classifyDeliveryFailure } from '../lib/whatsappErrorCodes.js';
import {
  getFroConversations,
  getAgentConversations,
  getAgentUnreadCount,
  getConversationMessages,
  sendFroReply,
  sendDirectMessage,
  createEmptyConversation,
  markConversationRead,
  getFroUnreadCount,
  getQuickReplies,
  getTemplates,
  sendTemplateReply,
  searchFroMessages,
  updateConversationLabels,
  uploadFroMedia,
  resendMessage,
} from '../services/froWhatsAppService.js';
import { froActPairs } from './froController.js';
import db from '../config/db.js';
import config from '../config/whatsappConfig.js';

export async function getMedia(req, res) {
  try {
    const { mediaId } = req.params;
    if (!mediaId) return res.status(400).json({ message: 'mediaId is required' });

    let accessToken = null;
    const { data: message } = await db
      .from('messages')
      .select('conversation_id')
      .eq('media_id', mediaId)
      .limit(1)
      .maybeSingle();

    if (message?.conversation_id) {
      const { data: conversation } = await db
        .from('conversations')
        .select('project')
        .eq('id', message.conversation_id)
        .maybeSingle();
      if (conversation?.project) {
        const { data: account } = await db
          .from('whatsapp_accounts')
          .select('access_token')
          .eq('project', conversation.project)
          .eq('is_active', true)
          .maybeSingle();
        accessToken = account?.access_token;
      }
    }

    if (!accessToken) {
      const { data: anyAccount } = await db
        .from('whatsapp_accounts')
        .select('access_token')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      accessToken = anyAccount?.access_token;
    }

    if (!accessToken) return res.status(400).json({ message: 'No WhatsApp account configured' });

    const infoRes = await fetch(`https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = await infoRes.json();
    if (!infoRes.ok || !info.url) {
      return res.status(infoRes.status || 500).json({ message: info.error?.message || 'Failed to resolve media' });
    }

    const dlRes = await fetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!dlRes.ok) return res.status(502).json({ message: 'Failed to download media' });

    const contentType = info.mime_type || dlRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const filename = info.filename || `media-${mediaId}`;
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.status(200);
    dlRes.body.pipe(res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// Read the list filters off the query string. Defaults match what the inbox UI
// asks for: unread-only off, all statuses, no search, no label, first 100 rows.
const listFiltersFrom = (query) => ({
  unread: query.unread === 'true' || query.unread === '1',
  statuses: query.status ? String(query.status).split(',').map(s => s.trim()).filter(Boolean) : [],
  search: query.q || query.search || '',
  label: query.label || '',
  limit: query.limit || 100,
});

export async function listAgentConversations(req, res) {
  try {
    const { project } = req.query;
    const conversations = await getAgentConversations(
      req.user.id,
      project || null,
      req.user.role,
      listFiltersFrom(req.query),
    );
    return res.json(conversations);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// Every label currently in use across the conversations this caller can see, so
// the inbox can offer a filter list without hard-coding a tag catalogue. Derived
// from conversations.labels, which already exists in the CRM — no new table.
export async function listLabels(req, res) {
  try {
    const conversations = await getAgentConversations(req.user.id, req.query.project || null, req.user.role, { limit: 1000 });
    const counts = new Map();
    for (const c of conversations) {
      const labels = c.labels;
      if (!labels) continue;
      const list = Array.isArray(labels) ? labels : String(labels).split(',');
      for (const raw of list) {
        const label = String(raw).trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const prev = counts.get(key);
        counts.set(key, { label, count: (prev?.count || 0) + 1 });
      }
    }
    const items = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function agentUnreadCount(req, res) {
  try {
    const count = await getAgentUnreadCount(req.user.id, req.user.role);
    return res.json({ count });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function listConversations(req, res) {
  try {
    const conversations = await getFroConversations(req.user.id, froActPairs(req));
    return res.json(conversations);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function listMessages(req, res) {
  try {
    const { id } = req.params;
    const messages = await getConversationMessages(id);
    return res.json(messages);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function sendMessage(req, res) {
  try {
    const { id } = req.params;
    const { text, mediaUrl, mediaMimeType: reqMimeType } = req.body;

    if ((!text || !text.trim()) && !mediaUrl) {
      return res.status(400).json({ message: 'Message text or media URL is required' });
    }

    // Recover the stored mime type so the bubble can pick the right renderer
    // (<img> / <audio> / <video> / download) and so the WhatsApp payload is sent
    // with the correct `type`. The client only passes the URL back, and that URL
    // is presigned, so match on the object key with the query string stripped
    // rather than on the full signed string.
    let mediaMimeType = reqMimeType || null;
    if (!mediaMimeType && mediaUrl) {
      const bareUrl = String(mediaUrl).split('?')[0];
      const { data: mlRows } = await db
        .from('media_library')
        .select('file_type, file_url')
        .ilike('file_url', `${bareUrl}%`)
        .limit(1);
      mediaMimeType = mlRows?.[0]?.file_type || null;
    }

    const message = await sendFroReply(id, req.user.id, text?.trim() || '', mediaUrl, mediaMimeType);
    return res.json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function sendDirect(req, res) {
  try {
    const { phone, text, project } = req.body;
    if (!phone || !text || !text.trim()) {
      return res.status(400).json({ message: 'Phone and text are required' });
    }

    const result = await sendDirectMessage(req.user.id, phone, text.trim(), project);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function createConversation(req, res) {
  try {
    const { phone, project } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'Phone is required' });
    }

    const result = await createEmptyConversation(req.user.id, phone, project || null);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function markRead(req, res) {
  try {
    const { id } = req.params;
    await markConversationRead(id, req.user.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function unreadCount(req, res) {
  try {
    const count = await getFroUnreadCount(req.user.id);
    return res.json({ count });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function listQuickReplies(req, res) {
  try {
    const replies = await getQuickReplies();
    return res.json(replies);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function listTemplates(req, res) {
  try {
    const { project } = req.query;
    const templates = await getTemplates(project);
    return res.json(templates);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function sendTemplate(req, res) {
  try {
    const { conversationId, templateName, paramValues, headerMediaUrl, headerMediaName } = req.body;
    if (!conversationId || !templateName) {
      return res.status(400).json({ message: 'conversationId and templateName are required' });
    }
    const message = await sendTemplateReply(conversationId, req.user.id, templateName, paramValues || [], headerMediaUrl, headerMediaName);
    return res.json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function searchMessages(req, res) {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json([]);
    }
    const results = await searchFroMessages(req.user.id, q.trim());
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function updateLabels(req, res) {
  try {
    const { id } = req.params;
    const { labels } = req.body;
    if (!Array.isArray(labels)) {
      return res.status(400).json({ message: 'labels must be an array' });
    }
    await updateConversationLabels(id, labels);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// The standalone inbox lets a thread move through open -> pending -> resolved ->
// closed. `conversations.status` has always existed in the CRM (default 'open')
// but nothing wrote it except the webhook's initial 'open', so the whole
// lifecycle was unreachable. Reusing that column keeps this additive: no new
// table, and rows that were never set simply read as 'open'.
const CONVERSATION_STATUSES = ['open', 'pending', 'resolved', 'closed'];

export async function updateConversationStatus(req, res) {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || '').trim();
    if (!CONVERSATION_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${CONVERSATION_STATUSES.join(', ')}`,
      });
    }
    const { data: conv, error: readErr } = await db
      .from('conversations')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    // Compare-and-swap on the status we just read, so two agents changing the
    // same thread at once cannot silently overwrite each other.
    const { data: updated, error: updErr } = await db
      .from('conversations')
      .update({ status })
      .eq('id', id)
      .eq('status', conv.status)
      .select()
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      return res.status(409).json({ message: 'Conversation status changed elsewhere, reload and retry' });
    }
    return res.json({ success: true, conversation: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

// Retry a failed outbound message in place, reusing the same row (and therefore
// the same bubble) rather than creating a duplicate. messages already carries
// status + failure_reason, so this needs no schema. Only outbound rows that are
// actually 'failed' are eligible, matching the standalone's retry semantics.
export async function retryFailedMessage(req, res) {
  try {
    const { id, messageId } = req.params;
    const { data: msg, error: readErr } = await db
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('conversation_id', id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.direction !== 'outbound') {
      return res.status(422).json({ message: 'Only outbound messages can be retried' });
    }
    if (msg.status !== 'failed') {
      return res.status(409).json({ message: `Message is '${msg.status}', not 'failed'` });
    }

    // Some Meta failures are permanent. Retrying one re-sends byte-identical
    // text, so Meta rejects it with the same code again — every time. Refuse it
    // here, before any Meta call, and hand back the remedy instead of a generic
    // failure. `failure_reason` is the only place the CRM keeps the code.
    const failure = classifyDeliveryFailure(msg.failure_reason);
    if (!failure.retryable) {
      return res.status(409).json({
        message: failure.hint,
        errorCode: failure.code,
        remedy: failure.remedy,
        title: failure.title,
      });
    }

    const result = await resendMessage(id, messageId);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function uploadMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const record = await uploadFroMedia(req.user.id, req.file);
    // The inbox client reads file_url / file_type, while other callers of this
    // endpoint expect url / type. Return both so a single upload works
    // everywhere and the send step can attach the right WhatsApp media type.
    return res.json({
      url: record.file_url,
      type: record.file_type,
      name: record.name,
      file_url: record.file_url,
      file_type: record.file_type,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

/**
 * Does the logged-in agent hold the WhatsApp admin flag?
 *
 * The panel needs this to decide whether to render the admin entry, but the
 * flag must not be baked into the JWT: it can be granted or revoked at any time
 * and a token lives 24h, so a stamped claim would leave access in place after
 * the flag was removed. Reading it live means revocation takes effect on the
 * next request. The backend guard already refuses the real routes either way --
 * this only decides what the panel offers to click.
 */
export async function whatsappAdminStatus(req, res) {
  try {
    const agentId = req.user?.agent_user_id;
    if (!agentId) return res.json({ whatsapp_admin: false, reason: 'not_an_agent_login' });

    const { data, error } = await db
      .from('crm_agents')
      .select('whatsapp_admin, is_active, label')
      .eq('id', agentId)
      .maybeSingle();
    if (error) throw error;

    return res.json({
      whatsapp_admin: Boolean(data?.is_active && data?.whatsapp_admin),
      label: data?.label || req.user?.agent_label || null,
    });
  } catch (error) {
    return res.status(503).json({ message: 'Could not verify WhatsApp admin access' });
  }
}

export async function listMyAccounts(req, res) {
  try {
    const userId = req.user.id;
    const { data: froAssignments } = await db
      .from('fro_whatsapp_assignments')
      .select('whatsapp_accounts!inner(id, name, phone_number_id, project)')
      .eq('fro_worker_id', userId)
      .eq('is_active', true);

    const { data: crmAssignments } = await db
      .from('agent_phone_assignments')
      .select('whatsapp_accounts!inner(id, name, phone_number_id, project)')
      .eq('user_id', userId);

    const { data: workerAssignments } = await db
      .from('worker_agent_assignments')
      .select('account_id')
      .eq('user_id', userId);

    const workerAccountIds = (workerAssignments || []).map(a => a.account_id).filter(Boolean);
    let workerAccounts = [];
    if (workerAccountIds.length > 0) {
      const { data } = await db
        .from('whatsapp_accounts')
        .select('id, name, phone_number_id, project')
        .in('id', workerAccountIds);
      workerAccounts = data || [];
    }

    const seen = new Map();
    for (const a of [...(froAssignments || []), ...(crmAssignments || []), ...workerAccounts]) {
      const acct = a.whatsapp_accounts || a;
      if (acct?.id && !seen.has(acct.id)) seen.set(acct.id, acct);
    }
    return res.json(Array.from(seen.values()));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

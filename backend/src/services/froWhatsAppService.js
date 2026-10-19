import db from '../config/db.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';
import config from '../config/whatsappConfig.js';
import { presignStoredUrl } from './mediaProxy.js';

// Object keys under the shared media bucket. Meta fetches these URLs itself, so
// only keys with this prefix may be turned into a signed link for it.
const WHATSAPP_MEDIA_PREFIX = 'whatsapp-media/';

function normalizePhone(phone) {
  const raw = String(phone).replace(/[^0-9]/g, '');
  if (raw.length === 10) return '91' + raw;
  if (raw.length === 12 && raw.startsWith('91')) return raw;
  return raw;
}

export async function getFroConversations(froWorkerId, restrictPairs = null) {
  const { data: assignments, error: assignErr } = await db
    .from('fro_assignments')
    .select('donor_id, fro_worker_id, station, ngo_id, donor_profiles!inner(mobile_number)')
    .eq('fro_worker_id', froWorkerId)
    .not('status', 'eq', 'reassigned');

  if (assignErr) throw assignErr;
  let scoped = assignments || [];
  // Station-scoped work-as: only donors whose assignment sits on a claimed
  // (ngo_id, station) pair are visible.
  if (restrictPairs && restrictPairs.length > 0) {
    const allowed = new Set(restrictPairs.map(p => `${p?.ngo_id ?? ''}|${String(p?.station ?? '').trim()}`));
    scoped = scoped.filter(a => allowed.has(`${a.ngo_id ?? ''}|${String(a.station ?? '').trim()}`));
  }
  if (scoped.length === 0) return [];

  const donorPhones = scoped
    .map(a => a.donor_profiles?.mobile_number)
    .filter(Boolean);

  const phoneVariants = new Set();
  for (const p of donorPhones) {
    const raw = String(p).replace(/[^0-9]/g, '');
    phoneVariants.add(raw);
    if (raw.startsWith('91') && raw.length === 12) {
      phoneVariants.add(raw.slice(2));
    } else if (raw.length === 10) {
      phoneVariants.add('91' + raw);
    }
  }

  if (phoneVariants.size === 0) return [];

  const phoneList = [...phoneVariants];

  const { data: contacts, error: contactErr } = await db
    .from('contacts')
    .select('id, phone, phone_normalized, wa_profile_name, project')
    .in('phone_normalized', phoneList);

  if (contactErr) {
    if (contactErr.code === '42P01' || contactErr.message?.includes('does not exist')) return [];
    throw contactErr;
  }
  if (!contacts || contacts.length === 0) return [];

  const contactIds = contacts.map(c => c.id);

  const { data: conversations, error: convErr } = await db
    .from('conversations')
    .select('*, contact:contacts!inner(id, phone, phone_normalized, wa_profile_name, project)')
    .in('contact_id', contactIds)
    .order('last_message_at', { ascending: false });

  if (convErr) {
    if (convErr.code === '42P01' || convErr.message?.includes('does not exist')) return [];
    throw convErr;
  }
  return conversations || [];
}

export async function getConversationMessages(conversationId) {
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  // The bucket is private, so a stored media_url answers 403 and the bubble shows
  // a dead image. Sign it on the way out (only for the shared media bucket, so a
  // foreign URL is never touched) without persisting the signed form.
  return Promise.all((data || []).map(async (m) => (
    m.media_url
      ? { ...m, media_url: await presignStoredUrl(m.media_url, { prefix: WHATSAPP_MEDIA_PREFIX }) }
      : m
  )));
}

export async function sendFroReply(conversationId, froWorkerId, messageText, mediaUrl, mediaMimeType = null) {
  const { data: conversation, error: convErr } = await db
    .from('conversations')
    .select('*, contact:contacts!inner(id, phone, phone_normalized, project)')
    .eq('id', conversationId)
    .single();

  if (convErr || !conversation) throw new Error('Conversation not found');

  if (!conversation.assigned_agent_id) {
    await db
      .from('conversations')
      .update({ assigned_agent_id: froWorkerId })
      .eq('id', conversationId);
    conversation.assigned_agent_id = froWorkerId;
  }

  let project = conversation.project;

  if (!project) {
    console.warn('[sendFroReply] Conversation', conversationId, 'has NO project set — falling back to assignment lookup');
    const { data: workerAssignments } = await db
      .from('worker_agent_assignments')
      .select('account_id, whatsapp_accounts!inner(project)')
      .eq('user_id', froWorkerId);
    if (workerAssignments?.length) {
      project = workerAssignments[0].whatsapp_accounts?.project;
    }
  }

  if (!project) {
    const { data: froAssignments } = await db
      .from('fro_whatsapp_assignments')
      .select('whatsapp_accounts!inner(project)')
      .eq('fro_worker_id', froWorkerId)
      .eq('is_active', true)
      .maybeSingle();
    project = froAssignments?.whatsapp_accounts?.project;
  }

  if (!project) {
    console.warn('[sendFroReply] No project found for conversation', conversationId, '— defaulting to bsct');
  }
  project = project || 'bsct';
  const recipientPhone = normalizePhone(conversation.contact?.phone_normalized || conversation.contact?.phone);

  if (!recipientPhone) throw new Error('Recipient phone not found');

  // WhatsApp only allows free-form (session) messages within 24 hours of the
  // contact's last inbound message. Outside that window Meta rejects the send
  // (error 131009) and an approved template is required, so refuse here with a
  // clear reason instead of recording a message that can never be delivered.
  const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const lastInboundMs = conversation.last_inbound_at ? new Date(conversation.last_inbound_at).getTime() : null;
  if (!lastInboundMs || Date.now() - lastInboundMs > SERVICE_WINDOW_MS) {
    const windowErr = new Error('The 24-hour window is closed for this contact. Send an approved template first.');
    windowErr.statusCode = 422;
    throw windowErr;
  }

  const account = await getAccountByProject(project);
  console.log('[sendFroReply] project:', project, 'account:', account ? account.name : 'null', 'phone_number_id:', account?.phone_number_id);
  const accessToken = account?.access_token || config.accessToken;
  const phoneNumberId = account?.phone_number_id || config.phoneNumberId;

  if (!accessToken || !phoneNumberId) {
    throw new Error(`WhatsApp account not configured for project "${project}"`);
  }

  const mime = String(mediaMimeType || '').toLowerCase();
  const mediaType = mediaUrl
    ? (mime.startsWith('image/') ? 'image'
      : mime.startsWith('video/') ? 'video'
      : mime.startsWith('audio/') ? 'audio'
      : 'document')
    : null;
  const messageType = mediaUrl ? (mediaType || 'media') : 'text';

  const { data: message, error: msgErr } = await db
    .from('messages')
    .insert({
      tenant_id: conversation.tenant_id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      user_id: String(froWorkerId),
      direction: 'outbound',
      message_type: messageType,
      body_text: messageText || '',
      media_url: mediaUrl || null,
      media_mime_type: mediaUrl ? (mediaMimeType || null) : null,
      status: 'queued',
      message_category: 'fro_reply',
    })
    .select()
    .single();

  if (msgErr) throw msgErr;

  try {
    let body;
    if (mediaUrl) {
      const type = mediaType || 'image';
      // Hand Meta a signed link, not the stored bucket URL: the bucket is private,
      // so the raw URL 403s and Meta reports 131053 "Media upload error".
      const mediaLink = await presignStoredUrl(mediaUrl, { prefix: WHATSAPP_MEDIA_PREFIX });
      body = {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type,
        [type]: { link: mediaLink },
      };
      if (type === 'document') {
        body.document.filename = mediaUrl.split('/').pop()?.split('?')[0] || 'file';
      }
      if (messageText?.trim() && type !== 'audio') {
        body[type].caption = messageText.trim();
      }
    } else {
      body = {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: messageText },
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const result = await response.json();

    if (response.ok && result.messages?.[0]?.id) {
      await db
        .from('messages')
        .update({
          wa_message_id: result.messages[0].id,
          status: 'sent',
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);
    } else {
      await db
        .from('messages')
        .update({
          status: 'failed',
          failure_reason: result.error?.message || 'Meta API error',
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);
      throw new Error(result.error?.message || 'Failed to send');
    }
  } catch (apiErr) {
    await db
      .from('messages')
      .update({
        status: 'failed',
        failure_reason: apiErr instanceof Error ? apiErr.message : 'Network error',
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', message.id);
    throw apiErr;
  }

  await db
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  return message;
}

export async function sendDirectMessage(froWorkerId, phone, messageText, projectOverride) {
  const phoneNormalized = normalizePhone(phone);

  let contact = await findOrCreateContact(phoneNormalized);
  let conversation = await findOrCreateConversation(contact, froWorkerId, projectOverride);

  const project = projectOverride || conversation.project || 'bsct';
  const recipientPhone = phoneNormalized;

  let account = await getAccountByProject(project);

  if (!account) {
    const { data: froAcct } = await db
      .from('fro_whatsapp_assignments')
      .select('whatsapp_accounts!inner(id, project, phone_number_id, access_token)')
      .eq('fro_worker_id', froWorkerId)
      .eq('is_active', true)
      .maybeSingle();
    account = froAcct?.whatsapp_accounts;
  }

  if (!account) {
    const { data: workerAcct } = await db
      .from('worker_agent_assignments')
      .select('whatsapp_accounts!inner(id, project, phone_number_id, access_token)')
      .eq('user_id', froWorkerId)
      .maybeSingle();
    account = workerAcct?.whatsapp_accounts;
  }

  const accessToken = account?.access_token || config.accessToken;
  const phoneNumberId = account?.phone_number_id || config.phoneNumberId;

  if (!accessToken || !phoneNumberId) {
    throw new Error(`WhatsApp account not configured`);
  }

  const { data: message, error: msgErr } = await db
    .from('messages')
    .insert({
      tenant_id: conversation.tenant_id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      user_id: String(froWorkerId),
      direction: 'outbound',
      message_type: 'text',
      body_text: messageText,
      status: 'queued',
      message_category: 'fro_reply',
    })
    .select()
    .single();

  if (msgErr) throw msgErr;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipientPhone,
          type: 'text',
          text: { body: messageText },
        }),
      }
    );

    const result = await response.json();

    if (response.ok && result.messages?.[0]?.id) {
      await db
        .from('messages')
        .update({
          wa_message_id: result.messages[0].id,
          status: 'sent',
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);
    } else {
      await db
        .from('messages')
        .update({
          status: 'failed',
          failure_reason: result.error?.message || 'Meta API error',
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);
      throw new Error(result.error?.message || 'Failed to send');
    }
  } catch (apiErr) {
    await db
      .from('messages')
      .update({
        status: 'failed',
        failure_reason: apiErr instanceof Error ? apiErr.message : 'Network error',
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', message.id);
    throw apiErr;
  }

  await db
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  const { data: fullConversation } = await db
    .from('conversations')
    .select('*, contact:contacts!inner(id, phone, phone_normalized, wa_profile_name, project)')
    .eq('id', conversation.id)
    .single();

  return { message, conversation: fullConversation };
}

export async function createEmptyConversation(froWorkerId, phone, projectOverride, contactName) {
  const phoneNormalized = normalizePhone(phone);
  const contact = await findOrCreateContact(phoneNormalized, contactName);
  const conversation = await findOrCreateConversation(contact, froWorkerId, projectOverride);
  return { conversation, contact };
}

async function findOrCreateContact(phoneNormalized, contactName) {
  const name = contactName && String(contactName).trim() ? String(contactName).trim() : null;

  const { data: existing } = await db
    .from('contacts')
    .select('*')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();

  if (existing) {
    // Backfill the display name from the lead when the contact has none yet, so
    // the inbox shows a name instead of a bare number.
    if (name && !existing.wa_profile_name) {
      const { data: updated } = await db
        .from('contacts')
        .update({ wa_profile_name: name })
        .eq('id', existing.id)
        .select()
        .single();
      return updated || existing;
    }
    return existing;
  }

  try {
    const { data: newContact, error } = await db
      .from('contacts')
      .insert({
        phone: phoneNormalized,
        phone_normalized: phoneNormalized,
        source: 'fro_initiated',
        ...(name ? { wa_profile_name: name } : {}),
      })
      .select()
      .single();

    if (error) throw error;
    return newContact;
  } catch (insertErr) {
    // Handle race: another request inserted the same contact concurrently
    const { data: raceContact } = await db
      .from('contacts')
      .select('*')
      .eq('phone_normalized', phoneNormalized)
      .maybeSingle();
    if (raceContact) return raceContact;
    throw insertErr;
  }
}

async function findOrCreateConversation(contact, froWorkerId, projectOverride) {
  const projectFilter = projectOverride || contact.project || null;

  let query = db
    .from('conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('status', 'open');

  if (projectFilter) {
    query = query.eq('project', projectFilter);
  } else {
    query = query.is('project', null);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    return existing;
  }

  try {
    const { data: newConv, error } = await db
      .from('conversations')
      .insert({
        contact_id: contact.id,
        status: 'open',
        last_message_at: new Date().toISOString(),
        project: projectOverride || contact.project || null,
        assigned_agent_id: froWorkerId,
      })
      .select()
      .single();

    if (error) throw error;
    return newConv;
  } catch (insertErr) {
    let raceQuery = db
      .from('conversations')
      .select('*')
      .eq('contact_id', contact.id)
      .eq('status', 'open');
    if (projectFilter) {
      raceQuery = raceQuery.eq('project', projectFilter);
    } else {
      raceQuery = raceQuery.is('project', null);
    }
    const { data: raceConv } = await raceQuery.maybeSingle();
    if (raceConv) return raceConv;
    throw insertErr;
  }
}

export async function markConversationRead(conversationId, froWorkerId) {
  const { error } = await db
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId);

  if (error) throw error;
}

export async function getAgentConversations(agentUserId, projectFilter, role) {
  const isAdmin = ['admin', 'master', 'super_admin'].includes(role);

  let query = db
    .from('conversations')
    .select('*, contact:contacts!inner(id, phone, phone_normalized, wa_profile_name, project)')
    .order('last_message_at', { ascending: false });

  if (isAdmin) {
    query = query.or(`assigned_agent_id.eq.${agentUserId},assigned_agent_id.is.null`);
  } else {
    const { data: myAcctAssigns } = await db
      .from('worker_agent_assignments')
      .select('account_id')
      .eq('user_id', agentUserId);
    const { data: myFroAssigns } = await db
      .from('fro_whatsapp_assignments')
      .select('whatsapp_account_id')
      .eq('fro_worker_id', agentUserId)
      .eq('is_active', true);
    const { data: myAgentAssigns } = await db
      .from('agent_phone_assignments')
      .select('account_id')
      .eq('user_id', agentUserId);

    const acctIds = new Set();
    for (const a of [...(myAcctAssigns || []), ...(myFroAssigns || []), ...(myAgentAssigns || [])]) {
      if (a.account_id) acctIds.add(a.account_id);
    }

    let myProjects = [];
    if (acctIds.size > 0) {
      const { data: accts } = await db
        .from('whatsapp_accounts')
        .select('project')
        .in('id', Array.from(acctIds));
      myProjects = (accts || []).map(a => a.project).filter(Boolean);
    }

    const orParts = [`assigned_agent_id.eq.${agentUserId}`];
    if (myProjects.length > 0) {
      const projectOr = myProjects.map(p => `and(project.eq.${p},assigned_agent_id.is.null)`).join(',');
      orParts.push(projectOr);
    }
    query = query.or(orParts.join(','));
  }

  if (projectFilter) {
    query = query.eq('project', projectFilter);
  }

  const { data: conversations, error: convErr } = await query;

  if (convErr) {
    if (convErr.code === '42P01' || convErr.message?.includes('does not exist')) return [];
    throw convErr;
  }

  const seen = new Map();
  for (const c of conversations || []) {
    // group_id joins the dedupe key so two different WhatsApp groups that
    // happen to share a first sender are not collapsed into one row.
    const key = `${c.contact_id}__${c.project || 'none'}__${c.group_id || ''}`;
    if (!seen.has(key) || new Date(c.last_message_at) > new Date(seen.get(key).last_message_at)) {
      seen.set(key, c);
    }
  }
  return Array.from(seen.values());
}

export async function getAgentUnreadCount(agentUserId, role) {
  try {
    const conversations = await getAgentConversations(agentUserId, null, role);
    return conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  } catch (err) {
    console.error('[getAgentUnreadCount] error:', err.message);
    return 0;
  }
}

export async function getFroUnreadCount(froWorkerId) {
  try {
    const conversations = await getFroConversations(froWorkerId);
    return conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  } catch (err) {
    console.error('[getFroUnreadCount] WhatsApp tables may not exist:', err.message);
    return 0;
  }
}

export async function getQuickReplies() {
  const { data, error } = await db
    .from('quick_replies')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getTemplates(project) {
  let query = db
    .from('whatsapp_templates')
    .select('*')
    .in('status', ['approved', 'APPROVED'])
    .order('name', { ascending: true });
  if (project) {
    query = query.eq('project', project);
  }
  const { data, error } = await query;
  if (error) throw error;

  const account = project ? await getAccountByProject(project) : null;
  return Promise.all((data || []).map(async template => {
    if (template.components?.length || !account?.waba_id || !account?.access_token) return template;
    const liveTemplate = await getLiveTemplateDefinition(account, template.name);
    return liveTemplate ? { ...template, components: liveTemplate.components, language: liveTemplate.language || template.language } : template;
  }));
}

async function getLiveTemplateDefinition(account, templateName) {
  if (!account?.waba_id || !account?.access_token) return null;
  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${account.waba_id}/message_templates?name=${encodeURIComponent(templateName)}&fields=name,language,components`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    const result = await response.json();
    return result.data?.find(template => template.name === templateName) || null;
  } catch (error) {
    console.error('[getLiveTemplateDefinition] failed:', error.message);
    return null;
  }
}

export async function sendTemplateReply(conversationId, froWorkerId, templateName, paramValues, headerMediaUrl, headerMediaName) {
  const { data: conversation, error: convErr } = await db
    .from('conversations')
    .select('*, contact:contacts!inner(id, phone, phone_normalized, project)')
    .eq('id', conversationId)
    .single();
  if (convErr || !conversation) throw new Error('Conversation not found');

  let project = conversation.project;
  if (!project) {
    console.warn('[sendTemplateReply] Conversation', conversationId, 'has NO project set — falling back to contact project');
    project = conversation.contact?.project || 'bsct';
  }
  const recipientPhone = normalizePhone(conversation.contact?.phone_normalized || conversation.contact?.phone);
  if (!recipientPhone) throw new Error('Recipient phone not found');

  const account = await getAccountByProject(project);
  const accessToken = account?.access_token || config.accessToken;
  const phoneNumberId = account?.phone_number_id || config.phoneNumberId;
  if (!accessToken || !phoneNumberId) {
    throw new Error(`WhatsApp account not configured for project "${project}"`);
  }

  const { data: storedTemplate } = await db
    .from('whatsapp_templates')
    .select('*')
    .eq('name', templateName)
    .eq('project', project)
    .maybeSingle();

  const liveTemplate = await getLiveTemplateDefinition(account, templateName);
  const template = liveTemplate ? { ...storedTemplate, ...liveTemplate } : storedTemplate;
  if (!template) throw new Error('Template not found for this WhatsApp account');

  const components = [];
  if (template.components) {
    for (const comp of template.components) {
      if (comp.type === 'BODY' && paramValues?.length > 0) {
        const matches = comp.text?.match(/\{\{(\d+)\}\}/g) || [];
        if (matches.length > 0) {
          const params = matches.map((m, i) => ({
            type: 'text',
            text: paramValues[i] || '',
          }));
          components.push({ type: 'body', parameters: params });
        }
      }
      if (comp.type === 'HEADER' && ['IMAGE', 'DOCUMENT', 'VIDEO'].includes(comp.format)) {
        if (!headerMediaUrl) throw new Error(`This template requires a ${comp.format.toLowerCase()} header file`);
        const mediaType = comp.format.toLowerCase();
        // Meta fetches the header itself, so the link must be publicly readable.
        // The stored bucket URL is private (403), which Meta reports as 131053
        // "Media upload error", so sign it before sending.
        const media = { link: await presignStoredUrl(headerMediaUrl, { prefix: WHATSAPP_MEDIA_PREFIX }) };
        if (mediaType === 'document' && headerMediaName) media.filename = headerMediaName;
        components.push({ type: 'header', parameters: [{ type: mediaType, [mediaType]: media }] });
      }
    }
  }

  const fillPlaceholders = (str) => String(str || '').replace(
    /\{\{(\d+)\}\}/g,
    (_, n) => paramValues?.[Number(n) - 1] || '',
  );
  const bodyComponent = template.components?.find(c => c.type === 'BODY');
  const footerComponent = template.components?.find(c => c.type === 'FOOTER');
  const headerComponent = template.components?.find(c => c.type === 'HEADER');
  const buttonsComponent = template.components?.find(c => c.type === 'BUTTONS');
  const headerFormat = headerComponent?.format || null;
  const renderedBody = bodyComponent?.text ? fillPlaceholders(bodyComponent.text) : null;
  const headerMime = headerFormat === 'IMAGE' ? 'image/jpeg'
    : headerFormat === 'VIDEO' ? 'video/mp4'
    : headerFormat === 'DOCUMENT' ? 'application/pdf'
    : null;
  // Persist what the donor actually received (header media, rendered body,
  // footer, buttons) so the agent's thread reads like the WhatsApp thread
  // instead of showing only the template's internal name.
  const templateSummary = {
    kind: 'whatsapp_template',
    name: templateName,
    language: template.language || 'en',
    category: template.category || null,
    body: renderedBody,
    footer: footerComponent?.text || null,
    headerText: headerComponent?.text ? fillPlaceholders(headerComponent.text) : null,
    headerFormat,
    buttons: (buttonsComponent?.buttons || []).map(b => ({
      kind: b.type,
      label: b.text,
      url: b.url ? fillPlaceholders(b.url) : null,
    })),
  };

  // Claim the conversation for the sending agent, otherwise the FRO inbox's
  // assigned-agent filter hides the thread (and therefore the template) again.
  if (!conversation.assigned_agent_id) {
    await db
      .from('conversations')
      .update({ assigned_agent_id: froWorkerId })
      .eq('id', conversationId);
  }

  const { data: message, error: msgErr } = await db
    .from('messages')
    .insert({
      tenant_id: conversation.tenant_id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      user_id: String(froWorkerId),
      direction: 'outbound',
      message_type: 'template',
      body_text: renderedBody || templateName,
      template_id: templateName,
      template_params: templateSummary,
      media_url: headerMediaUrl || null,
      media_mime_type: headerMime,
      status: 'queued',
      message_category: 'template',
    })
    .select()
    .single();
  if (msgErr) throw msgErr;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipientPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: template?.language || 'en' },
            components: components.length > 0 ? components : undefined,
          },
        }),
      }
    );
    const result = await response.json();
    if (response.ok && result.messages?.[0]?.id) {
      await db.from('messages').update({
        wa_message_id: result.messages[0].id,
        status: 'sent',
        status_updated_at: new Date().toISOString(),
      }).eq('id', message.id);
    } else {
      await db.from('messages').update({
        status: 'failed',
        failure_reason: result.error?.message || 'Meta API error',
        status_updated_at: new Date().toISOString(),
      }).eq('id', message.id);
      throw new Error(result.error?.message || 'Failed to send template');
    }
  } catch (apiErr) {
    await db.from('messages').update({
      status: 'failed',
      failure_reason: apiErr instanceof Error ? apiErr.message : 'Network error',
      status_updated_at: new Date().toISOString(),
    }).eq('id', message.id);
    throw apiErr;
  }

  await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
  return message;
}

export async function searchFroMessages(froWorkerId, query) {
  const conversations = await getFroConversations(froWorkerId);
  const convIds = conversations.map(c => c.id);
  if (convIds.length === 0) return [];

  const { data, error } = await db
    .from('messages')
    .select('*, contact:contacts!inner(id, phone, phone_normalized, wa_profile_name, project)')
    .in('conversation_id', convIds)
    .ilike('body_text', `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function updateConversationLabels(conversationId, labels) {
  const { error } = await db
    .from('conversations')
    .update({ labels })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function uploadFroMedia(froWorkerId, file) {
  // The original name becomes part of the object key. Keep it to the characters
  // the storage key rules and the presigner both accept -- a space or a comma in
  // the key makes the object impossible to sign later, so a template header built
  // on it would 403 and Meta would fail the send with 131053.
  const safeName = String(file.originalname || 'file')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(-120) || 'file';
  const fileName = `fro_${froWorkerId}_${Date.now()}_${safeName}`;
  const bucket = 'whatsapp-media';

  let { data: uploadData, error: uploadError } = await db.storage
    .from(bucket)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError?.message?.includes('Bucket not found')) {
    const { error: bucketError } = await db.storage.createBucket(bucket, {
      public: true,
      allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      fileSizeLimit: 52428800,
    });
    if (bucketError) throw bucketError;

    const result = await db.storage
      .from(bucket)
      .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: false });
    if (result.error) throw result.error;
    uploadData = result.data;
  } else if (uploadError) {
    throw uploadError;
  }

  const { data: urlData } = db.storage.from(bucket).getPublicUrl(fileName);

  const { data: record, error: recordError } = await db
    .from('media_library')
    .insert({
      name: file.originalname || fileName,
      file_url: urlData.publicUrl,
      file_type: file.mimetype,
      file_size: file.size,
    })
    .select()
    .single();
  if (recordError) throw recordError;

  return record;
}

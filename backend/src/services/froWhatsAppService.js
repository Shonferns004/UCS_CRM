import db from '../config/db.js';
import { classifyDeliveryFailure } from '../lib/whatsappErrorCodes.js';
import { checkAttachmentReachable, describeUnreachableAttachment } from './mediaReachability.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';
import config from '../config/whatsappConfig.js';

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

/**
 * Media in this bucket is private, so every stored URL is a presigned one and
 * those expire after an hour -- an inbox row read tomorrow would render a dead
 * image. Re-sign on read from the S3 key so attachments stay viewable.
 *
 * Also backfills media_mime_type for rows written before the column was
 * populated, since the bubble needs it to choose <img> vs <video> vs download.
 */
const MEDIA_BUCKET = 'whatsapp-media';

function s3KeyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const path = url.split('?')[0];
  // Shape: https://<bucket>.s3.<region>.amazonaws.com/<key>
  const m = path.match(/^https?:\/\/[^/]+\.s3[.-][^/]+\.amazonaws\.com\/(.+)$/i);
  if (!m) return null;
  const key = (() => { try { return decodeURIComponent(m[1]); } catch { return m[1]; } })();
  // uploadFroMedia uploads with `.from(MEDIA_BUCKET)`, so the stored URL already
  // carries the bucket as the leading folder. Passing the bucket again would
  // double it up and presign a key that does not exist.
  const prefixed = MEDIA_BUCKET + '/';
  return key.startsWith(prefixed) ? key.slice(prefixed.length) : key;
}

function mimeFromKey(key) {
  const ext = (key.split('.').pop() || '').toLowerCase();
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || null;
}

async function refreshMediaAttachments(messages) {
  const list = Array.isArray(messages) ? messages : [];
  await Promise.all(list.map(async (m) => {
    if (!m) return;
    const key = s3KeyFromUrl(m.media_url);
    if (!key) {
      // Nothing to re-sign, but an outbound row may still be missing its mime.
      if (m.media_url && !m.media_mime_type) {
        m.media_mime_type = mimeFromKey(m.media_url.split('?')[0]);
      }
      return;
    }
    if (!m.media_mime_type) m.media_mime_type = mimeFromKey(key);
    // sendFroReply stores the generic 'media' type; normalise it to the real
    // kind so the bubble stops treating the caption as standalone body text.
    if (m.message_type === 'media' && m.media_mime_type) {
      const kind = mediaPayloadKind(m.media_mime_type, null);
      if (kind) m.message_type = kind;
    }
    try {
      const { data, error } = await db.storage.from(MEDIA_BUCKET).presignDownload(key, 3600);
      if (!error && data?.url) m.media_url = data.url;
    } catch {
      // Leave the stored URL in place; the client degrades to a placeholder.
    }
  }));
  return list;
}

// ── Send-side media handling ──────────────────────────────────────────
//
// refreshMediaAttachments above keeps DISPLAY links alive. These two keep SEND
// links alive, and they are separate on purpose: re-signing for a bubble that
// only needs to render is cheap, but re-signing is not a substitute for checking
// that the object is actually there.

const MEDIA_SEND_TTL_SECONDS = 24 * 60 * 60;

// Which Cloud API payload key a stored mime maps to.
//
// This is the function the retry path got wrong by not having: it hardcoded
// 'image' for every attachment, so a retried PDF was handed to Meta as a picture.
// Cloud API answers 200 to that POST and then fails the fetch with 131053
// ("Media upload error") a minute later, so the agent saw a Retry button that
// could never have worked. Exported so that regression is pinned by a test
// instead of by the next retry.
//
// `fallback` is the kind to assume when the mime is genuinely unknown. The two
// callers differ on purpose: a fresh send always knows the mime (it comes
// straight off the upload), whereas a stored row might not — and `document` is
// what an unidentified inbox attachment almost always is, where `image` is a
// certain 131053.
export function mediaPayloadKind(mime, fallback) {
  const top = String(mime || '').split('/')[0].trim().toLowerCase();
  if (['image', 'audio', 'video', 'document'].includes(top)) return top;
  // Documents are the trap, and they are the reason this function exists. A PDF
  // is `application/pdf`, NOT `document/pdf`: matching only on the top-level type
  // leaves it unrecognised, and every caller's fallback then takes over — which is
  // how a checklist PDF reached Meta labelled `type: 'image'` on the FIRST send,
  // not just on retry. Meta answers 200 to that POST, fetches the object, finds
  // it is not a picture, and minutes later reports 131053 "Media upload error".
  // Every document WhatsApp accepts lives under application/ or text/.
  if (top === 'application' || top === 'text') return 'document';
  return fallback;
}

// A signed link is minted once, at upload (uploadFroMedia), with a fixed TTL.
// Anything that DISPATCHES to Meta has to re-sign: an hour later that stored URL
// is a dead signature, Meta's fetch of it 403s, and Cloud API reports that as
// 131053 "Media upload error" a minute AFTER answering our POST with a wamid and
// a clean 200. By then the operator is looking at a failed bubble with no cause.
//
// 24h rather than the 1h used for display: Meta normally fetches within seconds,
// but a retry can sit queued behind an earlier attempt, and db.js:1533 documents
// that a short expiry is precisely the wrong failure mode here. Still well
// inside presignDownload's 7-day cap.
export async function prepareMediaForSend(storedUrl, storedMime) {
  const mime = storedMime || mimeFromKey(String(storedUrl || '').split('?')[0]) || null;
  const key = s3KeyFromUrl(storedUrl);
  if (!key) return { url: storedUrl, mime };
  try {
    const { data, error } = await db.storage.from(MEDIA_BUCKET).presignDownload(key, MEDIA_SEND_TTL_SECONDS);
    if (error || !data?.url) return { url: storedUrl, mime };
    return { url: data.url, mime };
  } catch {
    // Signing failed. Hand back what we have rather than dropping the
    // attachment -- the probe below will then report the real problem.
    return { url: storedUrl, mime };
  }
}

// Refuse to dispatch an attachment Meta provably cannot fetch. The receipt path
// has done this since receipts started vanishing (whatsappController.js:94); the
// inbox did not, which is how an un-downloadable link reached Meta at all, and
// why the failure surfaced as a bare 131053 with no diagnosis attached.
async function assertAttachmentSendable(url) {
  const probe = await checkAttachmentReachable(url);
  if (!probe.ok) throw new Error(describeUnreachableAttachment(url, probe));
}

export async function getConversationMessages(conversationId) {
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return refreshMediaAttachments(data || []);
}

export async function sendFroReply(conversationId, froWorkerId, messageText, mediaUrl, mediaMimeType) {
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

  const account = await getAccountByProject(project);
  console.log('[sendFroReply] project:', project, 'account:', account ? account.name : 'null', 'phone_number_id:', account?.phone_number_id);
  const accessToken = account?.access_token || config.accessToken;
  const phoneNumberId = account?.phone_number_id || config.phoneNumberId;

  if (!accessToken || !phoneNumberId) {
    throw new Error(`WhatsApp account not configured for project "${project}"`);
  }

  // Store the real kind (image/audio/video/document) so the inbox renders the
  // right player instead of guessing from a generic 'media'. Same mapping the
  // send below uses — a PDF has to land on 'document' in both places, or the row
  // says one thing and the payload says another.
  const messageType = mediaUrl
    ? mediaPayloadKind(mediaMimeType || mimeFromKey(mediaUrl.split('?')[0]), 'media')
    : 'text';

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
      media_mime_type: mediaMimeType || null,
      status: 'queued',
      message_category: 'fro_reply',
    })
    .select()
    .single();

  if (msgErr) throw msgErr;

  try {
    let body;
    if (mediaUrl) {
      // Re-sign before dispatch. The URL came from uploadFroMedia and may already
      // have been sitting in an open composer for an hour.
      const prepared = await prepareMediaForSend(mediaUrl, mediaMimeType);
      // Meta keys the payload off the real media kind. Sending a voice note
      // as `type: 'image'` makes Cloud API reject the attachment, so derive the
      // type from the stored mime (falling back to the S3 key).
      const mediaType = mediaPayloadKind(prepared.mime, 'image');
      body = {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: mediaType,
        [mediaType]: { link: prepared.url },
      };
      if (messageText?.trim()) {
        body[mediaType].caption = messageText.trim();
      }
      // Probe what Meta is about to fetch, before the POST that will answer 200
      // and tell us nothing. A throw here lands in the catch below, which marks
      // the row failed with this message instead of Meta reporting 131053
      // minutes later against a bubble that looks like a random network fault.
      await assertAttachmentSendable(prepared.url);
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

// Re-dispatch an already-stored failed outbound message to Meta, updating that
// SAME row rather than inserting a new one, so the thread keeps one bubble and
// the retry stays auditable. Reuses the body_text / media_url already on the
// row, so a retry can never drift from what was originally attempted.
export async function resendMessage(conversationId, messageId) {
  const { data: message, error: msgErr } = await db
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (msgErr) throw msgErr;
  if (!message) throw new Error('Message not found');

  const { data: conversation, error: convErr } = await db
    .from('conversations')
    .select('*, contact:contacts(id, phone, phone_normalized)')
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr) throw convErr;
  if (!conversation) throw new Error('Conversation not found');

  let project = conversation.project;
  if (!project) {
    const { data: froAssignments } = await db
      .from('fro_whatsapp_assignments')
      .select('whatsapp_accounts!inner(project)')
      .eq('fro_worker_id', message.user_id)
      .eq('is_active', true)
      .maybeSingle();
    project = froAssignments?.whatsapp_accounts?.project;
  }
  project = project || 'bsct';

  const recipientPhone = normalizePhone(
    conversation.contact?.phone_normalized || conversation.contact?.phone,
  );
  if (!recipientPhone) throw new Error('Recipient phone not found');

  const account = await getAccountByProject(project);
  const accessToken = account?.access_token || config.accessToken;
  const phoneNumberId = account?.phone_number_id || config.phoneNumberId;
  if (!accessToken || !phoneNumberId) {
    throw new Error(`WhatsApp account not configured for project "${project}"`);
  }

  // Kept so a retry that dies without a Meta code does not erase the only clue
  // the agent had about why this message was failing in the first place.
  const originalReason = message.failure_reason || null;

  // Back to 'queued' first so a webhook 'sent' that lands mid-flight agrees
  // with the row rather than being rejected by the rank guard.
  await db
    .from('messages')
    .update({ status: 'queued', status_updated_at: new Date().toISOString() })
    .eq('id', message.id);

  // Re-sign, derive the payload type from the object's real mime, and probe it
  // before dispatching.
  //
  // This branch used to send `type: 'image'` with an `image: { link }` for every
  // attachment and to reuse the row's media_url verbatim. Both were wrong, and
  // together they are the whole of "Not delivered: (131053) Media upload error":
  //
  //   - the first send derived the kind correctly from the mime, so a PDF really
  //     was a document. Every RETRY relabelled that same PDF as an image, and
  //     Meta answers 200 to the POST and then fails the fetch with 131053 -- so
  //     the operator saw a retry that could never have worked, over and over.
  //   - the row's URL is the signature minted at upload time. Once it expired,
  //     the retry handed Meta a dead link that is guaranteed to 403.
  const caption = message.body_text?.trim() || null;
  let body;
  if (message.media_url) {
    const prepared = await prepareMediaForSend(message.media_url, message.media_mime_type);
    // Fall back to `document` rather than `image`: the kind is only unknown when
    // the mime was never recorded, and an image payload carrying a PDF is a
    // certain 131053, whereas document is what an unattached file almost always
    // is.
    const mediaType = mediaPayloadKind(prepared.mime, 'document');
    body = {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: mediaType,
      [mediaType]: caption ? { link: prepared.url, caption } : { link: prepared.url },
    };
    await assertAttachmentSendable(prepared.url);
  } else {
    body = {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'text',
      text: { body: message.body_text || '' },
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const result = await response.json();

    if (response.ok && result.messages?.[0]?.id) {
      await db
        .from('messages')
        .update({
          wa_message_id: result.messages[0].id,
          status: 'sent',
          failure_reason: null,
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);
      return { messageId: message.id, status: 'sent', waMessageId: result.messages[0].id };
    }

    // Store the code with the message, in the same "(131047) message" shape the
    // webhook uses, so classifyDeliveryFailure() can read a synchronous Meta
    // rejection exactly like an asynchronous one.
    const apiCode = result.error?.code;
    const reason = result.error?.message || 'Meta API error';
    const stored = apiCode ? `(${apiCode}) ${reason}` : reason;
    await db
      .from('messages')
      .update({ status: 'failed', failure_reason: stored, status_updated_at: new Date().toISOString() })
      .eq('id', message.id);
    throw new Error(stored);
  } catch (apiErr) {
    const reason = apiErr instanceof Error ? apiErr.message : 'Network error';
    // A network/timeout failure carries no code. Keeping the previous reason in
    // that case means a retry that dies offline still shows the agent why the
    // message is failing instead of a bare "Network error".
    const keep = classifyDeliveryFailure(reason).code === null && originalReason
      ? originalReason
      : reason;
    // Compare-and-swap on 'queued' so a successful write above is not clobbered.
    await db
      .from('messages')
      .update({ status: 'failed', failure_reason: keep })
      .eq('id', message.id)
      .eq('status', 'queued');
    throw apiErr;
  }
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

export async function createEmptyConversation(froWorkerId, phone, projectOverride) {
  const phoneNormalized = normalizePhone(phone);
  const contact = await findOrCreateContact(phoneNormalized);
  const conversation = await findOrCreateConversation(contact, froWorkerId, projectOverride);
  return { conversation, contact };
}

async function findOrCreateContact(phoneNormalized) {
  const { data: existing } = await db
    .from('contacts')
    .select('*')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();

  if (existing) return existing;

  try {
    const { data: newContact, error } = await db
      .from('contacts')
      .insert({
        phone: phoneNormalized,
        phone_normalized: phoneNormalized,
        source: 'fro_initiated',
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

// opts (all optional, all additive filters on top of the ownership scoping):
//   unread   : true  -> only conversations with unread_count > 0
//   statuses : []    -> any of open|pending|resolved|closed; empty means all
//   search   : ''    -> matches the CONTACT's phone / whatsapp name / contact name
//   label    : ''    -> conversations whose `labels` array contains this value
//   limit    : n     -> caps the page (default 100, matching the list UI)
//
// `label` is applied in JS rather than in SQL: `labels` is a text[] and the query
// builder in config/db.js has no array-contains operator, so there is no way to
// express it without touching that shared file. The filter therefore applies to
// the returned page only. That is honest for a per-agent inbox page and is the
// one filter here that is not server-side total.
export async function getAgentConversations(agentUserId, projectFilter, role, opts = {}) {
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
    // fro_whatsapp_assignments names the account column `whatsapp_account_id`;
    // the other two tables name it `account_id`. Reading only `a.account_id`
    // here silently dropped every FRO direct-assignment row, so an FRO's own
    // WhatsApp project never reached myProjects and their unassigned
    // conversations were filtered out of the inbox entirely.
    for (const a of [...(myAcctAssigns || []), ...(myFroAssigns || []), ...(myAgentAssigns || [])]) {
      const acctId = a.account_id || a.whatsapp_account_id;
      if (acctId) acctIds.add(acctId);
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

  // Unread and status are plain columns on conversations, so they filter in SQL.
  if (opts.unread) {
    query = query.gt('unread_count', 0);
  }
  const statuses = Array.isArray(opts.statuses)
    ? opts.statuses
    : String(opts.statuses || '').split(',').map(s => s.trim()).filter(Boolean);
  if (statuses.length) {
    query = query.in('status', statuses);
  }

  // Search resolves to a set of contact ids first. The builder cannot filter on
  // an embedded table, and `contacts.phone_normalized` is indexed, so matching
  // there and then filtering conversations by id keeps it to two cheap queries.
  let searchContactIds = null;
  const search = String(opts.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    const digits = search.replace(/\D/g, '');
    const { data: matched, error: matchErr } = await db
      .from('contacts')
      .select('id')
      .or([
        `phone_normalized.ilike.${like}`,
        `phone.ilike.${like}`,
        `wa_profile_name.ilike.${like}`,
        `first_name.ilike.${like}`,
        `last_name.ilike.${like}`,
        `company.ilike.${like}`,
        digits ? `phone_normalized.ilike.%${digits}%` : null,
      ].filter(Boolean).join(','));
    if (matchErr) throw matchErr;
    searchContactIds = (matched || []).map(c => c.id);
    // An empty result must match nothing. `in ()` degrades to `1 = 0` in the
    // builder, which is exactly right, but only if we still call it.
    query = query.in('contact_id', searchContactIds);
  }

  const { data: conversations, error: convErr } = await query;

  if (convErr) {
    if (convErr.code === '42P01' || convErr.message?.includes('does not exist')) return [];
    throw convErr;
  }

  const seen = new Map();
  for (const c of conversations || []) {
    const key = `${c.contact_id}__${c.project || 'none'}`;
    if (!seen.has(key) || new Date(c.last_message_at) > new Date(seen.get(key).last_message_at)) {
      seen.set(key, c);
    }
  }
  let rows = Array.from(seen.values());

  // Label filter, in JS — see the note on the function signature.
  const label = String(opts.label || '').trim();
  if (label) {
    rows = rows.filter(c => {
      const labels = c.labels;
      if (!labels) return false;
      const list = Array.isArray(labels) ? labels : String(labels).split(',');
      return list.some(l => String(l).trim().toLowerCase() === label.toLowerCase());
    });
  }

  if (opts.limit) {
    rows = rows.slice(0, Math.max(1, parseInt(opts.limit, 10) || 100));
  }
  return rows;
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

// Live APPROVED templates per project, for a short window. Meta is the only
// authority on what a given WABA may send; the local table is a mirror, so
// keying the read on it made the library show templates that are not approved
// on THIS number and hide ones that are.
const TEMPLATE_CACHE_MS = 60_000;
const liveTemplateCache = new Map();

function safeParseComponents(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Replace {{1}} / {{name}} placeholders with what was actually sent. */
function substituteTemplateText(text, paramValues) {
  if (!text) return '';
  const source = String(text);
  if (!paramValues) return source;
  const named = !Array.isArray(paramValues);
  return source.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, token) => {
    const value = named ? paramValues[token] : paramValues[Number(token) - 1];
    return value === undefined || value === null || value === '' ? match : String(value);
  });
}

function mimeForHeader(format) {
  if (format === 'IMAGE') return 'image/jpeg';
  if (format === 'VIDEO') return 'video/mp4';
  if (format === 'DOCUMENT') return 'application/pdf';
  return null;
}

/** Both the current BUTTONS shape and the older BUTTON + sub_type shape. */
function collectTemplateButtons(components) {
  if (!Array.isArray(components)) return [];
  const out = [];
  const container = components.find((c) => c && c.type === 'BUTTONS');
  for (const button of container?.buttons ?? []) {
    out.push({
      kind: String(button.type ?? '').toUpperCase(),
      label: String(button.text ?? ''),
      url: button.url ?? null,
    });
  }
  for (const comp of components) {
    if (!String(comp?.type ?? '').startsWith('BUTTON')) continue;
    const parameter = (comp.parameters ?? []).find((p) => p?.url) ?? {};
    out.push({
      kind: String(comp.sub_type ?? '').toUpperCase(),
      label: String(parameter.text ?? comp.text ?? ''),
      url: parameter.url ?? comp.url ?? null,
    });
  }
  return out;
}

/** The HEADER component of a template, when it is a media header. */
function mediaHeaderOf(components) {
  if (!Array.isArray(components)) return null;
  const header = components.find((c) => c && c.type === 'HEADER');
  if (!header) return null;
  return ['IMAGE', 'DOCUMENT', 'VIDEO'].includes(header.format) ? header : null;
}

/**
 * Copy a template's header media into our own bucket, once.
 *
 * Meta only hands back the asset as a sample URL (components[].example
 * .header_handle) that expires, so it cannot be reused at send time. We store a
 * copy under a deterministic key -- project + template name -- which means a
 * template resync can never orphan it and no extra column lookup is needed to
 * find it again.
 *
 * Returns the object key, or null when there is nothing to cache.
 */
const TEMPLATE_HEADER_DIR = 'template-headers';
const cachedHeaderKeys = new Set();

function templateHeaderKey(project, templateName) {
  const safeProject = String(project || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  const safeName = String(templateName || 'template').replace(/[^A-Za-z0-9_-]/g, '_');
  return `${TEMPLATE_HEADER_DIR}/${safeProject}/${safeName}`;
}

async function cacheTemplateHeader(project, templateName, headerComponent) {
  if (!headerComponent) return null;
  const sampleUrl = headerComponent?.example?.header_handle?.[0];
  if (!sampleUrl) return null;

  const key = templateHeaderKey(project, templateName);
  if (cachedHeaderKeys.has(key)) return key;

  try {
    const response = await fetch(sampleUrl);
    if (!response.ok) {
      console.warn(`[templateHeader] ${project}/${templateName}: sample download ${response.status}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(key, buffer, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.warn(`[templateHeader] ${project}/${templateName}: upload failed ${error.message}`);
      return null;
    }

    cachedHeaderKeys.add(key);
    // Best effort: keeps the DB useful for debugging, but the deterministic key
    // means a missing row only costs one re-download.
    await db.from('whatsapp_templates')
      .update({ header_storage_key: key, header_mime_type: contentType })
      .eq('project', project)
      .eq('name', templateName)
      .then(({ error: dbErr }) => {
        if (dbErr) console.warn(`[templateHeader] ${project}/${templateName}: db update ${dbErr.message}`);
      });
    return key;
  } catch (error) {
    console.warn(`[templateHeader] ${project}/${templateName}: ${error.message}`);
    return null;
  }
}

/** A fresh signed URL for a cached header, so previews and sends keep working
 *  past the one-hour expiry of any single signature. */
async function presignTemplateHeader(key) {
  if (!key) return null;
  try {
    const { data, error } = await db.storage.from(MEDIA_BUCKET).presignDownload(key, 3600);
    if (error || !data?.url) return null;
    return data.url;
  } catch {
    return null;
  }
}

/**
 * Attach the template's own header asset to a template the picker will show:
 * `headerMediaUrl` drives the preview image and, at send time, is reused as-is
 * so the donor always receives the same picture the template was approved with.
 */
async function attachHeaderMedia(items, project) {
  return Promise.all(items.map(async (item) => {
    const header = mediaHeaderOf(item.components);
    if (!header) return item;
    const key = await cacheTemplateHeader(project, item.name, header);
    if (!key) return item;
    const url = await presignTemplateHeader(key);
    if (!url) return item;
    return {
      ...item,
      headerFormat: header.format,
      headerMediaUrl: url,
      // True when the header came from the template itself, so the UI can offer
      // "send as-is" instead of demanding a fresh upload.
      headerFromTemplate: true,
    };
  }));
}

async function fetchLiveTemplates(account) {  const response = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${account.waba_id}/message_templates` +
      `?status=APPROVED&limit=200&fields=id,name,status,language,category,components,sub_category,parameter_format`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  if (!response.ok) return null;
  const body = await response.json();
  if (!Array.isArray(body?.data)) return null;
  return body.data.filter((t) => String(t.status || '').toUpperCase() === 'APPROVED');
}

/**
 * `whatsapp_templates.ngo_id` is NOT NULL with no default, so an insert that
 * omits it silently fails and the template never lands in the cache. Resolve a
 * real ngo first: from an existing row for this project, else ngos.code (bsct2
 * falls back to BSCT by prefix), else whatever the current rows already use.
 */
async function resolveNgoId(project) {
  const { data: existing } = await db
    .from('whatsapp_templates')
    .select('ngo_id')
    .eq('project', project)
    .limit(1);
  if (existing?.[0]?.ngo_id) return existing[0].ngo_id;

  const { data: ngos } = await db.from('ngos').select('id, code');
  const want = String(project || '').toUpperCase();
  const exact = (ngos || []).find((n) => String(n.code).toUpperCase() === want);
  if (exact) return exact.id;
  const byPrefix = (ngos || []).find((n) => want && want.startsWith(String(n.code).toUpperCase()));
  if (byPrefix) return byPrefix.id;

  const { data: fallback } = await db.from('whatsapp_templates').select('ngo_id').limit(1);
  return fallback?.[0]?.ngo_id || null;
}

/**
 * Keeps `whatsapp_templates` an accurate mirror of Meta for one project.
 *
 * Two rules, both learned the hard way:
 *   1. Every write is checked. A failed insert used to pass unnoticed, so a
 *      template Meta had approved never reached the cache.
 *   2. Stale rows are deleted ONLY after every live template was persisted.
 *      Deleting first would have thrown away working rows because of one bad
 *      write, leaving the library worse than before.
 */
async function mirrorTemplatesToCache(project, live) {
  const ngoId = await resolveNgoId(project);
  if (!ngoId) {
    console.error(`[getTemplates] no ngo_id resolvable for "${project}" -- cache mirror skipped`);
    return { inserted: 0, updated: 0, removed: 0 };
  }

  let inserted = 0;
  let updated = 0;
  const failed = [];

  for (const t of live) {
    const language = t.language || 'en';
    const row = {
      ngo_id: ngoId,
      name: t.name,
      language,
      category: t.category || null,
      status: 'approved',
      meta_template_id: t.id ? String(t.id) : null,
      components: t.components || null,
      project,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await db
      .from('whatsapp_templates')
      .select('id')
      .eq('project', project)
      .eq('name', t.name)
      .eq('language', language)
      .maybeSingle();

    if (existing) {
      const { error } = await db.from('whatsapp_templates').update(row).eq('id', existing.id);
      if (error) failed.push(`${t.name}: ${error.message}`);
      else updated += 1;
    } else {
      const { error } = await db.from('whatsapp_templates').insert(row);
      if (error) failed.push(`${t.name}: ${error.message}`);
      else inserted += 1;
    }
  }

  if (failed.length) {
    // Do NOT prune on a partial write -- that is what lost templates before.
    console.error(`[getTemplates] mirror incomplete for "${project}", stale rows left in place:`, failed);
    return { inserted, updated, removed: 0 };
  }

  const liveNames = new Set(live.map((t) => t.name));
  const { data: stored } = await db
    .from('whatsapp_templates')
    .select('id, name')
    .eq('project', project);

  let removed = 0;
  for (const row of stored || []) {
    if (!liveNames.has(row.name)) {
      await db.from('whatsapp_templates').delete().eq('id', row.id);
      removed += 1;
    }
  }
  return { inserted, updated, removed };
}

async function storedTemplates(project) {
  const { data, error } = await db
    .from('whatsapp_templates')
    .select('*')
    .eq('project', project)
    .in('status', ['approved', 'APPROVED'])
    .order('name', { ascending: true });

  if (error) throw error;
  // The column is jsonb but rows written by other clients can come back
  // encoded; normalise so callers can rely on it being an array.
  return attachHeaderMedia(
    (data || []).map((t) => ({
      ...t,
      id: t.id ? String(t.id) : null,
      status: String(t.status || 'APPROVED').toUpperCase(),
      components: Array.isArray(t.components) ? t.components : safeParseComponents(t.components),
    })),
    project,
  );
}
/**
 * Templates the agent may actually send for one project.
 *
 * Read live from the project's own WABA so the library can only ever offer
 * what is APPROVED on the number currently in use, and so a template approved
 * in Meta shows up within a minute without anyone pressing Refresh. The local
 * table is kept in step and used as a fallback if Meta cannot be reached.
 */
export async function getTemplates(project) {
  if (!project) return [];

  const account = await getAccountByProject(project);
  if (account?.waba_id && account?.access_token) {
    const cached = liveTemplateCache.get(project);
    if (cached && Date.now() - cached.at < TEMPLATE_CACHE_MS) return cached.items;

    try {
      const live = await fetchLiveTemplates(account);
      if (live) {
        const items = live.map((t) => ({
          id: t.id ? String(t.id) : null,
          name: t.name,
          language: t.language || 'en',
          category: t.category || null,
          // Only APPROVED templates reach here (fetchLiveTemplates filters), so
          // stamp it explicitly -- the library groups and filters on this, and an
          // undefined status would hide every template from the picker.
          status: String(t.status || 'APPROVED').toUpperCase(),
          // Graph returns components as an array on this endpoint, but it can
          // arrive JSON-encoded depending on the API version. Normalise so
          // callers can always use array methods on it.
          components: Array.isArray(t.components)
            ? t.components
            : (typeof t.components === 'string' ? safeParseComponents(t.components) : null),
          project,
        }));
        liveTemplateCache.set(project, { at: Date.now(), items });
        // Mirror is best-effort: a cache-write failure must not hide templates.
        await mirrorTemplatesToCache(project, live).catch((e) =>
          console.error('[getTemplates] mirror failed:', e.message),
        );
        return attachHeaderMedia(items, project);
      }
    } catch (error) {
      console.error('[getTemplates] live fetch failed:', error.message);
    }
  }

  return storedTemplates(project);
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
  // Meta supports two variable styles: positional {{1}} and named {{name}}.
  // They need a different payload shape, so remember which one this template
  // uses and label the request accordingly.
  let parameterFormat = null;
  if (template.components) {
    for (const comp of template.components) {
      if (comp.type === 'BODY' && paramValues && (Array.isArray(paramValues) ? paramValues.length > 0 : Object.keys(paramValues).length > 0)) {
        const bodyText = comp.text || '';
        const positional = bodyText.match(/\{\{\s*\d+\s*\}\}/g) || [];
        const named = bodyText.match(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g) || [];

        if (named.length > 0 && !Array.isArray(paramValues)) {
          // Named parameters go as { param_name, text } and the message
          // itself must carry parameter_format: 'NAMED'.
          parameterFormat = 'NAMED';
          const params = named.map((token) => {
            const key = token.replace(/[{}\s]/g, '');
            return { type: 'text', parameter_name: key, text: String(paramValues[key] ?? '') };
          });
          components.push({ type: 'body', parameters: params });
        } else if (positional.length > 0 && Array.isArray(paramValues)) {
          parameterFormat = 'POSITIONAL';
          const params = positional.map((_m, i) => ({
            type: 'text',
            text: paramValues[i] || '',
          }));
          components.push({ type: 'body', parameters: params });
        }
      }
      if (comp.type === 'HEADER' && ['IMAGE', 'DOCUMENT', 'VIDEO'].includes(comp.format)) {
        // Fall back to the template's own approved header so the recipient sees
        // the same image the template was created with, instead of forcing the
        // agent to attach a file on every single send.
        let mediaLink = headerMediaUrl;
        if (!mediaLink) {
          const liveHeader = mediaHeaderOf(template.components);
          const key = await cacheTemplateHeader(project, templateName, liveHeader);
          mediaLink = await presignTemplateHeader(key);
        }
        if (!mediaLink) throw new Error(`This template requires a ${comp.format.toLowerCase()} header file`);

        const mediaType = comp.format.toLowerCase();
        const media = { link: mediaLink };
        if (mediaType === 'document' && headerMediaName) media.filename = headerMediaName;
        components.push({ type: 'header', parameters: [{ type: mediaType, [mediaType]: media }] });
      }
      // A URL button whose link contains {{...}} needs its own component, or
      // Meta rejects the send with an unsubstituted placeholder in the URL.
      if (String(comp.type || '').startsWith('BUTTON') && comp.sub_type) {
        const param = (comp.parameters || []).find((p) => p?.url) || {};
        const dynamicUrl = param.url ?? comp.url ?? '';
        const tokens = dynamicUrl.match(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g) || [];
        if (tokens.length > 0) {
          const buttonParams = tokens.map((token) => {
            const key = token.replace(/[{}\s]/g, '');
            const value = Array.isArray(paramValues)
              ? paramValues[Number(key) - 1]
              : paramValues?.[key];
            return { type: 'text', text: String(value ?? '') };
          });
          components.push({
            type: 'button',
            sub_type: String(comp.sub_type).toLowerCase(),
            index: Number.isInteger(comp.index) ? comp.index : 0,
            parameters: buttonParams,
          });
        }
      }
    }
  }

  // Same for the newer BUTTONS container shape, which carries the sub-type on
  // each child rather than on the component itself.
  if (template.components) {
    const container = template.components.find((c) => c && c.type === 'BUTTONS');
    for (const button of container?.buttons ?? []) {
      const dynamicUrl = button.url ?? '';
      const tokens = dynamicUrl.match(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g) || [];
      if (!tokens.length) continue;
      const already = components.some((c) => c.type === 'button' && c.index === (button.index ?? 0));
      if (already) continue;
      const buttonParams = tokens.map((token) => {
        const key = token.replace(/[{}\s]/g, '');
        const value = Array.isArray(paramValues) ? paramValues[Number(key) - 1] : paramValues?.[key];
        return { type: 'text', text: String(value ?? '') };
      });
      components.push({
        type: 'button',
        sub_type: String(button.type || 'URL').toLowerCase(),
        index: Number.isInteger(button.index) ? button.index : 0,
        parameters: buttonParams,
      });
    }
  }

  // Keep what the donor will actually see, so the inbox can render the message
  // like WhatsApp does instead of only the template's internal name.
  const bodyDef = (template.components || []).find((c) => c.type === 'BODY');
  const headerDef = (template.components || []).find((c) => c.type === 'HEADER');
  const footerDef = (template.components || []).find((c) => c.type === 'FOOTER');
  const renderedBody = substituteTemplateText(bodyDef?.text, paramValues);
  const renderedHeader = headerDef?.format === 'TEXT'
    ? substituteTemplateText(headerDef.text, paramValues)
    : null;
  const headerMediaForChat = mediaHeaderOf(template.components)
    ? await presignTemplateHeader(await cacheTemplateHeader(project, templateName, mediaHeaderOf(template.components)))
    : null;

  const templateSummary = {
    kind: 'whatsapp_template',
    name: templateName,
    language: template?.language || 'en',
    category: template?.category || null,
    body: renderedBody,
    headerText: renderedHeader,
    footer: footerDef?.text || null,
    headerFormat: mediaHeaderOf(template.components)?.format || (headerDef?.format === 'TEXT' ? 'TEXT' : null),
    buttons: collectTemplateButtons(template.components).map((b) => ({
      ...b,
      // Store the URL the recipient will actually tap, not the raw template.
      url: b.url ? substituteTemplateText(b.url, paramValues) : null,
    })),
  };

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
      // The header is stored in the normal media columns so the existing
      // read-time re-sign keeps the attachment viewable after the signed URL
      // expires.
      media_url: headerMediaForChat || null,
      media_mime_type: headerMediaForChat ? mimeForHeader(mediaHeaderOf(template.components)?.format) : null,
      template_params: templateSummary,
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
          // Sits at the top level of the request, not inside `template` -- Meta
          // rejects the payload with "Unexpected key" if it is nested there.
          parameter_format: parameterFormat || undefined,
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
  const fileName = `fro_${froWorkerId}_${Date.now()}_${file.originalname || 'file'}`;
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

  // The bucket cannot serve anonymous reads: this account has S3 Block Public
  // Access on and the IAM user has neither s3:PutObjectAcl nor s3:PutBucketAcl
  // (both denied, verified). A plain getPublicUrl() therefore 403s and Meta
  // cannot download the attachment.
  //
  // So the URL is presigned instead -- the same pattern receipt documents already
  // use in messages.media_url (X-Amz-Expires=3600). Meta fetches the media
  // asynchronously but well inside an hour, which is exactly the window
  // receiptFileLink.js:DEFAULT_TTL_MS was chosen for.
  let publicUrl;
  try {
    // presignDownload resolves { data: { url, expiresAt }, error }.
    const { data: presigned, error: signErr } = await db.storage.from(bucket).presignDownload(fileName, 3600);
    if (signErr || !presigned?.url) {
      throw new Error(signErr?.message || 'presign returned no url');
    }
    publicUrl = presigned.url;
  } catch (signErr) {
    console.error('[uploadFroMedia] presign failed:', signErr.message);
    throw new Error(`Could not create a shareable link for the uploaded file: ${signErr.message}`);
  }

  const { data: record, error: recordError } = await db
    .from('media_library')
    .insert({
      name: file.originalname || fileName,
      file_url: publicUrl,
      file_type: file.mimetype,
      file_size: file.size,
    })
    .select()
    .single();
  if (recordError) throw recordError;

  return record;
}

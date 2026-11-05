import dns from 'node:dns';
import config from '../config/whatsappConfig.js';
import { postWhatsAppMessage } from '../lib/whatsappGraphSend.js';
import { getAccountByProject } from '../models/whatsappAccountModel.js';

// Windows machines with broken/partial IPv6 routes intermittently fail Node's
// fetch() with a bare "fetch failed" when talking to graph.facebook.com.
// Prefer IPv4 so media uploads (receipt PDFs) don't fail on the happy-eyeballs
// attempt. Safe no-op on platforms that ignore the setting.
try { dns.setDefaultResultOrder('ipv4first'); } catch { /* ignore */ }

function sanitizeUploadFileName(name) {
  const cleaned = String(name || 'document.pdf')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[<>:"/\\|?*\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || 'document.pdf';
}

function getApiBase(account) {
  const id = account?.phoneNumberId || account?.phone_number_id || config.phoneNumberId;
  return `https://graph.facebook.com/${config.apiVersion}/${id}/messages`;
}

function getAccessToken(account) {
  const token = (account?.accessToken || account?.access_token || config.accessToken || '').trim();
  if (token.startsWith('enc:')) throw new Error('WhatsApp access token is encrypted/invalid. Re-enter it in WhatsApp Accounts settings.');
  return token || null;
}

function getWabaId(account) {
  return account?.wabaId || account?.waba_id || config.wabaId;
}

function getTemplateLanguage(account) {
  return account?.templateLanguage || account?.template_language || config.templateLanguage;
}

export async function resolveAccount(project) {
  if (project) {
    try {
      const account = await getAccountByProject(project);
      if (account) return account;
    } catch (err) {
      console.error(`Failed to resolve WhatsApp account for project "${project}":`, err.message);
    }
    throw new Error(`No active WhatsApp account is configured for project "${project}". Add it under Accounts > WhatsApp before sending.`);
  }
  if (config.enabled) {
    return {
      phone_number_id: config.phoneNumberId,
      access_token: config.accessToken,
      waba_id: config.wabaId,
      template_name: config.receiptTemplate,
      template_language: config.templateLanguage,
      project: project || 'bsct',
    };
  }
  return null;
}

export async function sendMediaMessage(to, mediaUrl, mediaType = 'image', caption = '', account) {
  const resolved = account || await resolveAccount();
  if (!resolved) throw new Error('WhatsApp not configured');
  const type = mediaType === 'document'
    ? 'document'
    : mediaType === 'video'
      ? 'video'
      : mediaType === 'audio'
        ? 'audio'
        : 'image';
  const payload = { [type]: { link: mediaUrl } };
  // The Cloud API rejects captions on audio messages.
  if (caption && type !== 'audio') payload[type].caption = caption;
  return sendViaFacebook(to, type, payload, resolved);
}
export async function sendTextMessage(to, text, account) {
  if (!config.enabled && !account) throw new Error('WhatsApp not configured');

  const resolved = account || await resolveAccount();
  if (!resolved) throw new Error('WhatsApp not configured');

  return sendViaFacebook(to, 'text', { text: { body: text } }, resolved);
}

async function uploadBufferToMeta(account, buffer, contentType, fileName) {
  const token = getAccessToken(account);
  const phoneNumberId = account?.phone_number_id || account?.phoneNumberId || config.phoneNumberId;
  if (!token || !phoneNumberId) throw new Error('WhatsApp account not configured');

  const uploadUrl = `https://graph.facebook.com/${config.apiVersion}/${phoneNumberId}/media`;
  const safeFileName = sanitizeUploadFileName(fileName);
  const MAX_ATTEMPTS = 4;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // FormData/Body must be recreated per attempt — a consumed body cannot be
    // replayed after a network failure.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', contentType);
    form.append('file', new Blob([buffer], { type: contentType }), safeFileName);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: controller.signal,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (uploadRes.ok && uploadData?.id) return uploadData.id;

      const message = uploadData?.error?.message || `Media upload to Meta failed (HTTP ${uploadRes.status})`;
      const error = new Error(message);
      error.retryable = uploadRes.status === 429 || uploadRes.status >= 500;
      throw error;
    } catch (e) {
      lastError = e;
      const cause = e?.cause?.code || e?.cause?.errno || e?.cause?.message || e?.name || '';
      console.warn(`[whatsapp] media upload attempt ${attempt}/${MAX_ATTEMPTS} failed:`, e.message, cause || '');
      if (e?.retryable === false || attempt === MAX_ATTEMPTS) break;
      await new Promise(resolve => setTimeout(resolve, 800 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  const cause = lastError?.cause?.code || lastError?.cause?.errno || lastError?.cause?.message;
  throw new Error(
    `${lastError?.message || 'Media upload to Meta failed'}${cause ? ` (${cause})` : ''}`,
  );
}

/**
 * Upload a document straight to Meta and return its media id. The file is
 * never persisted in our storage — Meta keeps it only long enough to deliver
 * the message. Use this in template headers as `document: { id }` instead of
 * `{ link }` when no public/stored URL exists.
 */
export async function uploadDocumentBufferToMeta(account, buffer, fileName = 'receipt.pdf') {
  return uploadBufferToMeta(account, buffer, 'application/pdf', fileName);
}

async function uploadMediaToMeta(account, mediaUrl, mediaType = 'image') {
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) throw new Error('Failed to download media for upload');
  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  const contentType = mediaRes.headers.get('content-type') || (mediaType === 'image' ? 'image/jpeg' : 'application/pdf');
  return uploadBufferToMeta(account, buffer, contentType, mediaType === 'image' ? 'image.jpg' : 'document.pdf');
}

export async function sendTemplateMessage(to, templateName, parameters, lang = 'en', account, headerImageUrl = null, headerFormat = 'IMAGE') {
  if (!config.enabled && !account) throw new Error('WhatsApp not configured');

  const resolved = account || await resolveAccount();
  if (!resolved) throw new Error('WhatsApp not configured');

  const tplLang = lang || getTemplateLanguage(resolved);

  const components = [];
  if (headerImageUrl) {
    const mediaType = String(headerFormat || 'IMAGE').toUpperCase() === 'DOCUMENT' ? 'document' : 'image';
    const mediaId = await uploadMediaToMeta(resolved, headerImageUrl, mediaType);
    components.push({
      type: 'header',
      parameters: [{ type: mediaType, [mediaType]: { id: mediaId } }],
    });
  }
  if (Array.isArray(parameters) && parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: parameters.map(p => ({ type: 'text', text: String(p) })),
    });
  }

  const templatePayload = {
    name: templateName,
    language: { code: tplLang },
  };
  if (components.length > 0) templatePayload.components = components;

  return sendViaFacebook(to, 'template', {
    template: templatePayload,
  }, resolved);
}

export async function sendReceiptMessage(to, donorName, amount, receiptNo, date, headerMediaUrl, templateName, account, headerMediaId = null) {
  const formattedAmount = typeof amount === 'number' ? '\u20B9' + amount.toLocaleString('en-IN') : amount;
  const params = [donorName, formattedAmount, receiptNo, date];

  const resolved = account || await resolveAccount();
  if (!resolved) throw new Error('WhatsApp not configured');

  const tpl = templateName || resolved.template_name || config.whatsappTemplateName || config.receiptTemplate;

  const ngoMap = { bsct_receipt:'BeingSevak', mann_receipt:'MannCare', aflf_receipt:'Ashray', ashray_receipt:'Ashray' }
  const ngoPrefix = ngoMap[tpl] || 'Receipt'
  const safeName = String(donorName || 'Donor').replace(/[<>:"/\\|?*]/g, '_').trim()
  const fileName = `${ngoPrefix}_${safeName}_${receiptNo || 'receipt'}.pdf`

  const components = [];
  if (headerMediaId) {
    // Uploaded straight to Meta — no stored URL involved.
    components.push({ type: 'header', parameters: [{ type: 'document', document: { id: headerMediaId, filename: fileName } }] });
  } else if (headerMediaUrl) {
    components.push({ type: 'header', parameters: [{ type: 'document', document: { link: headerMediaUrl, filename: fileName } }] });
  }
  components.push({
    type: 'body',
    parameters: params.map(p => ({ type: 'text', text: String(p) })),
  });

  return sendViaFacebook(to, 'template', {
    template: { name: tpl, language: { code: getTemplateLanguage(resolved) }, components },
  }, resolved);
}

export async function sendNgoInfoTemplate(to, name, account) {
  const ngoName = 'Being Sevak Charitable Trust';
  const num1 = '8879035035';
  const num2 = '8879034034';
  const email = 'being.sevak@gmail.com';
  const params = [ngoName, name, ngoName, num1, num2, email];

  const resolved = account || await resolveAccount();
  if (!resolved) throw new Error('WhatsApp not configured');

  return sendViaFacebook(to, 'template', {
    template: {
      name: 'ngo_information',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: params.map(p => ({ type: 'text', text: String(p) })),
        },
      ],
    },
  }, resolved);
}

export async function sendDocumentMessage(to, documentUrl, caption, filename, account) {
  if (!config.enabled && !account) throw new Error('WhatsApp not configured');

  const resolved = account || await resolveAccount();
  if (!resolved) throw new Error('WhatsApp not configured');

  return sendViaFacebook(to, 'document', {
    document: {
      link: documentUrl,
      caption: caption || '',
      filename: filename || 'receipt.pdf',
    },
  }, resolved);
}

export function buildInteractivePayload({ type = 'button', bodyText, headerText, footerText, buttons = [], sections = [], listButtonTitle }) {
  const interactive = { type };

  if (headerText) interactive.header = { type: 'text', text: String(headerText) };
  interactive.body = { text: String(bodyText || '') };
  if (footerText) interactive.footer = { text: String(footerText) };

  if (type === 'button') {
    if (!buttons.length || buttons.length > 3) throw new Error('button replies need 1-3 buttons');
    interactive.action = {
      buttons: buttons.map((b) => ({ type: 'reply', reply: { id: String(b.id), title: String(b.title).slice(0, 20) } })),
    };
  } else if (type === 'list') {
    if (!sections.length) throw new Error('list replies need at least one section');
    interactive.action = {
      button: String(listButtonTitle || 'Options').slice(0, 20),
      sections: sections.map((s, i) => ({
        title: String(s.title || `Section ${i + 1}`).slice(0, 24),
        rows: (s.rows || []).slice(0, 10).map((r) => ({
          id: String(r.id),
          title: String(r.title).slice(0, 24),
          ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
        })),
      })),
    };
  } else {
    throw new Error('type must be "button" or "list"');
  }

  return interactive;
}

async function sendWithHeaderMedia(to, templateName, params, headerMediaUrl, account) {
  const resolved = account || await resolveAccount();
  if (!resolved) throw new Error('WhatsApp not configured');

  return sendViaFacebook(to, 'template', {
    template: {
      name: templateName,
      language: { code: getTemplateLanguage(resolved) },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'document', document: { link: headerMediaUrl, filename: 'receipt.pdf' } }],
        },
        {
          type: 'body',
          parameters: params.map(p => ({ type: 'text', text: String(p) })),
        },
      ],
    },
  }, resolved);
}

// Connection-level failures happen before Meta receives the request, so
// retrying them cannot duplicate a message. A reset *after* sending is
// deliberately not retried (the message may already have been accepted).
const SAFE_CONNECT_RETRY_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

async function sendViaFacebook(to, type, payload, account) {
  const body = {
    messaging_product: 'whatsapp',
    to: String(to).replace(/[^0-9]/g, ''),
    type,
    ...payload,
  };

  const apiBase = getApiBase(account);
  const token = getAccessToken(account);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await postWhatsAppMessage(apiBase, token, body);
    } catch (error) {
      const code = error?.cause?.code;
      if (!SAFE_CONNECT_RETRY_CODES.has(code) || attempt === MAX_ATTEMPTS) throw error;
      console.warn(`[whatsapp] send attempt ${attempt}/${MAX_ATTEMPTS} failed (${code}); retrying`);
      await new Promise(resolve => setTimeout(resolve, 600 * attempt));
    }
  }
  throw new Error('WhatsApp send failed');
}

export async function testConnection(account) {
  const resolved = account || await resolveAccount();
  if (!resolved) return { success: false, message: 'WhatsApp not configured' };

  const apiBase = getApiBase(resolved);
  const token = getAccessToken(resolved);

  try {
    const phoneId = resolved.phone_number_id || resolved.phoneNumberId;
    const res = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${phoneId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.error?.message || 'Connection failed' };
    return { success: true, message: `Phone: ${data.display_phone_number || data.id || 'OK'}` };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export async function listTemplatesForAccount(account) {
  const wabaId = getWabaId(account);
  const token = getAccessToken(account);

  const tplRes = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${wabaId}/message_templates?fields=name,language,status,components`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!tplRes.ok) { const e = await tplRes.text(); throw new Error('Meta API: ' + e); }

  const { data } = await tplRes.json();
  return (data || []).filter(t => t.status === 'APPROVED').map(t => ({ name: t.name, language: t.language, components: t.components || [] }));
}
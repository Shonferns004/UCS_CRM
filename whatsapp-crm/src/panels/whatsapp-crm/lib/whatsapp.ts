import { supabase } from './supabase';

const META_API = 'https://graph.facebook.com/v23.0';

export function extractPlaceholders(text: string): number {
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

function extractParamKeys(text: string): string[] {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  return matches.map(m => m).filter(k => { if (seen.has(k)) return false; seen.add(k); return true; });
}

function isWithin24Hours(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

async function uploadMedia(accessToken: string, phoneNumberId: string, file: File): Promise<string | null> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', file, file.name);
  form.append('type', file.type);
  try {
    const r = await fetch(`${META_API}/${phoneNumberId}/media`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form,
    });
    const d = await r.json();
    return d.id || null;
  } catch { return null; }
}

export async function sendWhatsAppMessage(
  conversationId: string,
  contactId: string,
  messageText?: string,
  mediaFile?: File | null,
  userId?: string,
): Promise<boolean> {
  try {
    const { data: conv } = await supabase.from('conversations').select('last_inbound_at').eq('id', conversationId).maybeSingle();
    const { data: contact } = await supabase.from('contacts').select('phone_normalized').eq('id', contactId).maybeSingle();
    if (!contact?.phone_normalized) return false;

    const windowOpen = isWithin24Hours(conv?.last_inbound_at);

    const accounts: { phone_number_id: string; access_token: string }[] = [];

    if (userId) {
      const { data: assignments } = await supabase.from('agent_phone_assignments').select('account_id').eq('user_id', userId);
      if (assignments && assignments.length > 0) {
        const ids = assignments.map((a: any) => a.account_id);
        const { data } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token').in('id', ids);
        if (data) accounts.push(...data);
      }
    }

    if (accounts.length === 0) {
      const { data: fallback } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token');
      if (fallback) accounts.push(...fallback);
    }

    let mediaId: string | null = null;

    for (const acct of accounts) {
      const { phone_number_id, access_token } = acct;
      const payloads: any[] = [];

      if (mediaFile) {
        mediaId = await uploadMedia(access_token, phone_number_id, mediaFile);
        if (mediaId) {
          const fileType = mediaFile.type.startsWith('image/') ? 'image' : mediaFile.type.startsWith('video/') ? 'video' : 'document';
          const p: any = { messaging_product: 'whatsapp', to: contact.phone_normalized, type: fileType, [fileType]: { id: mediaId } };
          if (messageText) p[fileType].caption = messageText;
          payloads.push(p);
        }
      } else if (!windowOpen) {
        payloads.push(
          { messaging_product: 'whatsapp', to: contact.phone_normalized, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } },
          { messaging_product: 'whatsapp', to: contact.phone_normalized, type: 'text', text: { body: messageText || '' } }
        );
      } else {
        payloads.push({ messaging_product: 'whatsapp', to: contact.phone_normalized, type: 'text', text: { body: messageText || '' } });
      }

      for (const p of payloads) {
        let res: Response;
        let result: any;
        try {
          res = await fetch(`${META_API}/${phone_number_id}/messages`, {
            method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(p),
          });
          result = await res.json();
        } catch {
          continue;
        }
        console.log('Meta API response:', res.status, JSON.stringify(result).slice(0, 200));
        if (res.ok && result.messages?.[0]?.id) {
          const updates: any = { status: 'sent', wa_message_id: result.messages[0].id, status_updated_at: new Date().toISOString() };
          if (mediaId) { updates.media_id = mediaId; updates.media_mime_type = mediaFile?.type; }
          try { await supabase.from('messages').update(updates).eq('conversation_id', conversationId).eq('status', 'queued'); } catch {}
          if (userId) { try { await supabase.from('conversations').update({ assigned_agent_id: userId }).eq('id', conversationId).is('assigned_agent_id', null); } catch {} }
          return true;
        }
      }
    }

    await supabase.from('messages').update({ status: 'failed', failure_reason: 'All accounts failed' }).eq('conversation_id', conversationId).eq('status', 'queued');
    return false;
  } catch {
    await supabase.from('messages').update({ status: 'failed', failure_reason: 'Network error' }).eq('conversation_id', conversationId).eq('status', 'queued');
    return false;
  }
}

async function fetchMetaTemplateComponents(
  wabaId: string,
  accessToken: string,
  templateName: string,
): Promise<any[]> {
  try {
    const res = await fetch(`${META_API}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (data.data?.[0]?.components) return data.data[0].components;
    return [];
  } catch {
    return [];
  }
}

function buildTemplateComponents(
  metaComps: any[],
  paramValues: Record<string, string>,
): any[] {
  const result: any[] = [];
  for (const comp of metaComps) {
    const type = (comp.type || '').toLowerCase();
    if (type === 'button') continue;
    const text: string = comp.text || '';
    const format: string = (comp.format || '').toUpperCase();

    if (type === 'header') {
      if (format === 'DOCUMENT' || format === 'IMAGE' || format === 'VIDEO') {
        if (comp.example?.header_handle) {
          result.push({
            type,
            parameters: [{ type: format.toLowerCase(), [format.toLowerCase()]: { link: comp.example.header_handle } }],
          });
        }
      } else {
        const count = extractPlaceholders(text);
        if (count > 0) {
          const params: any[] = [];
          for (let i = 1; i <= count; i++) {
            params.push({ type: 'text', text: paramValues[`header_${i}`] || paramValues[String(i)] || '' });
          }
          result.push({ type, parameters: params });
        }
      }
    } else {
      const count = extractPlaceholders(text);
      if (count > 0) {
        const params: any[] = [];
        for (let i = 1; i <= count; i++) {
          params.push({ type: 'text', text: paramValues[String(i)] || '' });
        }
        result.push({ type, parameters: params });
      }
    }
  }
  return result;
}

export async function sendWhatsAppTemplate(
  conversationId: string,
  contactId: string,
  template: {
    id: number;
    name: string;
    language: string;
    components: any[];
  },
  paramValues: Record<string, string>,
  userId?: string,
): Promise<boolean> {
  const msgId = crypto.randomUUID();
  try {
    const { data: contact } = await supabase.from('contacts').select('phone_normalized, tenant_id').eq('id', contactId).maybeSingle();
    if (!contact?.phone_normalized) return false;

    const tenantId = contact.tenant_id;

    await supabase.from('messages').insert({
      id: msgId,
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      user_id: userId,
      direction: 'outbound',
      message_type: 'template',
      body_text: template.name,
      template_id: String(template.id),
      template_params: paramValues,
      status: 'queued',
      message_category: 'service',
    });

    const accounts: { phone_number_id: string; access_token: string; waba_id: string }[] = [];
    if (userId) {
      const { data: assignments } = await supabase.from('agent_phone_assignments').select('account_id').eq('user_id', userId);
      if (assignments && assignments.length > 0) {
        const ids = assignments.map((a: any) => a.account_id);
        const { data } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token, waba_id').in('id', ids);
        if (data) accounts.push(...data);
      }
    }
    if (accounts.length === 0) {
      const { data: fallback } = await supabase.from('whatsapp_accounts').select('phone_number_id, access_token, waba_id');
      if (fallback) accounts.push(...fallback);
    }

    let metaComps = template.components || [];
    if (metaComps.length === 0 && accounts.length > 0) {
      metaComps = await fetchMetaTemplateComponents(accounts[0].waba_id, accounts[0].access_token, template.name);
    }

    const sendComponents = buildTemplateComponents(metaComps, paramValues);

    for (const acct of accounts) {
      const payload: any = {
        messaging_product: 'whatsapp',
        to: contact.phone_normalized,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language },
        },
      };
      if (sendComponents.length > 0) {
        payload.template.components = sendComponents;
      }

      let res: Response;
      let result: any;
      try {
        res = await fetch(`${META_API}/${acct.phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${acct.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        result = await res.json();
      } catch {
        continue;
      }

      console.log('Meta template response:', res.status, JSON.stringify(result));
      if (res.ok && result.messages?.[0]?.id) {
        await supabase.from('messages').update({
          status: 'sent',
          wa_message_id: result.messages[0].id,
          status_updated_at: new Date().toISOString(),
        }).eq('id', msgId);
        if (userId) {
          try { await supabase.from('conversations').update({ assigned_agent_id: userId }).eq('id', conversationId).is('assigned_agent_id', null); } catch {}
        }
        return true;
      }
    }

    const reason = 'Template send failed. Check console for Meta API error.';
    await supabase.from('messages').update({ status: 'failed', failure_reason: reason }).eq('id', msgId);
    return false;
  } catch (err) {
    console.error('sendWhatsAppTemplate error:', err);
    await supabase.from('messages').update({ status: 'failed', failure_reason: 'Network error' }).eq('id', msgId);
    return false;
  }
}

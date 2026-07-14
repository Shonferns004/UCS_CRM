import { supabase } from './supabase';
import { toast } from 'sonner';

const META_API_VERSION = 'v23.0';

function isWithin24Hours(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 24 * 60 * 60 * 1000;
}

export async function sendWhatsAppMessage(
  conversationId: string,
  contactId: string,
  messageText?: string,
  mediaUrl?: string | null,
  mediaMimeType?: string | null
): Promise<boolean> {
  try {
    const { data: accounts } = await supabase
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .limit(1);

    if (!accounts?.[0]) return false;

    const { phone_number_id, access_token } = accounts[0];

    const { data: contact } = await supabase
      .from('contacts')
      .select('phone_normalized')
      .eq('id', contactId)
      .maybeSingle();

    if (!contact?.phone_normalized) return false;

    const { data: conv } = await supabase
      .from('conversations')
      .select('last_inbound_at')
      .eq('id', conversationId)
      .maybeSingle();

    const windowOpen = isWithin24Hours(conv?.last_inbound_at);

    let payload: any;

    if (!windowOpen && !mediaUrl) {
      payload = {
        messaging_product: 'whatsapp',
        to: contact.phone_normalized,
        type: 'template',
        template: {
          name: 'hello_world',
          language: { code: 'en_US' },
        },
      };
    } else if (mediaUrl && mediaMimeType) {
      const type = mediaMimeType.startsWith('image/') ? 'image'
        : mediaMimeType.startsWith('video/') ? 'video'
        : mediaMimeType.startsWith('audio/') ? 'audio'
        : 'document';
      payload = {
        messaging_product: 'whatsapp',
        to: contact.phone_normalized,
        type,
        [type]: { link: mediaUrl },
      };
      if (messageText) payload[type].caption = messageText;
    } else {
      payload = {
        messaging_product: 'whatsapp',
        to: contact.phone_normalized,
        type: 'text',
        text: { body: messageText || '' },
      };
    }

    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (res.ok && result.messages?.[0]?.id) {
      const isTemplate = !!payload.template;
      await supabase
        .from('messages')
        .update({
          status: isTemplate ? 'sent' : 'sent',
          wa_message_id: result.messages[0].id,
          status_updated_at: new Date().toISOString(),
        })
        .eq('conversation_id', conversationId)
        .eq('status', 'queued');

      if (!windowOpen && !mediaUrl) {
        toast.info('Sent via template (24hr window closed). Ask donor to reply to open chat.');
      }

      return true;
    }

    await supabase
      .from('messages')
      .update({ status: 'failed', failure_reason: result.error?.message || 'Meta API error' })
      .eq('conversation_id', conversationId)
      .eq('status', 'queued');
    return false;
  } catch {
    await supabase
      .from('messages')
      .update({ status: 'failed', failure_reason: 'Network error' })
      .eq('conversation_id', conversationId)
      .eq('status', 'queued');
    return false;
  }
}

import db from '../config/db.js';
import { getAccountByPhoneNumberId } from '../models/whatsappAccountModel.js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'ucscompany123';

export function verifyWhatsAppWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
}

export async function whatsappWebhookEntry(req, res) {
  try {
    const body = req.body || {};
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const phoneNumberId = value?.metadata?.phone_number_id;

    let accountProject = 'unknown';
    if (phoneNumberId) {
      const account = await getAccountByPhoneNumberId(phoneNumberId);
      if (account?.project) accountProject = account.project;
    }

    await db.from('whatsapp_webhook_logs').insert({
      direction: 'inbound',
      event_type: changes?.field || 'unknown',
      payload: body,
      processed: false,
      account_project: accountProject,
    });

    if (changes?.field === 'messages' && value?.messages) {
      for (const message of value.messages) {
        const from = message.from;
        let bodyText = message.text?.body || null;

        if (message.type === 'image') bodyText = message.image?.caption || '[Image]';
        else if (message.type === 'video') bodyText = message.video?.caption || '[Video]';
        else if (message.type === 'audio') bodyText = '[Audio]';
        else if (message.type === 'document') bodyText = message.document?.caption || '[Document]';
        else if (message.type === 'sticker') bodyText = '[Sticker]';

        let { data: contact } = await db
          .from('contacts')
          .select('*')
          .eq('phone_normalized', from)
          .maybeSingle();

        if (!contact) {
          const { data: newContact, error: contactErr } = await db
            .from('contacts')
            .insert({
              phone: from,
              phone_normalized: from,
              wa_profile_name: value.contacts?.[0]?.profile?.name,
              source: 'whatsapp',
              project: accountProject !== 'unknown' ? accountProject : null,
            })
            .select()
            .single();
          if (contactErr) throw contactErr;
          contact = newContact;
        }

        const projectFilter = accountProject !== 'unknown' ? accountProject : null;
        let query = db
          .from('conversations')
          .select('*')
          .eq('contact_id', contact.id)
          .eq('status', 'open');
        if (projectFilter) query = query.eq('project', projectFilter);
        else query = query.is('project', null);
        const { data: conversation } = await query.maybeSingle();

        let activeConversation = conversation;
        if (!activeConversation) {
          const { data: newConversation, error: convErr } = await db
            .from('conversations')
            .insert({
              contact_id: contact.id,
              status: 'open',
              last_message_at: new Date().toISOString(),
              last_inbound_at: new Date().toISOString(),
              project: accountProject !== 'unknown' ? accountProject : null,
            })
            .select()
            .single();
          if (convErr) throw convErr;
          activeConversation = newConversation;
        }

        const mediaId = message[message.type]?.id || null;
        const mediaMimeType = message[message.type]?.mime_type || null;

        const { data: newMessage, error: msgError } = await db.from('messages').insert({
          conversation_id: activeConversation.id,
          contact_id: contact.id,
          direction: 'inbound',
          message_type: message.type,
          body_text: bodyText,
          wa_message_id: message.id,
          media_id: mediaId,
          media_mime_type: mediaMimeType,
          status: 'delivered',
          message_category: 'service',
        }).select().single();

        if (msgError) throw msgError;

        if (mediaId && ['image', 'video', 'audio', 'document', 'sticker'].includes(message.type)) {
          try {
            const waAccount = await getAccountByPhoneNumberId(phoneNumberId);
            if (waAccount?.access_token) {
              const infoRes = await fetch(
                `https://graph.facebook.com/v23.0/${mediaId}`,
                { headers: { Authorization: `Bearer ${waAccount.access_token}` } }
              );
              const info = await infoRes.json();
              if (infoRes.ok && info.url) {
                const dlRes = await fetch(info.url, {
                  headers: { Authorization: `Bearer ${waAccount.access_token}` },
                });
                if (dlRes.ok) {
                  const buffer = Buffer.from(await dlRes.arrayBuffer());
                  const ext = (mediaMimeType?.split('/')[1] || 'bin').split(';')[0].trim();
                  const fileName = `webhook_${message.id}.${ext}`;

                  const { error: uploadError } = await db.storage
                    .from('whatsapp-media')
                    .upload(fileName, buffer, { contentType: mediaMimeType, upsert: true });
                  if (!uploadError) {
                    const { data: publicUrl } = db.storage
                      .from('whatsapp-media')
                      .getPublicUrl(fileName);
                    if (publicUrl?.publicUrl) {
                      await db.from('messages').update({
                        media_url: publicUrl.publicUrl,
                      }).eq('id', newMessage.id);
                    }
                  }
                }
              }
            }
          } catch (mediaErr) {
            console.error('Failed to download/upload media:', mediaErr);
          }
        }

        await db
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_inbound_at: new Date().toISOString(),
          })
          .eq('id', activeConversation.id);
      }
    }

    if ((changes?.field === 'messages' || changes?.field === 'message_status') && value?.statuses) {
      for (const status of value.statuses) {
        const update = {
          status: status.status,
          status_updated_at: new Date().toISOString(),
        };
        if (status.status === 'failed' && status.errors?.length > 0) {
          update.failure_reason = `(${status.errors[0].code}) ${status.errors[0].message}`;
        }
        await db
          .from('messages')
          .update(update)
          .eq('wa_message_id', status.id);
      }
    }

    await db
      .from('whatsapp_webhook_logs')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(1);

    res.json({ success: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({ error: error.message });
  }
}

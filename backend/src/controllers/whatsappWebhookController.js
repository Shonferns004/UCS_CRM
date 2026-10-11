import db from '../config/db.js';
import { getAccountByPhoneNumberId } from '../models/whatsappAccountModel.js';
import { handleInboundForAi } from '../services/aiReplyService.js';
import { applyRouting } from '../services/routingService.js';
import { runAutomationForInbound } from '../services/whatsappAutomationService.js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'ucscompany123';

// Delivery states only ever move forward through this list. Mirrors
// WA_STATUS_RANK in whatsappController.js, which already guards the send path;
// the webhook path had no equivalent, so a redelivered 'sent' could undo a
// 'read'. 'failed' is deliberately absent: it is terminal rather than a rank.
const WA_STATUS_RANK = {
  queued: 1,
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
};

/**
 * Map one `calls` webhook event onto our whatsapp_calls row.
 *
 * Meta sends the action in `event` (connect / ring / accept / reject /
 * terminate) and only puts an outcome in `status` on terminate
 * (COMPLETED / FAILED). Reading `status` as the action drops every connect
 * event, which is exactly how an inbound call became invisible: the row was
 * never created so the inbox had nothing to ring.
 *
 * Meta also redelivers, so each branch re-finds the row by provider id or by
 * the client_ref we supplied, and terminal states are sticky.
 */
const CALL_TERMINAL = new Set(['terminated', 'rejected', 'failed', 'missed', 'expired']);

/** Meta's `event` value -> the status we store. */
function statusFromCallEvent(action) {
  switch (action) {
    case 'connect':
    case 'connect_webhook':
      return 'ringing';
    case 'ring':
      return 'ringing';
    case 'pre_accept':
      return 'accepted';
    case 'accept':
      return 'accepted';
    case 'reject':
      return 'rejected';
    case 'terminate':
      return 'terminated';
    case 'expire':
      return 'expired';
    case 'fail':
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

/** `terminate` carries the real outcome here; connect events have no status. */
function outcomeFromCallStatus(rawStatus) {
  const s = String(rawStatus || '').toUpperCase();
  if (s === 'FAILED') return 'failed';
  if (s === 'MISSED') return 'missed';
  if (s === 'EXPIRED') return 'expired';
  if (s === 'COMPLETED') return 'terminated';
  return null;
}

async function handleCallEvent(raw, accountProject, calling) {
  const action = String(raw?.event || '').toLowerCase();
  const providerCallId = raw?.id || null;
  const clientRef = raw?.biz_opaque_callback_data || null;
  const from = String(raw?.from || '').replace(/\D/g, '');

  if (!action && !raw?.status) return;

  const now = new Date();
  const occurredAt = raw?.timestamp
    ? new Date(Number(raw.timestamp) * 1000).toISOString()
    : now.toISOString();
  // USER_INITIATED means the donor dialled us.
  const direction = String(raw?.direction || '').toUpperCase() === 'USER_INITIATED'
    ? 'inbound'
    : 'outbound';

  const existing = await calling.findCall({ providerCallId, clientRef });

  // First time we see this call: create the row so the inbox can ring it.
  if (!existing) {
    if (action !== 'connect' && action !== 'connect_webhook' && action !== 'ring') return;

    let conversationId = null;
    let contactId = null;
    if (from) {
      const { data: contact } = await db
        .from('contacts')
        .select('id')
        .eq('phone_normalized', from)
        .maybeSingle();
      contactId = contact?.id || null;
      if (contactId) {
        const { data: conv } = await db
          .from('conversations')
          .select('id')
          .eq('contact_id', contactId)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        conversationId = conv?.id || null;
      }
    }

    // Meta redelivers; the unique provider_call_id index is the real guard and
    // losing the race against the first delivery is fine.
    try {
      await calling.createCallRow({
        project: accountProject,
        conversation_id: conversationId,
        contact_id: contactId,
        contact_wa_id: from || null,
        provider_call_id: providerCallId,
        client_ref: clientRef,
        direction,
        status: 'ringing',
        sdp_offer: raw?.session?.sdp || null,
        started_at: occurredAt,
      });
    } catch (err) {
      console.warn('[call-event] duplicate inbound call ignored:', err.code || err.message);
    }
    return;
  }

  // A call we started and Meta is now ringing: attach the id we learn here.
  const patch = {};
  if (providerCallId && !existing.provider_call_id) patch.provider_call_id = providerCallId;
  if (raw?.session?.sdp && !existing.sdp_offer) patch.sdp_offer = raw.session.sdp;

  // Meta answers OUR offer when we place an outbound call. Without storing that
  // answer the browser can never complete the handshake, so the call rings and
  // then stays silent -- which is exactly what it looked like from the inbox.
  if (raw?.session?.sdp_type === 'answer' && raw.session.sdp && raw.session.sdp !== existing.sdp_answer) {
    patch.sdp_answer = raw.session.sdp;
    if (!existing.answered_at) patch.answered_at = occurredAt;
    patch.status = 'connected';
  }

  const mapped = outcomeFromCallStatus(raw?.status) || statusFromCallEvent(action);
  if (mapped) {
    patch.status = mapped;
    if (['accepted', 'connected'].includes(mapped) && !existing.answered_at) {
      patch.answered_at = occurredAt;
    }
    if (CALL_TERMINAL.has(mapped)) {
      patch.ended_at = occurredAt;
      patch.end_reason = action || mapped;
      // Meta reports the authoritative talk time on terminate; fall back to our
      // own clock only when it does not.
      const metaDuration = Number(raw?.duration);
      if (Number.isFinite(metaDuration) && metaDuration > 0) {
        patch.duration_seconds = Math.round(metaDuration);
      } else {
        const answeredAt = existing.answered_at ? new Date(existing.answered_at) : null;
        const startedAt = existing.started_at ? new Date(existing.started_at) : null;
        const reference = answeredAt || startedAt;
        patch.duration_seconds = reference
          ? Math.max(0, Math.round((new Date(occurredAt) - reference) / 1000))
          : null;
      }
      if (mapped === 'failed') {
        patch.failure_reason = raw?.errors?.[0]?.message || raw?.status || 'Call failed';
      }
    }
  }

  // Nothing changed (e.g. a bare ring we already recorded) -> skip the write.
  if (Object.keys(patch).length === 0) return;

  // Never resurrect a call the agent already ended.
  if (CALL_TERMINAL.has(existing.status) && !CALL_TERMINAL.has(patch.status || '')) return;

  await calling.updateCallRow(existing.id, patch);
}

export function verifyWhatsAppWebhook(req, res) {
  const mode = req.query['hub.mode'];  const token = req.query['hub.verify_token'];
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
        else if (message.type === 'button') bodyText = `[Button: ${message.button?.text || message.button?.payload || ''}]`;
        else if (message.type === 'interactive') {
          const reply = message.interactive?.button_reply || message.interactive?.list_reply;
          bodyText = reply ? `[Reply: ${reply.title}]` : '[Interactive]';
        }

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
                    // getPublicUrl() yields an unsigned URL, and the bucket's
                    // public access is blocked (s3:PutObjectAcl denied), so it
                    // 403s and inbound attachments never render in the inbox.
                    // Presign the same way outgoing replies do.
                    const { data: presigned, error: signErr } = await db.storage
                      .from('whatsapp-media')
                      .presignDownload(fileName, 3600);
                    if (!signErr && presigned?.url) {
                      await db.from('messages').update({
                        media_url: presigned.url,
                        media_mime_type: mediaMimeType,
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
            // An inbound message is by definition unread by the inbox. Nothing
            // else in the codebase ever raised this counter, so it stayed at its
            // column default of 0 and every unread badge in the CRM was dead.
            // markConversationRead() is the only other writer, and it writes 0.
            unread_count: (activeConversation.unread_count || 0) + 1,
          })
          .eq('id', activeConversation.id);

        const routingProject = accountProject !== 'unknown' ? accountProject : (contact.project || 'bsct');
        if (!activeConversation.assigned_agent_id) {
          await applyRouting(activeConversation.id, bodyText, routingProject);
          if (bodyText && !bodyText.startsWith('[')) {
            const { data: refreshed } = await db
              .from('conversations')
              .select('*')
              .eq('id', activeConversation.id)
              .single();
            if (refreshed) activeConversation = refreshed;
          }
        }

        await handleInboundForAi({ conversation: activeConversation, contact, inboundMessage: newMessage });

        // Keyword automations. This is an UNATTENDED send, so it is deliberately
        // placed after persistence and behind a service that checks its own
        // `enabled` flag before it looks at a single rule -- migration 183 seeds
        // that flag false, so this call is inert until an admin turns it on.
        // Wrapped in its own try/catch: a failed auto-reply must never turn a
        // successfully delivered inbound into a 500, because Meta would then
        // redeliver it and the customer could be messaged again.
        if (message.type === 'text' && bodyText) {
          try {
            await runAutomationForInbound({
              conversationId: activeConversation.id,
              contactId: contact.id,
              triggerMessageId: newMessage.id,
              inboundText: bodyText,
              recipientPhone: contact.phone_normalized || contact.phone,
              project: routingProject,
            });
          } catch (automationErr) {
            console.error('[automation] run failed:', automationErr?.message);
          }
        }
      }
    }

    if ((changes?.field === 'messages' || changes?.field === 'message_status') && value?.statuses) {
      for (const status of value.statuses) {
        const failureReason = (status.status === 'failed' && status.errors?.length > 0)
          ? `(${status.errors[0].code}) ${status.errors[0].message}`
          : null;

        // Status frames arrive out of order and Meta redelivers them. Previously
        // the last frame to land simply won, so a 'sent' arriving after 'read'
        // walked the message back to a single tick and the read receipt was
        // lost for good. Apply the same monotonic rule the send path already
        // uses in whatsappController.js (WA_STATUS_RANK): only ever move
        // forward, 'failed' is terminal, and 'failed' never beats 'read'.
        //
        // The guard is a compare-and-swap: the update only matches while the
        // status we read is still the status in the row, so two webhook frames
        // racing on the same message cannot both apply.
        const { data: targets } = await db
          .from('messages')
          .select('id, status')
          .eq('wa_message_id', status.id)
          .eq('direction', 'outbound');

        for (const row of targets || []) {
          const current = row.status || 'queued';
          const incoming = WA_STATUS_RANK[status.status];
          const currentRank = WA_STATUS_RANK[current];

          if (current === 'failed') continue;                       // terminal
          if (status.status === 'failed') {
            if (current === 'read') continue;                       // read beats failure
          } else if (incoming !== undefined && currentRank !== undefined && currentRank > incoming) {
            continue;                                               // never move backwards
          }

          const update = {
            status: status.status,
            status_updated_at: new Date().toISOString(),
          };
          if (failureReason) update.failure_reason = failureReason;

          await db
            .from('messages')
            .update(update)
            .eq('id', row.id)
            .eq('status', current);
        }

        await db
          .from('whatsapp_broadcast_recipients')
          .update({
            status: status.status,
            failure_reason: failureReason,
            status_updated_at: new Date().toISOString(),
          })
          .eq('wa_message_id', status.id);

        // Receipts are sent straight to a donor's phone, often to someone who
        // has never messaged the NGO, so there may be no `messages` row above for
        // this wamid at all. Recording the verdict on the receipt itself is what
        // lets the Accounts panel show a real delivery status instead of a green
        // tick that Meta later contradicts with error 131053.
        //
        // sent=false on failure is load-bearing: getPendingReceipts() keys off
        // it, so a failed receipt walks itself back into the pending queue for a
        // retry instead of disappearing into history with no explanation.
        const receiptPatch = {
          wa_status: status.status,
          wa_status_at: new Date().toISOString(),
          wa_failure_reason: status.status === 'failed' ? failureReason : null,
        };
        if (status.status === 'failed') {
          receiptPatch.sent = false;
          receiptPatch.sent_at = null;
        }
        await db
          .from('receipts')
          .update(receiptPatch)
          .eq('wa_message_id', status.id);
      }
    }

    // Calling arrives on its own `calls` field, separate from messages. Without
    // this an inbound call would be dropped and the agent would never see it
    // ring.
    if (changes?.field === 'calls' && Array.isArray(value?.calls)) {
      const calling = await import('../services/whatsappCallingService.js');
      for (const event of value.calls) {
        try {
          await handleCallEvent(event, accountProject, calling);
        } catch (callError) {
          console.error('[webhook] call event failed:', callError.message);
        }
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

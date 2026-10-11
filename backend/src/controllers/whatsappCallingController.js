import db from '../config/db.js';
import {
  getCallingAccount,
  getCallingSettings,
  getCallPermission,
  sendCallPermissionRequest,
  createCallRow,
  updateCallRow,
  findCall,
  initiateCall,
  acceptCall,
  rejectCall,
  terminateCall,
  listActiveCalls,
  listCallHistory,
  describeCallingError,
} from '../services/whatsappCallingService.js';

/**
 * Resolve the conversation + donor's WhatsApp id and the account that would
 * handle the call, so every endpoint shares the same preconditions.
 */
async function resolveTarget(req) {
  const { conversationId } = req.body;
  if (!conversationId) {
    return { error: { status: 400, message: 'conversationId is required' } };
  }

  const { data: conversation, error } = await db
    .from('conversations')
    .select('id, project, contact_id, contact:contacts(id, phone, phone_normalized, wa_profile_name, project)')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conversation) return { error: { status: 404, message: 'Conversation not found' } };

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const contactWaId = contact?.phone_normalized || contact?.phone;
  if (!contactWaId) return { error: { status: 400, message: 'This contact has no WhatsApp number' } };

  const project = conversation.project || contact?.project;
  const account = await getCallingAccount(project);
  if (!account) {
    return { error: { status: 400, message: `No active WhatsApp number is configured for "${project}"` } };
  }

  return { conversation, contact, contactWaId, project, account };
}

function toDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** What the inbox needs before it shows the call button. */
export async function callingStatus(req, res) {
  try {
    const { conversationId } = req.body;
    if (!conversationId) return res.status(400).json({ message: 'conversationId is required' });

    const { data: conversation } = await db
      .from('conversations')
      .select('id, project, contact:contacts(phone, phone_normalized, project)')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
    const contactWaId = contact?.phone_normalized || contact?.phone;
    const project = conversation.project || contact?.project;
    const account = await getCallingAccount(project);
    if (!account) {
      return res.json({ available: false, reason: `No WhatsApp number is configured for "${project}"` });
    }

    const settings = await getCallingSettings(account);
    if (!settings.enabled) {
      return res.json({
        available: false,
        reason: 'Calling is not enabled on this WhatsApp number.',
        settings,
      });
    }
    if (!contactWaId) {
      return res.json({ available: false, reason: 'This contact has no WhatsApp number', settings });
    }

    const permission = await getCallPermission(account, toDigits(contactWaId));
    return res.json({
      available: permission.canCall,
      reason: permission.canCall ? null : describePermission(permission),
      canRequestPermission: permission.canRequestPermission,
      permissionStatus: permission.status,
      settings,
      phoneNumberId: account.phone_number_id,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

function describePermission(permission) {
  switch (permission.status) {
    case 'no_permission':
      return 'This donor has not given call permission yet. Ask them to call this number first, or request permission.';
    case 'calling_disabled':
      return 'Calling is not enabled on this WhatsApp number.';
    case 'temporary':
    case 'permanent':
      // Meta says the permission exists, so the call itself is allowed and any
      // refusal came from somewhere else. Saying "not given permission" here
      // would send the agent off to request one that Meta will not issue.
      return 'Call permission is granted.';
    case 'expired':
      return 'The donor\'s call permission has expired. Ask them to call this number again.';
    default:
      return permission.error
        ? `Could not read call permission: ${permission.error}`
        : 'Call permission could not be confirmed.';
  }
}

export async function requestCallPermission(req, res) {
  try {
    const target = await resolveTarget(req);
    if (target.error) return res.status(target.error.status).json({ message: target.error.message });

    const permission = await getCallPermission(target.account, toDigits(target.contactWaId));
    if (permission.canCall) {
      return res.json({ success: true, alreadyGranted: true });
    }
    if (!permission.canRequestPermission) {
      const limitHit =
        permission.status === 'no_permission' &&
        permission.requestRemaining != null &&
        permission.requestUsed != null &&
        permission.requestUsed >= permission.requestRemaining;
      return res.status(409).json({
        message: permission.status === 'calling_disabled'
          ? 'Calling is not enabled on this WhatsApp number.'
          : limitHit
            ? `WhatsApp allows ${permission.requestRemaining} permission request(s) per day and ${permission.requestUsed} has already been used for this donor.`
            : 'Meta is not accepting a call-permission request for this donor right now.',
        canRequestPermission: false,
        permissionStatus: permission.status,
      });
    }

    await sendCallPermissionRequest(target.account, toDigits(target.contactWaId));
    return res.json({ success: true, alreadyGranted: false });
  } catch (error) {
    return res.status(500).json({ message: describeCallingError(error) });
  }
}

/** Place an outbound call using the browser's SDP offer. */
export async function startCall(req, res) {
  try {
    const { sdpOffer } = req.body;
    if (!sdpOffer || typeof sdpOffer !== 'string') {
      return res.status(400).json({ message: 'sdpOffer is required' });
    }
    // A browser SDP with ICE candidates is a few KB; this guards the webhook
    // column, not the API.
    if (sdpOffer.length > 64000) {
      return res.status(413).json({ message: 'sdpOffer is too large' });
    }

    const target = await resolveTarget(req);
    if (target.error) return res.status(target.error.status).json({ message: target.error.message });

    const settings = await getCallingSettings(target.account);
    if (!settings.enabled) {
      return res.status(409).json({ message: 'Calling is not enabled on this WhatsApp number.' });
    }

    const recipient = toDigits(target.contactWaId);

    // One call at a time per conversation. Without this, a second click reaches
    // Meta while the first is still ringing and comes back "Call already ongoing
    // with this receiver", which reads to the agent as calling being broken.
    const { data: inFlight } = await db
      .from('whatsapp_calls')
      .select('id, status, direction, created_at')
      .eq('conversation_id', target.conversation.id)
      .in('status', ['queued', 'ringing', 'offered', 'accepted', 'connected'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (inFlight?.length) {
      return res.status(409).json({
        message: 'There is already a call in progress on this conversation. End it before starting another.',
        existingCallId: inFlight[0].id,
        existingStatus: inFlight[0].status,
      });
    }

    const permission = await getCallPermission(target.account, recipient);
    if (!permission.canCall) {
      return res.status(409).json({
        message: describePermission(permission),
        canRequestPermission: permission.canRequestPermission,
        permissionStatus: permission.status,
      });
    }

    // Write the row first: its id is the client_ref Meta echoes back, so the
    // call survives a restart or a redelivered webhook.
    const call = await createCallRow({
      tenant_id: target.conversation.tenant_id ?? null,
      project: target.project,
      conversation_id: target.conversation.id,
      contact_id: target.conversation.contact_id,
      contact_wa_id: recipient,
      phone_number_id: target.account.phone_number_id,
      provider_call_id: null,
      client_ref: null,
      direction: 'outbound',
      status: 'queued',
      sdp_offer: sdpOffer,
      agent_id: String(req.user.id),
      agent_label: req.user.agent_label || req.user.name || null,
      started_at: new Date().toISOString(),
    });

    try {
      const result = await initiateCall({
        account: target.account,
        to: recipient,
        sdpOffer,
        clientRef: call.id,
      });
      const providerCallId = result?.calls?.[0]?.id || null;
      const updated = await updateCallRow(call.id, {
        provider_call_id: providerCallId,
        client_ref: call.id,
        status: 'ringing',
      });
      return res.json({ success: true, call: updated });
    } catch (metaError) {
      // Keep the failed attempt in history rather than dropping it, so the
      // agent can see what went wrong.
      await updateCallRow(call.id, {
        status: 'failed',
        ended_at: new Date().toISOString(),
        failure_reason: describeCallingError(metaError),
      }).catch(() => {});
      return res.status(502).json({ message: describeCallingError(metaError), code: metaError.code });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function loadCallForAction(req, res) {
  const { callId } = req.params;
  if (!callId) return { error: { status: 400, message: 'callId is required' } };

  const call = await findCall({ providerCallId: callId, clientRef: callId });
  if (!call) return { error: { status: 404, message: 'Call not found' } };

  const account = await getCallingAccount(call.project);
  if (!account) return { error: { status: 400, message: 'No WhatsApp account configured for this call' } };
  return { call, account };
}

/** Agent answered an inbound call: pass the browser's answer SDP to Meta. */
export async function answerCall(req, res) {
  try {
    const loaded = await loadCallForAction(req, res);
    if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
    const { call, account } = loaded;
    const { sdpAnswer } = req.body;
    if (!sdpAnswer || typeof sdpAnswer !== 'string') {
      return res.status(400).json({ message: 'sdpAnswer is required' });
    }

    if (!call.provider_call_id) {
      return res.status(409).json({ message: 'Meta has not assigned this call an id yet' });
    }

    await acceptCall({
      account,
      providerCallId: call.provider_call_id,
      sdpAnswer,
      clientRef: call.id,
    });
    const updated = await updateCallRow(call.id, {
      status: 'accepted',
      sdp_answer: sdpAnswer,
      answered_at: new Date().toISOString(),
      agent_id: call.agent_id || String(req.user.id),
      agent_label: call.agent_label || req.user.agent_label || req.user.name || null,
    });
    return res.json({ success: true, call: updated });
  } catch (error) {
    return res.status(502).json({ message: describeCallingError(error), code: error.code });
  }
}

export async function declineCall(req, res) {
  try {
    const loaded = await loadCallForAction(req, res);
    if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
    const { call, account } = loaded;
    if (call.provider_call_id) {
      await rejectCall({ account, providerCallId: call.provider_call_id, clientRef: call.id });
    }
    const updated = await updateCallRow(call.id, {
      status: 'rejected',
      ended_at: new Date().toISOString(),
      end_reason: 'declined_by_agent',
      agent_id: call.agent_id || String(req.user.id),
      agent_label: call.agent_label || req.user.agent_label || req.user.name || null,
    });
    return res.json({ success: true, call: updated });
  } catch (error) {
    return res.status(502).json({ message: describeCallingError(error), code: error.code });
  }
}

export async function endCall(req, res) {
  try {
    const loaded = await loadCallForAction(req, res);
    if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
    const { call, account } = loaded;
    if (call.provider_call_id) {
      await terminateCall({ account, providerCallId: call.provider_call_id, clientRef: call.id });
    }
    const endedAt = new Date();
    const answeredAt = call.answered_at ? new Date(call.answered_at) : null;
    const startedAt = call.started_at ? new Date(call.started_at) : null;
    const duration = answeredAt
      ? Math.max(0, Math.round((endedAt - answeredAt) / 1000))
      : (startedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : null);

    const updated = await updateCallRow(call.id, {
      status: 'terminated',
      ended_at: endedAt.toISOString(),
      duration_seconds: duration,
      end_reason: req.body?.reason || 'hangup',
    });
    return res.json({ success: true, call: updated });
  } catch (error) {
    return res.status(502).json({ message: describeCallingError(error), code: error.code });
  }
}

/** Calls needing attention right now, so a ringing call is not missed. */
export async function activeCalls(req, res) {
  try {
    const project = req.query.project;
    if (!project) return res.status(400).json({ message: 'project is required' });
    const calls = await listActiveCalls(project);
    return res.json({ calls });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function callHistory(req, res) {
  try {
    const project = req.query.project;
    if (!project) return res.status(400).json({ message: 'project is required' });
    const calls = await listCallHistory({
      project,
      conversationId: req.query.conversationId || null,
      contactId: req.query.contactId || null,
      limit: req.query.limit,
    });
    return res.json({ calls });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

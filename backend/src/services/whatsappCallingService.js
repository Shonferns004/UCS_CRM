import config from '../config/whatsappConfig.js';
import db from '../config/db.js';

/**
 * WhatsApp Business Calling API.
 *
 * Meta is the signalling relay, not the media path: the browser creates the
 * WebRTC peer connection and only the SDP offer/answer passes through the
 * server. No audio is handled here.
 *
 * Only the documented endpoints are used. Every action we send carries the
 * call's `client_ref`, which Meta echoes back on every webhook event as
 * `biz_opaque_callback_data`, so an event can always be tied back to our row
 * even if Meta redelivers it or we restart mid-call.
 */

/** Meta error codes that need a message an agent can act on. */
export const CALLING_ERRORS = {
  138006: 'This donor has not given call permission yet. Ask them to call you first, then try again.',
  138009: 'Calling is not enabled on this WhatsApp number.',
  139000: 'Calling is not available for this account or region.',
  2593051: 'Calling is not enabled on this WhatsApp number.',
  // A free-form permission request only goes out inside the 24h service window.
  131047: 'The 24-hour customer-service window is closed, so the permission request cannot be sent as a free-form message. Ask the donor to message this number first, then request permission.',
};

// Meta answers "Unknown path components: /<thing>" for an edge that does not exist
// at all -- an invented endpoint, or one this Graph API version does not carry.
// It is a bug in the caller, never something the agent did, and the raw string
// ("Call failed / Unknown path components: /call_permission_requests") sent them
// looking for a donor problem that was not there.
const UNKNOWN_PATH = /unknown path components/i;

export function describeCallingError(error) {
  if (!error) return 'Call failed';
  const code = Number(error.code);
  if (CALLING_ERRORS[code]) return CALLING_ERRORS[code];
  if (code === 100) return 'The number rejected the request. The donor may not be on WhatsApp.';
  if (UNKNOWN_PATH.test(error.message || '')) {
    const path = (error.message.match(/(\/\S+)/) || [])[1] || '';
    return (
      `WhatsApp rejected the request because ${path || 'that endpoint'} is not a valid endpoint ` +
      'for this API version. This is a bug on our side, not something to fix from the inbox — ' +
      'no call or permission request will succeed until it is corrected.'
    );
  }
  return error.message || 'Call failed';
}

const callsBase = (phoneNumberId) => `https://graph.facebook.com/${config.apiVersion}/${phoneNumberId}/calls`;

async function graphPost(path, token, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    const error = new Error(result?.error?.message || `Meta returned HTTP ${response.status}`);
    error.code = result?.error?.code;
    error.metaError = result?.error;
    throw error;
  }
  return result;
}

async function graphGet(path, token) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    const error = new Error(result?.error?.message || `Meta returned HTTP ${response.status}`);
    error.code = result?.error?.code;
    throw error;
  }
  return result;
}

/** The project's WhatsApp account, or null when it cannot call. */
export async function getCallingAccount(project) {
  const { data, error } = await db
    .from('whatsapp_accounts')
    .select('id, project, name, phone_number_id, waba_id, access_token')
    .eq('project', project)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token || !data?.phone_number_id) return null;
  return data;
}

/** Whether Meta has calling switched on for this number, and how it is shown. */
export async function getCallingSettings(account) {
  try {
    const result = await graphGet(
      `https://graph.facebook.com/${config.apiVersion}/${account.phone_number_id}/settings`,
      account.access_token,
    );
    const calling = result?.data?.calling || result?.calling || null;
    return {
      enabled: String(calling?.status || '').toUpperCase() === 'ENABLED',
      status: calling?.status || 'NOT_SET',
      callIconVisibility: calling?.call_icon_visibility || null,
      callbackPermissionStatus: calling?.callback_permission_status || null,
    };
  } catch (error) {
    return { enabled: false, status: 'UNKNOWN', error: error.message };
  }
}

/**
 * Whether this specific donor lets us call them. Meta returns
 * `no_permission` until the donor calls the business first or accepts a
 * permission request, so the inbox checks this before offering the button.
 */
export async function getCallPermission(account, contactWaId) {
  try {
    const result = await graphGet(
      `https://graph.facebook.com/${config.apiVersion}/${account.phone_number_id}` +
      `/call_permissions?user_wa_id=${encodeURIComponent(contactWaId)}`,
      account.access_token,
    );
    const entry = result?.data?.[0] ?? result;
    const status = entry?.permission?.status ?? entry?.status ?? null;
    const rawActions = entry?.actions ?? [];

    // status is one of no_permission | temporary | permanent. An earlier version
    // of this read only `granted`, which is not a value Meta returns -- so a donor
    // who had granted PERMANENT permission was treated as having none and could
    // never be called again.
    const canCall = status === 'temporary' || status === 'permanent';

    // Meta lists the action whether or not its daily/weekly limits have room, and
    // says so in can_perform_action. Offering the button with the limit already
    // spent only moves the rejection from here to Meta.
    const requestAction = rawActions.find((a) => a?.action_name === 'send_call_permission_request');
    const callAction = rawActions.find((a) => a?.action_name === 'start_call');
    const canRequest = Boolean(requestAction) && requestAction.can_perform_action !== false;

    return {
      status,
      canCall,
      canStartCall: Boolean(callAction) && callAction.can_perform_action !== false,
      canRequestPermission: canRequest,
      actions: rawActions.map((a) => a?.action_name ?? a).filter(Boolean),
      // What is left today, and when the bucket refills. null when Meta reports
      // no limit for the action.
      requestRemaining: requestAction?.limits?.[0]?.max_allowed ?? null,
      requestUsed: requestAction?.limits?.[0]?.current_usage ?? null,
      callRemaining: callAction?.limits?.[0]?.max_allowed ?? null,
      callUsed: callAction?.limits?.[0]?.current_usage ?? null,
    };
  } catch (error) {
    // 138000 means calling itself is off for the number; surface that
    // separately from a donor-level permission problem.
    if (Number(error.code) === 138000 || Number(error.code) === 2593051) {
      return { status: 'calling_disabled', canCall: false, canRequestPermission: false, actions: [] };
    }
    return { status: 'unknown', canCall: false, canRequestPermission: false, actions: [], error: error.message };
  }
}

// Ask the donor to allow calls.
//
// There is NO /call_permission_requests endpoint. The Calling API has exactly two
// edges -- GET /{phone_number_id}/call_permissions and POST /{phone_number_id}/calls
// -- and a permission request is sent through the ordinary Messages API as an
// interactive message of type `call_permission_request`. Calling a path that does
// not exist gets "Unknown path components: /call_permission_requests" back, which
// is what this function used to do on every press of Request permission.
//
// Meta documents this as a free-form message, so it only goes out inside an open
// customer-service window; outside one it must be an approved template with a
// `call_permission_request` component (whatsappAutomationService holds the
// template helpers). The limit is real too -- getCallPermission surfaces
// can_perform_action so the UI can refuse rather than let Meta reject it.
const DEFAULT_PERMISSION_BODY =
  'We would like to call you to help support your query.';

export async function sendCallPermissionRequest(account, contactWaId, bodyText) {
  return graphPost(
    `https://graph.facebook.com/${config.apiVersion}/${account.phone_number_id}/messages`,
    account.access_token,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: contactWaId,
      type: 'interactive',
      interactive: {
        type: 'call_permission_request',
        action: { name: 'call_permission_request' },
        body: { text: String(bodyText || '').trim() || DEFAULT_PERMISSION_BODY },
      },
    },
  );
}

export async function createCallRow(values) {
  const { data, error } = await db.from('whatsapp_calls').insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateCallRow(id, patch) {
  const { data, error } = await db
    .from('whatsapp_calls')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Find the row a webhook event belongs to, by Meta's id or by our echoed ref. */
export async function findCall({ providerCallId, clientRef }) {
  if (providerCallId) {
    const { data } = await db
      .from('whatsapp_calls')
      .select('*')
      .eq('provider_call_id', providerCallId)
      .maybeSingle();
    if (data) return data;
  }
  if (clientRef) {
    const { data } = await db
      .from('whatsapp_calls')
      .select('*')
      .eq('client_ref', clientRef)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/** Business-initiated call: we supply the browser's SDP offer, Meta relays it. */
export async function initiateCall({ account, to, sdpOffer, clientRef }) {
  return graphPost(callsBase(account.phone_number_id), account.access_token, {
    messaging_product: 'whatsapp',
    to,
    action: 'connect',
    session: { sdp_type: 'offer', sdp: sdpOffer },
    biz_opaque_callback_data: clientRef,
  });
}

export async function acceptCall({ account, providerCallId, sdpAnswer, clientRef }) {
  return graphPost(callsBase(account.phone_number_id), account.access_token, {
    messaging_product: 'whatsapp',
    call_id: providerCallId,
    action: 'accept',
    session: { sdp_type: 'answer', sdp: sdpAnswer },
    ...(clientRef ? { biz_opaque_callback_data: clientRef } : {}),
  });
}

export async function rejectCall({ account, providerCallId, clientRef }) {
  return graphPost(callsBase(account.phone_number_id), account.access_token, {
    messaging_product: 'whatsapp',
    call_id: providerCallId,
    action: 'reject',
    ...(clientRef ? { biz_opaque_callback_data: clientRef } : {}),
  });
}

export async function terminateCall({ account, providerCallId, clientRef }) {
  return graphPost(callsBase(account.phone_number_id), account.access_token, {
    messaging_product: 'whatsapp',
    call_id: providerCallId,
    action: 'terminate',
    ...(clientRef ? { biz_opaque_callback_data: clientRef } : {}),
  });
}

/**
 * Calls that still need an agent's attention (ringing, waiting for answer).
 *
 * `project` is optional on purpose: the inbox polls this to notice an incoming
 * call, and the agent may be on the "all" tab or have no project in the URL.
 * Filtering by a project the agent happens to be viewing meant a ringing call
 * was silently invisible until they switched tabs.
 */
export async function listActiveCalls(project) {
  let query = db
    .from('whatsapp_calls')
    .select('*')
    .in('status', ['queued', 'ringing', 'offered', 'accepted', 'connected']);
  if (project && project !== 'all') query = query.eq('project', project);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function listCallHistory({ project, conversationId, contactId, limit = 50 }) {
  let query = db.from('whatsapp_calls').select('*').eq('project', project);
  if (conversationId) query = query.eq('conversation_id', conversationId);
  else if (contactId) query = query.eq('contact_id', contactId);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
  if (error) throw error;
  return data || [];
}

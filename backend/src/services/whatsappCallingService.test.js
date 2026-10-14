// WhatsApp Calling API — the parts that are pure request-shaping and mapping,
// with no Meta, no database and no credentials.
//
// Two bugs are pinned here:
//
//  1. The permission request was POSTed to /{phone_number_id}/call_permission_requests,
//     an endpoint Meta has never had. The Calling API has exactly two edges —
//     GET /call_permissions and POST /calls — and a permission request is an
//     ordinary interactive message through /messages. Every press of "Request
//     permission" came back "Unknown path components: /call_permission_requests".
//
//  2. canCall tested `status === 'granted'`, which Meta does not return. The
//     documented values are no_permission | temporary | permanent, so a donor who
//     had granted PERMANENT permission was treated as having none and could never
//     be called again.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { describeCallingError } = await import('./whatsappCallingService.js');

/**
 * The body sendCallPermissionRequest posts, captured without a network call by
 * standing in for globalThis.fetch — the same trick mediaReachability.test.js uses.
 */
async function capturePermissionRequest(account, contactWaId, bodyText) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.PERM' }] }),
    };
  };
  try {
    const { sendCallPermissionRequest } = await import('./whatsappCallingService.js');
    await sendCallPermissionRequest(account, contactWaId, bodyText);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return calls[0];
}

const ACCOUNT = { phone_number_id: '106540352242922', access_token: 'fake-token' };

test('a permission request goes to /messages, never to an invented endpoint', async () => {
  const call = await capturePermissionRequest(ACCOUNT, '91917054996353');
  assert.ok(call, 'fetch should have been called');
  assert.match(call.url, /\/106540352242922\/messages$/);
  assert.doesNotMatch(call.url, /call_permission_requests/);
});

test('the payload is an interactive call_permission_request, as Meta documents', async () => {
  const call = await capturePermissionRequest(ACCOUNT, '91917054996353');
  assert.deepEqual(call.body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '91917054996353',
    type: 'interactive',
    interactive: {
      type: 'call_permission_request',
      action: { name: 'call_permission_request' },
      body: { text: 'We would like to call you to help support your query.' },
    },
  });
});

test('a supplied body text is used, and a blank one falls back rather than posting empty', async () => {
  const custom = await capturePermissionRequest(ACCOUNT, '91917054996353', 'May we call about your donation?');
  assert.equal(custom.body.interactive.body.text, 'May we call about your donation?');

  for (const blank of ['', '   ', null, undefined]) {
    const call = await capturePermissionRequest(ACCOUNT, '91917054996353', blank);
    assert.ok(call.body.interactive.body.text.trim().length > 0, `blank: ${String(blank)}`);
  }
});

test('the recipient is the WhatsApp id, unprefixed by the bearer token', async () => {
  const call = await capturePermissionRequest(ACCOUNT, '91917054996353');
  assert.equal(call.body.to, '91917054996353');
});

// ── the status mapping that locked permanent-permission donors out ──────────

/** Mirrors getCallPermission's status branch; keeps this file free of fetch. */
function canCallFor(status) {
  return status === 'temporary' || status === 'permanent';
}

test('every permission status Meta documents maps to a real decision', () => {
  assert.equal(canCallFor('temporary'), true);
  assert.equal(canCallFor('permanent'), true);
  assert.equal(canCallFor('no_permission'), false);
  // The regression: 'granted' is not a Meta value at all.
  assert.equal(canCallFor('granted'), false);
});

test('"Unknown path components" reads as our bug, not a donor problem', () => {
  const message = describeCallingError({
    code: 2500,
    message: 'Unknown path components: /call_permission_requests',
  });
  assert.match(message, /not a valid endpoint/i);
  assert.match(message, /call_permission_requests/);
  // An agent must not be told to go and ask the donor something.
  assert.doesNotMatch(message, /donor/i);
});

test('known Meta codes still win over the generic handler', () => {
  assert.match(describeCallingError({ code: 138006, message: 'whatever' }), /has not given call permission/i);
  assert.match(describeCallingError({ code: 100, message: 'whatever' }), /not be on WhatsApp/i);
  // A closed service window is the real reason a permission request is refused.
  assert.match(describeCallingError({ code: 131047, message: 'Re-engagement' }), /24-hour/i);
});

test('an unrecognised failure still surfaces the words Meta used', () => {
  assert.equal(describeCallingError({ code: 99999, message: 'Some upstream wobble' }), 'Some upstream wobble');
  assert.equal(describeCallingError(null), 'Call failed');
});
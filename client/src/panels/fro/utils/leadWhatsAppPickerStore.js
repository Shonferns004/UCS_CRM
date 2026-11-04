// A tiny request/response store for the "which WhatsApp?" picker.
//
// The WhatsApp buttons live in several lead/donor pages, while the modal is mounted once in
// FROPanel. A module-level store keeps the buttons free of local modal state and lets the
// promise-based API (`requestLeadWhatsAppChoice`) read like the rest of the FRO utilities.

let listener = null;
let pending = null;
let sequence = 0;

export function subscribeLeadWhatsAppPicker(handler) {
  listener = handler;
  return () => {
    if (listener === handler) listener = null;
  };
}

/**
 * Ask the mounted picker to choose a number. Resolves with the chosen option, or null when the
 * user cancels. A second request settles the first as cancelled, so a stale modal can never
 * hold a promise open.
 */
export function requestLeadWhatsAppChoice(payload) {
  return new Promise(resolve => {
    if (!listener) {
      resolve(null);
      return;
    }
    if (pending) {
      pending.resolve(null);
      pending = null;
    }
    sequence += 1;
    pending = { ...payload, requestId: sequence, resolve };
    listener(pending);
  });
}

export function settleLeadWhatsAppChoice(requestId, choice) {
  if (!pending || pending.requestId !== requestId) return;
  const { resolve } = pending;
  pending = null;
  resolve(choice || null);
}

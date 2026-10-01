// Guards the one WhatsApp send step we cannot observe synchronously.
//
// Meta's POST /{phone_number_id}/messages answers 200 with a wamid the instant
// it accepts a template send. It has not touched the attachment yet. A minute
// later it fetches the HEADER document from the URL we handed it, and if that
// fetch fails the whole message dies with error 131053 ("Media upload error",
// typically "Downloading media from weblink failed with http code 403"). By
// then the API has already told the Accounts panel "sent successfully" and the
// receipt has been struck off the pending queue.
//
// The only way to catch that class of failure before it costs a donor their
// receipt is to make the same anonymous request Meta is about to make, ourselves,
// and refuse to send when the answer is not 200. That is all this module does.

const DEFAULT_TIMEOUT_MS = 8000;

// S3 answers HEAD for a public object and 403 for a private one without
// transferring the body, so HEAD is the cheap first probe. Not every storage
// frontend implements HEAD, so a 405/501 falls back to a ranged GET rather than
// being reported as a broken attachment.
const PROBE_ATTEMPTS = [
  { method: 'HEAD' },
  { method: 'GET', headers: { Range: 'bytes=0-0' } },
];

const isHttpStatus = (value) => Number.isInteger(value) && value >= 100 && value < 600;

export function describeUnreachableAttachment(url, result) {
  const host = (() => {
    try { return new URL(url).host; } catch { return url; }
  })();
  const where = `${host} answered HTTP ${result.status}`;
  if (result.status === 403 || result.status === 401) {
    return (
      `The receipt PDF is not publicly readable, so WhatsApp cannot download it. ` +
      `${where}. This is an S3 permissions problem on the upload bucket, not a ` +
      `donor or template problem: the object exists but anonymous reads are denied. ` +
      `Grant s3:GetObject to Principal "*" on the receipts/ prefix of that bucket, ` +
      `or point the backend at a bucket that already serves it.`
    );
  }
  if (result.status === 404) {
    return (
      `The receipt PDF is not at the URL WhatsApp will be given (${where}). ` +
      `The upload reported success but the object cannot be read back.`
    );
  }
  if (result.status === 405 || result.status === 501) {
    return `The receipt host does not support a read probe (${where}).`;
  }
  if (result.reason === 'timeout') {
    return `The receipt host did not respond within ${result.timeoutMs}ms (${url}). WhatsApp would time out on it too.`;
  }
  if (result.reason === 'network') {
    return `The receipt host could not be reached (${result.error || 'network error'}). WhatsApp would fail on it too.`;
  }
  return `The receipt PDF could not be verified as downloadable by WhatsApp (${where}).`;
}

/**
 * Probes `url` exactly the way Meta will, and reports whether it is safe to send.
 *
 * Never throws: every failure mode is reported in the returned object so the
 * caller decides whether an unreachable attachment is fatal. Returns
 * `{ ok: true, status, method }` or `{ ok: false, status, statusText, method,
 * reason, error, timeoutMs, url }`.
 */
export async function checkAttachmentReachable(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = options;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, url, reason: 'network', error: 'fetch is unavailable in this runtime', timeoutMs };
  }
  if (!url || typeof url !== 'string') {
    return { ok: false, url, reason: 'network', error: 'no attachment URL to probe', timeoutMs };
  }

  let last = null;
  for (const attempt of PROBE_ATTEMPTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: attempt.method,
        headers: attempt.headers,
        signal: controller.signal,
        redirect: 'follow',
      });
      if (isHttpStatus(res.status) && res.status >= 200 && res.status < 300) {
        return { ok: true, url, status: res.status, method: attempt.method };
      }
      // 206 is what a ranged GET returns for a healthy object; it is already
      // covered by the 2xx branch above, so anything here is a real refusal.
      last = {
        ok: false, url, status: res.status, statusText: res.statusText || '',
        method: attempt.method, reason: 'http', timeoutMs,
      };
      if (res.status !== 405 && res.status !== 501) return last;
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      last = {
        ok: false, url, status: 0, statusText: '', method: attempt.method,
        reason: aborted ? 'timeout' : 'network', error: err?.message || String(err), timeoutMs,
      };
      // A timeout or a dead host will not be fixed by changing the verb.
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last || { ok: false, url, status: 0, reason: 'network', error: 'probe failed', timeoutMs };
}

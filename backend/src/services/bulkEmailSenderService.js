import nodemailer from 'nodemailer';

// Bulk campaigns send from a sender row stored in bulk_email_senders. This
// module owns everything that is independent of the database: normalising the
// credentials, building the From header, caching one SMTP pool per sender and
// verifying a login before a campaign is queued.
//
// The Sevak Library module keeps its own account and is deliberately not
// involved here.

const DEFAULT_DISPLAY_NAME = 'Being Sevak Charitable Trust';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Gmail shows app passwords as four groups of four ("abcd efgh ijkl mnop").
// Spaces are cosmetic, so they are stripped before storage and use.
export function normalizeAppPassword(value) {
  return String(value || '').replace(/\s+/g, '');
}

export function normalizeSenderEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidSenderEmail(value) {
  return EMAIL_RE.test(normalizeSenderEmail(value));
}

export function maskSenderPassword(value) {
  return value ? '••••••••' : null;
}

export function buildSenderFromHeader(sender) {
  const email = normalizeSenderEmail(sender?.email);
  if (!email) throw new Error('Sender email is not configured');
  const name = String(sender?.display_name || '').trim() || DEFAULT_DISPLAY_NAME;
  return `${name.replace(/"/g, '')} <${email}>`;
}

export function smtpConfigFor(sender) {
  const port = Number(sender?.smtp_port) || 465;
  return {
    host: String(sender?.smtp_host || '').trim() || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: {
      user: normalizeSenderEmail(sender?.email),
      pass: normalizeAppPassword(sender?.app_password),
    },
  };
}

// Turn nodemailer/SMTP failures into a message the UI can show without leaking
// a raw stack trace or the credential.
export function friendlySmtpError(error) {
  const message = String(error?.message || error || '');
  if (/535|Invalid login|Username and Password not accepted|EAUTH|authentication/i.test(message)) {
    return 'App password is wrong or has been revoked. Generate a new one in Google Account → Security → App passwords.';
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ESOCKET|network/i.test(message)) {
    return 'Could not connect to the SMTP server. Check the network connection and try again.';
  }
  return message || 'Login could not be verified.';
}

// One pooled transport per sender. Keyed by the credentials too, so a changed
// app password replaces (and closes) the stale pool instead of reusing it.
const transports = new Map();

export function getTransportForSender(sender) {
  const email = normalizeSenderEmail(sender?.email);
  const password = normalizeAppPassword(sender?.app_password);
  if (!email) throw new Error('Select a sender email before sending');
  if (!password) throw new Error(`App password is missing for ${email}`);

  const senderKey = String(sender?.id || email);
  const key = `${senderKey}:${email}:${password}`;
  const cached = transports.get(key);
  if (cached) return cached;

  for (const [existingKey, existing] of transports) {
    if (existingKey === key || !existingKey.startsWith(`${senderKey}:`)) continue;
    try { existing.close(); } catch { /* best effort */ }
    transports.delete(existingKey);
  }

  const transport = nodemailer.createTransport({
    ...smtpConfigFor(sender),
    pool: true,
    maxConnections: Math.min(10, Math.max(1, Number(process.env.SMTP_MAX_CONNECTIONS) || 3)),
    maxMessages: 100,
  });
  transports.set(key, transport);
  return transport;
}

export async function verifySenderLogin(sender) {
  const transport = nodemailer.createTransport({ ...smtpConfigFor(sender), pool: false });
  try {
    await transport.verify();
    return { ok: true, message: 'Login verified' };
  } catch (error) {
    return { ok: false, message: friendlySmtpError(error) };
  } finally {
    try { transport.close(); } catch { /* best effort */ }
  }
}

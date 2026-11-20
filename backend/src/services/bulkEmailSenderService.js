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
// Spaces are cosmetic, so they are stripped before storage and use. Other
// providers (Hostinger, cPanel, Zoho…) may legitimately use spaces inside a
// mailbox password, so the strip only applies to Google hosts. A missing host
// keeps the historical behaviour (strip) for rows saved before providers
// existed.
export function normalizeAppPassword(value, smtpHost) {
  const raw = String(value ?? '');
  const host = String(smtpHost || '').trim().toLowerCase();
  const isGoogle = !host || host.includes('gmail') || host.includes('googlemail');
  return isGoogle ? raw.replace(/\s+/g, '') : raw.trim();
}

export function normalizeSenderEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidSenderEmail(value) {
  return EMAIL_RE.test(normalizeSenderEmail(value));
}

const SMTP_HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

// Bulk mail is no longer Gmail-only: any SMTP provider can be used (Hostinger,
// Zoho, Brevo, SES…). These two normalisers are shared by the controller and
// the model so the host/port saved is always the one the transport will use.
export function normalizeSmtpHost(value) {
  const host = String(value || '').trim().toLowerCase();
  if (!host) return 'smtp.gmail.com';
  if (!SMTP_HOST_RE.test(host)) {
    throw new Error('Enter a valid SMTP server, for example smtp.hostinger.com');
  }
  return host;
}

export function normalizeSmtpPort(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 465;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Enter a valid SMTP port, for example 465 or 587');
  }
  return port;
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
  const port = normalizeSmtpPort(sender?.smtp_port);
  return {
    host: normalizeSmtpHost(sender?.smtp_host),
    port,
    secure: port === 465,
    auth: {
      user: normalizeSenderEmail(sender?.email),
      pass: normalizeAppPassword(sender?.app_password, sender?.smtp_host),
    },
  };
}

// Turn nodemailer/SMTP failures into a message the UI can show without leaking
// a raw stack trace or the credential. The hint depends on the provider: a
// Gmail app password is a different thing from a Hostinger mailbox password.
export function friendlySmtpError(error, sender) {
  const message = String(error?.message || error || '');
  const host = String(sender?.smtp_host || '').trim().toLowerCase();
  const isHostinger = host.includes('hostinger');
  const isGoogle = !host || host.includes('gmail') || host.includes('googlemail');

  if (/535|Invalid login|Username and Password not accepted|EAUTH|authentication|LOGIN failed/i.test(message)) {
    if (isHostinger) {
      return 'Hostinger rejected this email or password. Use the mailbox password (not a Google app password) and check the address exists in hPanel → Emails.';
    }
    if (isGoogle) {
      return 'App password is wrong or has been revoked. Generate a new one in Google Account → Security → App passwords.';
    }
    return `The mail server (${host || 'SMTP'}) rejected the login. Check the username, password and server settings.`;
  }
  if (/ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(message)) {
    return `Could not reach ${host || 'the SMTP server'} on the configured port. Try port 465 (SSL) or 587 (STARTTLS).`;
  }
  if (/ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ESOCKET|network/i.test(message)) {
    return 'Could not connect to the SMTP server. Check the network connection and the server name, then try again.';
  }
  if (/rate limit|too many|421|quota|daily limit|sending limit/i.test(message)) {
    return 'The mail server is rate limiting this account. Wait a while (or reduce the daily volume) and try again.';
  }
  return message || 'Login could not be verified.';
}

// One pooled transport per sender. Keyed by the credentials too, so a changed
// app password replaces (and closes) the stale pool instead of reusing it.
const transports = new Map();

export function getTransportForSender(sender) {
  const email = normalizeSenderEmail(sender?.email);
  const host = normalizeSmtpHost(sender?.smtp_host);
  const port = normalizeSmtpPort(sender?.smtp_port);
  const password = normalizeAppPassword(sender?.app_password, sender?.smtp_host);
  if (!email) throw new Error('Select a sender email before sending');
  if (!password) throw new Error(`Email password is missing for ${email}`);

  const senderKey = String(sender?.id || email);
  // The host and port are part of the key so editing the SMTP server closes the
  // stale pool instead of reusing a connection to the old provider.
  const key = `${senderKey}:${email}:${host}:${port}:${password}`;
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
    return { ok: false, message: friendlySmtpError(error, sender) };
  } finally {
    try { transport.close(); } catch { /* best effort */ }
  }
}

import crypto from 'crypto';
import db from '../config/db.js';
import { escapeHtml } from './emailTemplateRenderer.js';

// ---------------------------------------------------------------------------
// Bulk-email unsubscribe links and suppression list.
//
// Every bulk send carries a signed, per-recipient unsubscribe URL plus the
// List-Unsubscribe / List-Unsubscribe-Post headers Gmail expects. A click
// opens a confirmation page; the one-click POST records the address in
// bulk_email_unsubscribes and future campaigns skip it.
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSecret() {
  const secret = String(process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET (or JWT_SECRET) is not configured');
  return secret;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function buildUnsubscribeToken(email) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) throw new Error('A valid email is required for an unsubscribe token');
  const payload = Buffer.from(normalized, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token) {
  const raw = String(token || '').trim();
  const dot = raw.indexOf('.');
  if (dot < 1 || dot === raw.length - 1) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  try {
    const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const email = Buffer.from(payload, 'base64url').toString('utf8');
    return EMAIL_RE.test(email) ? email : null;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(baseUrl, email) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const token = buildUnsubscribeToken(email);
  const path = `/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

export function appendUnsubscribeHtml(html, unsubscribeUrl) {
  const source = String(html || '');
  const url = String(unsubscribeUrl || '').trim();
  if (!url) return source;
  const footer = `<div style="max-width:600px;margin:0 auto;padding:4px 20px 20px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;line-height:1.6;color:#6b7280;text-align:center;">`
    + 'You are receiving this email because you subscribed to updates from Being Sevak.'
    + `<br /><a href="${escapeHtml(url)}" target="_blank" style="color:#0f766e;text-decoration:underline;">Unsubscribe</a>`
    + '</div>';
  const closing = source.search(/<\/body>/i);
  return closing >= 0 ? `${source.slice(0, closing)}${footer}${source.slice(closing)}` : `${source}${footer}`;
}

export function appendUnsubscribeText(text, unsubscribeUrl) {
  const source = String(text || '').replace(/\s+$/, '');
  const url = String(unsubscribeUrl || '').trim();
  if (!url) return source;
  return `${source ? `${source}\n\n` : ''}To unsubscribe from future emails, visit: ${url}`;
}

export async function recordUnsubscribe({ email, source, reason } = {}) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) throw new Error('A valid email is required');
  await db._pool.query(
    `INSERT INTO bulk_email_unsubscribes (email, source, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET source = EXCLUDED.source,
           reason = EXCLUDED.reason,
           created_at = NOW()`,
    [normalized, source || 'bulk-email', reason || 'link'],
  );
  return normalized;
}

export async function getUnsubscribedSet() {
  const { rows } = await db._pool.query('SELECT email FROM bulk_email_unsubscribes');
  return new Set(rows.map((row) => normalizeEmail(row.email)).filter(Boolean));
}

export default {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  appendUnsubscribeHtml,
  appendUnsubscribeText,
  recordUnsubscribe,
  getUnsubscribedSet,
};

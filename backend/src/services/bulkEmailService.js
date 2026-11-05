import nodemailer from 'nodemailer';
import db from '../config/db.js';
import { applyPersonalization } from './emailTemplateRenderer.js';
import {
  appendUnsubscribeHtml,
  appendUnsubscribeText,
  buildUnsubscribeUrl,
  getUnsubscribedSet,
} from './bulkEmailUnsubscribe.js';
import { buildInlineImageAttachments } from './emailImageAssets.js';

// Bulk-email campaigns use a Gmail SMTP account configured through the
// environment. The app password is never stored in source.
const GMAIL_USER = process.env.GMAIL_USER || 'library.sevak@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let transport;

function getTransport() {
  if (!GMAIL_APP_PASSWORD) {
    throw new Error('Gmail app password is not configured - email not sent');
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return transport;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanSearch(value) {
  return String(value || '').trim().replace(/[,()%]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeRecipients(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const email = normalizeEmail(item?.email);
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: String(item?.name || '').trim() || null,
    });
  }
  return out;
}

async function fetchSource(source, search, limit) {
  const q = cleanSearch(search);
  if (source === 'donors') {
    let query = db
      .from('donor_profiles')
      .select('id, name, email, mobile_number')
      .not('email', 'is', null)
      .neq('email', '')
      .limit(limit);
    if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,mobile_number.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((r) => ({ email: r.email, name: r.name }));
  }

  if (source === 'beneficiaries') {
    let query = db
      .from('beneficiaries')
      .select('id, full_name, email, mobile')
      .not('email', 'is', null)
      .neq('email', '')
      .limit(limit);
    if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((r) => ({ email: r.email, name: r.full_name }));
  }

  throw new Error('Unsupported recipient source');
}

export async function listBulkEmailRecipients({ source, search = '', limit = 1000 } = {}) {
  const max = Math.min(5000, Math.max(1, Number(limit) || 1000));
  const rows = [];
  if (source === 'all') {
    const [donors, beneficiaries] = await Promise.all([
      fetchSource('donors', search, max),
      fetchSource('beneficiaries', search, max),
    ]);
    rows.push(...donors, ...beneficiaries);
  } else {
    rows.push(...(await fetchSource(source, search, max)));
  }
  const recipients = normalizeRecipients(rows);
  const unsubscribed = await getUnsubscribedSet();
  const allowed = recipients.filter((recipient) => !unsubscribed.has(recipient.email));
  return { recipients: allowed, total: allowed.length, skipped: recipients.length - allowed.length };
}

function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827">${escaped.replace(/\n/g, '<br />')}</div>`;
}

function personalize(value, recipient, { html = false } = {}) {
  return applyPersonalization(value, {
    name: recipient.name || recipient.email.split('@')[0],
    email: recipient.email,
  }, { html });
}

export async function sendBulkEmail({ subject, text, html, recipients, attachment, unsubscribeBaseUrl } = {}) {
  const requested = normalizeRecipients(recipients);
  if (!requested.length) throw new Error('No valid recipients selected');
  if (!String(subject || '').trim()) throw new Error('Subject is required');

  const unsubscribed = await getUnsubscribedSet();
  const to = requested.filter((recipient) => !unsubscribed.has(recipient.email));
  const skipped = requested.length - to.length;
  if (!to.length) {
    return { total: 0, sent: 0, failed: 0, skipped, results: [] };
  }

  const transporter = getTransport();
  const inline = html
    ? await buildInlineImageAttachments(html)
    : { html, attachments: [] };
  const htmlTemplate = inline.html;
  const attachments = [
    ...(attachment
      ? [{ filename: attachment.filename, content: attachment.content, contentType: attachment.contentType }]
      : []),
    ...(inline.attachments || []),
  ];
  const results = [];
  const batchSize = 5;

  for (let i = 0; i < to.length; i += batchSize) {
    const batch = to.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(async (recipient) => {
      const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeBaseUrl, recipient.email);
      const personalizedText = personalize(text, recipient);
      const personalizedHtml = htmlTemplate
        ? personalize(htmlTemplate, recipient, { html: true })
        : textToHtml(personalizedText);

      await transporter.sendMail({
        from: `UCS CRM <${GMAIL_USER}>`,
        to: recipient.email,
        subject: personalize(subject, recipient),
        text: appendUnsubscribeText(personalizedText, unsubscribeUrl),
        html: appendUnsubscribeHtml(personalizedHtml, unsubscribeUrl),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        attachments,
      });
      return recipient.email;
    }));

    settled.forEach((item, index) => {
      const recipient = batch[index];
      if (item.status === 'fulfilled') {
        results.push({ email: recipient.email, ok: true });
      } else {
        results.push({
          email: recipient.email,
          ok: false,
          error: item.reason?.message || 'Send failed',
        });
      }
    });

    if (i + batchSize < to.length) await sleep(250);
  }

  const sent = results.filter((r) => r.ok).length;
  return {
    total: results.length,
    sent,
    failed: results.length - sent,
    skipped,
    results,
  };
}

export async function saveBulkEmailLog({ subject, text, source, result, createdBy } = {}) {
  const { rows } = await db._pool.query(
    `INSERT INTO bulk_email_logs
       (subject, body, source, total_recipients, sent_count, failed_count, recipients, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id, subject, source, total_recipients, sent_count, failed_count, created_by, created_at`,
    [
      subject,
      text || '',
      source || null,
      result?.total || 0,
      result?.sent || 0,
      result?.failed || 0,
      JSON.stringify(result?.results || []),
      createdBy || null,
    ],
  );
  return rows[0];
}

export async function listBulkEmailLogs({ page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    db._pool.query(
      `SELECT id, subject, source, total_recipients, sent_count, failed_count, created_by, created_at
         FROM bulk_email_logs
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [limitNum, offset],
    ),
    db._pool.query('SELECT COUNT(*)::int AS total FROM bulk_email_logs'),
  ]);

  return {
    logs: rows,
    total: countRows[0]?.total || 0,
    page: pageNum,
    limit: limitNum,
  };
}

export async function getBulkEmailLog(id) {
  const { rows } = await db._pool.query(
    `SELECT id, subject, body, source, total_recipients, sent_count, failed_count, recipients, created_by, created_at
       FROM bulk_email_logs
      WHERE id = $1::bigint`,
    [id],
  );
  return rows[0] || null;
}

export async function listBulkEmailTemplates() {
  const { rows } = await db._pool.query(
    `SELECT id, name, subject, body, created_by, created_at, updated_at,
            attachment_name, attachment_type,
            (attachment_data IS NOT NULL) AS has_attachment,
            (design IS NOT NULL) AS has_design,
            (html IS NOT NULL) AS has_html
       FROM bulk_email_templates
      ORDER BY name ASC`,
  );
  return rows;
}

export async function getBulkEmailTemplate(id) {
  const { rows } = await db._pool.query(
    `SELECT id, name, subject, body, design, html, created_by, created_at, updated_at,
            attachment_name, attachment_type,
            (attachment_data IS NOT NULL) AS has_attachment,
            (design IS NOT NULL) AS has_design,
            (html IS NOT NULL) AS has_html
       FROM bulk_email_templates
      WHERE id = $1::bigint`,
    [id],
  );
  return rows[0] || null;
}

export async function getBulkEmailTemplateAttachment(id) {
  const { rows } = await db._pool.query(
    `SELECT attachment_name, attachment_type, attachment_data
       FROM bulk_email_templates
      WHERE id = $1::bigint`,
    [id],
  );
  const row = rows[0];
  if (!row || !row.attachment_data) return null;
  return {
    filename: row.attachment_name || 'attachment',
    contentType: row.attachment_type || 'application/octet-stream',
    content: row.attachment_data,
  };
}

export async function createBulkEmailTemplate({ name, subject, body, createdBy, attachment, design, html } = {}) {
  const { rows } = await db._pool.query(
    `INSERT INTO bulk_email_templates
       (name, subject, body, created_by, attachment_name, attachment_type, attachment_data, design, html)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING id, name, subject, body, created_by, created_at, updated_at,
               attachment_name, attachment_type,
               (attachment_data IS NOT NULL) AS has_attachment,
               (design IS NOT NULL) AS has_design,
               (html IS NOT NULL) AS has_html`,
    [
      name,
      subject,
      body,
      createdBy || null,
      attachment?.filename || null,
      attachment?.contentType || null,
      attachment?.content || null,
      design ? JSON.stringify(design) : null,
      html || null,
    ],
  );
  return rows[0];
}

export async function updateBulkEmailTemplate(id, { name, subject, body, attachment, removeAttachment, design, html } = {}) {
  const sets = ['name = $2', 'subject = $3', 'body = $4', 'updated_at = NOW()'];
  const params = [id, name, subject, body];
  if (attachment) {
    params.push(attachment.filename || null, attachment.contentType || null, attachment.content || null);
    sets.push(
      `attachment_name = $${params.length - 2}`,
      `attachment_type = $${params.length - 1}`,
      `attachment_data = $${params.length}`,
    );
  } else if (removeAttachment) {
    sets.push('attachment_name = NULL', 'attachment_type = NULL', 'attachment_data = NULL');
  }
  if (design !== undefined) {
    const value = design ? JSON.stringify(design) : null;
    sets.push(`design = $${params.push(value)}::jsonb`);
  }
  if (html !== undefined) {
    sets.push(`html = $${params.push(html || null)}`);
  }

  const { rows } = await db._pool.query(
    `UPDATE bulk_email_templates
        SET ${sets.join(', ')}
      WHERE id = $1::bigint
      RETURNING id, name, subject, body, created_by, created_at, updated_at,
                attachment_name, attachment_type,
                (attachment_data IS NOT NULL) AS has_attachment,
                (design IS NOT NULL) AS has_design,
                (html IS NOT NULL) AS has_html`,
    params,
  );
  return rows[0] || null;
}

export async function deleteBulkEmailTemplate(id) {
  const { rowCount } = await db._pool.query(
    'DELETE FROM bulk_email_templates WHERE id = $1::bigint',
    [id],
  );
  return rowCount > 0;
}

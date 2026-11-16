import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import db from '../config/db.js';
import emailConfig from '../config/emailConfig.js';
import { getActiveAccounts } from '../models/emailAccountModel.js';

// Polls the bulk-email sender inbox and turns replies to a campaign into CRM
// leads. Matching is by sender address (a campaign recipient replying) with the
// campaign subject as a fallback. Processed message ids live in
// bulk_email_replies so re-polling never duplicates a lead -- deliberately not
// email_import_log, which the bank-alert importer shares.

let lastResult = { success: null, message: 'Not run yet', processed: 0, skipped: 0, timestamp: null, error: null };

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();

function normalizeSubject(subject) {
  let s = String(subject || '').toLowerCase().trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i += 1) {
    const next = s.replace(/^(re|fwd?|aw|sv)\s*:\s*/i, '').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function bodyText(parsed) {
  const text = String(parsed.text || '').trim();
  return text || stripHtml(parsed.html || '');
}

// Keep the fresh reply, drop the quoted thread below it.
function replySnippet(text) {
  const clean = String(text || '').replace(/\r/g, '').trim();
  if (!clean) return '';
  const kept = [];
  for (const line of clean.split('\n')) {
    if (/^\s*>/.test(line)) break;
    if (/^on .*wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*original message\s*-{2,}/i.test(line)) break;
    kept.push(line);
  }
  const out = kept.join('\n').trim() || clean;
  return out.slice(0, 2000);
}

async function loadCampaignMaps() {
  const { rows } = await db._pool.query(
    `SELECT id, subject, recipients, created_at
       FROM bulk_email_logs
      WHERE created_at > NOW() - INTERVAL '180 days'
      ORDER BY created_at DESC`,
  );
  const byEmail = new Map();
  const bySubject = new Map();
  for (const campaign of rows) {
    const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : [];
    const subjectKey = normalizeSubject(campaign.subject);
    if (subjectKey && !bySubject.has(subjectKey)) bySubject.set(subjectKey, campaign);
    for (const recipient of recipients) {
      const email = normalizeEmail(recipient?.email);
      if (!email || byEmail.has(email)) continue;
      byEmail.set(email, { campaign, recipientName: recipient?.name || null });
    }
  }
  return { byEmail, bySubject };
}

async function upsertLeadForReply({ campaign, senderEmail, senderName, receivedAt, body }) {
  const ref = `Bulk email campaign #${campaign.id}: ${campaign.subject}`;
  const at = receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString();
  const replyBlock = `--- Reply received ${at.slice(0, 16).replace('T', ' ')} UTC ---\n${body || '(no text)'}`;

  const { rows: existing } = await db._pool.query(
    `SELECT id, notes
       FROM leads
      WHERE lower(email) = lower($1) AND source = 'Bulk Email'
      ORDER BY (notes LIKE $2) DESC, created_at DESC
      LIMIT 1`,
    [senderEmail, `%campaign #${campaign.id}%`],
  );

  if (existing.length) {
    const lead = existing[0];
    const nextNotes = `${lead.notes || ref}\n\n${replyBlock}`.slice(0, 8000);
    await db._pool.query(
      `UPDATE leads SET status = 'replied', notes = $2, updated_at = NOW() WHERE id = $1`,
      [lead.id, nextNotes],
    );
    return { leadId: lead.id, created: false };
  }

  const name = (senderName && String(senderName).trim()) || senderEmail.split('@')[0];
  const notes = `${ref}\n\n${replyBlock}`.slice(0, 8000);
  const { rows: inserted } = await db._pool.query(
    `INSERT INTO leads (name, email, phone, source, status, notes, created_by, created_by_name)
     VALUES ($1, $2, NULL, 'Bulk Email', 'replied', $3, NULL, NULL)
     RETURNING id`,
    [name, senderEmail, notes],
  );
  return { leadId: inserted[0].id, created: true };
}

async function pollAccount(account, maps, stats) {
  const client = new ImapFlow({
    host: account.imap_host || 'imap.gmail.com',
    port: account.imap_port || 993,
    secure: true,
    auth: { user: account.email, pass: account.app_password },
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    let uids = [];
    try {
      uids = await client.search({ seen: false });
    } catch {
      uids = [];
    }
    if (!uids || !uids.length) {
      await client.logout();
      return;
    }
    if (uids.length > 200) uids = uids.slice(-200);

    for await (const msg of client.fetch(uids, { source: true, uid: true, flags: true })) {
      try {
        const parsed = await simpleParser(msg.source);
        const messageId = parsed.messageId || (msg.uid ? `uid-${msg.uid}` : null);
        if (!messageId) { stats.skipped += 1; continue; }

        const { rows: seen } = await db._pool.query(
          'SELECT 1 FROM bulk_email_replies WHERE message_id = $1 LIMIT 1',
          [messageId],
        );
        if (seen.length) { stats.skipped += 1; continue; }

        const from = parsed.from?.value?.[0] || {};
        const senderEmail = normalizeEmail(from.address);
        if (!senderEmail) { stats.skipped += 1; continue; }

        const subjectRaw = parsed.subject || '';
        const byEmail = maps.byEmail.get(senderEmail);
        const bySubject = maps.bySubject.get(normalizeSubject(subjectRaw));
        const match = byEmail || (bySubject ? { campaign: bySubject, recipientName: null } : null);
        if (!match) { stats.skipped += 1; continue; }

        const campaign = match.campaign;
        const receivedAt = parsed.date || new Date().toISOString();
        const campaignMs = new Date(campaign.created_at).getTime();
        const receivedMs = new Date(receivedAt).getTime();
        if (Number.isFinite(campaignMs) && Number.isFinite(receivedMs) && receivedMs < campaignMs - 7 * 24 * 3600 * 1000) {
          stats.skipped += 1;
          continue;
        }

        const body = replySnippet(bodyText(parsed));
        const result = await upsertLeadForReply({
          campaign,
          senderEmail,
          senderName: match.recipientName || from.name || null,
          receivedAt,
          body,
        });

        await db._pool.query(
          `INSERT INTO bulk_email_replies (message_id, campaign_id, lead_id, from_email, from_name, subject, received_at, body)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (message_id) DO NOTHING`,
          [
            messageId,
            campaign.id,
            result.leadId,
            senderEmail,
            from.name || match.recipientName || null,
            String(subjectRaw).slice(0, 500),
            new Date(receivedAt).toISOString(),
            body || null,
          ],
        );

        try { await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true }); } catch {}
        stats.processed += 1;
      } catch (err) {
        console.error('[bulkEmailReplies] message error:', err.message);
        stats.skipped += 1;
      }
    }

    await client.logout();
  } catch (err) {
    try { await client.logout(); } catch {}
    stats.errors += 1;
    stats.error = err.message;
  }
}

export async function pollBulkEmailReplies() {
  let accounts = [];
  try {
    accounts = await getActiveAccounts();
  } catch {
    accounts = [];
  }

  if (!accounts || accounts.length === 0) {
    if (emailConfig.enabled && emailConfig.imap.auth.user && emailConfig.imap.auth.pass) {
      accounts = [{
        id: null,
        name: 'Default',
        email: emailConfig.imap.auth.user,
        app_password: emailConfig.imap.auth.pass,
        imap_host: emailConfig.imap.host,
        imap_port: emailConfig.imap.port,
      }];
    } else {
      lastResult = {
        success: null,
        message: 'No email account configured for bulk email replies.',
        processed: 0,
        skipped: 0,
        timestamp: new Date().toISOString(),
        error: null,
      };
      return lastResult;
    }
  }

  const maps = await loadCampaignMaps();
  const stats = { processed: 0, skipped: 0, errors: 0, error: null };
  for (const account of accounts) {
    await pollAccount(account, maps, stats);
  }

  lastResult = {
    success: stats.errors === 0,
    message: `Replies captured: ${stats.processed} | skipped: ${stats.skipped} | accounts: ${accounts.length}`,
    processed: stats.processed,
    skipped: stats.skipped,
    timestamp: new Date().toISOString(),
    error: stats.error,
  };
  return lastResult;
}

export function getLastBulkReplyPollResult() {
  return lastResult;
}

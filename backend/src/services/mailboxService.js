import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import db from '../config/db.js';
import { emitDbChange } from '../socket.js';
import { getSenderByEmail, listActiveSenders } from '../models/bulkEmailSenderModel.js';
import { normalizeAppPassword } from './bulkEmailSenderService.js';

// ---------------------------------------------------------------------------
// Inbound mailbox mirror for the Bulk Email "Mailbox" tab.
//
// Senders are mailboxes in bulk_email_senders, so the same credentials that
// authenticate SMTP are reused for IMAP. Sync is incremental: email_mailbox_state
// remembers the highest UID already stored, so a poll only asks IMAP for what is
// new. Messages are mirrored into email_messages; attachments stay on the server
// and are fetched on demand.
//
// This module is self-contained on purpose (its own campaign matcher and lead
// upsert) so it can be called from the scheduler without importing the reply
// importer, which would create a cycle.
// ---------------------------------------------------------------------------

const INBOX = 'INBOX';
const MAX_BODY_CHARS = 500 * 1024;
const DEFAULT_SINCE_DAYS = 15;
const DEFAULT_FETCH_LIMIT = 100;

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * IMAP endpoint for a sender. The SMTP host already tells us the provider, so
 * a Hostinger mailbox maps to imap.hostinger.com instead of Gmail (which is
 * what the old reply importer assumed for every sender).
 */
export function imapConfigForSender(sender) {
  const smtpHost = String(sender?.smtp_host || '').trim().toLowerCase();
  const email = normalizeEmail(sender?.email);

  let host = 'imap.gmail.com';
  if (smtpHost.includes('hostinger')) host = 'imap.hostinger.com';
  else if (smtpHost.includes('gmail') || smtpHost.includes('googlemail')) host = 'imap.gmail.com';
  else if (smtpHost.includes('outlook') || smtpHost.includes('office365')) host = 'outlook.office365.com';
  else if (smtpHost.includes('zoho')) host = 'imap.zoho.com';
  else {
    const domain = email.split('@')[1];
    if (domain) host = `imap.${domain}`;
  }

  return {
    host,
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: normalizeAppPassword(sender?.app_password, sender?.smtp_host),
    },
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  };
}

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeSubject(subject) {
  let s = String(subject || '').toLowerCase().trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i += 1) {
    const next = s.replace(/^(re|fwd?|aw|sv)\s*:\s*/i, '').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function snippetFrom(text, html) {
  const raw = String(text || '').trim()
    || String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function flagsToArray(flags) {
  if (!flags) return [];
  if (Array.isArray(flags)) return flags;
  if (flags instanceof Set) return Array.from(flags);
  try { return Array.from(flags); } catch { return []; }
}

async function readState(accountEmail) {
  const { rows } = await db._pool.query(
    'SELECT * FROM email_mailbox_state WHERE account_email = $1',
    [accountEmail],
  );
  return rows[0] || null;
}

async function writeState(accountEmail, { uidValidity, lastUid, error }) {
  await db._pool.query(
    `INSERT INTO email_mailbox_state (account_email, folder, uid_validity, last_uid, last_synced_at, last_error)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (account_email) DO UPDATE
       SET folder = EXCLUDED.folder,
           uid_validity = COALESCE(EXCLUDED.uid_validity, email_mailbox_state.uid_validity),
           last_uid = COALESCE(EXCLUDED.last_uid, email_mailbox_state.last_uid),
           last_synced_at = NOW(),
           last_error = EXCLUDED.last_error`,
    [accountEmail, INBOX, uidValidity || null, lastUid || null, error || null],
  );
}

/** Campaign lookup reused for tagging inbound mail with the campaign it answers. */
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
  return (kept.join('\n').trim() || clean).slice(0, 2000);
}

/** One lead per replying address; the reply text is appended to its notes. */
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

/**
 * Pull new messages for one sender mailbox. Returns a summary instead of
 * throwing for IMAP problems, so the sync button always has something to show.
 */
export async function syncMailbox(email, { sinceDays = DEFAULT_SINCE_DAYS, limit = DEFAULT_FETCH_LIMIT } = {}) {
  const accountEmail = normalizeEmail(email);
  if (!accountEmail) throw new Error('Mailbox email is required');

  const sender = await getSenderByEmail(accountEmail);
  if (!sender) throw new Error(`${accountEmail} is not added as a sender email`);
  if (sender.is_active === false) throw new Error(`${accountEmail} is inactive`);
  if (!sender.app_password) throw new Error(`Password is missing for ${accountEmail}`);

  const state = await readState(accountEmail);
  const since = new Date(Date.now() - Math.max(1, sinceDays) * 24 * 3600 * 1000);

  const client = new ImapFlow(imapConfigForSender(sender));
  const stats = { account: accountEmail, synced: 0, skipped: 0, error: null };

  try {
    await client.connect();
  } catch (error) {
    const message = `Could not connect to the mail server: ${error?.message || error}`;
    await writeState(accountEmail, { uidValidity: state?.uid_validity, lastUid: state?.last_uid, error: message }).catch(() => {});
    return { ...stats, error: message };
  }

  let lock = null;
  try {
    lock = await client.getMailboxLock(INBOX);
    const mailbox = client.mailbox || {};
    const uidValidity = Number(mailbox.uidValidity) || Number(state?.uid_validity) || null;
    const sameServerSession = !state?.uid_validity || !uidValidity
      || String(state.uid_validity) === String(uidValidity);
    const startUid = state?.last_uid && sameServerSession ? Number(state.last_uid) + 1 : null;

    let uids = [];
    try {
      uids = startUid
        ? await client.search({ uid: `${startUid}:*` }, { uid: true })
        : await client.search({ since }, { uid: true });
    } catch {
      uids = [];
    }
    if (!Array.isArray(uids)) uids = [];
    uids = uids.filter((uid) => Number.isFinite(Number(uid)));
    if (uids.length > limit) uids = uids.slice(-limit);

    if (uids.length) {
      const maps = await loadCampaignMaps();
      // A changed UIDVALIDITY means the server renumbered the mailbox, so the
      // stored bookmark is meaningless and counting starts from zero.
      let highestUid = sameServerSession ? (Number(state?.last_uid) || 0) : 0;

      for await (const msg of client.fetch(uids, { source: true, flags: true, size: true }, { uid: true })) {
        try {
          const uid = Number(msg.uid) || null;
          if (uid && uid > highestUid) highestUid = uid;

          const parsed = await simpleParser(msg.source);
          const messageId = String(parsed.messageId || `uid-${uid}@${accountEmail}`);
          const from = parsed.from?.value?.[0] || {};
          const fromEmail = normalizeEmail(from.address);
          const flags = flagsToArray(msg.flags);
          const isRead = flags.includes('\\Seen');

          const attachments = (parsed.attachments || []).map((file, index) => ({
            index,
            filename: file.filename || `attachment-${index + 1}`,
            contentType: file.contentType || 'application/octet-stream',
            size: Number(file.size) || (file.content?.length || 0),
          }));

          const subject = String(parsed.subject || '');
          const bodyText = truncate(parsed.text, MAX_BODY_CHARS);
          const bodyHtml = truncate(parsed.html, MAX_BODY_CHARS);
          const receivedAt = parsed.date ? new Date(parsed.date) : new Date();

          const byEmail = fromEmail ? maps.byEmail.get(fromEmail) : null;
          const bySubject = maps.bySubject.get(normalizeSubject(subject));
          const match = byEmail || (bySubject ? { campaign: bySubject, recipientName: null } : null);
          const campaignId = match?.campaign?.id || null;

          const saved = await db._pool.query(
            `INSERT INTO email_messages
               (account_email, folder, uid, uid_validity, message_id, from_email, from_name,
                to_email, subject, snippet, body_text, body_html, has_attachments, attachments,
                size_bytes, received_at, is_read, campaign_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18)
             ON CONFLICT (account_email, message_id) DO UPDATE
               SET uid = EXCLUDED.uid,
                   is_read = email_messages.is_read OR EXCLUDED.is_read,
                   campaign_id = COALESCE(email_messages.campaign_id, EXCLUDED.campaign_id)
             RETURNING id, (xmax = 0) AS is_new`,
            [
              accountEmail,
              INBOX,
              uid,
              uidValidity,
              messageId,
              fromEmail || null,
              from.name || null,
              String(parsed.to?.value?.[0]?.address || accountEmail),
              subject || '(no subject)',
              snippetFrom(bodyText, bodyHtml),
              bodyText,
              bodyHtml || null,
              attachments.length > 0,
              JSON.stringify(attachments),
              Number(msg.size) || null,
              receivedAt,
              isRead,
              campaignId,
            ],
          );
          stats.synced += 1;

          // Push the new mail to open tabs. Only genuine inserts are broadcast
          // (xmax = 0) so a re-sync of the same message never re-notifies.
          const insertedRow = saved.rows[0];
          if (insertedRow?.is_new) {
            try {
              emitDbChange({
                table: 'email_messages',
                schema: 'public',
                eventType: 'INSERT',
                new: {
                  id: insertedRow.id,
                  account_email: accountEmail,
                  folder: INBOX,
                  message_id: messageId,
                  from_email: fromEmail || null,
                  from_name: from.name || null,
                  to_email: String(parsed.to?.value?.[0]?.address || accountEmail),
                  subject: subject || '(no subject)',
                  snippet: snippetFrom(bodyText, bodyHtml),
                  has_attachments: attachments.length > 0,
                  attachments,
                  size_bytes: Number(msg.size) || null,
                  received_at: receivedAt,
                  is_read: isRead,
                  campaign_id: campaignId,
                  lead_id: null,
                },
                old: null,
              });
            } catch (emitError) {
              console.error('[mailbox] realtime emit failed:', emitError?.message || emitError);
            }
          }

          // A reply to a campaign is also mirrored into bulk_email_replies so the
          // existing Email Leads view and the reply importer stay in sync. The
          // insert is the dedupe gate: only the first path writes the lead note.
          if (match?.campaign) {
            const inserted = await db._pool.query(
              `INSERT INTO bulk_email_replies (message_id, campaign_id, from_email, from_name, subject, received_at, body)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (message_id) DO NOTHING
               RETURNING message_id`,
              [
                messageId,
                match.campaign.id,
                fromEmail || null,
                from.name || null,
                subject || null,
                receivedAt,
                replySnippet(bodyText) || null,
              ],
            );
            if (inserted.rowCount > 0) {
              try {
                const lead = await upsertLeadForReply({
                  campaign: match.campaign,
                  senderEmail: fromEmail,
                  senderName: match.recipientName || from.name || null,
                  receivedAt,
                  body: replySnippet(bodyText),
                });
                if (lead?.leadId) {
                  await db._pool.query(
                    'UPDATE bulk_email_replies SET lead_id = $2 WHERE message_id = $1',
                    [messageId, lead.leadId],
                  );
                  await db._pool.query(
                    'UPDATE email_messages SET lead_id = $2 WHERE account_email = $1 AND message_id = $3',
                    [accountEmail, lead.leadId, messageId],
                  );
                }
              } catch (leadError) {
                console.error('[mailbox] lead upsert failed:', leadError?.message || leadError);
              }
            }
          }
        } catch (messageError) {
          stats.skipped += 1;
          console.error('[mailbox] message error:', messageError?.message || messageError);
        }
      }

      await writeState(accountEmail, { uidValidity, lastUid: highestUid, error: null });
    } else {
      await writeState(accountEmail, { uidValidity, lastUid: state?.last_uid, error: null });
    }

    return stats;
  } catch (error) {
    const message = error?.message || 'Mailbox sync failed';
    await writeState(accountEmail, { uidValidity: state?.uid_validity, lastUid: state?.last_uid, error: message }).catch(() => {});
    return { ...stats, error: message };
  } finally {
    try { lock?.release(); } catch { /* best effort */ }
    try { await client.logout(); } catch { /* best effort */ }
  }
}

/** Senders are polled one at a time so a shared mailbox never opens 4 sessions. */
export async function syncAllMailboxes() {
  let senders = [];
  try {
    senders = await listActiveSenders();
  } catch (error) {
    console.error('[mailbox] could not load senders:', error?.message || error);
    return [];
  }

  const results = [];
  for (const sender of senders) {
    if (!sender?.email) continue;
    try {
      results.push(await syncMailbox(sender.email));
    } catch (error) {
      results.push({ account: sender.email, synced: 0, skipped: 0, error: error?.message || 'Sync failed' });
    }
    await sleep(500);
  }
  return results;
}

export async function listMailboxMessages({ email, folder = 'INBOX', search = '', unreadOnly = false, limit = 50, before = null } = {}) {
  const accountEmail = normalizeEmail(email);
  if (!accountEmail) throw new Error('Mailbox email is required');

  const folderName = String(folder || '').toLowerCase() === 'sent' ? 'Sent' : INBOX;
  const params = [accountEmail, folderName];
  const where = ['account_email = $1', 'folder = $2'];

  const term = String(search || '').trim();
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(subject ILIKE $${params.length} OR from_email ILIKE $${params.length}
                 OR to_email ILIKE $${params.length}
                 OR from_name ILIKE $${params.length} OR snippet ILIKE $${params.length})`);
  }
  if (unreadOnly) where.push('is_read = FALSE');
  if (before) {
    params.push(before);
    where.push(`received_at < $${params.length}`);
  }

  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  params.push(limitNum);

  const [{ rows }, { rows: counts }] = await Promise.all([
    db._pool.query(
      `SELECT id, account_email, folder, from_email, from_name, to_email, to_name, subject, snippet,
              has_attachments, attachments, size_bytes, received_at, is_read, campaign_id, lead_id
         FROM email_messages
        WHERE ${where.join(' AND ')}
        ORDER BY received_at DESC NULLS LAST, id DESC
        LIMIT $${params.length}`,
      params,
    ),
    db._pool.query(
      `SELECT COUNT(*) FILTER (WHERE folder = 'INBOX')::int AS inbox_total,
              COUNT(*) FILTER (WHERE folder = 'INBOX' AND is_read = FALSE)::int AS unread,
              COUNT(*) FILTER (WHERE folder = 'Sent')::int AS sent_total,
              MAX(received_at) AS latest
         FROM email_messages
        WHERE account_email = $1`,
      [accountEmail],
    ),
  ]);

  const state = await readState(accountEmail);
  return {
    messages: rows,
    folder: folderName,
    total: folderName === 'Sent' ? (counts[0]?.sent_total || 0) : (counts[0]?.inbox_total || 0),
    inbox_total: counts[0]?.inbox_total || 0,
    sent_total: counts[0]?.sent_total || 0,
    unread: counts[0]?.unread || 0,
    latest: counts[0]?.latest || null,
    last_synced_at: state?.last_synced_at || null,
    last_error: state?.last_error || null,
  };
}

export async function getMailboxMessage(id) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const { rows } = await db._pool.query('SELECT * FROM email_messages WHERE id = $1', [numeric]);
  const message = rows[0];
  if (!message) return null;

  // Sent rows are created per recipient without duplicating the body, so the
  // reading pane borrows the campaign copy. Attachments already point at
  // bulk_email_attachments via their metadata.
  if (message.folder === 'Sent' && !message.body_html && !message.body_text && message.campaign_id) {
    try {
      const { rows: campaigns } = await db._pool.query(
        'SELECT body, html FROM bulk_email_logs WHERE id = $1::bigint',
        [message.campaign_id],
      );
      const campaign = campaigns[0];
      if (campaign) {
        message.body_text = campaign.body || message.body_text || null;
        message.body_html = campaign.html || message.body_html || null;
      }
    } catch (error) {
      console.error('[mailbox] campaign body lookup failed:', error?.message || error);
    }
  }

  return message;
}

async function withImapFor(accountEmail, run) {
  const sender = await getSenderByEmail(accountEmail);
  if (!sender) throw new Error(`${accountEmail} is not added as a sender email`);
  const client = new ImapFlow(imapConfigForSender(sender));
  let lock = null;
  try {
    await client.connect();
    lock = await client.getMailboxLock(INBOX);
    return await run(client);
  } finally {
    try { lock?.release(); } catch { /* best effort */ }
    try { await client.logout(); } catch { /* best effort */ }
  }
}

/** Attachment bytes are pulled from IMAP on demand, never stored in Postgres. */
export async function getMailboxAttachment(id, index) {
  const message = await getMailboxMessage(id);
  if (!message) return null;

  const wanted = Number(index);
  if (!Number.isInteger(wanted) || wanted < 0) throw new Error('Invalid attachment');

  const meta = Array.isArray(message.attachments) ? message.attachments : [];

  // Sent mail was composed in the CRM, so its attachment bytes already live in
  // bulk_email_attachments — no IMAP round trip needed.
  if (message.folder === 'Sent') {
    const entry = meta[wanted];
    if (!entry?.campaignAttachmentId) return null;
    const { rows } = await db._pool.query(
      'SELECT filename, content_type, data FROM bulk_email_attachments WHERE id = $1::bigint',
      [entry.campaignAttachmentId],
    );
    const row = rows[0];
    if (!row?.data) return null;
    return {
      filename: row.filename || entry.filename || `attachment-${wanted + 1}`,
      contentType: row.content_type || entry.contentType || 'application/octet-stream',
      content: row.data,
    };
  }

  if (!message.uid) throw new Error('This message has no server reference any more');

  return withImapFor(message.account_email, async (client) => {
    const uid = Number(message.uid);
    for await (const msg of client.fetch(`${uid}`, { source: true }, { uid: true })) {
      const parsed = await simpleParser(msg.source);
      const file = (parsed.attachments || [])[wanted];
      if (!file) return null;
      return {
        filename: file.filename || `attachment-${wanted + 1}`,
        contentType: file.contentType || 'application/octet-stream',
        content: file.content,
      };
    }
    return null;
  });
}

/** Mirror the read flag to IMAP so webmail and the CRM agree. */
export async function setMailboxMessageRead(id, read = true) {
  const message = await getMailboxMessage(id);
  if (!message) return null;

  const { rows } = await db._pool.query(
    'UPDATE email_messages SET is_read = $2 WHERE id = $1 RETURNING id, is_read',
    [message.id, read !== false],
  );

  if (message.uid) {
    try {
      await withImapFor(message.account_email, async (client) => {
        const uid = Number(message.uid);
        if (read === false) await client.messageFlagsRemove(`${uid}`, ['\\Seen'], { uid: true });
        else await client.messageFlagsAdd(`${uid}`, ['\\Seen'], { uid: true });
      });
    } catch (error) {
      // The local flag is already saved; a dead IMAP session must not fail the
      // request. The next sync re-reads the server flag.
      console.error('[mailbox] could not sync read flag:', error?.message || error);
    }
  }

  return rows[0] || null;
}

let schedulerTimer = null;
let schedulerRunning = false;

// How often every sender mailbox is polled. Two minutes keeps the Mailbox tab
// feeling live without holding IMAP connections open (IDLE) on a shared host.
function schedulerIntervalMs() {
  const value = Number(process.env.MAILBOX_SYNC_INTERVAL_MS);
  if (Number.isFinite(value) && value >= 30000) return Math.floor(value);
  return 2 * 60 * 1000;
}

/** Poll every sender mailbox in the background. Safe to call twice. */
export function startMailboxScheduler(intervalMs = schedulerIntervalMs()) {
  if (schedulerTimer) return;
  const tick = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      const results = await syncAllMailboxes();
      const failed = results.filter((r) => r.error);
      if (failed.length) console.error('[mailbox] sync errors:', failed.map((r) => `${r.account}: ${r.error}`).join(' | '));
    } catch (error) {
      console.error('[mailbox] scheduler error:', error?.message || error);
    } finally {
      schedulerRunning = false;
    }
  };
  // First run shortly after boot so startup is not slowed down by IMAP.
  setTimeout(() => { tick().catch(() => {}); }, 20 * 1000);
  schedulerTimer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
  schedulerTimer.unref?.();
}

export function stopMailboxScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

import db from '../config/db.js';

export async function ensureBulkEmailSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_email_logs (
      id BIGSERIAL PRIMARY KEY,
      subject TEXT NOT NULL,
      body TEXT,
      source TEXT,
      total_recipients INT NOT NULL DEFAULT 0,
      sent_count INT NOT NULL DEFAULT 0,
      failed_count INT NOT NULL DEFAULT 0,
      recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_email_logs_created_at ON bulk_email_logs(created_at DESC);`);

  // Campaign queue/progress. A campaign row is inserted before sending starts so
  // a crash or restart cannot lose the record of who was meant to receive it.
  // `status` moves queued -> processing -> completed | partial | failed |
  // cancelled | interrupted. `recipients` is an array of
  // { email, name, ok: true|false|null, error } where null means not yet tried.
  await db._pool.query(`
    ALTER TABLE bulk_email_logs
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
      ADD COLUMN IF NOT EXISTS processed_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS html TEXT,
      ADD COLUMN IF NOT EXISTS attachment_name TEXT,
      ADD COLUMN IF NOT EXISTS attachment_type TEXT,
      ADD COLUMN IF NOT EXISTS attachment_data BYTEA,
      ADD COLUMN IF NOT EXISTS last_error TEXT,
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
  `);

  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_email_logs_status ON bulk_email_logs(status);`);

  // Sender mailboxes for bulk campaigns. Each row is one Gmail account plus its
  // app password, so a campaign can go out from any of the NGO's accounts
  // without touching environment variables. Kept separate from
  // email_import_accounts (bank-alert IMAP polling) on purpose.
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_email_senders (
      id BIGSERIAL PRIMARY KEY,
      display_name TEXT,
      email TEXT NOT NULL UNIQUE,
      app_password TEXT NOT NULL,
      smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
      smtp_port INT NOT NULL DEFAULT 465,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_email_senders_active ON bulk_email_senders(is_active);`);

  // Which sender a campaign went out from, so history and Resume stay correct
  // even after the account is edited.
  await db._pool.query(`
    ALTER TABLE bulk_email_logs
      ADD COLUMN IF NOT EXISTS sender_id BIGINT,
      ADD COLUMN IF NOT EXISTS sender_email TEXT;
  `);

  // One-time hand-off from the old env-only sender. Runs only while the table is
  // empty, so removing GMAIL_USER/GMAIL_APP_PASSWORD later makes it a no-op.
  const seedEmail = String(process.env.GMAIL_USER || '').trim().toLowerCase();
  const seedPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (seedEmail && seedPassword) {
    const { rows: seedRows } = await db._pool.query('SELECT COUNT(*)::int AS count FROM bulk_email_senders');
    if (!seedRows[0]?.count) {
      await db._pool.query(
        `INSERT INTO bulk_email_senders (display_name, email, app_password)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        ['Being Sevak Charitable Trust', seedEmail, seedPassword],
      );
      console.log('[bulkEmail] Seeded the initial sender from GMAIL_USER env.');
    }
  }

  // Multiple attachments per campaign/template. Stored as one row per file so
  // large binaries never bloat the parent row and streaming stays cheap.
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_email_attachments (
      id BIGSERIAL PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id BIGINT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT,
      data BYTEA NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_email_attachments_owner ON bulk_email_attachments(owner_type, owner_id);`);

  // One-time migration of the old single-attachment columns into the new table.
  await db._pool.query(`
    INSERT INTO bulk_email_attachments (owner_type, owner_id, filename, content_type, data, sort_order)
    SELECT 'campaign', l.id, COALESCE(l.attachment_name, 'attachment'),
           COALESCE(l.attachment_type, 'application/octet-stream'), l.attachment_data, 0
      FROM bulk_email_logs l
     WHERE l.attachment_data IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM bulk_email_attachments a
          WHERE a.owner_type = 'campaign' AND a.owner_id = l.id
       );
  `);
  await db._pool.query(`
    INSERT INTO bulk_email_attachments (owner_type, owner_id, filename, content_type, data, sort_order)
    SELECT 'template', t.id, COALESCE(t.attachment_name, 'attachment'),
           COALESCE(t.attachment_type, 'application/octet-stream'), t.attachment_data, 0
      FROM bulk_email_templates t
     WHERE t.attachment_data IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM bulk_email_attachments a
          WHERE a.owner_type = 'template' AND a.owner_id = t.id
       );
  `);

  // Backfill status for campaigns that were sent before this column existed so
  // old history does not show up as "queued" and offer a pointless Resume.
  await db._pool.query(`
    UPDATE bulk_email_logs
       SET status = CASE
         WHEN sent_count > 0 AND failed_count > 0 THEN 'partial'
         WHEN sent_count > 0 THEN 'completed'
         WHEN failed_count > 0 THEN 'failed'
         ELSE 'completed'
       END
     WHERE status = 'queued'
       AND (sent_count > 0 OR failed_count > 0);
  `);

  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_email_templates (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db._pool.query(`
    ALTER TABLE bulk_email_templates
      ADD COLUMN IF NOT EXISTS attachment_name TEXT,
      ADD COLUMN IF NOT EXISTS attachment_type TEXT,
      ADD COLUMN IF NOT EXISTS attachment_data BYTEA,
      ADD COLUMN IF NOT EXISTS design JSONB,
      ADD COLUMN IF NOT EXISTS html TEXT;
  `);

  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_email_unsubscribes (
      email TEXT PRIMARY KEY,
      source TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Inbound replies to bulk campaigns. One row per processed email so the IMAP
  // poller never turns the same reply into a duplicate lead. Kept separate from
  // email_import_log because the bank-alert importer also logs this inbox and
  // would otherwise mark a reply as processed.
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_email_replies (
      message_id TEXT PRIMARY KEY,
      campaign_id BIGINT,
      lead_id BIGINT,
      from_email TEXT,
      from_name TEXT,
      subject TEXT,
      received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_email_replies_campaign ON bulk_email_replies(campaign_id);`);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_bulk_email_replies_lead ON bulk_email_replies(lead_id);`);
  // The fresh reply text (quoted thread stripped) is stored with the message so
  // the Email Leads view can show it without re-parsing the lead's notes.
  await db._pool.query(`ALTER TABLE bulk_email_replies ADD COLUMN IF NOT EXISTS body TEXT;`);

  await db._pool.query(`
    INSERT INTO bulk_email_templates (name, subject, body, created_by)
    VALUES
      ('Donation Thank You', 'Thank you for your generous support',
       'Dear {{name}},' || E'\n\n' || 'Thank you for your generous support to Being Sevak. Your contribution helps us continue our work for the community.' || E'\n\n' || 'With gratitude,' || E'\n' || 'Team Being Sevak',
       'system'),
      ('Event Invitation', 'You are invited to our upcoming event',
       'Dear {{name}},' || E'\n\n' || 'We would be delighted to have you join us at our upcoming event. Your presence will make the occasion even more special.' || E'\n\n' || 'Warm regards,' || E'\n' || 'Team Being Sevak',
       'system'),
      ('General Update', 'An update from Being Sevak',
       'Dear {{name}},' || E'\n\n' || 'We wanted to share a quick update with you about our recent activities and the impact we are creating together.' || E'\n\n' || 'Thank you for being part of this journey.' || E'\n\n' || 'Team Being Sevak',
       'system'),
      ('Festival Greeting', 'Warm wishes from Being Sevak',
       'Dear {{name}},' || E'\n\n' || 'Wishing you and your family health, happiness and prosperity. Thank you for your continued support.' || E'\n\n' || 'Warm wishes,' || E'\n' || 'Team Being Sevak',
       'system')
    ON CONFLICT (name) DO NOTHING;
  `);

  // Inbound mailbox mirror behind Accounts > Bulk Email > Mailbox. One row per
  // message seen in a sender mailbox. Attachments are metadata only (name,
  // type, size) because the binary is re-fetched from IMAP on demand, so large
  // files never sit in Postgres.
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS email_messages (
      id BIGSERIAL PRIMARY KEY,
      account_email TEXT NOT NULL,
      folder TEXT NOT NULL DEFAULT 'INBOX',
      uid BIGINT,
      uid_validity BIGINT,
      message_id TEXT NOT NULL,
      from_email TEXT,
      from_name TEXT,
      to_email TEXT,
      subject TEXT,
      snippet TEXT,
      body_text TEXT,
      body_html TEXT,
      has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
      attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
      size_bytes INT,
      received_at TIMESTAMPTZ,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      campaign_id BIGINT,
      lead_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db._pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_unique ON email_messages(account_email, message_id);`);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_email_messages_list ON email_messages(account_email, received_at DESC);`);
  await db._pool.query(`CREATE INDEX IF NOT EXISTS idx_email_messages_campaign ON email_messages(campaign_id);`);

  // Recipient display name for the per-recipient Sent rows.
  await db._pool.query(`ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS to_name TEXT;`);
  // Cc/Bcc recorded on the Sent copy so the reading pane can show the real
  // recipient list of a reply.
  await db._pool.query(`ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS cc TEXT;`);
  await db._pool.query(`ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS bcc TEXT;`);
  // Starred flag for the Mailbox list (local to the CRM, like Gmail's star).
  await db._pool.query(`ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT FALSE;`);

  // Incremental sync bookmark: the highest UID already stored for a mailbox, so
  // a poll only asks IMAP for what is new instead of re-reading the inbox.
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS email_mailbox_state (
      account_email TEXT PRIMARY KEY,
      folder TEXT NOT NULL DEFAULT 'INBOX',
      uid_validity BIGINT,
      last_uid BIGINT,
      last_synced_at TIMESTAMPTZ,
      last_error TEXT
    );
  `);

  // One-time backfill so campaigns sent before the Sent mirror existed still
  // show up in Bulk Email > Mailbox > Sent. One row PER RECIPIENT, like Gmail,
  // with attachment metadata linked back to bulk_email_attachments.
  //
  // The first version of this mirror stored a single "N recipients" row per
  // campaign; those rows are removed first so the per-recipient rows replace
  // them instead of sitting alongside them.
  await db._pool.query(`
    DELETE FROM email_messages
     WHERE folder = 'Sent'
       AND message_id ~ '^sent-campaign-[0-9]+@';
  `);
  await db._pool.query(`
    INSERT INTO email_messages
      (account_email, folder, message_id, from_email, from_name, to_email, to_name, subject, snippet,
       body_text, body_html, has_attachments, attachments, received_at, is_read, campaign_id)
    SELECT
      l.sender_email,
      'Sent',
      'sent-campaign-' || l.id || '-' || recipients.rn || '@'
        || COALESCE(NULLIF(split_part(l.sender_email, '@', 2), ''), 'ucs-crm'),
      l.sender_email,
      NULL,
      COALESCE(recipients.rec->>'email', ''),
      NULLIF(recipients.rec->>'name', ''),
      l.subject,
      LEFT(regexp_replace(COALESCE(l.body, ''), '\\s+', ' ', 'g'), 240),
      NULL,
      NULL,
      EXISTS (SELECT 1 FROM bulk_email_attachments a WHERE a.owner_type = 'campaign' AND a.owner_id = l.id),
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'index', files.rn - 1,
                 'filename', files.filename,
                 'contentType', files.content_type,
                 'size', octet_length(files.data),
                 'campaignAttachmentId', files.id
               ) ORDER BY files.rn)
          FROM (
            SELECT id, filename, content_type, data, sort_order,
                   row_number() OVER (ORDER BY sort_order, id) AS rn
              FROM bulk_email_attachments
             WHERE owner_type = 'campaign' AND owner_id = l.id
          ) files
      ), '[]'::jsonb),
      l.created_at,
      TRUE,
      l.id
    FROM bulk_email_logs l
    CROSS JOIN LATERAL (
      SELECT rec, row_number() OVER () AS rn
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(l.recipients) = 'array' THEN l.recipients ELSE '[]'::jsonb END
             ) AS rec
    ) recipients
    WHERE l.sender_email IS NOT NULL
      AND l.sender_email <> ''
      AND NOT EXISTS (SELECT 1 FROM email_messages m WHERE m.folder = 'Sent')
    ON CONFLICT (account_email, message_id) DO NOTHING;
  `);
}

export default ensureBulkEmailSchema;

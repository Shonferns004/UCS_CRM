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
}

export default ensureBulkEmailSchema;

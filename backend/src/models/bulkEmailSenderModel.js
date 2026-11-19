import db from '../config/db.js';
import {
  isValidSenderEmail,
  maskSenderPassword,
  normalizeAppPassword,
  normalizeSenderEmail,
} from '../services/bulkEmailSenderService.js';

// Sender mailboxes for bulk campaigns. The app password is stored here so the
// module no longer depends on GMAIL_USER / GMAIL_APP_PASSWORD env vars.

const isMissingTable = (error) => {
  const message = String(error?.message || '');
  return message.includes('does not exist') || message.includes('relation');
};

function normalizeRow(row) {
  return {
    ...row,
    email: normalizeSenderEmail(row.email),
    smtp_host: String(row.smtp_host || '').trim() || 'smtp.gmail.com',
    smtp_port: Number(row.smtp_port) || 465,
    is_active: row.is_active !== false,
  };
}

export async function listSenders({ activeOnly = false } = {}) {
  try {
    const { rows } = await db._pool.query(
      `SELECT id, display_name, email, app_password, smtp_host, smtp_port, is_active, created_at, updated_at
         FROM bulk_email_senders
        ${activeOnly ? 'WHERE is_active = TRUE' : ''}
        ORDER BY created_at ASC, id ASC`,
    );
    return rows.map(normalizeRow);
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

/** Safe list for the API/UI — the password never leaves the server. */
export async function listPublicSenders() {
  const senders = await listSenders();
  return senders.map((sender) => ({ ...sender, app_password: maskSenderPassword(sender.app_password) }));
}

export async function listActiveSenders() {
  return listSenders({ activeOnly: true });
}

export async function getSenderById(id) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  try {
    const { rows } = await db._pool.query('SELECT * FROM bulk_email_senders WHERE id = $1', [numeric]);
    return rows[0] ? normalizeRow(rows[0]) : null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export async function getSenderByEmail(email) {
  const normalized = normalizeSenderEmail(email);
  if (!normalized) return null;
  try {
    const { rows } = await db._pool.query(
      'SELECT * FROM bulk_email_senders WHERE lower(email) = $1 ORDER BY id ASC LIMIT 1',
      [normalized],
    );
    return rows[0] ? normalizeRow(rows[0]) : null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export async function createSender({ display_name, email, app_password, smtp_host, smtp_port } = {}) {
  const normalizedEmail = normalizeSenderEmail(email);
  if (!normalizedEmail) throw new Error('Email address is required');
  if (!isValidSenderEmail(normalizedEmail)) throw new Error('Enter a valid email address');
  const password = normalizeAppPassword(app_password);
  if (!password) throw new Error('App password is required');

  try {
    const { rows } = await db._pool.query(
      `INSERT INTO bulk_email_senders (display_name, email, app_password, smtp_host, smtp_port)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        String(display_name || '').trim() || null,
        normalizedEmail,
        password,
        String(smtp_host || '').trim() || 'smtp.gmail.com',
        Number(smtp_port) || 465,
      ],
    );
    return normalizeRow(rows[0]);
  } catch (error) {
    if (String(error?.message || '').includes('duplicate key')) {
      throw new Error('This email is already added');
    }
    throw error;
  }
}

export async function updateSender(id, updates = {}) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Sender not found');

  const fields = [];
  const params = [];
  const push = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if (updates.display_name !== undefined) {
    push('display_name', String(updates.display_name || '').trim() || null);
  }
  if (updates.email !== undefined) {
    const normalizedEmail = normalizeSenderEmail(updates.email);
    if (!normalizedEmail) throw new Error('Email address is required');
    if (!isValidSenderEmail(normalizedEmail)) throw new Error('Enter a valid email address');
    push('email', normalizedEmail);
  }
  // Blank password means "keep the current one", matching the email accounts UI.
  if (updates.app_password !== undefined && String(updates.app_password || '').trim()) {
    push('app_password', normalizeAppPassword(updates.app_password));
  }
  if (updates.smtp_host !== undefined) {
    push('smtp_host', String(updates.smtp_host || '').trim() || 'smtp.gmail.com');
  }
  if (updates.smtp_port !== undefined) {
    push('smtp_port', Number(updates.smtp_port) || 465);
  }
  if (updates.is_active !== undefined) {
    push('is_active', updates.is_active !== false);
  }

  if (!fields.length) throw new Error('No fields to update');
  params.push(numeric);

  try {
    const { rows } = await db._pool.query(
      `UPDATE bulk_email_senders
          SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length}
        RETURNING *`,
      params,
    );
    return rows[0] ? normalizeRow(rows[0]) : null;
  } catch (error) {
    if (String(error?.message || '').includes('duplicate key')) {
      throw new Error('This email is already added');
    }
    throw error;
  }
}

export async function deleteSender(id) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return false;
  const { rowCount } = await db._pool.query('DELETE FROM bulk_email_senders WHERE id = $1', [numeric]);
  return rowCount > 0;
}

import { Router } from 'express';
import db from '../config/db.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

// The NGO-level message-template library for Accounts → WhatsApp (OpenWA). A template is
// not tied to a phone number: it is stored against the NGO, so it can be written before a
// session exists and read by every session later assigned to that NGO.
const router = Router();
const ADMIN_ROLES = ['master', 'super_admin', 'accounts', 'admin'];
const requireAdmin = authenticateRole(...ADMIN_ROLES);

const NAME_MAX = 100;
const BODY_MAX = 4096;
const HEADER_FOOTER_MAX = 1024;
const MEDIA_URL_MAX = 2048;
const MEDIA_FILENAME_MAX = 255;
const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'audio', 'document']);

const codePoints = (value) => [...value].length;

// Returns a validation error message, or null when the value is acceptable.
function checkText(value, max) {
  if (typeof value !== 'string') return 'must be a string';
  if (value.includes('\u0000')) return 'must not contain a NUL character';
  if (codePoints(value) > max) return `must be at most ${max} characters`;
  return null;
}

function mapRow(row) {
  return {
    id: row.id,
    ngoId: row.ngo_id,
    name: row.name,
    header: row.header,
    body: row.body,
    footer: row.footer,
    messageType: row.message_type,
    mediaUrl: row.media_url,
    mediaFilename: row.media_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Validate the fields a write would store together. `partial` is true for an update: only
// keys present in the body are checked, but a merged row must still be coherent.
function validate(body, { partial }) {
  const values = {};
  const supplied = (key) => !partial || body[key] !== undefined;

  if (supplied('name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : body.name;
    if (!name) return { error: 'name is required' };
    const problem = checkText(name, NAME_MAX);
    if (problem) return { error: `name ${problem}` };
    values.name = name;
  }

  if (supplied('body')) {
    const value = typeof body.body === 'string' ? body.body.trim() : body.body;
    if (!value) return { error: 'body is required' };
    const problem = checkText(value, BODY_MAX);
    if (problem) return { error: `body ${problem}` };
    values.body = value;
  }

  for (const [key, column, max] of [
    ['header', 'header', HEADER_FOOTER_MAX],
    ['footer', 'footer', HEADER_FOOTER_MAX],
    ['mediaFilename', 'media_filename', MEDIA_FILENAME_MAX],
  ]) {
    if (!supplied(key)) continue;
    const raw = body[key];
    if (raw === null || raw === undefined) {
      values[column] = null;
      continue;
    }
    if (typeof raw !== 'string') return { error: `${key} must be a string` };
    const value = raw.trim();
    const problem = checkText(value, max);
    if (problem) return { error: `${key} ${problem}` };
    values[column] = value || null;
  }

  if (supplied('messageType')) {
    const type = body.messageType ?? 'text';
    if (typeof type !== 'string' || !MESSAGE_TYPES.has(type)) {
      return { error: `messageType must be one of ${[...MESSAGE_TYPES].join(', ')}` };
    }
    values.message_type = type;
  }

  if (supplied('mediaUrl')) {
    const raw = body.mediaUrl;
    if (raw === null || raw === undefined || raw === '') {
      values.media_url = null;
    } else {
      if (typeof raw !== 'string') return { error: 'mediaUrl must be a string' };
      const value = raw.trim();
      const problem = checkText(value, MEDIA_URL_MAX);
      if (problem) return { error: `mediaUrl ${problem}` };
      if (!/^https?:\/\//i.test(value)) {
        return { error: 'mediaUrl must start with http:// or https://' };
      }
      values.media_url = value;
    }
  }

  return { values };
}

// The merged row's message type and media URL must agree: a media template needs a file.
function checkMediaCoherence({ message_type, media_url }) {
  if ((message_type ?? 'text') !== 'text' && !media_url) {
    return 'A media template needs a media file';
  }
  return null;
}

// GET /?ngoId=… — the templates saved for one NGO, newest first.
router.get('/', requireAdmin, async (req, res) => {
  const ngoId = String(req.query.ngoId || '').trim();
  if (!ngoId) return res.status(400).json({ message: 'ngoId is required' });

  try {
    const { rows } = await db._pool.query(
      `SELECT id, ngo_id, name, header, body, footer, message_type, media_url, media_filename,
              created_at, updated_at
         FROM openwa_message_templates
        WHERE ngo_id = $1
        ORDER BY updated_at DESC, created_at DESC`,
      [ngoId],
    );
    return res.json({ templates: rows.map(mapRow) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load templates' });
  }
});

// POST / — create a template for an NGO. No WhatsApp session is required.
router.post('/', requireAdmin, async (req, res) => {
  const ngoId = String(req.body?.ngoId || '').trim();
  if (!ngoId) return res.status(400).json({ message: 'ngoId is required' });

  const { values, error } = validate(req.body || {}, { partial: false });
  if (error) return res.status(400).json({ message: error });
  const mediaProblem = checkMediaCoherence(values);
  if (mediaProblem) return res.status(400).json({ message: mediaProblem });

  try {
    const { data: ngo } = await db.from('ngos').select('id').eq('id', ngoId).maybeSingle();
    if (!ngo) return res.status(400).json({ message: 'Unknown NGO' });

    const { rows } = await db._pool.query(
      `INSERT INTO openwa_message_templates
         (ngo_id, name, header, body, footer, message_type, media_url, media_filename, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, ngo_id, name, header, body, footer, message_type, media_url, media_filename,
                 created_at, updated_at`,
      [
        ngoId,
        values.name,
        values.header ?? null,
        values.body,
        values.footer ?? null,
        values.message_type ?? 'text',
        values.media_url ?? null,
        values.media_filename ?? null,
        req.user?.id || null,
      ],
    );
    return res.status(201).json({ template: mapRow(rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'A template with that name already exists for this NGO' });
    }
    return res.status(500).json({ message: error.message || 'Could not save the template' });
  }
});

// PUT /:id — update the supplied fields. The NGO never changes, so an edit cannot move a
// template between libraries.
router.put('/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'id is required' });

  const { values, error } = validate(req.body || {}, { partial: true });
  if (error) return res.status(400).json({ message: error });
  if (Object.keys(values).length === 0) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  try {
    const { rows: existingRows } = await db._pool.query(
      'SELECT message_type, media_url FROM openwa_message_templates WHERE id = $1',
      [id],
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'Template not found' });

    const mediaProblem = checkMediaCoherence({
      message_type: values.message_type ?? existing.message_type,
      media_url: values.media_url !== undefined ? values.media_url : existing.media_url,
    });
    if (mediaProblem) return res.status(400).json({ message: mediaProblem });

    const columns = Object.keys(values);
    const sets = columns.map((column, index) => `${column} = $${index + 1}`);
    const params = columns.map((column) => values[column]);
    params.push(id);

    const { rows } = await db._pool.query(
      `UPDATE openwa_message_templates
          SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${params.length}
        RETURNING id, ngo_id, name, header, body, footer, message_type, media_url, media_filename,
                  created_at, updated_at`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ message: 'Template not found' });
    return res.json({ template: mapRow(rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'A template with that name already exists for this NGO' });
    }
    return res.status(500).json({ message: error.message || 'Could not update the template' });
  }
});

// DELETE /:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'id is required' });

  try {
    const result = await db._pool.query('DELETE FROM openwa_message_templates WHERE id = $1', [id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Template not found' });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not delete the template' });
  }
});

export default router;

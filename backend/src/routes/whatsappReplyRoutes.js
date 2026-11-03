import { Router } from 'express';
import db from '../config/db.js';
import { authenticate, authenticateRole } from '../middleware/authMiddleware.js';
import { suggestReply } from '../services/whatsappReplySuggester.js';

// Smart replies: the Q&A knowledge base behind the chat page's suggested reply. Operators own the
// answers; the assistant only matches and rewrites them, and every send stays a human decision.
const router = Router();
const ADMIN_ROLES = ['master', 'super_admin', 'accounts', 'admin'];
const requireAdmin = authenticateRole(...ADMIN_ROLES);

const QUESTION_MAX = 400;
const ANSWER_MAX = 4000;
const KEYWORDS_MAX = 400;

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db._pool.query(
      `SELECT id, question, answer, keywords, ngo_id, enabled, created_at, updated_at
         FROM whatsapp_reply_templates
        ORDER BY updated_at DESC`,
    );
    return res.json({ templates: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load reply templates' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const question = clean(req.body?.question, QUESTION_MAX);
  const answer = clean(req.body?.answer, ANSWER_MAX);
  if (question.length < 3) return res.status(400).json({ message: 'The question is too short' });
  if (answer.length < 2) return res.status(400).json({ message: 'The answer is too short' });

  try {
    const { rows } = await db._pool.query(
      `INSERT INTO whatsapp_reply_templates (question, answer, keywords, ngo_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, question, answer, keywords, ngo_id, enabled, created_at, updated_at`,
      [
        question,
        answer,
        clean(req.body?.keywords, KEYWORDS_MAX) || null,
        req.body?.ngoId || null,
        req.user?.id || null,
      ],
    );
    return res.status(201).json({ template: rows[0] });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not save the question' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'id is required' });

  const sets = [];
  const values = [];
  const push = (column, value) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (req.body?.question !== undefined) {
    const question = clean(req.body.question, QUESTION_MAX);
    if (question.length < 3) return res.status(400).json({ message: 'The question is too short' });
    push('question', question);
  }
  if (req.body?.answer !== undefined) {
    const answer = clean(req.body.answer, ANSWER_MAX);
    if (answer.length < 2) return res.status(400).json({ message: 'The answer is too short' });
    push('answer', answer);
  }
  if (req.body?.keywords !== undefined) push('keywords', clean(req.body.keywords, KEYWORDS_MAX) || null);
  if (req.body?.ngoId !== undefined) push('ngo_id', req.body.ngoId || null);
  if (req.body?.enabled !== undefined) push('enabled', Boolean(req.body.enabled));

  if (!sets.length) return res.status(400).json({ message: 'Nothing to update' });

  values.push(id);
  try {
    const { rows } = await db._pool.query(
      `UPDATE whatsapp_reply_templates
          SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${values.length}
        RETURNING id, question, answer, keywords, ngo_id, enabled, created_at, updated_at`,
      values,
    );
    if (!rows[0]) return res.status(404).json({ message: 'That question no longer exists' });
    return res.json({ template: rows[0] });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not update the question' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await db._pool.query('DELETE FROM whatsapp_reply_templates WHERE id = $1', [
      String(req.params.id || ''),
    ]);
    if (!result.rowCount) return res.status(404).json({ message: 'That question no longer exists' });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not delete the question' });
  }
});

// POST /suggest — a draft reply for one inbound message. Open to every signed-in user: the FROs
// answering donors are exactly who needs it. It returns text only; it never sends anything.
router.post('/suggest', authenticate, async (req, res) => {
  const text = clean(req.body?.text, 2000);
  if (!text) return res.status(400).json({ message: 'text is required' });

  try {
    const suggestion = await suggestReply({
      text,
      useAi: req.body?.useAi !== false,
      ngoId: req.body?.ngoId || null,
    });
    return res.json(suggestion);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not build a suggestion' });
  }
});

export default router;

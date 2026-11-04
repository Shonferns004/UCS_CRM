import { Router } from 'express';
import db from '../config/db.js';
import { authenticate, normalizeRole } from '../middleware/authMiddleware.js';
import { resolveFroIdentity, stationAccessForWorker } from './openwaAssignmentsRoutes.js';

// Templates for one chat: resolve the session's NGO, then read that NGO's template
// library. Templates belong to the NGO, not to the session, so every number around a
// chat sees the same set. Admin roles see all; an FRO only sees a session their station
// access covers.
const router = Router();
const ADMIN_ROLES = new Set(['master', 'super_admin', 'accounts', 'admin']);

function gatewayConfig() {
  return {
    baseUrl: String(process.env.OPENWA_GATEWAY_URL || process.env.OPENWA_URL || '').replace(/\/+$/, ''),
    apiKey: String(process.env.OPENWA_GATEWAY_API_KEY || process.env.OPENWA_API_KEY || ''),
  };
}

// The FAQ rules and the AI prompt live on the gateway plugins. The draft endpoint reads them so a
// human-review draft answers exactly like the auto-responder would, without sending anything.
const RESPONDER_CONFIG_TTL_MS = 60_000;
const DRAFT_TEXT_MAX = 2000;
let responderConfigCache = { at: 0, faq: null, ai: null };

async function readPluginConfig(id, baseUrl, apiKey) {
  const payload = await readPlugin(id, baseUrl, apiKey);
  return payload?.config || null;
}

async function readPlugin(id, baseUrl, apiKey) {
  try {
    const response = await fetch(`${baseUrl}/api/plugins/${encodeURIComponent(id)}`, {
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

async function loadResponderConfigs() {
  if (Date.now() - responderConfigCache.at < RESPONDER_CONFIG_TTL_MS) return responderConfigCache;
  const { baseUrl, apiKey } = gatewayConfig();
  if (!baseUrl) return responderConfigCache;
  const [faq, ai] = await Promise.all([
    readPluginConfig('faq-bot', baseUrl, apiKey),
    readPluginConfig('ai-responder', baseUrl, apiKey),
  ]);
  responderConfigCache = { at: Date.now(), faq, ai };
  return responderConfigCache;
}

// Same first-match semantics as the FAQ plugin: contains / exact / regex, in rule order.
function matchFaqRule(rulesJson, text) {
  let rules;
  try {
    rules = JSON.parse(String(rulesJson ?? ''));
  } catch {
    return null;
  }
  if (!Array.isArray(rules)) return null;
  const lower = text.toLowerCase();
  const trimmed = text.trim().toLowerCase();
  for (const rule of rules) {
    if (!rule || typeof rule.pattern !== 'string' || typeof rule.reply !== 'string') continue;
    if (rule.mode === 'contains' && lower.includes(rule.pattern.toLowerCase())) return rule;
    if (rule.mode === 'exact' && trimmed === rule.pattern.toLowerCase()) return rule;
    if (rule.mode === 'regex') {
      try {
        if (new RegExp(rule.pattern, 'i').test(text)) return rule;
      } catch {
        /* an invalid regex is skipped, as the plugin does */
      }
    }
  }
  return null;
}

// The plugin stores only a redacted key. The CRM owns the provider keys, so pick the matching one.
function providerKey(baseUrl) {
  const base = String(baseUrl || '');
  if (base.includes('generativelanguage.googleapis.com')) return process.env.GEMINI_API_KEY || '';
  if (base.includes('api.groq.com')) return process.env.GROQ_API_KEY || '';
  if (base.includes('api.openai.com')) return process.env.OPENAI_API_KEY || '';
  if (base.includes('openrouter.ai')) return process.env.OPENROUTER_API_KEY || '';
  return '';
}

async function draftWithAi(config, text) {
  const baseUrl = String(config?.apiBaseUrl || '').replace(/\/+$/, '');
  const model = String(config?.model || '').trim();
  const key = providerKey(baseUrl);
  if (!baseUrl || !model || !key) return null;

  const systemPrompt =
    String(config?.systemPrompt || '').trim() ||
    'You are a polite WhatsApp assistant for an NGO. Reply briefly, never invent amounts or dates, and ask a team member to follow up.';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    return content || null;
  } catch {
    return null;
  }
}

router.get('/templates', authenticate, async (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

  try {
    const { rows: assignmentRows } = await db._pool.query(
      `SELECT session_id, ngo_id, station
         FROM whatsapp_session_assignments
        WHERE session_id = $1
        ORDER BY created_at ASC`,
      [sessionId],
    );
    const assignment = assignmentRows?.[0] || null;
    if (!assignment) return res.json({ ngoId: null, ngoName: null, templates: [] });

    const role = normalizeRole(req.user?.role);
    if (!ADMIN_ROLES.has(role)) {
      const identity = await resolveFroIdentity(req);
      if (!identity) return res.status(403).json({ message: 'Forbidden' });
      const { permanent, temporary } = await stationAccessForWorker(identity.workerId, identity.agentId);
      // One session can be shared with several stations: allow when ANY of them is hers.
      const allowed = assignmentRows.some((row) => {
        const key = `${row.ngo_id}\u0000${row.station}`;
        return permanent.has(key) || temporary.has(key);
      });
      if (!allowed) return res.status(403).json({ message: 'Forbidden' });
    }

    const [{ rows: templates }, { data: ngo }] = await Promise.all([
      db._pool.query(
        `SELECT id, ngo_id, name, header, body, footer, message_type, media_url, media_filename,
                created_at, updated_at
           FROM openwa_message_templates
          WHERE ngo_id = $1
          ORDER BY updated_at DESC, created_at DESC`,
        [assignment.ngo_id],
      ),
      db.from('ngos').select('name').eq('id', assignment.ngo_id).maybeSingle(),
    ]);

    return res.json({
      ngoId: assignment.ngo_id,
      ngoName: ngo?.name || null,
      templates: templates.map((row) => ({
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
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load templates' });
  }
});

// GET /reply-mode — whether the gateway auto-responders are sending. Every signed-in chat user
// reads this, not just admins, so a non-admin's page knows whether to prefill drafts too.
router.get('/reply-mode', authenticate, async (_req, res) => {
  const { baseUrl, apiKey } = gatewayConfig();
  if (!baseUrl) return res.json({ autoReply: true });
  const [faq, ai, typebot] = await Promise.all([
    readPlugin('faq-bot', baseUrl, apiKey),
    readPlugin('ai-responder', baseUrl, apiKey),
    readPlugin('typebot-connector', baseUrl, apiKey),
  ]);
  return res.json({
    autoReply: faq?.status === 'enabled' || ai?.status === 'enabled' || typebot?.status === 'enabled',
  });
});

// POST /draft — a suggested reply for a donor message, WITHOUT sending it. The chat page puts it
// in the composer so the operator can edit and press Send. Used when auto-send is switched off.
router.post('/draft', authenticate, async (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim();
  const text = String(req.body?.text || '').replace(/\u0000/g, '').trim().slice(0, DRAFT_TEXT_MAX);
  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });
  if (!text) return res.json({ draft: '', source: 'none' });

  try {
    const { faq, ai } = await loadResponderConfigs();
    const faqRule = faq?.rules ? matchFaqRule(faq.rules, text) : null;
    if (faqRule?.reply) {
      return res.json({ draft: String(faqRule.reply), source: 'faq', pattern: faqRule.pattern });
    }
    const aiDraft = await draftWithAi(ai, text);
    if (aiDraft) return res.json({ draft: aiDraft, source: 'ai' });
    return res.json({ draft: '', source: 'none' });
  } catch {
    return res.json({ draft: '', source: 'none' });
  }
});

export default router;

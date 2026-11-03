import db from '../config/db.js';
import { parseJsonLoose } from '../utils/geminiClient.js';
import { AUTO_SUGGEST_THRESHOLD, rankTemplates } from './whatsappReplyMatcher.js';

// Turns a donor message into a *draft* reply. The stored answer is the only source of facts; the
// model is asked to rewrite that answer, never to answer from its own knowledge. Nothing here
// sends anything — the chat page shows the draft and a human decides.

const MAX_TEMPLATES = 500;

// Groq, called directly instead of through the shared suggestion chain. Two reasons, both learned
// from this feature: the chain tries Gemini first (this account's project is denied generation, per
// utils/aiSuggestions.js) and the SDK retries a 429 with backoff, which parked the request for
// minutes. The operator already has the approved answer — the polish is a bonus, so it gets ONE
// attempt with a hard timeout and falls back immediately.
const AI_TIMEOUT_MS =
  Number(process.env.WHATSAPP_REPLY_AI_TIMEOUT_MS) > 0
    ? Number(process.env.WHATSAPP_REPLY_AI_TIMEOUT_MS)
    : 12000;
const AI_MODEL =
  process.env.WHATSAPP_REPLY_AI_MODEL ||
  process.env.GROQ_CHAT_MODEL ||
  process.env.GROQ_CALENDAR_MODEL ||
  'qwen/qwen3.8-27b';

export const replyAiConfigured = () => Boolean(String(process.env.GROQ_API_KEY || '').trim());

function replyPrompt(donorMessage, approvedAnswer) {
  return `You are helping a charity's WhatsApp support agent reply to a donor.

Donor's message: "${donorMessage}"

Approved answer — the ONLY source of facts you may use: "${approvedAnswer}"

Rewrite it as the reply the agent could send, following these rules:
- Answer the donor's actual question directly and completely.
- Use the donor's own language (English, Hindi, Marathi or Hinglish) and script; match their tone.
- Warm, respectful, natural WhatsApp style: plain sentences, no markdown, no bullet points, no emoji.
- At most 60 words.
- Keep every fact, number, name and condition from the approved answer. Add nothing new — if the
  question asks for something the approved answer does not cover, reply only with what it covers.
- Start with the answer itself; only greet if the donor greeted first.

Return JSON exactly as: {"reply": "..."}`;
}

async function draftWithAi(donorMessage, approvedAnswer) {
  const key = String(process.env.GROQ_API_KEY || '').trim();
  if (!key) throw new Error('GROQ_API_KEY is not configured on this server');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.3,
      max_tokens: 320,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You return strict JSON only. No markdown fences, no commentary.',
        },
        { role: 'user', content: replyPrompt(donorMessage, approvedAnswer) },
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const payload = await response.json();
  const text = String(payload?.choices?.[0]?.message?.content || '').trim();
  if (!text) return null;
  const parsed = parseJsonLoose(text);
  const reply = String(parsed?.reply ?? '').trim();
  return reply || null;
}

/**
 * @param {{ text: string, useAi?: boolean, ngoId?: string|null }} input
 * @returns {Promise<{
 *   matched: { id: string, question: string, answer: string, score: number } | null,
 *   draft: string,
 *   source: 'template' | 'ai' | 'none',
 *   alternatives: Array<{ id: string, question: string, score: number }>,
 *   aiConfigured: boolean,
 *   aiError?: string,
 * }>}
 */
export async function suggestReply({ text, useAi = true, ngoId = null }) {
  const message = String(text ?? '').trim().slice(0, 2000);
  const aiConfigured = replyAiConfigured();
  if (!message) {
    return { matched: null, draft: '', source: 'none', alternatives: [], aiConfigured };
  }

  // NGO-scoped rows win over global ones for the same match importance; the untagged rows still
  // apply to everyone, so a small NGO does not have to restate the whole knowledge base.
  const { rows } = await db._pool.query(
    `SELECT id, question, answer, keywords, ngo_id
       FROM whatsapp_reply_templates
      WHERE enabled = true
        AND (ngo_id IS NULL OR ngo_id = $1)
      ORDER BY (ngo_id IS NOT NULL) DESC, updated_at DESC
      LIMIT $2`,
    [ngoId, MAX_TEMPLATES],
  );

  const ranked = rankTemplates(message, rows);
  const best = ranked[0];
  const alternatives = ranked.slice(0, 3).map(row => ({
    id: row.id,
    question: row.question,
    score: row.score,
  }));

  if (!best || best.score < AUTO_SUGGEST_THRESHOLD) {
    return { matched: null, draft: '', source: 'none', alternatives, aiConfigured };
  }

  const matched = {
    id: best.id,
    question: best.question,
    answer: best.answer,
    score: best.score,
  };

  if (!useAi || !aiConfigured) {
    return { matched, draft: best.answer, source: 'template', alternatives, aiConfigured };
  }

  try {
    const draft = await draftWithAi(message, best.answer);
    if (draft) return { matched, draft, source: 'ai', alternatives, aiConfigured };
    return {
      matched,
      draft: best.answer,
      source: 'template',
      alternatives,
      aiConfigured,
      aiError: 'The model returned an empty reply; the approved answer is shown instead.',
    };
  } catch (error) {
    // An AI outage must degrade to the approved wording, not to no suggestion at all.
    return {
      matched,
      draft: best.answer,
      source: 'template',
      alternatives,
      aiConfigured,
      aiError: String(error?.message || error).slice(0, 300),
    };
  }
}

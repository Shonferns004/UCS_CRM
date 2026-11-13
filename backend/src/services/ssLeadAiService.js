// ---------------------------------------------------------------------------
// AI scoring for the SS reply inbox.
//
// Provider: Groq (verified working with qwen/qwen3.8-27b). Gemini is NOT used
// here: on this account gemini-3.8-flash times out and the 2.5/1.5 models are
// 404 ("no longer available to new users"), so a Gemini attempt would only add
// latency before the fallback. The rule engine in ssLeadService.js is the
// fallback when Groq is unavailable or returns junk.
//
// Privacy: phone numbers are masked before the text leaves the server.
// Cost: one call per reply, cached on the lead row (see ssLeadAdminController).
// ---------------------------------------------------------------------------
import groq, { GROQ_CHAT_MODEL } from '../config/groq.js';

export const SS_AI_VERSION = 'ss-v1';

const MODEL = () =>
  (process.env.GROQ_SS_MODEL || '').trim() || GROQ_CHAT_MODEL || 'qwen/qwen3.8-27b';

const maskNumbers = (s) => String(s || '').replace(/\b\d{6,}\b/g, '[number]');

const LABELS = new Set(['interested', 'review', 'low']);

const SYSTEM_PROMPT = `You classify inbound WhatsApp replies for an Indian NGO fundraising CRM.
Return ONLY a JSON object, no prose:
{"label":"interested|review|low","score":0-100,"reason":"max 12 words"}

Rules:
- Template button clicked: "Donate Now", "Interested", "I Want to Donate", "Yes, Send Details" => interested (85-100).
- "More Information", "Volunteer With Us", questions about donating, pickup, 80G, kit => interested or review (60-85).
- "Not Interested", "Maybe Later", "Stop", "Do not call", "wrong number" => low (0-15).
- Business auto-replies: "Thank you for contacting...", "Welcome to...", "We will respond shortly", greetings with no ask => low (0-20).
- Receipt corrections, PAN/80G document requests, complaints about an existing donation => review (25-45), not a new lead.
- Anything ambiguous => review (40-60).
The reason must be short, specific and in English.`;

export async function aiScoreSsReply({ message = '', button = '', template = '' } = {}) {
  const model = MODEL();
  const user = [
    `Reply text: """${maskNumbers(message).slice(0, 700)}"""`,
    `Button clicked: ${maskNumbers(button).slice(0, 60) || 'none'}`,
    `Template: ${maskNumbers(template).slice(0, 80) || 'none'}`,
  ].join('\n');

  const res = await groq.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 120,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
  }, { timeout: 15000 });

  const raw = res?.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI returned non-JSON');
    parsed = JSON.parse(m[0]);
  }

  let label = String(parsed.label || '').toLowerCase().trim();
  if (!LABELS.has(label)) label = 'review';
  let score = Number(parsed.score);
  if (!Number.isFinite(score)) score = label === 'interested' ? 80 : label === 'low' ? 15 : 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    label,
    score,
    reasons: [String(parsed.reason || 'AI suggestion').slice(0, 140)],
    source: 'ai',
    model,
    version: SS_AI_VERSION,
  };
}

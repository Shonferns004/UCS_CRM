/**
 * Gemini client for AI lead tagging, ported from the standalone extractor.
 *
 * The allowed keyword list is the only source of tags, so the model can never
 * invent vocabulary the panel cannot filter on. A missing key is not an error
 * here: callers show "not configured" instead of pretending rows were tagged.
 */

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

export function isAiConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

export function aiModelName() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

function geminiUrl() {
  const base = String(process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = encodeURIComponent(aiModelName());
  const key = encodeURIComponent(String(process.env.GEMINI_API_KEY || '').trim());
  return `${base}/v1beta/models/${model}:generateContent?key=${key}`;
}

function buildPrompt(leads, keywords) {
  const allowed = keywords.map((keyword) => keyword.trim());
  const rows = leads.map((lead) => ({
    id: lead.id,
    name: lead.displayName,
    category: lead.category,
    address: lead.address,
    website: lead.website,
    email: lead.email,
    sources: lead.sourceNames,
  }));

  return [
    'You score leads for a fundraising outreach list.',
    'The user runs an NGO. Telecallers call organisations to ask for donations, CSR support or sponsorships.',
    `Allowed tags (use these exact strings only, do not invent new ones): ${JSON.stringify(allowed)}`,
    'For each lead choose 0 to 3 allowed tags that genuinely apply. If none apply, return an empty tags array.',
    'Give a score from 0 to 100 for how likely this organisation is to donate, fund or sponsor an NGO.',
    '100 means a clear donor/funder match, 0 means no signal at all.',
    'Use the name, category, address, website and email as evidence. A charity that needs donations is not a donor; a foundation, trust, CSR arm or sponsor is.',
    'Give a reason of at most 25 words.',
    'Return JSON only, in this shape:',
    '{"results":[{"id":"<lead id>","tags":["keyword"],"score":0,"reason":""}]}',
    '',
    `Leads: ${JSON.stringify(rows)}`,
  ].join('\n');
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('').trim();
}

function stripFences(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const startArray = body.indexOf('[');
  const from =
    start === -1 ? startArray : startArray === -1 ? start : Math.min(start, startArray);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (from === -1 || end === -1) return body.trim();
  return body.slice(from, end + 1).trim();
}

function parseVerdicts(text, keywords) {
  let parsed;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error('The model returned text that was not valid JSON.');
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results)
      ? parsed.results
      : [];

  const canonical = new Map(keywords.map((keyword) => [keyword.toLowerCase().trim(), keyword]));
  const verdicts = new Map();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id : null;
    if (!id) continue;

    const rawTags = Array.isArray(item.tags) ? item.tags : [];
    const tags = [
      ...new Set(
        rawTags
          .filter((tag) => typeof tag === 'string')
          .map((tag) => canonical.get(tag.toLowerCase().trim()))
          .filter(Boolean),
      ),
    ].slice(0, 3);

    const rawScore = Number(item.score);
    const score = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, Math.round(rawScore)))
      : 0;

    const reason =
      typeof item.reason === 'string' ? item.reason.trim().slice(0, 300) : '';

    verdicts.set(id, { tags, score, reason });
  }

  return verdicts;
}

/**
 * Tags one batch of leads. Resolves to a Map keyed by lead id.
 */
export async function tagLeadsWithGemini(leads, keywords) {
  if (!isAiConfigured()) throw new Error('GEMINI_API_KEY is not set.');

  const response = await fetch(geminiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(leads, keywords) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini returned ${response.status}: ${body.slice(0, 200)}`);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('Gemini returned an unreadable response.');
  }

  if (payload?.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${payload.promptFeedback.blockReason}.`);
  }

  const text = extractText(payload);
  if (!text) throw new Error('Gemini returned an empty response.');

  return parseVerdicts(text, keywords);
}

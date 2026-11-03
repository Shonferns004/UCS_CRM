// Pure matching layer for the WhatsApp smart-reply knowledge base.
//
// A donor's message is compared against each stored question and the best match is drafted into a
// reply. This is deliberately dependency-free and side-effect-free: the suggestion endpoint and its
// unit tests both run this exact code, and no model is involved in deciding *whether* a stored
// answer applies — the AI only rewrites the answer a human already approved, so it can never
// invent a fact about a donation.

// Words that carry no topic in either the donor's message or the stored question. Question words
// (kab / kitna / kaise) are kept: they are exactly what makes two questions different.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with', 'from',
  'and', 'or', 'but', 'if', 'so', 'as', 'it', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'we', 'us', 'you', 'your', 'he', 'she', 'they', 'them', 'his', 'her',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'please', 'pls', 'plz', 'kindly', 'sir', 'madam', 'ji', 'hi', 'hello', 'hey',
  'kya', 'kyu', 'kyun', 'hai', 'hain', 'ho', 'hota', 'hoti', 'hote', 'ka', 'ki', 'ke',
  'ko', 'se', 'me', 'mein', 'par', 'aur', 'ya', 'bhi', 'toh', 'to', 'na', 'nahi', 'haan',
]);

/** Lowercase, strip punctuation/emoji, collapse whitespace. Keeps Devanagari and digits. */
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Topic words of a message: normalized, single characters and filler removed. */
export function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

/** Comma/newline-separated extra triggers, e.g. "80g, tax exempt, receipt". */
function keywordList(value) {
  return String(value ?? '')
    .split(/[,\n]/)
    .map(item => normalizeText(item))
    .filter(Boolean);
}

/**
 * How well one stored question answers a donor message, 0..1.
 *
 * Weighted for the failure that matters: a missed reply is cheap (the operator writes it), a wrong
 * draft is expensive (someone sends a confident, irrelevant answer). So a match needs the stored
 * question's own words covered by the message, not just one shared word.
 */
export function scoreTemplate(query, template) {
  const qTokens = tokenize(query);
  const tTokens = tokenize(template?.question);
  const q = normalizeText(query);
  const t = normalizeText(template?.question);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (!qTokens.length || !tTokens.length) return 0;

  const qSet = new Set(qTokens);
  let shared = 0;
  for (const token of new Set(tTokens)) if (qSet.has(token)) shared++;
  const uniqueTemplateTokens = new Set(tTokens).size;
  const coverage = shared / uniqueTemplateTokens;

  const union = new Set([...qSet, ...tTokens]).size;
  const jaccard = union ? shared / union : 0;

  // Whole-question containment only counts when it is a real phrase, not one word that happens to
  // sit inside a longer question ("donation" inside "what is the minimum donation?").
  const phrase =
    (qTokens.length >= 3 && q.includes(t)) || (tTokens.length >= 3 && t.includes(q)) ? 1 : 0;

  const keywordHit = keywordList(template?.keywords).some(keyword => q.includes(keyword)) ? 1 : 0;

  const score = 0.55 * coverage + 0.2 * jaccard + 0.3 * keywordHit + (phrase ? 0.25 : 0);
  return Math.min(1, Math.round(score * 1000) / 1000);
}

/** The best stored questions for a donor message, highest score first. */
export function rankTemplates(query, templates, limit = 3) {
  const ranked = (Array.isArray(templates) ? templates : [])
    .map(template => ({ ...template, score: scoreTemplate(query, template) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(1, limit));
}

// A draft is only offered automatically above this confidence. Below it the operator gets nothing
// rather than a plausible-looking answer to a question nobody actually asked.
export const AUTO_SUGGEST_THRESHOLD = 0.4;

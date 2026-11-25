// Reader for the `leads.notes` format written by the intake services.
//
// WhatsApp replies use free text plus [Template:]/[Account:] tags. Meta instant
// forms use [Meta Lead:] tags plus "Question: answer" lines, and the old ingest
// also stored "Inbox Url:" which is a Facebook business link the FRO can do
// nothing with.
//
// The FRO only needs the ANSWER the person chose, not the question text and not
// the inbox URL. Meta answers are option slugs ("make_a_donation"), so they are
// made readable here ("Make a donation").

const BOOKKEEPING_TAG = /^\[([^\]]{1,60}):\s*([^\]]*)\]$/;
const KEEP_AS_ANSWER_TAG = new Set(['button', 'reply']);
const META_SKIP_KEY = /^(state|inbox url|inbox_url|inboxurl|city|town|platform|campaign|form|account|meta lead|lead|page|ad|adset)$/i;

const ACRONYMS = [['ngo', 'NGO'], ['csr', 'CSR'], ['emi', 'EMI'], ['upi', 'UPI']];

export function humanizeAnswer(value) {
  let text = String(value ?? '').trim();
  if (!text) return '';
  // Already a sentence ("Yes, call me") — leave it alone.
  if (/\s/.test(text) && !text.includes('_')) return text;
  text = text
    .replace(/_*\/_*/g, ' / ')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [word, label] of ACRONYMS) {
    text = text.replace(new RegExp(`\\b${word}\\b`, 'gi'), label);
  }
  return text.replace(/^[a-z]/, (c) => c.toUpperCase());
}

export function parseLeadNotes(raw) {
  const text = String(raw || '');
  const isMeta = /\[Meta Lead:/i.test(text);
  const tags = {};
  const answers = [];
  const body = [];
  let state = '';

  for (const original of text.split('\n')) {
    const line = original.trim();
    if (!line) continue;

    const tag = BOOKKEEPING_TAG.exec(line);
    if (tag) {
      const key = tag[1].trim().toLowerCase();
      const value = tag[2].trim();
      tags[key] = value;
      // A template button/reply is the actual answer on WhatsApp.
      if (KEEP_AS_ANSWER_TAG.has(key) && value) body.push(value);
      continue;
    }

    const kv = /^([^:]{2,120}):\s*(.+)$/.exec(line);
    if (!kv) {
      body.push(line);
      continue;
    }

    const key = kv[1].trim();
    const value = kv[2].trim();
    if (/^state$/i.test(key)) {
      state = value;
      continue;
    }
    if (META_SKIP_KEY.test(key)) continue;
    answers.push({ q: key, a: value });
  }

  // Meta: the chosen answer only — no question label, no inbox URL.
  // WhatsApp: the reply text (a button click is already folded into body).
  const message = answers.length
    ? answers.map(({ a }) => humanizeAnswer(a)).filter(Boolean).join('\n')
    : body.join('\n');

  return {
    isMeta,
    answers,
    state,
    message,
    template: tags.template || '',
    account: tags.account || 'unknown',
    platform: tags.platform || '',
    campaign: tags.campaign || '',
    form: tags.form || '',
  };
}

import Tesseract from 'tesseract.js';

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
const ID_LABELS = [
  /^upi[ -]*(?:transaction)?[ -]*(?:id|ref(?:erence)?|no\.?)?\s*:?\s*$/i,
  /^google[ -]*(?:pay[ -]*)?transaction[ -]*id\s*:?\s*$/i,
  /^transaction[ -]*(?:id|ref(?:erence)?|no\.?)\s*:?\s*$/i,
  /^(?:ref|ref\.?|ref no|ref id|utr|utr no)\s*:?\s*$/i,
  /upi[ -]*\d/i,
];

function normalizeDateStr(day, monthText, year) {
  const m = MONTHS[monthText.slice(0, 3).toLowerCase()];
  if (!m) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTimeFromLine(line) {
  const m = line.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2];
  const sec = m[3] || '00';
  const ampm = (m[4] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}:${sec}`;
}

function isTimeSuspicious(timeStr) {
  const m = timeStr.match(/^(\d{2}):/);
  if (!m) return false;
  const h = parseInt(m[1]);
  const suffixMatch = timeStr.match(/[ap]m$/i);
  const isPM = suffixMatch && suffixMatch[0].toLowerCase() === 'pm';
  const isAM = suffixMatch && suffixMatch[0].toLowerCase() === 'am';
  if (isPM && h >= 1 && h <= 5) return true;
  if (isAM && h === 12) return true;
  return false;
}

function extractTransactionDataFromText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let upiTransactionId = null;
  let transactionDatetime = null;
  let amount = null;
  let fromName = null;

  for (let i = 0; i < lines.length; i++) {
    if (ID_LABELS.some(p => p.test(lines[i]))) {
      if (i + 1 < lines.length) {
        const val = lines[i + 1].replace(/[^A-Z0-9a-z\-]/g, '');
        if (/^[A-Z0-9a-z\-]{4,30}$/.test(val)) {
          upiTransactionId = val;
          break;
        }
      }
    }
  }
  if (!upiTransactionId) {
    for (const line of lines) {
      const cleaned = line.replace(/[^0-9]/g, '');
      if (cleaned.length >= 10 && cleaned.length <= 16) {
        upiTransactionId = cleaned;
        break;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m1 = line.match(/[₹£]\s*([\d,.]+)/);
    if (m1) { const v = m1[1].replace(/,/g, ''); if (v.length <= 8) { amount = v; break; } }
    const m2 = line.match(/Rs\.?\s*([\d,.]+)/i);
    if (m2) { const v = m2[1].replace(/,/g, ''); if (v.length <= 8) { amount = v; break; } }
  }

  for (let i = 0; i < lines.length; i++) {
    if (/^from\s*:?\s*$/i.test(lines[i])) {
      if (i + 1 < lines.length) {
        fromName = lines[i + 1].replace(/[^A-Za-z\s.]/g, '').trim();
        if (fromName) break;
      }
    }
    const inline = lines[i].match(/^from\s*:?\s*(.+)/i);
    if (inline) {
      fromName = inline[1].replace(/[^A-Za-z\s.]/g, '').trim();
      if (fromName) break;
    }
  }

  let amountLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/[₹£]/.test(lines[i]) || /(?:paid|total|amount)/i.test(lines[i])) {
      amountLineIdx = i;
      break;
    }
  }
  const searchStart = amountLineIdx >= 0 ? amountLineIdx : 0;
  for (let i = searchStart; i < lines.length; i++) {
    const dm = lines[i].match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[,\s]+(\d{4})/i);
    if (dm) {
      const dateStr = normalizeDateStr(dm[1], dm[2], dm[3]);
      const timeStr = parseTimeFromLine(lines[i]);
      if (dateStr) {
        transactionDatetime = timeStr ? `${dateStr}T${timeStr}` : `${dateStr}T00:00:00`;
      }
      break;
    }
  }

  return { upiTransactionId, transactionDatetime, amount, fromName };
}

function mergeResults(a, b) {
  return {
    upiTransactionId: a.upiTransactionId || b.upiTransactionId,
    transactionDatetime: resolveTime(a.transactionDatetime, b.transactionDatetime),
    amount: a.amount || b.amount,
    fromName: a.fromName || b.fromName,
  };
}

function resolveTime(t1, t2) {
  if (!t1) return t2;
  if (!t2) return t1;
  const s1 = isTimeSuspicious(t1.split('T')[1] || '');
  const s2 = isTimeSuspicious(t2.split('T')[1] || '');
  if (s1 && !s2) return t2;
  if (!s1 && s2) return t1;
  return t1;
}

async function tryTesseract(image, psm) {
  try {
    const { data } = await Tesseract.recognize(image, 'eng', {
      logger: () => {},
      config: { 'tessedit_pageseg_mode': String(psm) },
    });
    return data.text;
  } catch {
    return null;
  }
}

export async function extractTransactionData(base64Image) {
  const text1 = await tryTesseract(base64Image, 3);
  const result1 = text1 ? extractTransactionDataFromText(text1) : {};

  const text2 = await tryTesseract(base64Image, 6);
  const result2 = text2 ? extractTransactionDataFromText(text2) : {};

  const merged = mergeResults(result1, result2);

  if (merged.upiTransactionId || merged.transactionDatetime || merged.amount || merged.fromName) {
    return merged;
  }

  return { upiTransactionId: null, transactionDatetime: null, amount: null, fromName: null };
}

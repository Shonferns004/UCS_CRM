import Tesseract from 'tesseract.js';

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
const ID_LABELS = [
  /^upi[ -]*(?:transaction)?[ -]*(?:id|ref(?:erence)?|no\.?)?\s*:?\s*$/i,
  /^google[ -]*(?:pay[ -]*)?transaction[ -]*id\s*:?\s*$/i,
  /^transaction[ -]*(?:id|ref(?:erence)?|no\.?)\s*:?\s*$/i,
  /^(?:ref|ref\.?|ref no|ref id|utr|utr no)\s*:?\s*$/i,
  /upi[ -]*\d/i,
];

const OCR_API = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL + '/ocr/parse'
  : '/api/ocr/parse';

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
  const sfx = timeStr.match(/[ap]m$/i);
  if (sfx && sfx[0].toLowerCase() === 'pm' && h >= 1 && h <= 5) return true;
  if (sfx && sfx[0].toLowerCase() === 'am' && h === 12) return true;
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
        if (/^[A-Z0-9a-z\-]{4,30}$/.test(val)) { upiTransactionId = val; break; }
      }
    }
  }
  if (!upiTransactionId) {
    for (const line of lines) {
      const c = line.replace(/[^0-9]/g, '');
      if (c.length >= 10 && c.length <= 16) { upiTransactionId = c; break; }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const m1 = lines[i].match(/[₹£]\s*([\d,.]+)/);
    if (m1) { const v = m1[1].replace(/,/g, ''); if (v.length <= 8) { amount = v; break; } }
    const m2 = lines[i].match(/Rs\.?\s*([\d,.]+)/i);
    if (m2) { const v = m2[1].replace(/,/g, ''); if (v.length <= 8) { amount = v; break; } }
  }

  for (let i = 0; i < lines.length; i++) {
    if (/^from\s*:?\s*$/i.test(lines[i]) && i + 1 < lines.length) {
      fromName = lines[i + 1].replace(/[^A-Za-z\s.]/g, '').trim();
      if (fromName) break;
    }
    const inline = lines[i].match(/^from\s*:?\s*(.+)/i);
    if (inline) {
      fromName = inline[1].replace(/[^A-Za-z\s.]/g, '').trim();
      if (fromName) break;
    }
  }

  let amtIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/[₹£]/.test(lines[i]) || /(?:paid|total|amount)/i.test(lines[i])) { amtIdx = i; break; }
  }
  for (let i = (amtIdx >= 0 ? amtIdx : 0); i < lines.length; i++) {
    const dm = lines[i].match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[,\s]+(\d{4})/i);
    if (dm) {
      const ds = normalizeDateStr(dm[1], dm[2], dm[3]);
      const ts = parseTimeFromLine(lines[i]);
      if (ds) transactionDatetime = ts ? `${ds}T${ts}` : `${ds}T00:00:00`;
      break;
    }
  }

  return { upiTransactionId, transactionDatetime, amount, fromName };
}

function mergeResults(a, b) {
  return {
    upiTransactionId: a.upiTransactionId || b.upiTransactionId,
    transactionDatetime: (() => {
      if (!a.transactionDatetime) return b.transactionDatetime;
      if (!b.transactionDatetime) return a.transactionDatetime;
      const s1 = isTimeSuspicious(a.transactionDatetime.split('T')[1] || '');
      const s2 = isTimeSuspicious(b.transactionDatetime.split('T')[1] || '');
      if (s1 && !s2) return b.transactionDatetime;
      if (!s1 && s2) return a.transactionDatetime;
      return a.transactionDatetime;
    })(),
    amount: a.amount || b.amount,
    fromName: a.fromName || b.fromName,
  };
}

async function callBackendOcr(base64Image) {
  try {
    const res = await fetch(OCR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.text || null;
  } catch {
    return null;
  }
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
  // 1. Try backend OCR (proxies to OCR.space with API key)
  const backendText = await callBackendOcr(base64Image);
  if (backendText) {
    const backendResult = extractTransactionDataFromText(backendText);
    if (backendResult.upiTransactionId || backendResult.amount || backendResult.transactionDatetime || backendResult.fromName) {
      return backendResult;
    }
  }

  // 2. Fallback: dual-pass Tesseract
  const t1 = await tryTesseract(base64Image, 3);
  const r1 = t1 ? extractTransactionDataFromText(t1) : {};
  const t2 = await tryTesseract(base64Image, 6);
  const r2 = t2 ? extractTransactionDataFromText(t2) : {};
  const merged = mergeResults(r1, r2);

  if (merged.upiTransactionId || merged.transactionDatetime || merged.amount || merged.fromName) {
    return merged;
  }

  return { upiTransactionId: null, transactionDatetime: null, amount: null, fromName: null };
}

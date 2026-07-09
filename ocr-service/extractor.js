const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTHS_STR = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';

function cleanText(text) {
  return text.replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAllMatches(text, pattern) {
  const results = [];
  let m;
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  while ((m = re.exec(text)) !== null) {
    results.push(m[1] || m[0]);
  }
  return results.length > 0 ? results : null;
}

function extractWithPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const val = match[1] || match[0];
      if (val && val.length > 0) return val.trim();
    }
  }
  return null;
}

function extractAmount(text, rawText) {
  const rawLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  function parseNum(str) {
    const cleaned = str.replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0 || num >= 999999) return null;
    return num;
  }

  function isAmount(n) {
    return n >= 1 && n <= 500000;
  }

  const isNoiseLine = (line) => /^(upi|txn|transaction|ref|id|utr|rrn|cheque|ifsc|account|date|time|status)\b/i.test(line) && !/amount|paid|total|pay/i.test(line);

  const cleanNumber = (str) => {
    return str.replace(/,/g, '').replace(/^[^0-9.]+/, '').trim();
  };

  const hasDecimal2 = (str) => /\.\d{2}$/.test(str);

  function tryMatch(line, pattern) {
    const m = line.match(pattern);
    if (!m) return null;
    const raw = m[1] || m[0];
    const cleaned = cleanNumber(raw);
    const n = parseNum(cleaned);
    if (n && isAmount(n)) return n.toFixed(2);
    return null;
  }

  for (const line of rawLines) {
    if (isNoiseLine(line)) continue;
    const r = tryMatch(line, /(?:Rs\.?\s*|INR\s*|[₹?BRF]\s*)([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (r) return r;
  }

  const flatLabel = text.match(/\b(?:Amount|Amt|Paid|Pay|Total)[:\s]*(?:Rs\.?\s*|INR\s*|[₹?BRF]\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (flatLabel) {
    const cleaned = cleanNumber(flatLabel[1]);
    const n = parseNum(cleaned);
    if (n && isAmount(n)) return n.toFixed(2);
  }

  for (const line of rawLines) {
    if (isNoiseLine(line)) continue;
    const r = tryMatch(line, /\b(\d{1,6}\.\d{2})\b/);
    if (r) return r;
  }

  for (const line of rawLines) {
    if (isNoiseLine(line)) continue;
    const r = tryMatch(line, /(?:Rs\.?\s*|INR\s*|[₹?BRF]\s*)([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (r) return r;
  }

  for (const line of rawLines) {
    if (isNoiseLine(line)) continue;
    const r = tryMatch(line, /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/);
    if (r) return r;
  }

  for (const line of rawLines) {
    if (isNoiseLine(line)) continue;
    if (/paid|amount|total/i.test(line)) {
      const nums = line.match(/\b(\d{1,6}\.\d{2})\b/g);
      if (nums) {
        for (const n of nums) {
          const cleaned = cleanNumber(n);
          const pn = parseNum(cleaned);
          if (pn && isAmount(pn)) return pn.toFixed(2);
        }
      }
    }
  }

  return null;
}

function extractDate(text) {
  const patterns = [
    new RegExp(`(\\d{1,2})[-/](${MONTHS_STR})[-/](\\d{4})`, 'i'),
    new RegExp(`(\\d{1,2})\\s+(${MONTHS_STR})\\s*,?\\s*(\\d{4})`, 'i'),
    new RegExp(`(${MONTHS_STR})\\s*(\\d{1,2}),?\\s*(\\d{4})`, 'i'),
    /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;

    if (/[A-Za-z]/.test(m[2] || '')) {
      const monVal = MONTH_MAP[m[2].toLowerCase().substring(0, 3)];
      if (monVal) {
        const day = parseInt(m[1]);
        const year = parseInt(m[3]);
        if (day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
          return `${year}-${String(monVal).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    } else if (/[A-Za-z]/.test(m[1] || '')) {
      const monVal = MONTH_MAP[m[1].toLowerCase().substring(0, 3)];
      if (monVal && m[3]) {
        const day = parseInt(m[2]);
        const year = parseInt(m[3]);
        if (day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
          return `${year}-${String(monVal).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    } else if (m[3] && /^\d{4}$/.test(m[3])) {
      const a = parseInt(m[1]);
      const b = parseInt(m[2]);
      const y = parseInt(m[3]);
      if (y < 2000 || y > 2100) continue;
      if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
      if (b > 12) return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
      return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
  }
  return null;
}

function extractTime(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  function isValidTime(h, min, sec) {
    if (min < 0 || min > 59 || sec < 0 || sec > 59) return false;
    return true;
  }

  function hourValidAMPM(h) { return h >= 1 && h <= 12; }
  function hourValid24(h) { return h >= 0 && h <= 23; }

  const isNoise = (line) => /\b(txn|transaction|upi|ref|account|ifsc|utr|rn|cheque|id)\b/i.test(line);
  const hasDateRef = (line) => /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line);
  const hasDateNum = (line) => /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/.test(line);

  const isNumericLine = (line) => {
    const d = line.replace(/[^0-9]/g, '');
    return d.length >= 10 && /^[\d\s,:.\-\\/]+$/.test(line.trim());
  };

  let best = null;
  let bestScore = -1;

  function record(h, min, sec, score) {
    const formatted = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    if (score > bestScore) { best = formatted; bestScore = score; }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isNoise(line)) continue;
    if (isNumericLine(line)) continue;

    const m = line.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b/i);
    if (!m) continue;

    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const sec = m[3] ? parseInt(m[3]) : 0;
    const period = m[4];

    if (!hourValidAMPM(h) || !isValidTime(h, min, sec)) continue;

    let score = 1;
    if (hasDateRef(line) || hasDateNum(line)) score += 5;
    else if (i > 0 && (hasDateRef(lines[i - 1]) || hasDateNum(lines[i - 1]))) score += 4;
    else if (i < lines.length - 1 && (hasDateRef(lines[i + 1]) || hasDateNum(lines[i + 1]))) score += 3;
    else if (/\b(time|at)\b/i.test(line)) score += 2;
    else continue;

    if (period.toUpperCase() === 'PM' && h < 12) h += 12;
    if (period.toUpperCase() === 'AM' && h === 12) h = 0;

    record(h, min, sec, score);
  }

  if (best) return best;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isNoise(line)) continue;
    if (isNumericLine(line)) continue;

    const m = line.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    if (!m) continue;

    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const sec = m[3] ? parseInt(m[3]) : 0;

    if (!hourValid24(h) || !isValidTime(h, min, sec)) continue;
    if (h === 0 && min === 0) continue;

    let score = 1;
    if (hasDateRef(line) || hasDateNum(line)) score += 5;
    else if (i > 0 && (hasDateRef(lines[i - 1]) || hasDateNum(lines[i - 1]))) score += 4;
    else if (i < lines.length - 1 && (hasDateRef(lines[i + 1]) || hasDateNum(lines[i + 1]))) score += 3;
    else if (/\b(time|at)\b/i.test(line)) score += 2;
    else continue;

    if (h < 6 && !hasDateRef(line) && !hasDateNum(line)) continue;
    if (h >= 6 && h <= 22) score += 1;

    record(h, min, sec, score);
  }

  if (best) return best;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isNoise(line)) continue;
    if (isNumericLine(line)) continue;

    const m = line.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b/i);
    if (!m) continue;

    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const sec = m[3] ? parseInt(m[3]) : 0;
    const period = m[4];

    if (!hourValidAMPM(h) || !isValidTime(h, min, sec)) continue;

    if (period.toUpperCase() === 'PM' && h < 12) h += 12;
    if (period.toUpperCase() === 'AM' && h === 12) h = 0;

    record(h, min, sec, 1);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isNoise(line)) continue;
    if (isNumericLine(line)) continue;

    const m = line.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    if (!m) continue;

    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const sec = m[3] ? parseInt(m[3]) : 0;

    if (!hourValid24(h) || !isValidTime(h, min, sec)) continue;
    if (h === 0 && min === 0) continue;
    if (h < 6) continue;

    record(h, min, sec, 0);
  }

  return best;
}

const TXN_ID_PATTERNS = [
  /Transaction\s*(?:ID|Ref|No|Number|#)[:\s]*([A-Z0-9]{6,30})/i,
  /Txn\s*(?:ID|Ref|No)[:\s]*([A-Z0-9]{6,30})/i,
  /Ref(?:erence)?\s*(?:No|Number|ID|#)[:\s]*([A-Z0-9]{6,30})/i,
  /[Uu][Pp][Ii]\s*(?:Ref|Id|ID|No|Number)[:\s]*([A-Z0-9]{6,30})/i,
  /\b(TXN\d{8,25})\b/i,
  /\b(UTR\d{8,25})\b/i,
  /\b(CREDTXN\d{6,25})\b/i,
  /\b([A-Z]{2}\d{10,20})\b/,
  /\b(\d{12})\b/,
  /\b([A-Z]\d{10,15})\b/,
];

function extractTxnId(text) {
  const id = extractWithPatterns(text, TXN_ID_PATTERNS);
  if (id && id.length >= 6) return id;

  const lines = text.split('\n');
  for (const line of lines) {
    const clean = line.replace(/[^A-Z0-9a-z\-]/g, '').trim();
    if (clean.length >= 10 && clean.length <= 30 && /^[A-Z]/.test(clean) && /\d/.test(clean)) {
      return clean;
    }
  }
  return null;
}

function extractUPIId(text) {
  const match = text.match(/\b([a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,})\b/);
  return match ? match[1] : null;
}

function extractName(text) {
  const firstWord = (line) => line.split(/[\s,]+/).filter(Boolean)[0] || '';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const nameCandidates = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nameLine = line.replace(/^[:\s]*/, '')
      .replace(/[^A-Za-z\s.]/g, '')
      .trim();

    if (
      nameLine.length >= 3 &&
      nameLine.length <= 40 &&
      /^[A-Z]/.test(nameLine) &&
      /\s/.test(nameLine) &&
      !/\b(payment|successful|transaction|date|amount|total|upi|ref|id|bank|account|status)\b/i.test(nameLine)
    ) {
      nameCandidates.push(nameLine);
    }
  }

  return nameCandidates.filter((v, i, a) => a.indexOf(v) === i);
}

function extractFromTo(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let from = null;
  let to = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    const toMatch = line.match(/(?:^|\s)To[:\s]+([A-Za-z\s.]+)/i);
    if (toMatch) {
      const val = toMatch[1].replace(/[^A-Za-z\s.]/g, '').trim();
      if (val.length >= 2 && val.length <= 40) to = val;
    }

    const fromMatch = line.match(/(?:^|\s)From[:\s]+([A-Za-z\s.]+)/i);
    if (fromMatch) {
      const val = fromMatch[1].replace(/[^A-Za-z\s.]/g, '').trim();
      if (val.length >= 2 && val.length <= 40) from = val;
    }

    if (/^paid\s+to$/i.test(line.trim()) && next) {
      const val = next.replace(/[^A-Za-z\s.]/g, '').trim();
      if (val.length >= 2 && val.length <= 40 && !/^(paid|upi|transaction|rs)/i.test(val) && val !== to) {
        to = val;
      }
    }

    if (/^paid\s+by$/i.test(line.trim()) && next) {
      const val = next.replace(/[^A-Za-z\s.]/g, '').trim();
      if (val.length >= 2 && val.length <= 40 && !/^(paid|upi|transaction|rs)/i.test(val) && val !== from) {
        from = val;
      }
    }

    const fromLabel = line.match(/(?:Paid\s+[Bb]y|Sender|Payer|Debited\s+[Ff]rom|Debited)[:\s]+([A-Za-z\s.]+)/i);
    if (fromLabel && !from) {
      const val = fromLabel[1].replace(/[^A-Za-z\s.]/g, '').trim();
      if (val.length >= 2 && val.length <= 40) from = val;
    }
  }

  return { from, to };
}

function extractCheckDetails(text) {
  const chequePatterns = {
    chequeNo: [
      /Cheq(?:ue)?\s*(?:No|Number|#)[:\s]*([A-Za-z0-9]{6,15})/i,
      /Ch\.?\s*No[:\s]*([A-Za-z0-9]{6,15})/i,
      /\b(\d{6})\b(?:\s|$)/,
    ],
    payee: [
      /^PAY\s+([A-Za-z\s.]+?)\s+Rs\.?\s/i,
      /^PAY\s+([A-Za-z\s.]+?)\s+the\s/i,
    ],
    bankName: [
      /(?:^|\n)\s*([A-Za-z\s]+(?:Bank|bank|BANK)\w*)/,
    ],
    ifsc: [
      /\b([A-Z]{4}0[A-Z0-9]{6})\b/,
    ],
  };

  const chequeNo = extractWithPatterns(text, chequePatterns.chequeNo);
  const payee = extractWithPatterns(text, chequePatterns.payee);
  const bankName = extractWithPatterns(text, chequePatterns.bankName);
  const ifsc = extractWithPatterns(text, chequePatterns.ifsc);

  let isCheck = false;
  if (chequeNo || isBankCheque(text)) {
    isCheck = true;
  }

  return { isCheck, chequeNo, payee: payee || chequeNo ? (payee || null) : null, bankName, ifsc };
}

function guessApp(text) {
  const lower = text.toLowerCase();
  if (lower.includes('phonepe') || lower.includes('phone pe')) return 'PhonePe';
  if (lower.includes('google pay') || lower.includes('gpay') || lower.includes('tez')) return 'Google Pay';
  if (lower.includes('paytm')) return 'Paytm';
  if (lower.includes('cred')) return 'CRED';
  if (lower.includes('amazon pay') || lower.includes('amazon')) return 'Amazon Pay';
  if (lower.includes('whatsapp')) return 'WhatsApp Pay';
  if (lower.includes('bhim')) return 'BHIM';

  const upiHandle = text.match(/@([a-zA-Z0-9]+)\b/);
  if (upiHandle) {
    const h = upiHandle[1].toLowerCase();
    if (h === 'ybl' || h === 'paytm' || h === 'ptm' || h.startsWith('ybl')) return 'PhonePe';
    if (h === 'okhdfcbank' || h === 'oksbi' || h === 'okicici' || h === 'okaxis' || h.startsWith('ok')) return 'Google Pay';
    if (h === 'paytm' || h === 'ptm') return 'Paytm';
    if (h === 'upi' || h === 'icici' || h === 'sbi' || h === 'hdfc') return 'UPI App';
  }

  return 'Unknown';
}

function isBankCheque(text) {
  const hasPayBearer = /(?:^|\n)\s*PAY\s+(?!MENT)/i.test(text) && /OR\s+BEARER/i.test(text);
  const hasChequeNo = /Cheq(?:ue)?\s*(?:No|Number|#)[:\s]*[A-Za-z0-9]{6,15}/i.test(text);
  return hasPayBearer || hasChequeNo;
}

function isUPIScreenshot(text) {
  const indicators = ['payment successful', 'payment of', 'paid to', 'paid by',
    'upi', 'transaction', 'txn', 'amount', 'successful'];
  const lower = text.toLowerCase();
  let score = 0;
  for (const ind of indicators) {
    if (lower.includes(ind)) score++;
  }
  return score >= 2;
}

function inferFromFromUPI(text, upiId, to) {
  if (!upiId) return null;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const upiLocal = upiId.split('@')[0].toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const upiOnLine = line.match(/\b([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)\b/i);
    if (!upiOnLine) continue;
    if (upiOnLine[1].toLowerCase() !== upiId.toLowerCase()) continue;

    const before = lines[i - 1];
    if (!before) continue;

    const skipWords = /\b(payment|successful|date|transaction|amount|total|paid|to|from)\b/i;
    if (skipWords.test(before)) continue;

    if (/^(?:To|From|Paid)\s*:/i.test(before.trim())) continue;

    const cleaned = before.replace(/[^A-Za-z\s.]/g, '').trim();
    if (cleaned.length >= 2 && cleaned.length <= 40 && cleaned !== to) {
      return cleaned;
    }
  }
  return null;
}

function inferNamesFromUPI(text) {
  const upiIds = [];
  const pat = /\b([a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,})\b/g;
  let m;
  while ((m = pat.exec(text)) !== null) {
    upiIds.push(m[1]);
  }

  if (upiIds.length === 0) return { from: null, to: null };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  function findNameNear(lineIdx, direction) {
    for (let offset = 1; offset <= 2; offset++) {
      const idx = direction === 'before' ? lineIdx - offset : lineIdx + offset;
      if (idx < 0 || idx >= lines.length) continue;
      const candidate = lines[idx].replace(/[^A-Za-z\s.]/g, '').trim();
      if (candidate.length >= 2 && candidate.length <= 40 && /^[A-Z]/.test(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  let fromUpi = null;
  let toUpi = null;

  for (const upi of upiIds) {
    const local = upi.split('@')[0];
    if (/^\d{10}$/.test(local)) {
      if (!fromUpi) fromUpi = upi;
      else toUpi = upi;
    } else {
      if (!toUpi) toUpi = upi;
      else if (!fromUpi) fromUpi = upi;
    }
  }

  if (!toUpi && upiIds.length > 0) toUpi = upiIds[0];
  if (!fromUpi && upiIds.length > 1) fromUpi = upiIds[1];

  return { from: fromUpi, to: toUpi };
}

export function extractStructuredData(rawText) {
  if (!rawText || !rawText.trim()) {
    return { error: 'No text provided' };
  }

  const text = cleanText(rawText);
  const app = guessApp(text);
  let type = 'unknown';

  if (isUPIScreenshot(text)) type = 'upi_payment';

  const checkDetails = extractCheckDetails(rawText);
  if (checkDetails.isCheck) type = 'bank_check';

  const txnId = extractTxnId(text);
  const amount = extractAmount(text, rawText);
  const date = extractDate(text);
  const time = extractTime(rawText);
  const upiId = extractUPIId(text);
  const { from: explicitFrom, to: explicitTo } = extractFromTo(rawText);
  const upiNames = inferNamesFromUPI(text);
  const inferredFrom = inferFromFromUPI(rawText, upiId, explicitTo);

  let from = explicitFrom || inferredFrom || upiNames.from || null;
  let to = explicitTo || upiNames.to || null;

  let mobile = null;
  if (upiId) {
    const localPart = upiId.split('@')[0];
    if (/^\d{10}$/.test(localPart)) {
      mobile = localPart;
    }
  }
  if (!mobile) {
    const phoneMatch = rawText.match(/\b(\d{10})\b/);
    if (phoneMatch) mobile = phoneMatch[1];
  }

  const result = {
    type,
    app,
    transaction_id: txnId || null,
    amount: amount || null,
    date: date || null,
    time: time || null,
    from: from || null,
    to: to || null,
    upi_id: upiId || null,
    mobile: mobile || null,
  };

  if (type === 'bank_check') {
    result.cheque_no = checkDetails.chequeNo || null;
    result.payee = checkDetails.payee || null;
    result.bank_name = checkDetails.bankName || null;
    result.ifsc = checkDetails.ifsc || null;
  }

  return result;
}

const TXN_ID_PATTERNS = [
  /Transaction\s*(?:ID|Ref|No|Number)[:\s]*([A-Z0-9]{6,25})/i,
  /Txn\s*(?:ID|Ref|No)[:\s]*([A-Z0-9]{6,25})/i,
  /Ref(?:erence)?\s*(?:No|Number|ID)[:\s]*([A-Z0-9]{6,25})/i,
  /\b(TXN\d{8,20})\b/i,
  /\b(UTR\d{8,20})\b/i,
  /\b(CREDTXN\d{6,20})\b/i,
  /\b(\d{12})\b/,
  /\b([A-Z]\d{9,15})\b/,
  /\b([A-Z]{2}\d{10,18})\b/,
];

const UPI_ID_PATTERN = /\b([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)\b/;

const AMOUNT_PATTERNS = [
  /(?:Rs|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Rs|INR|₹)/i,
  /\b(?:Amount|Amt|Paid|Pay|Total)[:\s]*(?:Rs|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /(?:Rs|INR|₹)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
];

const DATE_PATTERNS = [
  /(\d{1,2})[-/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/](\d{4})/i,
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*(\d{4})/i,
  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(\d{1,2}),?\s*(\d{4})/i,
  /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
  /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
];

const TIME_PATTERNS = [
  /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)/i,
  /(\d{1,2}):(\d{2})(?::(\d{2}))?/,
];

const MOBILE_PATTERN = /\b(\d{10})\b/;

const CHEQUE_PATTERNS = {
  chequeNo: [
    /Cheq(?:ue)?\s*(?:No|Number|#)[:\s]*([A-Za-z0-9]{6,15})/i,
    /Ch\.?\s*No[:\s]*([A-Za-z0-9]{6,15})/i,
    /\b(\d{6})\b/,
  ],
  payee: [
    /Pay\s*[:\s]*([A-Za-z\s.]+?)(?:\s+Rs|\s+the|\s+or|\s+to|\n)/i,
    /[Pp]ayee[:\s]*([A-Za-z\s.]+?)(?:\s+Rs|\n|$)/i,
  ],
  bankName: [
    /(?:^|\n)([A-Za-z\s]+?Bank\w*)/,
  ],
  ifsc: [
    /\b([A-Z]{4}0[A-Z0-9]{6})\b/,
  ],
};

function cleanText(text) {
  return text.replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();
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

function extractAmount(text) {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const val = match[1].replace(/,/g, '');
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) return num.toFixed(2);
    }
  }
  return null;
}

const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function extractDate(text) {
  for (const p of DATE_PATTERNS) {
    const m = text.match(p);
    if (!m) continue;

    if (/[A-Za-z]/.test(m[2] || '')) {
      const mon = MONTH_MAP[m[2].toLowerCase().substring(0, 3)];
      if (mon) {
        const day = parseInt(m[1]);
        const year = parseInt(m[3]);
        if (day > 0 && day < 32 && year > 2000 && year < 2100) {
          return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    } else if (m[3] && /^\d{4}$/.test(m[3])) {
      const a = parseInt(m[1]), b = parseInt(m[2]), y = parseInt(m[3]);
      if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
      if (b > 12) return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
      return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    } else if (/[A-Za-z]/.test(m[1] || '')) {
      const mon = MONTH_MAP[m[1].toLowerCase().substring(0, 3)];
      if (mon && m[3]) {
        const day = parseInt(m[2]);
        const year = parseInt(m[3]);
        if (day > 0 && day < 32 && year > 2000 && year < 2100) {
          return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }
  return null;
}

function extractTime(text) {
  for (const p of TIME_PATTERNS) {
    const m = text.match(p);
    if (!m) continue;
    let h = parseInt(m[1]);
    const min = m[2];
    const sec = m[3] || '00';
    const period = m[4];
    if (period) {
      if (period.toUpperCase() === 'PM' && h < 12) h += 12;
      if (period.toUpperCase() === 'AM' && h === 12) h = 0;
    }
    return `${String(h).padStart(2, '0')}:${min}:${sec}`;
  }
  return null;
}

function extractUPIId(text) {
  const match = text.match(UPI_ID_PATTERN);
  if (match && match[1].split('@')[0].length >= 3) return match[1];
  return null;
}

function findNameNearLabel(raw, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|\\n)${escaped}[\\s:\\-]*([A-Za-z\\s.]+?)(?:\\n|$)`, 'im');
  const match = raw.match(regex);
  if (match) return match[1].trim();
  return null;
}

function extractFromTo(raw) {
  const text = raw.replace(/\n/g, ' \\n ');
  let from = null;
  let to = null;

  const toMatch = text.match(/(?:Paid\s+to|To|Beneficiary|Recipient|Payee|Receiver)[:\s]*([A-Za-z\s.0-9]+?)(?:\s*\||\n| \\n |$|Upi|UPI|@)/i);
  if (toMatch) to = toMatch[1].trim().replace(/\s+\\n\s+.*/, '').trim();
  if (to && to.length > 50) to = null;

  const fromMatch = text.match(/(?:Paid\s+by|From|Sender|Payer|Paid\s+From|Debited\s+From|Debited|Account)[:\s]*([A-Za-z\s.0-9]+?)(?:\s*\||\n| \\n |$|Upi|UPI|@)/i);
  if (fromMatch) from = fromMatch[1].trim().replace(/\s+\\n\s+.*/, '').trim();
  if (from && from.length > 50) from = null;

  if (!to) {
    const t = text.match(/(?:^|\\n)\s*To[:\s]*([A-Za-z\s.0-9@]+?)(?:\\n|$)/i);
    if (t) to = t[1].trim();
  }

  if (!from) {
    const f = text.match(/(?:^|\\n)\s*From[:\s]*([A-Za-z\s.0-9@]+?)(?:\\n|$)/i);
    if (f) from = f[1].trim();
  }

  return { from, to };
}

function extractCheckDetails(text) {
  const chequeNo = extractWithPatterns(text, CHEQUE_PATTERNS.chequeNo);
  const payee = extractWithPatterns(text, CHEQUE_PATTERNS.payee);
  const bankName = extractWithPatterns(text, CHEQUE_PATTERNS.bankName);
  const ifsc = extractWithPatterns(text, CHEQUE_PATTERNS.ifsc);

  let isCheck = false;
  if (chequeNo || text.match(/[\s"(]PAY[\s"]/i) || text.match(/[\s"(]OR BEARER[\s"]/i)) {
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
  if (text.match(/[\s"(]PAY[\s"]/i) || text.match(/[\s"(]OR BEARER[\s"]/i) || text.match(/\b\d{6}\b.*(?:Rs|₹)/)) return 'Bank Cheque';
  if (lower.includes('bhim')) return 'BHIM';
  if (lower.includes('@upi') || lower.includes('@ybl') || lower.includes('@ok')) return 'UPI App';
  return 'Unknown';
}

function isUPIScreenshot(text) {
  const indicators = ['payment successful', 'payment of', 'paid to', 'paid by',
    'upi', 'transaction', 'txn', 'amount', 'successful'];
  const lower = text.toLowerCase();
  let score = 0;
  for (const ind of indicators) {
    if (lower.includes(ind)) score++;
  }
  return score >= 3;
}

export function extractStructuredData(rawText) {
  if (!rawText || !rawText.trim()) {
    return { error: 'No text provided' };
  }

  const text = cleanText(rawText);
  const textWithNewlines = rawText;
  const app = guessApp(text);
  let type = 'unknown';

  if (isUPIScreenshot(text)) {
    type = 'upi_payment';
  }

  const checkDetails = extractCheckDetails(textWithNewlines);
  if (checkDetails.isCheck) {
    type = 'bank_check';
  }

  const txnId = extractWithPatterns(text, TXN_ID_PATTERNS);
  const amount = extractAmount(text);
  const date = extractDate(text);
  const time = extractTime(text);
  const upiId = extractUPIId(text);
  const { from, to } = extractFromTo(textWithNewlines);

  let mobile = extractWithPatterns(text, [MOBILE_PATTERN]);
  if (upiId) {
    const localPart = upiId.split('@')[0];
    if (/^\d{10}$/.test(localPart)) {
      mobile = localPart;
    }
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

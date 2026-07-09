import re

MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}


def parse_num(s):
    cleaned = s.replace(',', '').strip()
    try:
        num = float(cleaned)
        if num <= 0 or num >= 999999:
            return None
        return num
    except (ValueError, TypeError):
        return None


def is_amount(n):
    return 1 <= n <= 500000


def clean_number(s):
    return re.sub(r'^[^0-9.]+', '', s.replace(',', '')).strip()


def is_noise_line(line):
    return bool(re.match(
        r'^(upi|txn|transaction|ref|id|utr|rrn|cheque|ifsc|account|date|time|status)\b',
        line, re.I
    )) and not re.search(r'amount|paid|total|pay', line, re.I)


def try_match(line, pattern):
    m = re.search(pattern, line, re.I)
    if not m:
        return None
    raw = m.group(1) if m.lastindex and m.group(1) else m.group(0)
    cleaned = clean_number(raw)
    n = parse_num(cleaned)
    if n and is_amount(n):
        return f"{n:.2f}"
    return None


def extract_amount(text, raw_text):
    raw_lines = [l.strip() for l in raw_text.split('\n') if l.strip()]

    # Priority 1: lines with currency symbol (Rs, INR, ₹, or OCR garbled R/B/F/?)
    for line in raw_lines:
        if is_noise_line(line):
            continue
        r = try_match(line, r'(?:Rs\.?\s*|INR\s*|[₹?BRF]\s*)([0-9,]+(?:\.[0-9]{1,2})?)')
        if r:
            return r

    # Priority 2: labeled (Amount:, Paid:, Total:)
    flat_label = re.search(
        r'\b(?:Amount|Amt|Paid|Pay|Total)[:\s]*(?:Rs\.?\s*|INR\s*|[₹?BRF]\s*)?([0-9,]+(?:\.[0-9]{1,2})?)',
        text, re.I
    )
    if flat_label:
        cleaned = clean_number(flat_label.group(1))
        n = parse_num(cleaned)
        if n and is_amount(n):
            return f"{n:.2f}"

    # Priority 3: standalone number with 2 decimal places
    for line in raw_lines:
        if is_noise_line(line):
            continue
        r = try_match(line, r'\b(\d{1,6}\.\d{2})\b')
        if r:
            return r

    # Priority 4: currency symbol but with more noise
    for line in raw_lines:
        if is_noise_line(line):
            continue
        r = try_match(line, r'(?:Rs\.?\s*|INR\s*|[₹?BRF]\s*)([0-9,]+(?:\.[0-9]{1,2})?)')
        if r:
            return r

    # Priority 5: comma-formatted number
    for line in raw_lines:
        if is_noise_line(line):
            continue
        r = try_match(line, r'\b(\d{1,3}(?:,\d{3})*\.\d{2})\b')
        if r:
            return r

    # Priority 6: lines with "paid/amount/total" keywords
    for line in raw_lines:
        if is_noise_line(line):
            continue
        if re.search(r'paid|amount|total', line, re.I):
            nums = re.findall(r'\b(\d{1,6}\.\d{2})\b', line)
            for n in nums:
                cleaned = clean_number(n)
                pn = parse_num(cleaned)
                if pn and is_amount(pn):
                    return f"{pn:.2f}"

    return None


def extract_date(text):
    patterns = [
        re.compile(r'(\d{1,2})[-/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/](\d{4})', re.I),
        re.compile(r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*(\d{4})', re.I),
        re.compile(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(\d{1,2}),?\s*(\d{4})', re.I),
        re.compile(r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})'),
    ]

    for p in patterns:
        m = p.search(text)
        if not m:
            continue

        if m.lastindex >= 3 and re.match(r'[A-Za-z]', m.group(2) or ''):
            mon = MONTH_MAP.get(m.group(2).lower()[:3])
            if mon:
                day, year = int(m.group(1)), int(m.group(3))
                if 1 <= day <= 31 and 2000 <= year <= 2100:
                    return f"{year}-{mon:02d}-{day:02d}"

        elif m.lastindex >= 3 and re.match(r'[A-Za-z]', m.group(1) or ''):
            mon = MONTH_MAP.get(m.group(1).lower()[:3])
            if mon and m.group(3):
                day, year = int(m.group(2)), int(m.group(3))
                if 1 <= day <= 31 and 2000 <= year <= 2100:
                    return f"{year}-{mon:02d}-{day:02d}"

        elif m.lastindex >= 3 and re.match(r'^\d{4}$', m.group(3) or ''):
            a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if y < 2000 or y > 2100:
                continue
            if a > 12:
                return f"{y}-{b:02d}-{a:02d}"
            if b > 12:
                return f"{y}-{a:02d}-{b:02d}"
            return f"{y}-{a:02d}-{b:02d}"

    return None


def extract_time(raw_text):
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]

    def has_date_ref(line):
        return bool(re.search(r'\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b', line, re.I))

    def has_date_num(line):
        return bool(re.search(r'\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b', line))

    def is_noise(line):
        return bool(re.search(r'\b(txn|transaction|upi|ref|account|ifsc|utr|rn|cheque|id)\b', line, re.I))

    def is_numeric(line):
        digits = re.sub(r'[^0-9]', '', line)
        return len(digits) >= 10 and re.match(r'^[\d\s,:.\-\\/]+$', line.strip())

    def record(h, m, s, score, best):
        formatted = f"{h:02d}:{m:02d}:{s:02d}"
        if score > best['score']:
            best['time'] = formatted
            best['score'] = score

    best = {'time': None, 'score': -1}

    # Pass 1: AM/PM times on/near date lines
    for i, line in enumerate(lines):
        if is_noise(line) or is_numeric(line):
            continue
        m = re.search(r'\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b', line)
        if not m:
            continue
        h, mi, s_val = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        period = m.group(4)
        if mi < 0 or mi > 59 or s_val < 0 or s_val > 59:
            continue
        if h < 1 or h > 12:
            continue

        score = 1
        if has_date_ref(line) or has_date_num(line):
            score += 5
        elif i > 0 and (has_date_ref(lines[i - 1]) or has_date_num(lines[i - 1])):
            score += 4
        elif i < len(lines) - 1 and (has_date_ref(lines[i + 1]) or has_date_num(lines[i + 1])):
            score += 3
        elif re.search(r'\b(time|at)\b', line, re.I):
            score += 2
        else:
            continue

        if period.upper() == 'PM' and h < 12:
            h += 12
        if period.upper() == 'AM' and h == 12:
            h = 0

        record(h, mi, s_val, score, best)

    if best['time']:
        return best['time']

    # Pass 2: 24h times on/near date lines
    for i, line in enumerate(lines):
        if is_noise(line) or is_numeric(line):
            continue
        m = re.search(r'\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b', line)
        if not m:
            continue
        h, mi, s_val = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        if mi < 0 or mi > 59 or s_val < 0 or s_val > 59:
            continue
        if h < 0 or h > 23:
            continue
        if h == 0 and mi == 0:
            continue

        score = 1
        if has_date_ref(line) or has_date_num(line):
            score += 5
        elif i > 0 and (has_date_ref(lines[i - 1]) or has_date_num(lines[i - 1])):
            score += 4
        elif i < len(lines) - 1 and (has_date_ref(lines[i + 1]) or has_date_num(lines[i + 1])):
            score += 3
        elif re.search(r'\b(time|at)\b', line, re.I):
            score += 2
        else:
            continue

        if h < 6 and not has_date_ref(line) and not has_date_num(line):
            continue
        if 6 <= h <= 22:
            score += 1

        record(h, mi, s_val, score, best)

    if best['time']:
        return best['time']

    # Pass 3: fallback AM/PM
    for line in lines:
        if is_noise(line) or is_numeric(line):
            continue
        m = re.search(r'\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b', line)
        if not m:
            continue
        h, mi, s_val = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        period = m.group(4)
        if mi < 0 or mi > 59 or s_val < 0 or s_val > 59:
            continue
        if h < 1 or h > 12:
            continue
        if period.upper() == 'PM' and h < 12:
            h += 12
        if period.upper() == 'AM' and h == 12:
            h = 0
        record(h, mi, s_val, 1, best)

    # Pass 4: fallback 24h
    for line in lines:
        if is_noise(line) or is_numeric(line):
            continue
        m = re.search(r'\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b', line)
        if not m:
            continue
        h, mi, s_val = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        if mi < 0 or mi > 59 or s_val < 0 or s_val > 59:
            continue
        if h < 0 or h > 23:
            continue
        if h == 0 and mi == 0:
            continue
        if h < 6:
            continue
        record(h, mi, s_val, 0, best)

    return best['time']


TXN_ID_PATTERNS = [
    re.compile(r'Transaction\s*(?:ID|Ref|No|Number|#)[:\s]*([A-Z0-9]{6,30})', re.I),
    re.compile(r'Txn\s*(?:ID|Ref|No)[:\s]*([A-Z0-9]{6,30})', re.I),
    re.compile(r'Ref(?:erence)?\s*(?:No|Number|ID|#)[:\s]*([A-Z0-9]{6,30})', re.I),
    re.compile(r'[Uu][Pp][Ii]\s*(?:Ref|Id|ID|No|Number)[:\s]*([A-Z0-9]{6,30})', re.I),
    re.compile(r'\b(TXN\d{8,25})\b', re.I),
    re.compile(r'\b(UTR\d{8,25})\b', re.I),
    re.compile(r'\b(CREDTXN\d{6,25})\b', re.I),
    re.compile(r'\b([A-Z]{2}\d{10,20})\b'),
    re.compile(r'\b(\d{12})\b'),
    re.compile(r'\b([A-Z]\d{10,15})\b'),
]


def extract_txn_id(text):
    for p in TXN_ID_PATTERNS:
        m = p.search(text)
        if m:
            val = m.group(1) or m.group(0)
            if len(val.strip()) >= 6:
                return val.strip()

    lines = text.split('\n')
    for line in lines:
        clean = re.sub(r'[^A-Z0-9a-z\-]', '', line).strip()
        if 10 <= len(clean) <= 30 and re.match(r'^[A-Z]', clean) and re.search(r'\d', clean):
            return clean
    return None


def extract_upi_id(text):
    m = re.search(r'\b([a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,})\b', text)
    return m.group(1) if m else None


def extract_from_to(raw):
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    from_val, to_val = None, None

    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else ''

        m = re.search(r'(?:^|\s)To[:\s]+([A-Za-z\s.]+)', line, re.I)
        if m:
            val = re.sub(r'[^A-Za-z\s.]', '', m.group(1)).strip()
            if 2 <= len(val) <= 40:
                to_val = val

        m = re.search(r'(?:^|\s)From[:\s]+([A-Za-z\s.]+)', line, re.I)
        if m:
            val = re.sub(r'[^A-Za-z\s.]', '', m.group(1)).strip()
            if 2 <= len(val) <= 40:
                from_val = val

        # "Paid to" on its own line, name on next
        if re.match(r'^paid\s+to$', line, re.I) and nxt:
            val = re.sub(r'[^A-Za-z\s.]', '', nxt).strip()
            if 2 <= len(val) <= 40 and not re.match(r'^(paid|upi|transaction|rs)', val, re.I) and val != to_val:
                to_val = val

        # "Paid by" on its own line, name on next
        if re.match(r'^paid\s+by$', line, re.I) and nxt:
            val = re.sub(r'[^A-Za-z\s.]', '', nxt).strip()
            if 2 <= len(val) <= 40 and not re.match(r'^(paid|upi|transaction|rs)', val, re.I) and val != from_val:
                from_val = val

        m = re.search(r'(?:Paid\s+[Bb]y|Sender|Payer|Debited\s+[Ff]rom|Debited)[:\s]+([A-Za-z\s.]+)', line, re.I)
        if m and not from_val:
            val = re.sub(r'[^A-Za-z\s.]', '', m.group(1)).strip()
            if 2 <= len(val) <= 40:
                from_val = val

    return from_val, to_val


def infer_names_from_upi(text):
    upi_ids = re.findall(r'\b([a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,})\b', text)
    if not upi_ids:
        return None, None

    from_upi, to_upi = None, None
    for upi in upi_ids:
        local = upi.split('@')[0]
        if re.match(r'^\d{10}$', local):
            if not from_upi:
                from_upi = upi
            else:
                to_upi = upi
        else:
            if not to_upi:
                to_upi = upi
            elif not from_upi:
                from_upi = upi

    if not to_upi and upi_ids:
        to_upi = upi_ids[0]
    if not from_upi and len(upi_ids) > 1:
        from_upi = upi_ids[1]

    return from_upi, to_upi


def guess_app(text):
    lower = text.lower()
    if 'phonepe' in lower or 'phone pe' in lower:
        return 'PhonePe'
    if 'google pay' in lower or 'gpay' in lower or 'tez' in lower:
        return 'Google Pay'
    if 'paytm' in lower:
        return 'Paytm'
    if 'cred' in lower:
        return 'CRED'
    if 'amazon pay' in lower or 'amazon' in lower:
        return 'Amazon Pay'
    if 'whatsapp' in lower:
        return 'WhatsApp Pay'
    if 'bhim' in lower:
        return 'BHIM'
    match = re.search(r'@([a-zA-Z0-9]+)\b', text)
    if match:
        h = match.group(1).lower()
        if h in ('ybl', 'paytm', 'ptm') or h.startswith('ybl'):
            return 'PhonePe'
        if h in ('okhdfcbank', 'oksbi', 'okicici', 'okaxis') or h.startswith('ok'):
            return 'Google Pay'
        if h == 'paytm' or h == 'ptm':
            return 'Paytm'
        if h in ('upi', 'icici', 'sbi', 'hdfc'):
            return 'UPI App'
    return 'Unknown'


def is_upi_screenshot(text):
    indicators = ['payment successful', 'payment of', 'paid to', 'paid by',
                  'upi', 'transaction', 'txn', 'amount', 'successful']
    lower = text.lower()
    score = sum(1 for ind in indicators if ind in lower)
    return score >= 2


def is_bank_cheque(text):
    has_pay_bearer = bool(re.search(r'(?:^|\n)\s*PAY\s+(?!MENT)', text, re.I)) and bool(re.search(r'OR\s+BEARER', text, re.I))
    has_cheque_no = bool(re.search(r'Cheq(?:ue)?\s*(?:No|Number|#)[:\s]*[A-Za-z0-9]{6,15}', text, re.I))
    return has_pay_bearer or has_cheque_no


def extract_mobile(text, upi_id):
    if upi_id:
        local = upi_id.split('@')[0]
        if re.match(r'^\d{10}$', local):
            return local
    m = re.search(r'\b(\d{10})\b', text)
    return m.group(1) if m else None


def extract_structured_data(raw_text):
    if not raw_text or not raw_text.strip():
        return {'error': 'No text provided'}

    text = re.sub(r'\s+', ' ', raw_text.replace('\r', '')).strip()
    app = guess_app(text)
    doc_type = 'upi_payment' if is_upi_screenshot(text) else 'unknown'

    if is_bank_cheque(raw_text):
        doc_type = 'bank_check'

    txn_id = extract_txn_id(text)
    amount = extract_amount(text, raw_text)
    date = extract_date(text)
    time_val = extract_time(raw_text)
    upi_id = extract_upi_id(text)
    from_val, to_val = extract_from_to(raw_text)
    upi_from, upi_to = infer_names_from_upi(text)

    result_from = from_val or upi_from or None
    result_to = to_val or upi_to or None
    mobile = extract_mobile(raw_text, upi_id)

    result = {
        'type': doc_type,
        'app': app,
        'transaction_id': txn_id or None,
        'amount': amount or None,
        'date': date or None,
        'time': time_val or None,
        'from': result_from or None,
        'to': result_to or None,
        'upi_id': upi_id or None,
        'mobile': mobile or None,
    }

    if doc_type == 'bank_check':
        cheque_match = re.search(r'Cheq(?:ue)?\s*(?:No|Number|#)[:\s]*([A-Za-z0-9]{6,15})', raw_text, re.I)
        payee_match = re.search(r'^PAY\s+([A-Za-z\s.]+?)\s+Rs\.?\s', raw_text, re.I | re.M)
        bank_match = re.search(r'(?:^|\n)\s*([A-Za-z\s]+(?:Bank|bank|BANK)\w*)', raw_text)
        ifsc_match = re.search(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', raw_text)
        result['cheque_no'] = cheque_match.group(1) if cheque_match else None
        result['payee'] = payee_match.group(1).strip() if payee_match else None
        result['bank_name'] = bank_match.group(1).strip() if bank_match else None
        result['ifsc'] = ifsc_match.group(1) if ifsc_match else None

    return result

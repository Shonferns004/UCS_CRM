import groq from '../config/groq.js';
import FormData from 'form-data';

const VISION_MODEL = 'llama-3.2-90b-vision-preview';

// Regex heuristics used only when Groq vision is unavailable. The front side of
// an Aadhaar card is fairly regular: name near the top, DOB / Gender lines, an
// address block, and the 12-digit number (possibly masked) near the bottom.
const STATE_NAMES = [
  'Andaman and Nicobar', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Delhi',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
];

function parseDob(raw) {
  const m = String(raw || '').match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (!m) return null;
  let [d, mo, y] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  if (d > 31 && mo <= 12) { const t = d; d = mo; mo = t; }
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// Best-effort field extraction from a blob of OCR text.
export function parseAadhaarFromText(text = '') {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/[|_]/g, '').trim())
    .filter(Boolean);

  const joined = lines.join('\n');
  const out = {};

  // Aadhaar number: "1234 5678 9012" or 12 contiguous digits (allow masks).
  const numMatch =
    joined.match(/\b\d{4}[ ]\d{4}[ ]\d{4}\b/) ||
    joined.match(/\b\d{12}\b/);
  if (numMatch) out.aadhaar_number = numMatch[0].replace(/[^0-9]/g, '');

  // DOB line like "DOB: 12/03/1990" / "Date of Birth : 12-03-1990".
  const dobLine = joined.match(/(?:DOB|Date of Birth|Birth)[^\d]{0,20}(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i);
  if (dobLine) {
    const parsed = parseDob(dobLine[1]);
    if (parsed) out.dob = parsed;
  }

  // Gender: "Gender : Male" or a lone "Male"/"Female"/"Transgender".
  const gMatch =
    joined.match(/(?:Gender|Sex)[^\d]{0,25}(Male|Female|Transgender)/i) ||
    joined.match(/^(Male|Female|Transgender)$/im);
  if (gMatch) out.gender = gMatch[1][0].toUpperCase() + gMatch[1].slice(1).toLowerCase();

  // Pincode: a 6-digit number not used as the Aadhaar UID.
  const pinMatch = joined.match(/\b[1-9]\d{5}\b/);
  if (pinMatch) {
    const pin = pinMatch[0];
    if (!out.aadhaar_number || !pin.startsWith(out.aadhaar_number.slice(0, 2))) {
      out.pincode = pin;
    }
  }

  // State: pick the best-known state name present.
  const state = STATE_NAMES.find((s) =>
    s.split(' ').length > 1
      ? joined.toLowerCase().includes(s.toLowerCase())
      : new RegExp(`\\b${s}\\b`, 'i').test(joined),
  );
  if (state) out.state = state;

  // Address: collect the block between the DOB/Gender lines and the number/
  // pincode at the bottom, dropping known labels and short noise lines.
  const addrStart = lines.findIndex(
    (l) => /Gender|DOB|Date of Birth|Address/i.test(l),
  );
  const addrEnd = lines.length;
  const stopIdx = lines.findIndex((l) => /\b\d{6}\b/.test(l));
  const addrLines = lines.slice(addrStart + 1, stopIdx > -1 ? stopIdx : addrEnd)
    .map((l) => l
      .replace(/^Address[:\- ]*/i, '')
      .replace(/\b\d{4}[ ]?\d{4}[ ]?\d{4}\b/g, '')
      .trim())
    .filter((l) => l && l.length >= 3 && !/^(Male|Female|Transgender|India|Government of India)$/i.test(l));

  if (addrLines.length) {
    out.address_line_1 = addrLines.join(', ');
    out.vtc = addrLines[0];
  }

  // Name: the first "name-like" line near the top (skips headers and labels).
  const nameLine = lines.find(
    (l) =>
      l.length >= 3 &&
      l.length <= 60 &&
      /[A-Za-z]{2,}/.test(l) &&
      !/^(Government|मोहन|Mohan|UIDAI|Unique|Identification|Authority|India|Address|Gender|DOB|Date of Birth|Enrolment|Enrollment)/i.test(l) &&
      !/\d/.test(l),
  );
  if (nameLine) out.name = nameLine.replace(/^[:\- ]+|[:\- ]+$/g, '');

  return out;
}

// Tries Groq vision (structured, reliable) then falls back to OCR.space text +
// regex heuristics. Returns the same shape as parseAadhaarXml.
export async function extractAadhaarFromPhoto(base64) {
  const dataUrl = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;

  try {
    const completion = await groq.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You read Aadhaar cards from photos. Reply with ONLY a JSON object.',
            'Extract exactly these keys (null if not visible):',
            '{"name","dob","gender","address_line_1","vtc","district","state","pincode","aadhaar_number"}',
            'dob must be YYYY-MM-DD. aadhaar_number must be 12 digits with no spaces.',
            'Do not invent values that are not on the card.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the Aadhaar details from this card photo.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (parsed && typeof parsed === 'object') {
      const cleaned = {};
      for (const k of ['name', 'dob', 'gender', 'address_line_1', 'vtc', 'district', 'state', 'pincode', 'aadhaar_number']) {
        const v = parsed[k];
        if (v != null && String(v).trim() !== '') cleaned[k] = String(v).trim();
      }
      if (cleaned.aadhaar_number) {
        cleaned.aadhaar_number = String(cleaned.aadhaar_number).replace(/[^0-9]/g, '').slice(0, 12);
      }
      const dob = parseDob(cleaned.dob);
      if (dob) cleaned.dob = dob;
      return cleaned;
    }
  } catch (_) {
    // Fall through to OCR.space heuristics.
  }

  // Fallback: OCR.space text → regex.
  try {
    let b64 = base64;
    if (base64.includes('base64,')) b64 = base64.split('base64,')[1];
    const form = new FormData();
    form.append('base64image', b64);
    form.append('language', 'eng');
    form.append('filetype', 'JPG');
    form.append('isOverlayRequired', 'false');

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: process.env.OCR_SPACE_KEY },
      body: form,
    });
    const json = await ocrRes.json();
    if (json.OCRExitCode === 1 && json.ParsedResults?.length > 0) {
      return parseAadhaarFromText(json.ParsedResults[0].ParsedText);
    }
    return {};
  } catch (_) {
    return {};
  }
}
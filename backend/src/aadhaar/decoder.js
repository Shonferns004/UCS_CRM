import { QR } from '@xone-labs/aadharjs';
import {
  decodeAadhaarQr as decodeXmlPayload,
  parseAadhaarXml,
} from '../utils/aadhaarDecoder.js';

// ---- Aadhaar QR decoding service ------------------------------------------
// Primary decoder: @xone-labs/aadharjs (modern binary SecureQR). The SecureQR
// encodes its data as a base-10 big integer (per the UIDAI spec) which this
// package decodes with BigInt() -> bytes -> inflate -> 0xFF-delimited fields.
// Fallback decoder: the project's existing XML decoder (legacy base64/zlib/
// JSON-wrapped XML cards). No Aadhaar data is ever logged here.

export class AadhaarDecodeError extends Error {
  /**
   * @param {string} message
   * @param {'invalid' | 'unsupported'} kind
   */
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

const GENDER_BY_CODE = {
  M: 'Male',
  F: 'Female',
  T: 'Other',
  O: 'Other',
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  TRANSGENDER: 'Other',
};

const GENDER_CHOICES = ['Male', 'Female', 'Other'];

function normalizeDob(dob) {
  const s = String(dob ?? '').trim();
  if (!s) return null;
  // Aadhaar QR dob is DD-MM-YYYY; the beneficiaries form expects YYYY-MM-DD.
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function normalizeGender(gender) {
  const s = String(gender ?? '').trim();
  if (!s) return null;
  if (GENDER_CHOICES.includes(s)) return s;
  return GENDER_BY_CODE[s.toUpperCase()] ?? null;
}

// Join address components in a stable order, skipping blanks and removing
// duplicate components so the form never shows "null, null, null".
function buildAddress(parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const v = String(part ?? '').trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.length > 0 ? out.join(', ') : null;
}

function hasAnyIdentityField(a) {
  if (a.name || a.dob || a.gender) return true;
  return Object.values(a.address || {}).some((v) => String(v ?? '').trim());
}

function normalizePackageOutput(a) {
  return {
    name: String(a.name ?? '').trim() || null,
    dob: normalizeDob(a.dob),
    gender: normalizeGender(a.gender),
    address: buildAddress([
      a.address?.co,
      a.address?.house,
      a.address?.street,
      a.address?.location,
      a.address?.landmark,
      a.address?.vtc,
      a.address?.po,
      a.address?.district,
      a.address?.subdist,
      a.address?.state,
      a.address?.pincode,
    ]),
  };
}

function looksLikeLegacyXml(input) {
  // base64 / zlib / JSON-wrapped XML payloads start with '<' after base64
  // decode. Anything else that fails to decode is treated as simply invalid.
  const cleaned = String(input).replace(/[\s\r\n]+/g, '');
  try {
    const text = Buffer.from(cleaned, 'base64').toString('utf8');
    return text.startsWith('<?xml') || text.includes('<UidaiData') || text.includes('<Poi');
  } catch {
    return false;
  }
}

// Returns { name, dob, gender, address } or throws an AadhaarDecodeError.
export function decodeAadhaarQr(raw) {
  const input = String(raw ?? '').trim();
  if (!input) {
    throw new AadhaarDecodeError('QR data is required', 'invalid');
  }

  // 1) Modern binary SecureQR via @xone-labs/aadharjs.
  let packageResult = null;
  try {
    packageResult = QR.decode(input);
  } catch {
    packageResult = null;
  }
  if (packageResult && hasAnyIdentityField(packageResult)) {
    return normalizePackageOutput(packageResult);
  }

  // 2) Legacy XML-format cards via the existing XML decoder.
  const xml = decodeXmlPayload(input);
  if (xml) {
    const fields = parseAadhaarXml(xml);
    if (fields && (fields.name || fields.aadhaar_number)) {
      return {
        name: String(fields.name ?? '').trim() || null,
        dob: normalizeDob(fields.dob),
        gender: normalizeGender(fields.gender),
        address: String(fields.address_line_1 ?? '').trim() || null,
      };
    }
  }

  // 3) Classify the failure.
  if (looksLikeLegacyXml(input)) {
    throw new AadhaarDecodeError('Unsupported Aadhaar QR format', 'unsupported');
  }
  throw new AadhaarDecodeError('Invalid Aadhaar QR', 'invalid');
}
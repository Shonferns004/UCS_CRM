/**
 * Phone engine - ported from UcsExtractor `packages/shared/src/phone`.
 *
 * Honest by construction:
 *  - an Indian mobile number carries no region, so the region is reported as
 *    unknown instead of copying the address into it;
 *  - `formatValid` means "well-formed for its country", never "reachable".
 *
 * `libphonenumber-js/max` is required: the default `min` metadata omits phone
 * number types, which would make every number report as "unknown".
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/** The market we tune for first. Any ISO country code still works. */
export const DEFAULT_COUNTRY = 'IN';

/**
 * India STD (area) code -> region seed.
 *
 * Deliberately conservative: only codes we can state with confidence are
 * listed, and ambiguous short codes resolve to a state rather than a city.
 * Mobile numbers carry no region, so this map is only consulted for landlines.
 */
export const STD_CODES = {
  // Metro (2-digit)
  '11': { state: 'Delhi', city: 'New Delhi' },
  '22': { state: 'Maharashtra', city: 'Mumbai' },
  '33': { state: 'West Bengal', city: 'Kolkata' },
  '40': { state: 'Telangana', city: 'Hyderabad' },
  '44': { state: 'Tamil Nadu', city: 'Chennai' },
  '20': { state: 'Maharashtra', city: 'Pune' },
  '79': { state: 'Gujarat', city: 'Ahmedabad' },
  '80': { state: 'Karnataka', city: 'Bengaluru' },

  // North
  '120': { state: 'Uttar Pradesh' },
  '121': { state: 'Uttar Pradesh', city: 'Meerut' },
  '124': { state: 'Haryana', city: 'Gurugram' },
  '129': { state: 'Haryana', city: 'Faridabad' },
  '141': { state: 'Rajasthan', city: 'Jaipur' },
  '151': { state: 'Rajasthan', city: 'Bikaner' },
  '161': { state: 'Punjab', city: 'Ludhiana' },
  '172': { state: 'Chandigarh', city: 'Chandigarh' },
  '175': { state: 'Punjab', city: 'Patiala' },
  '183': { state: 'Punjab', city: 'Amritsar' },
  '291': { state: 'Rajasthan', city: 'Jodhpur' },
  '294': { state: 'Rajasthan', city: 'Udaipur' },
  '512': { state: 'Uttar Pradesh', city: 'Kanpur' },
  '522': { state: 'Uttar Pradesh', city: 'Lucknow' },
  '532': { state: 'Uttar Pradesh', city: 'Prayagraj' },
  '542': { state: 'Uttar Pradesh', city: 'Varanasi' },
  '560': { state: 'Uttar Pradesh', city: 'Mathura' },
  '562': { state: 'Uttar Pradesh', city: 'Agra' },
  '571': { state: 'Uttar Pradesh', city: 'Aligarh' },
  '581': { state: 'Uttar Pradesh', city: 'Bareilly' },
  '744': { state: 'Rajasthan', city: 'Kota' },

  // East
  '612': { state: 'Bihar', city: 'Patna' },
  '651': { state: 'Jharkhand', city: 'Ranchi' },
  '657': { state: 'Jharkhand', city: 'Jamshedpur' },
  '661': { state: 'Odisha', city: 'Rourkela' },
  '674': { state: 'Odisha', city: 'Bhubaneswar' },
  '361': { state: 'Assam', city: 'Guwahati' },

  // South
  '413': { state: 'Puducherry', city: 'Puducherry' },
  '422': { state: 'Tamil Nadu', city: 'Coimbatore' },
  '427': { state: 'Tamil Nadu', city: 'Salem' },
  '431': { state: 'Tamil Nadu', city: 'Tiruchirappalli' },
  '452': { state: 'Tamil Nadu', city: 'Madurai' },
  '471': { state: 'Kerala', city: 'Thiruvananthapuram' },
  '484': { state: 'Kerala', city: 'Kochi' },
  '487': { state: 'Kerala', city: 'Thrissur' },
  '495': { state: 'Kerala', city: 'Kozhikode' },
  '821': { state: 'Karnataka', city: 'Mysuru' },
  '824': { state: 'Karnataka', city: 'Mangaluru' },
  '836': { state: 'Karnataka', city: 'Hubballi' },
  '863': { state: 'Andhra Pradesh', city: 'Guntur' },
  '866': { state: 'Andhra Pradesh', city: 'Vijayawada' },
  '870': { state: 'Telangana', city: 'Warangal' },
  '877': { state: 'Andhra Pradesh', city: 'Tirupati' },
  '891': { state: 'Andhra Pradesh', city: 'Visakhapatnam' },

  // West / Central
  '240': { state: 'Maharashtra', city: 'Chhatrapati Sambhajinagar' },
  '241': { state: 'Maharashtra', city: 'Ahmednagar' },
  '253': { state: 'Maharashtra', city: 'Nashik' },
  '261': { state: 'Gujarat', city: 'Surat' },
  '265': { state: 'Gujarat', city: 'Vadodara' },
  '281': { state: 'Gujarat', city: 'Rajkot' },
  '288': { state: 'Gujarat', city: 'Jamnagar' },
  '712': { state: 'Maharashtra', city: 'Nagpur' },
  '731': { state: 'Madhya Pradesh', city: 'Indore' },
  '751': { state: 'Madhya Pradesh', city: 'Gwalior' },
  '755': { state: 'Madhya Pradesh', city: 'Bhopal' },
  '761': { state: 'Madhya Pradesh', city: 'Jabalpur' },
};

/** Longest-prefix match against the STD map. 2-4 digit codes supported. */
export function lookupStdCode(nationalNumber) {
  if (!/^\d{6,}$/.test(nationalNumber)) return null;
  for (let len = 4; len >= 2; len -= 1) {
    const candidate = nationalNumber.slice(0, len);
    const hit = STD_CODES[candidate];
    if (hit) return hit;
  }
  return null;
}

const LINE_TYPE_MAP = {
  MOBILE: 'mobile',
  FIXED_LINE: 'landline',
  TOLL_FREE: 'toll_free',
  VOIP: 'voip',
};

function toLineType(raw) {
  if (!raw) return 'unknown';
  // FIXED_LINE_OR_MOBILE is genuinely ambiguous (e.g. North America) - do not guess.
  return LINE_TYPE_MAP[raw] ?? 'unknown';
}

/**
 * Normalise one raw phone value.
 *
 * @param {string|null|undefined} raw
 * @param {{defaultCountry?: string, addressHint?: {state?: string|null, city?: string|null}}} [options]
 * @returns {{
 *   raw: string,
 *   e164: string|null,
 *   country: string|null,
 *   lineType: 'mobile'|'landline'|'toll_free'|'voip'|'unknown',
 *   formatValid: boolean,
 *   region: {state: string|null, city: string|null, source: 'area_code'|'address'|'unknown'},
 *   reason?: string
 * }}
 */
export function normalizePhone(raw, options = {}) {
  const trimmed = (raw ?? '').trim();
  const country = String(options.defaultCountry ?? DEFAULT_COUNTRY).toUpperCase();

  const empty = {
    raw: trimmed,
    e164: null,
    country: null,
    lineType: 'unknown',
    formatValid: false,
    region: { state: null, city: null, source: 'unknown' },
  };

  if (!trimmed) return { ...empty, reason: 'empty' };

  // Keep digits, leading +, and separators libphonenumber understands.
  const cleaned = trimmed.replace(/[^\d+\-().\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/\d{4,}/.test(cleaned)) return { ...empty, reason: 'no_digits' };

  let parsed = parsePhoneNumberFromString(cleaned, country);
  if (!parsed) parsed = parsePhoneNumberFromString(cleaned);
  if (!parsed) return { ...empty, reason: 'unparseable' };

  const formatValid = parsed.isValid();
  if (!formatValid) {
    return {
      ...empty,
      raw: trimmed,
      country: parsed.country ?? country,
      reason: 'invalid_for_country',
    };
  }

  const lineType = toLineType(parsed.getType());
  const e164 = parsed.number;
  const resolvedCountry = parsed.country ?? country;

  // Region inference, in strict priority order.
  let region = { state: null, city: null, source: 'unknown' };
  let reason;

  if (resolvedCountry === 'IN' && lineType === 'landline') {
    const hit = lookupStdCode(parsed.nationalNumber);
    if (hit) {
      region = { state: hit.state, city: hit.city ?? null, source: 'area_code' };
    } else {
      reason = 'std_code_not_in_seed_map';
    }
  } else if (lineType === 'mobile') {
    // A mobile number says nothing about where the business is.
    reason = 'mobile_number_has_no_region';
  } else if (resolvedCountry !== 'IN') {
    reason = 'region_inference_supported_for_in_only';
  }

  if (region.source === 'unknown') {
    const hintState = options.addressHint?.state?.trim() || null;
    const hintCity = options.addressHint?.city?.trim() || null;
    if (hintState || hintCity) {
      region = { state: hintState, city: hintCity, source: 'address' };
    }
  }

  return {
    raw: trimmed,
    e164,
    country: resolvedCountry,
    lineType,
    formatValid: true,
    region,
    ...(reason ? { reason } : {}),
  };
}

/** Display helper: groups digits for readability without changing the value. */
export function formatE164ForDisplay(e164) {
  if (!e164) return 'Not available';
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

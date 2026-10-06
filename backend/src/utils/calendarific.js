// Calendarific (https://calendarific.com) enriches the Event Head calendar with
// India's festivals/national days and worldwide/UN observance days, properly
// dated for ANY year. The API key lives ONLY in the backend .env — never
// hardcode it in code.
//
// Design rules:
//   - one HTTP request per country+year (Calendarific's billing unit), cached
//     in memory with a TTL so repeated month views do not burn the quota
//   - in-flight dedup: two concurrent range requests for the same year make a
//     single upstream call
//   - graceful failure: missing key, timeout, HTTP error or quota exhaustion
//     degrade to the curated list alone (return []), never throw
//   - append-only merge: curated/DB rows always win on exact duplicates; a
//     Calendarific row is added only when its date+normalizedName is new

const CALENDARIFIC_API_BASE = 'https://calendarific.com/api/v2/holidays';
const CALENDARIFIC_COUNTRY = 'IN';
const CALENDARIFIC_TYPES = ['national', 'local', 'religious', 'observance'];
const CALENDARIFIC_TTL_MS = 24 * 60 * 60 * 1000;
const CALENDARIFIC_TIMEOUT_MS = 8000;
const CALENDARIFIC_FAILURE_BUDGET = 3;
const CALENDARIFIC_COOLDOWN_MS = 5 * 60 * 1000;

// Calendarific tags India's religious days with the religion name itself
// (e.g. type: ["Hinduism", "Optional holiday"]) instead of a generic flag.
const RELIGION_SIGNALS = [
  'hinduism', 'christian', 'christianity', 'islam', 'muslim', 'sikhism', 'sikh',
  'jainism', 'buddhism', 'buddhist', 'judaism', 'jewish', 'coptic', 'shinto', 'zoroastrian',
];

const cache = new Map();      // `${country}:${year}` -> { rows|null, expiresAt, inFlight }
const failures = new Map();   // `${country}:${year}` -> consecutive failure count
const retryAfter = new Map(); // `${country}:${year}` -> timestamp to retry after

const yearKey = (year) => `${CALENDARIFIC_COUNTRY}:${year}`;

/** Map one raw Calendarific holiday to an observance entry, or null to skip it. */
export function classifyCalendarific(raw) {
  const types = (raw?.type || []).map((t) => String(t).toLowerCase());
  const primary = String(raw?.primary_type || '').toLowerCase();
  // Equinoxes/solstices are astronomy, not observances.
  if (primary === 'season' || types.includes('season')) return null;
  // Calendarific's "Observance" bucket IS worldwide and UN observances.
  if (types.includes('observance') || primary.includes('observance')) {
    return { scope: 'worldwide', kind: 'observance' };
  }
  if (types.some((t) => RELIGION_SIGNALS.includes(t)) || RELIGION_SIGNALS.some((r) => primary.includes(r))) {
    return { scope: 'india', kind: 'religious' };
  }
  if (types.includes('national holiday') || /national|gazetted|government|bank/.test(primary)) {
    return { scope: 'india', kind: 'national' };
  }
  return { scope: 'india', kind: 'observance' };
}

/** Normalize a list of raw Calendarific holidays into observance entries. */
export function mapCalendarificRows(rawRows) {
  const out = [];
  for (const raw of rawRows || []) {
    const date = String(raw?.date?.iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const name = String(raw?.name || '').trim();
    if (!name) continue;
    const cls = classifyCalendarific(raw);
    if (!cls) continue;
    out.push({
      date,
      name,
      scope: cls.scope,
      kind: cls.kind,
      precision: 'fixed',
      themes: [],
      source: 'calendarific',
      note: String(raw?.description || '').trim() || null,
    });
  }
  return out;
}

/** Dedup key that collapses punctuation/casing so "X (India)" and "X" differ. */
export function normalizeObservanceName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Append-only merge of Calendarific rows over an existing list. Entries already
 * in `list` (curated + DB) always win: a Calendarific row whose date+name key
 * collides is dropped, anything else is appended, and multiple rows per date
 * are preserved. The optional `scope` restricts what gets appended.
 */
export function mergeCalendarific(list, rows, scope = 'all') {
  const out = list.map((o) => ({ ...o }));
  const key = (o) => `${o.date}::${normalizeObservanceName(o.name)}`;
  const seen = new Set(out.map(key));
  for (const o of rows || []) {
    if (scope !== 'all' && o.scope !== scope) continue;
    const k = key(o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  return out;
}

/** One upstream request for a country+year, mapped to observance entries. */
async function fetchCalendarificYear(year) {
  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) return [];
  const url = new URL(CALENDARIFIC_API_BASE);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('country', CALENDARIFIC_COUNTRY);
  url.searchParams.set('year', String(year));
  url.searchParams.set('type', CALENDARIFIC_TYPES.join(','));

  const res = await fetch(url, { signal: AbortSignal.timeout(CALENDARIFIC_TIMEOUT_MS) });
  if (!res.ok) {
    const err = new Error(`calendarific http ${res.status}`);
    err.code = 'CALENDARIFIC_HTTP';
    throw err;
  }
  const body = await res.json();
  if (!body?.response?.holidays) {
    throw new Error(body?.meta?.error_detail || 'calendarific empty response');
  }
  return mapCalendarificRows(body.response.holidays);
}

/**
 * Cached fetch for one year. Same process, same country+year = at most one
 * upstream call per TTL, and never a throw: callers always receive an array.
 */
export async function getCalendarificObservancesForYear(year) {
  if (!process.env.CALENDARIFIC_API_KEY) return [];

  const key = yearKey(year);
  const now = Date.now();
  const entry = cache.get(key);

  // Reuse a request already in flight for this year (quota-friendly).
  if (entry?.inFlight) return entry.inFlight;
  // Serve fresh cached rows without touching the network.
  if (entry?.rows && entry.expiresAt > now) return entry.rows;
  // The API is in cooldown after repeated failures: stale rows still beat nothing.
  if ((retryAfter.get(key) || 0) > now) return entry?.rows || [];

  const inFlight = fetchCalendarificYear(year)
    .then((rows) => {
      cache.set(key, { rows, expiresAt: Date.now() + CALENDARIFIC_TTL_MS });
      failures.delete(key);
      retryAfter.delete(key);
      return rows;
    })
    .catch((err) => {
      failures.set(key, (failures.get(key) || 0) + 1);
      if (failures.get(key) >= CALENDARIFIC_FAILURE_BUDGET) {
        retryAfter.set(key, Date.now() + CALENDARIFIC_COOLDOWN_MS);
        console.warn(`getCalendarificObservancesForYear: ${key} degraded for ${CALENDARIFIC_COOLDOWN_MS / 1000}s after ${failures.get(key)} failures (${err.message || err})`);
      }
      return entry?.rows || [];
    });
  cache.set(key, { rows: entry?.rows || null, expiresAt: entry?.expiresAt || 0, inFlight });
  return inFlight;
}

/** All Calendarific observances whose date falls inside [startYmd, endYmd). */
export async function getCalendarificObservancesInRange(startYmd, endYmd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startYmd)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endYmd))) {
    return [];
  }
  const startYear = Number(String(startYmd).slice(0, 4));
  const endYear = Number(String(endYmd).slice(0, 4));
  const jobs = [];
  for (let y = startYear; y <= endYear; y++) jobs.push(getCalendarificObservancesForYear(y));
  const byYear = await Promise.all(jobs);
  const out = [];
  for (const rows of byYear) {
    for (const o of rows) {
      if (o.date >= startYmd && o.date < endYmd) out.push(o);
    }
  }
  return out;
}
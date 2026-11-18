import db from '../config/db.js';

// ---------------------------------------------------------------------------
// Google Ads / GA4 credentials.
//
// DATABASE ONLY. The Connection panel is the only writer: values are saved in
// the `settings` table and loaded into this module's runtime map at boot and
// immediately after a save. `.env` is deliberately NOT consulted — a value in
// backend/.env is scrubbed at boot so there is exactly one source of truth.
//
// Why a runtime map instead of reading the table on demand:
// getGoogleAdsConfig() is called synchronously by the OAuth/Ads service and the
// sync scheduler. Keeping a small in-memory copy lets those callers stay
// synchronous while the database remains the persistent store.
//
// Required for the Ads API (developer tokens were sunset on 9 Sep 2026;
// access levels now belong to the Google Cloud project behind the OAuth client):
//   client id + client secret + refresh token  -> OAuth access token
//   customer id                                -> which ad account to read
// GA4 only needs the OAuth trio plus a property id.
// The developer token field is kept only for legacy saved values; it is no
// longer required and the API ignores the header.
// ---------------------------------------------------------------------------

export const GOOGLE_ADS_CONFIG_FIELDS = [
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'GOOGLE_ADS_API_VERSION',
  'GOOGLE_ADS_CONVERSION_ACTION_ID',
  'GA4_PROPERTY_ID',
];

// Never rendered in full by the API.
const SECRET_FIELDS = new Set([
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_REFRESH_TOKEN',
]);

// Read-only copy for the controller's reveal endpoint.
export const GOOGLE_ADS_SECRET_FIELDS = [...SECRET_FIELDS];

const DEFAULT_API_VERSION = 'v26';

const fieldKey = (envKey) => String(envKey).toLowerCase(); // settings.key

// Runtime copy, keyed by the same upper-case names as the settings fields.
let runtimeFields = {};

export function maskSecret(value) {
  const raw = String(value == null ? '' : value);
  if (!raw) return '';
  if (raw.length <= 8) return '•'.repeat(raw.length);
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

// Ad account ids are published as 123-456-7890 but every API takes digits.
export function normalizeCustomerId(value) {
  return String(value == null ? '' : value).replace(/[^\d]/g, '');
}

// GA4 property ids are either "123456789" or "properties/123456789".
export function normalizeGa4PropertyId(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^properties\//i, '')
    .replace(/[^\d]/g, '');
}

export function normalizeApiVersion(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return DEFAULT_API_VERSION;
  const withV = /^v/i.test(raw) ? raw : `v${raw}`;
  return /^v\d{1,3}$/i.test(withV) ? withV.toLowerCase() : DEFAULT_API_VERSION;
}

const str = (value) => String(value == null ? '' : value).trim();

// The service-facing shape. Always built from the runtime copy, never from
// process.env, so `.env` can never silently take over.
export function getGoogleAdsConfig() {
  const f = runtimeFields;
  return {
    clientId: str(f.GOOGLE_ADS_CLIENT_ID),
    clientSecret: str(f.GOOGLE_ADS_CLIENT_SECRET),
    developerToken: str(f.GOOGLE_ADS_DEVELOPER_TOKEN),
    refreshToken: str(f.GOOGLE_ADS_REFRESH_TOKEN),
    customerId: normalizeCustomerId(f.GOOGLE_ADS_CUSTOMER_ID),
    loginCustomerId: normalizeCustomerId(f.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
    apiVersion: normalizeApiVersion(f.GOOGLE_ADS_API_VERSION || DEFAULT_API_VERSION),
    conversionActionId: str(f.GOOGLE_ADS_CONVERSION_ACTION_ID),
    ga4PropertyId: normalizeGa4PropertyId(f.GA4_PROPERTY_ID),
  };
}

export function isGoogleAdsConfigured() {
  const cfg = getGoogleAdsConfig();
  return Boolean(
    cfg.clientId
    && cfg.clientSecret
    && cfg.refreshToken
    && cfg.customerId,
  );
}

export function isGa4Configured() {
  const cfg = getGoogleAdsConfig();
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken && cfg.ga4PropertyId);
}

function pickFields(input = {}) {
  const patch = {};
  for (const key of GOOGLE_ADS_CONFIG_FIELDS) {
    if (input[key] === undefined) continue;
    patch[key] = String(input[key] == null ? '' : input[key]).trim();
  }
  return patch;
}

// Normalises the shape before it reaches the runtime map / the settings table,
// so a pasted "123-456-7890" or "properties/123" is stored canonically.
function canonicalize(patch = {}) {
  const out = { ...patch };
  if (out.GOOGLE_ADS_CUSTOMER_ID !== undefined) {
    out.GOOGLE_ADS_CUSTOMER_ID = normalizeCustomerId(out.GOOGLE_ADS_CUSTOMER_ID);
  }
  if (out.GOOGLE_ADS_LOGIN_CUSTOMER_ID !== undefined) {
    out.GOOGLE_ADS_LOGIN_CUSTOMER_ID = normalizeCustomerId(out.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  }
  if (out.GOOGLE_ADS_API_VERSION !== undefined) {
    out.GOOGLE_ADS_API_VERSION = normalizeApiVersion(out.GOOGLE_ADS_API_VERSION);
  }
  if (out.GA4_PROPERTY_ID !== undefined) {
    out.GA4_PROPERTY_ID = normalizeGa4PropertyId(out.GA4_PROPERTY_ID);
  }
  return out;
}

// Apply a patch to the in-memory copy only. Persisting is a separate step so a
// failed OAuth verification can be rolled back without touching the database.
export function applyGoogleAdsConfigPatch(patch = {}) {
  const applied = [];
  for (const [key, value] of Object.entries(canonicalize(pickFields(patch)))) {
    if (value) runtimeFields[key] = value;
    else delete runtimeFields[key];
    applied.push(key);
  }
  return applied;
}

// Used by the controller to undo an in-memory patch when Google rejects the
// credentials or the database write fails.
export function snapshotGoogleAdsConfig() {
  return { ...runtimeFields };
}

export function restoreGoogleAdsConfig(snapshot = {}) {
  runtimeFields = { ...snapshot };
}

// Persists to `settings`, then mirrors the change into the runtime copy so a
// direct caller (not just the controller) stays consistent.
export async function persistGoogleAdsConfig(patch = {}) {
  const fields = canonicalize(pickFields(patch));
  for (const [key, value] of Object.entries(fields)) {
    if (value) {
      const { error } = await db
        .from('settings')
        .upsert({ key: fieldKey(key), value }, { onConflict: 'key' });
      if (error) throw error;
    } else {
      const { error } = await db.from('settings').delete().eq('key', fieldKey(key));
      if (error) throw error;
    }
  }
  applyGoogleAdsConfigPatch(fields);
  return Object.keys(fields);
}

// Removes legacy Google Ads values from backend/.env's in-memory copy. This is
// what makes the database the single source of truth: even if someone still has
// GOOGLE_ADS_* in .env, the service cannot read them.
export function scrubGoogleAdsEnvCredentials() {
  const found = GOOGLE_ADS_CONFIG_FIELDS.filter((key) => process.env[key] !== undefined);
  for (const key of GOOGLE_ADS_CONFIG_FIELDS) delete process.env[key];
  return found;
}

// Load every stored value into the runtime map at boot. The caller logs the
// returned keys; no credential value is ever logged.
export async function loadGoogleAdsConfigFromDb() {
  const ignoredEnv = scrubGoogleAdsEnvCredentials();
  if (ignoredEnv.length) {
    console.warn(
      `[google-ads] ignoring ${ignoredEnv.join(', ')} from .env — credentials are database-only. `
      + 'Save them in Accounts → Google Ads & Analytics → Connection.',
    );
  }

  const { rows } = await db._pool.query(
    `select key, value from settings where key = any($1::text[])`,
    [GOOGLE_ADS_CONFIG_FIELDS.map(fieldKey)],
  );

  const next = {};
  for (const row of rows) {
    const key = String(row.key || '').toUpperCase();
    if (!GOOGLE_ADS_CONFIG_FIELDS.includes(key)) continue;
    const value = String(row.value == null ? '' : row.value).trim();
    if (!value) continue;
    next[key] = key === 'GOOGLE_ADS_API_VERSION' ? normalizeApiVersion(value) : value;
  }
  runtimeFields = next;
  return Object.keys(next);
}

// Clear the database copy AND the runtime map. The service is immediately
// unconfigured; nothing can fall back to .env.
export async function clearGoogleAdsConfig() {
  await db._pool.query(
    `delete from settings where key = any($1::text[])`,
    [GOOGLE_ADS_CONFIG_FIELDS.map(fieldKey)],
  );
  runtimeFields = {};
  scrubGoogleAdsEnvCredentials();
  return GOOGLE_ADS_CONFIG_FIELDS.slice();
}

// What the Connection panel shows. Secrets are masked, never returned raw.
// `source` is only ever `database` (a saved row), `default` (API version) or
// `missing` — there is no env fallback anymore.
export async function getGoogleAdsConfigView() {
  const { rows } = await db._pool.query(
    `select key, value from settings where key = any($1::text[])`,
    [GOOGLE_ADS_CONFIG_FIELDS.map(fieldKey)],
  );
  const stored = new Map(
    rows.map((r) => [String(r.key || '').toUpperCase(), String(r.value == null ? '' : r.value).trim()]),
  );

  const cfg = getGoogleAdsConfig();
  const effective = {
    GOOGLE_ADS_CLIENT_ID: cfg.clientId,
    GOOGLE_ADS_CLIENT_SECRET: cfg.clientSecret,
    GOOGLE_ADS_DEVELOPER_TOKEN: cfg.developerToken,
    GOOGLE_ADS_REFRESH_TOKEN: cfg.refreshToken,
    GOOGLE_ADS_CUSTOMER_ID: cfg.customerId,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: cfg.loginCustomerId,
    GOOGLE_ADS_API_VERSION: cfg.apiVersion,
    GOOGLE_ADS_CONVERSION_ACTION_ID: cfg.conversionActionId,
    GA4_PROPERTY_ID: cfg.ga4PropertyId,
  };

  const fields = {};
  for (const key of GOOGLE_ADS_CONFIG_FIELDS) {
    const dbValue = stored.get(key) || '';
    const value = dbValue || effective[key] || '';

    let source = 'missing';
    if (dbValue) source = 'database';
    else if (key === 'GOOGLE_ADS_API_VERSION') source = 'default';

    fields[key.toLowerCase()] = {
      key,
      source,
      set: Boolean(value),
      value: SECRET_FIELDS.has(key) ? '' : (value || ''),
      masked: value ? (SECRET_FIELDS.has(key) ? maskSecret(value) : value) : '',
    };
  }

  return {
    fields,
    configured: isGoogleAdsConfigured(),
    ga4_configured: isGa4Configured(),
    editable: true,
  };
}

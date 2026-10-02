const ENV_KEY = 'db-viewer-env';
const CUSTOM_KEY = 'db-viewer-custom-api';
const ADMIN_KEY_STORE = 'db-viewer-admin-key';

export const ENV_PRESETS = {
  production: { label: 'Production', base: 'https://api.beingsevak.org' },
  development: { label: 'Development (Head)', base: 'http://52.66.211.205' },
  custom: { label: 'Custom', base: '' },
};

function getStoredEnv() {
  try { return localStorage.getItem(ENV_KEY) || null; } catch (e) { return null; }
}
function setStoredEnv(v) { try { if (v) localStorage.setItem(ENV_KEY, v); else localStorage.removeItem(ENV_KEY); } catch (e) {} }
function getStoredCustom() { try { return localStorage.getItem(CUSTOM_KEY) || ''; } catch (e) { return ''; } }
function setStoredCustom(v) { try { localStorage.setItem(CUSTOM_KEY, v || ''); } catch (e) {} }

function normalizeBase(b) {
  if (!b) return '';
  let s = b.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s.replace(/\/+$/, '');
}

function resolveBase() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('api');
  if (override) {
    const n = normalizeBase(override);
    if (n) return { base: n, explicit: true, source: 'override' };
  }
  const env = getStoredEnv();
  if (env && ENV_PRESETS[env]) {
    if (env === 'custom') {
      const c = normalizeBase(getStoredCustom());
      if (c) return { base: c, explicit: true, source: 'custom' };
    } else {
      return { base: ENV_PRESETS[env].base, explicit: true, source: env };
    }
  }
  if (window.location.protocol === 'file:') return { base: '', explicit: false };
  return { base: '', explicit: false };
}

let resolved = resolveBase();
export let apiBase = resolved.base;
export let apiBaseExplicit = resolved.explicit;
export let apiBaseSource = resolved.source;

export function setApiEnvironment(env, customBase) {
  if (env && ENV_PRESETS[env]) {
    setStoredEnv(env);
    if (env === 'custom' && typeof customBase !== 'undefined') {
      setStoredCustom(customBase || '');
    }
  } else {
    setStoredEnv(null);
    setStoredCustom('');
  }
  resolved = resolveBase();
  apiBase = resolved.base;
  apiBaseExplicit = resolved.explicit;
  apiBaseSource = resolved.source;
}

export function getApiConfig() {
  const env = getStoredEnv() || (apiBaseExplicit ? (apiBaseSource === 'custom' ? 'custom' : (apiBase === ENV_PRESETS.production.base ? 'production' : apiBase === ENV_PRESETS.development.base ? 'development' : 'custom')) : null);
  return {
    env,
    custom: getStoredCustom(),
    base: apiBase,
    explicit: apiBaseExplicit,
    source: apiBaseSource,
  };
}

export const API_BASE = apiBase || '';
export const WAS_API_BASE = (apiBase || '') + '/api/whatsapp';

// The S3 browser sits behind ENV_ADMIN_KEY on the backend. Sending it on every
// request costs nothing when it is unset, and the table routes ignore it.
export function getAdminKey() {
  try { return localStorage.getItem(ADMIN_KEY_STORE) || ''; } catch (e) { return ''; }
}
export function setAdminKey(v) {
  try { if (v) localStorage.setItem(ADMIN_KEY_STORE, v); else localStorage.removeItem(ADMIN_KEY_STORE); } catch (e) {}
}

function headers() {
  const h = { 'X-Client-Type': 'db-viewer', 'Content-Type': 'application/json' };
  const k = getAdminKey();
  if (k) h['X-Admin-Key'] = k;
  return h;
}

function errorFrom(res) {
  return res.text().then((t) => {
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(t); if (j.message) msg = j.message; } catch (e) { if (t) msg = t.slice(0, 200); }
    return new Error(msg);
  });
}

export async function api(path, opts) {
  const attempt = async (base) => {
    const res = await fetch(base + path, Object.assign({ headers: headers() }, opts));
    if (!res.ok) throw await errorFrom(res);
    return res.json();
  };
  if (!apiBase) {
    throw new Error('No API base configured. Select an environment (Production/Development/Custom) in the header.');
  }
  try {
    return await attempt(apiBase);
  } catch (e) {
    if (apiBaseExplicit) throw e;
    apiBase = ENV_PRESETS.production.base;
    apiBaseExplicit = true;
    apiBaseSource = 'production';
    return await attempt(apiBase);
  }
}

// Same as api() but hands back the raw body — used for object downloads, where
// the response is bytes and a blob URL, not JSON.
export async function apiBlob(path) {
  const res = await fetch(apiBase + path, { headers: headers() });
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

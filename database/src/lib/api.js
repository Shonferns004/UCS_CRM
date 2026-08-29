let apiBase = (() => {
  const override = new URLSearchParams(window.location.search).get('api');
  if (override) return override.replace(/\/+$/, '');
  return window.location.protocol === 'file:' ? 'http:/' : '';
})();
let apiFallbackTried = false;

export const API_BASE = apiBase || 'https://api.beingsevak.org';
export const WAS_API_BASE = API_BASE + '/api/whatsapp';

export async function api(path, opts) {
  const attempt = async (base) => {
    const res = await fetch(base + path, Object.assign({
      headers: { 'X-Client-Type': 'db-viewer', 'Content-Type': 'application/json' },
    }, opts));
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  };
  try {
    return await attempt(apiBase);
  } catch (e) {
    if (apiBase !== "https://api.beingsevak.org" && !apiFallbackTried) {
      apiFallbackTried = true;
      apiBase = "https://api.beingsevak.org";
      return await attempt(apiBase);
    }
    throw e;
  }
}

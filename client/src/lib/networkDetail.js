// Controls whether the app emits network/debug details to the browser console.
// Set VITE_SHOW_NETWORK_DETAIL=false in the environment to silence them.
// Note: this cannot hide real HTTP requests from the browser's Network tab;
// it only gates client-side debug logging.
export const SHOW_NETWORK_DETAIL =
  String(import.meta.env.VITE_SHOW_NETWORK_DETAIL ?? 'true').toLowerCase() !== 'false';

if (!SHOW_NETWORK_DETAIL && typeof console !== 'undefined') {
  const noop = () => {};
  try { console.log = noop; } catch { /* ignore */ }
  try { console.debug = noop; } catch { /* ignore */ }
  try { console.info = noop; } catch { /* ignore */ }
}
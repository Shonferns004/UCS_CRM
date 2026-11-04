/* global UCS_CONFIG */
importScripts("config.js");

const CONFIG = globalThis.UCS_CONFIG || {};
const DEFAULT_API_BASE = CONFIG.apiBase || "http://localhost:5000/api";

async function getSettings() {
  const stored = await chrome.storage.local.get(["apiBase", "token", "autoSave"]);
  return {
    apiBase: String(stored.apiBase || CONFIG.apiBase || DEFAULT_API_BASE).replace(/\/+$/, ""),
    token: String(stored.token || CONFIG.token || ""),
    autoSave: stored.autoSave === undefined ? CONFIG.autoSave !== false : Boolean(stored.autoSave),
  };
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text: text == null ? "" : String(text) });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
  } catch { /* action unavailable in some contexts */ }
}

async function request(settings, path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "1",
    ...(options.headers || {}),
  };
  if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
  const res = await fetch(`${settings.apiBase}${path}`, { ...options, headers });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }
  return { ok: res.ok, status: res.status, data };
}

async function saveToCrm(items, keyword, location, batchId) {
  const settings = await getSettings();
  if (!settings.token) return { ok: false, error: "No CRM token configured. Open extension Options." };
  if (!items.length) return { ok: false, error: "Nothing to save." };
  try {
    const out = await request(settings, "/accounts/business-finder/collect", {
      method: "POST",
      body: JSON.stringify({
        items,
        keyword: keyword || "",
        location: location || "",
        batchId: batchId || "",
        source: "google_maps_extension",
      }),
    });
    if (!out.ok) return { ok: false, error: out.data?.message || `HTTP ${out.status}` };
    await chrome.storage.local.set({
      lastSave: { at: Date.now(), saved: out.data?.saved || 0, batchId: out.data?.batchId || batchId || "" },
    });
    return { ok: true, data: out.data };
  } catch (e) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "COLLECTED_RESULTS") {
    (async () => {
      const results = Array.isArray(msg.results) ? msg.results : [];
      const keyword = msg.keyword || "";
      const location = msg.location || "";
      const batchId = msg.batchId || "";
      await chrome.storage.local.set({ pendingResults: results, pendingKeyword: keyword, pendingLocation: location, pendingBatchId: batchId });
      setBadge(results.length ? String(results.length) : "", "#2563eb");

      const settings = await getSettings();
      if (!settings.autoSave) {
        sendResponse({ ok: true, autoSaved: false, collected: results.length });
        return;
      }
      const out = await saveToCrm(results, keyword, location, batchId);
      setBadge(out.ok ? "OK" : "!", out.ok ? "#16a34a" : "#dc2626");
      sendResponse({ ok: out.ok, autoSaved: true, saved: out.data?.saved || 0, batchId: out.data?.batchId || batchId, error: out.error });
    })();
    return true;
  }

  if (msg?.type === "SAVE_TO_CRM") {
    (async () => {
      const { pendingResults, pendingKeyword, pendingLocation, pendingBatchId } = await chrome.storage.local.get([
        "pendingResults", "pendingKeyword", "pendingLocation", "pendingBatchId",
      ]);
      const items = (pendingResults || []).filter((_, i) => (msg.selectedIndices || []).includes(i));
      const out = await saveToCrm(items, pendingKeyword, pendingLocation, pendingBatchId);
      setBadge(out.ok ? "OK" : "!", out.ok ? "#16a34a" : "#dc2626");
      sendResponse({ ok: out.ok, data: out.data, error: out.error });
    })();
    return true;
  }

  if (msg?.type === "TEST_CONNECTION") {
    (async () => {
      const settings = await getSettings();
      if (!settings.token) {
        sendResponse({ ok: false, error: "No CRM token configured." });
        return;
      }
      try {
        const out = await request(settings, "/accounts/business-finder/status", { method: "GET" });
        sendResponse({ ok: out.ok && out.data?.ok !== false, status: out.status, data: out.data });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || "Network error" });
      }
    })();
    return true;
  }

  if (msg?.type === "GET_SETTINGS") {
    (async () => {
      const settings = await getSettings();
      const stored = await chrome.storage.local.get(["pendingResults", "lastSave"]);
      sendResponse({
        ok: true,
        settings,
        pending: (stored.pendingResults || []).length,
        lastSave: stored.lastSave || null,
      });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => setBadge(""));

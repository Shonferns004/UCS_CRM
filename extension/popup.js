const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

document.getElementById("searchBtn").addEventListener("click", async () => {
  const kw = document.getElementById("keyword").value.trim();
  const loc = document.getElementById("location").value.trim();
  if (!kw) { statusEl.textContent = "Enter keyword"; return; }
  const target = Math.max(0, parseInt(document.getElementById("targetCount").value, 10) || 100);
  await chrome.storage.local.set({ targetCount: target });
  const q = encodeURIComponent(`${kw} ${loc}`.trim());
  await chrome.tabs.create({ url: `https://www.google.com/maps/search/${q}` });
  statusEl.textContent = `Opened Google Maps. Auto-collecting up to ${target === 0 ? "all available" : target} results...`;
});

async function renderPending() {
  const { pendingResults } = await chrome.storage.local.get("pendingResults");
  const items = pendingResults || [];
  listEl.innerHTML = "";
  items.forEach((it, i) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<label><input type="checkbox" data-i="${i}" checked /> ${it.name || "(no name)"}<br/>${it.phone || "No phone"}<br/>${it.address || ""}</label>`;
    listEl.appendChild(div);
  });
  statusEl.textContent = `Collected: ${items.length}`;
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const checks = listEl.querySelectorAll("input[type=checkbox]");
  const selected = [];
  checks.forEach((c) => { if (c.checked) selected.push(parseInt(c.dataset.i, 10)); });
  chrome.runtime.sendMessage({ type: "SAVE_TO_CRM", selectedIndices: selected }, (resp) => {
    if (resp?.ok) statusEl.textContent = `Saved: ${resp.data?.saved ?? 0}`;
    else statusEl.textContent = `Save failed: ${resp?.error || resp?.data?.message || "unknown"}`;
  });
});

renderPending();
setInterval(renderPending, 2000);

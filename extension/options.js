document.getElementById("save").addEventListener("click", async () => {
  const apiBase = document.getElementById("apiBase").value.trim();
  const token = document.getElementById("token").value.trim();
  const autoSave = document.getElementById("autoSave").checked;
  const targetCount = Math.max(0, parseInt(document.getElementById("targetCount").value, 10) || 100);
  await chrome.storage.local.set({ apiBase, token, autoSave, targetCount });
  document.getElementById("msg").textContent = "Saved";
});
chrome.storage.local.get(["apiBase", "token", "targetCount"], (d) => {
  if (d.apiBase) document.getElementById("apiBase").value = d.apiBase;
  else if (globalThis.UCS_CONFIG?.apiBase) document.getElementById("apiBase").value = globalThis.UCS_CONFIG.apiBase;
  if (d.token) document.getElementById("token").value = d.token;
  else if (globalThis.UCS_CONFIG?.token) document.getElementById("token").value = globalThis.UCS_CONFIG.token;
  if (d.targetCount !== undefined) document.getElementById("targetCount").value = d.targetCount;
});

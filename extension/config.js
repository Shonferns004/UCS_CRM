// Default configuration shipped with the extension.
//
// When the extension is downloaded from Business Finder, the backend replaces
// this file with your CRM API base URL and token, so no manual setup is needed.
// If you loaded the folder directly from the repository, fill these in from
// extension Options (or download a fresh package from Business Finder).
globalThis.UCS_CONFIG = Object.assign(
  { apiBase: "http://localhost:5000/api", token: "", autoSave: true },
  globalThis.UCS_CONFIG || {},
);

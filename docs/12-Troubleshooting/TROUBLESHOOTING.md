# UCS CRM — Troubleshooting & Common Errors

> **Document ID:** 12-Troubleshooting/TROUBLESHOOTING
> **Status:** Partially verified — derived from code behavior; verify against your environment
> **Generated:** 2026-10-13

## 1. Startup Failures

| Symptom | Likely cause | Check |
| --- | --- | --- |
| App exits at boot | Missing env: `JWT_SECRET`, DB credentials | `.env` complete? see ENV-REFERENCE |
| Bootstraps' `.catch` logged | DB unreachable / schema bootstrap SQL failed | DB up? run `/api/health`; inspect logs |
| Port already in use | `PORT` conflict | change `PORT` or kill the process |
| Socket.IO not connecting on client | `VERCEL` mode (no socket) or wrong `VITE_SOCKET_URL` | confirm `VITE_SOCKET_URL`; non-Vercel needed for realtime |

## 2. Authentication

| Symptom | Likely cause |
| --- | --- |
| 401 on login | wrong identifier/password; account disabled |
| Logged out unexpectedly | token expired (JWT); 401 handler clears session and redirects `/login` |
| Wrong panel after login | role/department routing (`panelPathFor` in `App.jsx`); role wins over department |
| Access Denied on valid account | role not in that route's guard list |

## 3. Data / API

| Symptom | Likely cause |
| --- | --- |
| Receipt not appearing | lead not in expected state; idempotency guard; check queue/`mark-sent` |
| Bank audit rows unmatched | auto-match needs more info; use manual match endpoints |
| Import "preview/confirm" stuck | batch state in `import_batches`; check `data-import` logs |
| Salary export wrong days | attendance corrections not approved; `present-days` uses corrected state |
| FRO idle mismatch | idle reconciliation cron not run; check `/api/cron/fro-idle-reconcile` response |

## 4. Realtime / Chat

| Symptom | Likely cause |
| --- | --- |
| Chat not live | socket not connected (Vercel mode), or socket URL misconfigured |
| Notice popup reappears | server `ticket_popup_seen`/notice-seen set not persisted for that user |

## 5. Edge / Proxy

| Symptom | Likely cause |
| --- | --- |
| Large upload rejected | `client_max_body_size 12m` (nginx/Caddy) vs upload limit |
| Mixed content blocked | page over HTTPS calling HTTP API |

## 6. Diagnostic Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | DB connectivity check |
| `GET /aws`, `GET /api/aws` | version/health |
| `GET /api/debug` | debug info (exists in `index.js`, guards apply) |
| `/api/db/tables`, `/api/db/table/:table` | dev DB browser (admin-key gated) |

> Do not expose diagnostic/dev endpoints in production without an auth gate. See `docs/security/FINDINGS.md`.
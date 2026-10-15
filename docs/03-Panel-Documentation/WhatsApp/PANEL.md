# WhatsApp Panel — Black Book

> **Document ID:** PANEL-WHATSAPP-001
> **Status:** Verified (client entry + all four backend route groups read)
> **Generated:** 2026-10-13
> **Related:** `client/src/panels/whatsapp/WhatsAppPanel.jsx` · `client/src/panels/fro/pages/WhatsAppChat.jsx` · `backend/src/routes/froWhatsAppRoutes.js` · `backend/src/routes/whatsappRoutes.js` · `backend/src/routes/whatsappCrmRoutes.js` · `backend/src/routes/whatsappCrmDataRoutes.js` · `backend/src/routes/whatsappEnhancementsRoutes.js`
> Labels: **Verified** (confirmed in code) · **Partially verified** (some depth unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only).

## 1. Panel Overview

- **Route base:** `/wa/*` (Verified — `client/src/App.jsx:266`).
- **Entry component:** `WhatsAppPanel` (`client/src/panels/whatsapp/WhatsAppPanel.jsx`, 9 lines). It renders a padded wrapper around `WhatsAppChat` imported from `../fro/pages/WhatsAppChat` (Verified).
- **Access control:** `ProtectedRoute role={['*']}` — any authenticated user (Verified — `App.jsx:266-272`).
- **Purpose:** a thin, route-level mount of the FRO WhatsApp inbox so WhatsApp can be opened from outside the FRO panel. It is a **full inbox, not a coming-soon placeholder** (Verified — `WhatsAppChat.jsx` renders `WhatsAppInbox`; see §3).
- **Layout:** the FRO WhatsApp inbox fills the panel (`height: 100%`), padded by the wrapper (Verified — `WhatsAppPanel.jsx`).

## 2. Screens & UI

- Single screen: the FRO WhatsApp inbox. `WhatsAppChat` (`fro/pages/WhatsAppChat.jsx`) provides a `QueryClientProvider` (staleTime 30s, retry 1) and a `WhatsAppChatInner` that resolves an agent then renders `<WhatsAppInbox waUser={{id, role:'agent'}} agentToken activeProject />` (Verified).
- `AutoLoginLoader` shows a skeleton while it fetches sessions and an error card ("WhatsApp Unavailable") when no agent is assigned (Verified — `WhatsAppChat.jsx:50-123`).
- Project selection: `urlProject` from route params, else the `?project=` query param, else empty (Verified — `WhatsAppChat.jsx:125-128`). The panel itself passes no project, so the first available agent is used.

## 3. Features

- **Auto-login handshake:** clears stale `wa_agents` and calls `GET /api/fro/whatsapp/auto-login` with the `ucs_token`; maps returned sessions to `{agentUserId, accountName, project, whatsappUserId, token}` and stores them in `localStorage` under `wa_agents` (Verified — `WhatsAppChat.jsx:54-99`).
- **Agent inbox:** renders `components/enhanced/WhatsAppInbox` with the resolved agent token and project (Verified).
- **FRO-scoped messaging API:** agent conversations, unread counts, my-accounts, direct send, conversation create, message listing/sending (including interactive), read receipts, search, media get/upload, template send, quick replies and templates (Verified — `froWhatsAppRoutes.js`).
- **Accounts receipt sending:** `POST /api/whatsapp/send-receipt/:logId` and `POST /api/whatsapp/send-direct` (accounts/super_admin) plus a public HMAC-token `GET /api/whatsapp/receipt-file/:token` for Meta to fetch template header documents (Verified — `whatsappRoutes.js`).
- **Standalone WhatsApp CRM auth + data:** login/register/me/logout and messages/conversations CRUD (Verified — `whatsappCrmRoutes.js`, `whatsappCrmDataRoutes.js`).
- **Admin enhancements:** AI settings/suggestions/preview, broadcasts, template sync, routing rules and analytics (Verified — `whatsappEnhancementsRoutes.js`).

## 4. Technical Implementation

- **Stack:** React + hooks, React Router, `@tanstack/react-query` for the inbox, FRO enhanced inbox component (Verified — `WhatsAppChat.jsx:1-9`).
- **API base:** uses `API_BASE` from `client/src/lib/apiBase.js` for the auto-login `fetch`, and the FRO inbox uses the shared `api()` helper (Verified — `WhatsAppChat.jsx:5,69`).
- **Backend route files and mounts** (Verified — `backend/src/index.js`):
  - `froWhatsAppRoutes.js` → `/api/fro/whatsapp` (`index.js:276`), multer memory storage, 50 MB limit.
  - `whatsappRoutes.js` → `/api/whatsapp` (`index.js:288`).
  - `whatsappEnhancementsRoutes.js` → `/api/whatsapp` (`index.js:289`).
  - `whatsappCrmRoutes.js` and `whatsappCrmDataRoutes.js` → `/api/whatsapp-crm` (`index.js:299-300`).
- **Controllers:** `froWhatsAppAuthController`, `froWhatsAppController`, `whatsappEnhancementsController`, `whatsappController`, `whatsappCrmAuthController`, `whatsappCrmDataController` (Verified — imports in the route files).
- **WhatsApp Business config:** `backend/src/config/whatsappConfig.js` (present; not opened) (Partially verified).
- **Distinct tokens:** the CRM routes use `whatsappCrmAuthController` with its own login; the FRO routes reuse the UCS `authenticate` middleware (Verified — route imports).

## 5. Business Logic

- **FRO WhatsApp allowlist** (Verified — `froWhatsAppRoutes.js:31-44`): after `authenticate`, a `requireWhatsApp` gate allows `ALLOWED_ROLES = ['fro','worker','agent','admin','super_admin','master']` or any user whose `department` lower-cased equals `fro`. `/auto-login` sits **before** this gate (auth-only).
- **Receipt file authorization** (Verified — `whatsappRoutes.js:9-14`): `GET /receipt-file/:token` is deliberately unauthenticated because Meta fetches the template header document without a session; the HMAC-signed, expiring token in the URL is the authorisation, verified before any storage call, and a rejected token returns 404 so the endpoint cannot probe which keys exist.
- **Enhancements are admin-only** (Verified — `whatsappEnhancementsRoutes.js:27`): every AI, broadcast, template-sync, routing-rule and analytics route is wrapped in `authenticateRole('accounts','super_admin')`.
- **CRM auth shape** (Verified — `whatsappCrmRoutes.js`): `POST /auth/login` and `POST /auth/register` are public; `GET /auth/me` requires `authenticate`; `POST /auth/logout` has no middleware.
- **CRM data is authenticated** (Verified — `whatsappCrmDataRoutes.js`): all messages/conversations routes require `authenticate`.

## 6. API Endpoints

All **Verified** against the route files. Paths shown relative to mount.

### `/api/fro/whatsapp` — `froWhatsAppRoutes.js` (mounted `index.js:276`)

| Method | Path | Guard |
|---|---|---|
| GET | `/auto-login` | `authenticate` only |
| GET | `/agent-conversations` | authenticate + `requireWhatsApp` |
| GET | `/agent-conversations/unread-count` | authenticate + `requireWhatsApp` |
| GET | `/my-accounts` | authenticate + `requireWhatsApp` |
| POST | `/send-direct` | authenticate + `requireWhatsApp` |
| POST | `/create-conversation` | authenticate + `requireWhatsApp` |
| GET | `/conversations/:id/messages` | authenticate + `requireWhatsApp` |
| POST | `/conversations/:id/send` | authenticate + `requireWhatsApp` |
| POST | `/conversations/:id/send-interactive` | authenticate + `requireWhatsApp` |
| PUT | `/conversations/:id/read` | authenticate + `requireWhatsApp` |
| GET | `/search` | authenticate + `requireWhatsApp` |
| GET | `/media/:mediaId` | authenticate + `requireWhatsApp` |
| POST | `/upload-media` | authenticate + `requireWhatsApp` (multer, 50 MB) |
| POST | `/send-template` | authenticate + `requireWhatsApp` |
| GET | `/quick-replies` | authenticate + `requireWhatsApp` |
| GET | `/templates` | authenticate + `requireWhatsApp` |
| GET | `/conversations` | authenticate + `requireWhatsApp` |
| GET | `/conversations/unread-count` | authenticate + `requireWhatsApp` |
| PUT | `/conversations/:id/labels` | authenticate + `requireWhatsApp` |

### `/api/whatsapp` — `whatsappRoutes.js` (mounted `index.js:288`)

| Method | Path | Guard |
|---|---|---|
| POST | `/send-receipt/:logId` | `authenticateRole('accounts','super_admin')` |
| POST | `/send-direct` | `authenticateRole('accounts','super_admin')` |
| GET | `/receipt-file/:token` | public (HMAC-token authorisation) |

### `/api/whatsapp` — `whatsappEnhancementsRoutes.js` (mounted `index.js:289`)

All routes guarded by `authenticateRole('accounts','super_admin')`.

| Method | Path |
|---|---|
| GET / PUT | `/ai/settings/:project` |
| GET | `/ai/suggestions` |
| POST | `/ai/suggestions/:id/decide` |
| POST | `/ai/preview/:conversationId` |
| POST | `/broadcasts` · GET `/broadcasts` · GET `/broadcasts/:id` |
| POST | `/broadcasts/:id/start` · `/pause` · `/cancel` |
| POST | `/templates/sync` |
| GET / POST | `/routing-rules` · PUT/DELETE `/routing-rules/:id` |
| GET | `/analytics/overview` · `/analytics/daily` · `/analytics/agents` · `/analytics/broadcasts` |

### `/api/whatsapp-crm` — auth & data

| Method | Path | Guard | File |
|---|---|---|---|
| POST | `/auth/login` | public | `whatsappCrmRoutes.js` |
| POST | `/auth/register` | public | `whatsappCrmRoutes.js` |
| GET | `/auth/me` | `authenticate` | `whatsappCrmRoutes.js` |
| POST | `/auth/logout` | none | `whatsappCrmRoutes.js` |
| GET/POST | `/messages` · PUT `/messages/:id` · GET `/messages/counts` | `authenticate` | `whatsappCrmDataRoutes.js` |
| GET/POST | `/conversations` · GET `/conversations/counts` · `/by-contact` · `/:id` · PUT `/:id` | `authenticate` | `whatsappCrmDataRoutes.js` |

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing (`/wa/*`, `['*']` guard) | **Verified** |
| Entry renders full FRO inbox (not a placeholder) | **Verified** |
| Auto-login + `wa_agents` handling | **Verified** |
| FRO WhatsApp routes + allowlist | **Verified** (file read in full) |
| Accounts receipt routes + public token route | **Verified** (file read in full) |
| CRM auth + data routes | **Verified** (files read in full) |
| Admin enhancements routes | **Verified** (file read in full) |
| `WhatsAppInbox` internals / `whatsappService` | **Partially verified** (entry + API layer confirmed; inbox and service bodies not read) |
| Screenshots | **screenshots pending** |

> Note: the separate FRO panel route `whatsapp-chat` still renders a coming-soon placeholder, but this `/wa/*` panel mounts the real inbox (`fro/pages/WhatsAppChat.jsx`) — the two are different surfaces.

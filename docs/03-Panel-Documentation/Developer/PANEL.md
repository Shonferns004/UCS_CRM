# Developer Panel — Black Book

> **Document ID:** PANEL-DEVELOPER-001
> **Status:** Verified (client + backend source read; controllers/models read)
> **Generated:** 2026-10-13
> **Related:** `client/src/panels/dev-panel/DevPanel.jsx` · `client/src/panels/dev-panel/api/tickets.js` · `backend/src/routes/developerTicketRoutes.js` · `backend/src/controllers/developerTicketController.js` · `backend/src/models/developerTicketModel.js` · `backend/src/routes/dailyReportRoutes.js`
> Labels: **Verified** (confirmed in code) · **Partially verified** (some depth unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only).

## 1. Panel Overview

- **Route base:** `/dev-panel/*` (Verified — `client/src/App.jsx:254`).
- **Entry component:** `DevPanel` (`client/src/panels/dev-panel/DevPanel.jsx`), registered as panel key `developers` with class `panel-dev` (`App.jsx:58`). Lazy-loaded (`App.jsx:24`).
- **Access control:** `ProtectedRoute role={['developers','developer','digital','Developer','Developers','Digital','super_admin']}` (Verified — `App.jsx:255`). `ProtectedRoute` also matches `user.department` against the list and lets `super_admin` through (`App.jsx:68-69`). Landing path is resolved by `panelPathFor()`: department containing `develop` → `/dev-panel`; `digital` → `/social` (`App.jsx:145-147`) — so digital staff normally open the Social panel but are still admitted to `/dev-panel`.
- **Purpose:** the internal CRM issue tracker for the developer/digital teams — a unified ticket queue over both support tickets and developer tickets, a metrics dashboard, a daily report and UCS chat.
- **Layout:** collapsible left sidebar (220px / 56px) + top header + routed content, wrapped in a local `ToastProvider`; chat nav shows `ChatNavBadge` (`DevPanel.jsx`).

## 2. Screens & UI

Sidebar navigation (Verified — `DevPanel.jsx:17-24`):

| Nav item | Route |
|---|---|
| Dashboard | `/dev-panel` |
| All Tickets | `/dev-panel/tickets` |
| My Tickets | `/dev-panel/my-tickets` |
| Unassigned | `/dev-panel/unassigned` |
| Daily Report | `/dev-panel/daily-report` |
| UCS Chat | `/dev-panel/chat` |

Routes present but not in the sidebar (Verified — `DevPanel.jsx:91-101`): `tickets/:id` (`TicketDetail`), `tickets/new` (`TechnicalTickets` with `panel="dev_panel"`, lazy), and a `*` wildcard that redirects to `/dev-panel`.

Screen behaviours (Verified from page sources):

- **Dashboard** (`pages/Dashboard.jsx`): fetches `getUnifiedDevTickets()` and derives KPI cards (total/open/resolved/avg-resolution), a status donut, a 7-day trend and static activity/action panels client-side. Falls back to a local `MOCK_STATS` constant when the fetch is empty or fails.
- **TicketList** (`pages/TicketList.jsx`, used for `tickets` and `unassigned`): filter tabs (status/priority/category/panel/assignee/date/search), pagination (`PAGE_SIZE = 20`), row selection and a bulk action bar. Note the list filters displayed rows to `category === 'other'` (`TicketList.jsx:81`).
- **MyTickets** (`pages/MyTickets.jsx`): the caller's unified tickets with inline detail, resolve and close dialogs; routes each action to the correct backend by `_source` via `resolveTicketBySource` / `replyToTicketBySource`.
- **TicketDetail** (`pages/TicketDetail.jsx`): single-ticket view with back navigation to `/dev-panel/tickets`.
- **Daily Report** (`pages/DevDailyReport.jsx`): the shared `DailyReport` engine with `panel="dev"` and `developerSections`; ticket counts are derived live from `getMyUnifiedTickets()` while only prose fields are persisted.
- **Chat** (`ChatWorkspace`) mounted at the `chat` route (Verified — route present).

## 3. Features

- Unified ticket feed merging `GET /api/tickets` and `GET /api/developer-tickets`, each row tagged `_source: 'regular' | 'developer'` and sorted by `created_at` (Verified — `api/tickets.js:9-32`).
- Source-aware operations: get/update/reply/resolve dispatch to the regular or developer endpoint based on `_source` (Verified — `api/tickets.js:92-102`).
- Dashboard KPIs, status donut, 7-day trend and SLA/action panels; `MOCK_STATS` fallback (Verified — `Dashboard.jsx`).
- Ticket list with multi-field filters, pagination, row selection and bulk status/assignee/priority updates (Verified — `TicketList.jsx`).
- Approve / reject / resolve developer-ticket actions with a mandatory reject reason (Verified — `developerTicketController.js:204-242`).
- Internal replies allowed only to `digital`/`developers` department or `super_admin`; other replies are private to the ticket raiser (Verified — `developerTicketController.js:74-78,146-161`; `developerTicketModel.js:68-80`).
- Resolution posts a reply to the raiser and writes a `notification_log` row of type `ticket_resolved` (Verified — `developerTicketController.js:244-309`).
- Daily report via the shared `DailyReport` engine and `developerSections` (Verified — `DevDailyReport.jsx:39-69`).
- UCS chat with unread badge (Verified — `ChatWorkspace` + `ChatNavBadge`).

## 4. Technical Implementation

- **Stack:** React function components + hooks, React Router, `lazy`/`Suspense` for `TechnicalTickets`, inline styles + CSS variables, a local UI kit (`components/` — Button, Card, Badge, ConfirmDialog, Input, Select, ThemeProvider, Toast) and `theme/tokens.js` (Verified).
- **API helper:** `api/tickets.js` wraps `api()` from `client/src/api/auth.js` with `_prefix: 'ucs'`; the Bearer token is read from `ucs_token` and requests are prefixed with `API_BASE` (Verified — `auth.js:33-56`, `lib/apiBase.js`). Default 120s timeout; 401 clears the session.
- **Backend route:** `backend/src/routes/developerTicketRoutes.js` — the whole router is behind `authenticate` only (`router.use(authenticate)`), with no per-route role gate (Verified). Mounted at `/api/developer-tickets` (`backend/src/index.js:296`).
- **Controller/model:** `developerTicketController.js` (13 exported handlers mirrored by 13 routes) backed by `developerTicketModel.js` over Postgres via Supabase (tables `developer_tickets`, `developer_ticket_replies`) (Verified).
- **Team lookup:** `getDeveloperTeamMembers()` selects active `workers` with `department in (digital, developers)` (Verified — `developerTicketModel.js:158-167`).
- **Daily reports:** shared `/api/daily-reports` mount (`index.js:251`), route file `dailyReportRoutes.js`, controller `dailyReportController.js`, model `dailyReportModel.js`, util `utils/dailyReportPanels.js`. Reporters role gate: `super_admin, admin, hr, recruiter, digital, developers, social` (Verified — `dailyReportRoutes.js:18`).
- **Related mounts used by this panel:** `/api/tickets` (`index.js:295`), `/api/task-assignments` (`index.js:252`).

## 5. Business Logic

- **Reply visibility** (Verified — `developerTicketController.getTicket`, 74-78): internal (`is_internal = true`) replies are only fetched for `digital`/`developers` department or `super_admin`; and regardless of internal flag, replies are returned only to `req.user.id === ticket.raised_by`, so feedback is private to the raiser.
- **Create validation** (Verified — `createTicket`, 84-108): `subject` and `desk_number` are required; defaults are `category='bug'`, `priority='medium'`, `status='open'`, `raised_by_panel='fro'`.
- **Resolve side effects** (Verified — `resolveTicket`, 244-309): sets `status='resolved'` (+ optional `resolution`), posts a non-internal resolution reply, and inserts a `notification_log` entry for `ticket.raised_by`. Notification failure is caught and never fails the resolve.
- **First response tracking** (Verified — `updateTicket`/`addReply`): `first_response_at` is stamped the first time status leaves `open`, or when a digital/super_admin user replies; `resolved_at` is stamped on `resolved`/`closed`.
- **Daily-report bucketing** (Verified — `dailyReportController.js:24-34`): all departments share one table keyed by `panel` (`dev|hr|recruiter|social`); rows from `digital` identities are re-bucketed under `social` for the HOD/super-admin read. `dev` is this panel's bucket.

## 6. API Endpoints

All **Verified** against `backend/src/routes/developerTicketRoutes.js`; every route requires `authenticate` only. Mount: `/api/developer-tickets` (`index.js:296`).

| Method | Path (rel. to mount) | Handler |
|---|---|---|
| GET | `/stats` | `getStats` |
| GET | `/my` | `listMyTickets` |
| GET | `/unassigned` | `listUnassigned` |
| GET | `/assignees` | `getAssignees` |
| POST | `/` | `createTicket` |
| GET | `/` | `listTickets` |
| GET | `/:id` | `getTicket` |
| PUT | `/:id` | `updateTicket` |
| POST | `/:id/reply` | `addReply` |
| PUT | `/bulk` | `bulkUpdate` |
| PUT | `/:id/approve` | `approveTicket` |
| PUT | `/:id/reject` | `rejectTicket` |
| PUT | `/:id/resolve` | `resolveTicket` |

Supporting endpoints also used by this panel (Verified — mounts in `index.js`):

| Method | Path | Guard | Notes |
|---|---|---|---|
| GET | `/api/tickets`, `/api/tickets/my`, `/api/tickets/:id` | `authenticate` (per `ticketRoutes`) | regular support tickets, merged client-side (Partially verified) |
| POST | `/api/daily-reports` | `authenticateRole` (reporters: super_admin, admin, hr, recruiter, digital, developers, social) | `saveReport` |
| GET | `/api/daily-reports/mine` | reporters | `getMyReport` |
| GET | `/api/daily-reports` | reporters | `getReports` |
| GET/PUT | `/api/daily-reports/all`, `/summary`, `/roster`, `/:id/remark` | super_admin / admin | HOD oversight |

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing (`/dev-panel/*`, guards, panel key) | **Verified** |
| Sidebar NAV + extra routes | **Verified** |
| Dashboard / TicketList / MyTickets / TicketDetail | **Verified** (pages read) |
| Daily report wiring (`panel="dev"`, live summary) | **Verified** |
| Backend ticket endpoints (13) + controller/model | **Verified** (files read in full) |
| Reply privacy + resolve notification | **Verified** |
| Regular `/api/tickets` route internals | **Partially verified** (mount + client usage confirmed; `ticketRoutes.js` not read in full) |
| Screenshots | **screenshots pending** |

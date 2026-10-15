# Panel: FRO

> Generated: 2026-10-13 · Status labels: **Verified** (confirmed in code/config) · **Partially verified** (checked, some depth still unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only). Only what is confirmed in the source is stated as fact; anything else is tagged.

## 1. Panel Overview

- **Route base:** `/fro/*` (Verified — `client/src/App.jsx` `ROLE_PATHS.fro = '/fro'`; the `worker` role is an alias to the same base, and `panelPathFor()` resolves it).
- **Entry component:** `FROPanel` (`client/src/panels/fro/FROPanel.jsx`).
- **Access control:** guarded for the `fro` role (with `worker` alias) both via `panelPathFor()` in `client/src/App.jsx` and via the panel's own `api/auth.js` login helper. Backend mirrors it: every FRO route requires `authenticate`, self-service routes additionally require `requireFro` (`role === 'fro'` OR `department === 'fro'`), while a small set of live-status self-endpoints is intentionally reachable by any authenticated worker, and roster routes require `super_admin`/`admin` (Verified — `backend/src/routes/froRoutes.js`).
- **Purpose:** the field fundraising (FRO) operations panel — daily donor lead queue, dispositions, suspense-receipt claiming, personal collection targets, idle/live-status tracking, performance, incentives, tickets, UCS chat and a WhatsApp tie-in.
- **Layout:** left sidebar nav (grouped 7 entries) + top header + routed content area. The WhatsApp nav list is extended at runtime from `localStorage` (`wa_agents`), and a floating idle ticker widget is portalled to `document.body` (Verified — `FROPanel.jsx`).

## 2. Screens & UI

Navigation entries (Verified — `FROPanel.jsx` lines 133–139):

| Nav item | Route |
|---|---|
| Dashboard | `/fro/dashboard` |
| My Leads | `/fro/my-leads` |
| Donors | `/fro/donors` |
| My Idle | `/fro/my-idle` |
| Lead Incentive | `/fro/lead-incentive` |
| Tickets | `/fro/tickets` |
| Chat | `/fro/chat` |

Additional routes present but not in the sidebar (Verified — `FROPanel.jsx` lines ~1396–1410): `suspense`, `history`, `incentive-info`, `whatsapp-chat`, `whatsapp-chat/:project` (the two WhatsApp routes render `<WhatsAppComingSoon />`).

Key screen behaviours (all **Verified** from page sources unless noted):

- **My Leads** (`pages/MyLeadsSuspense.jsx`): edge-to-edge shell. Top “performance strip” (`PersonalPerformance`) shows Rank, Worked vs 8 h, Calls vs fixed target of 17, Idle today, Performance %, plus a live `CallTimer` pill. Below, a 60/40 split of **My Leads** (`MyDonors`) and **Suspense** (`FroSuspense`); the split stacks above 900 px via a CSS `@container` query, not the viewport hook.
- **Donors** (`pages/MyDonors.jsx`): the donor lead queue with connection-status grouping (Connected / Not Connected / remaining), per-status filtering, realtime refresh on the `fro_assignments` table, and support for a backend-authoritative “controlled queue” (`queue_current`).
- **Suspense** (`pages/Suspense.jsx`): suspense-receipt queue live-fed by `bank_audit_entries` + `receipts` realtime channels; claim and disposition actions.
- **Dashboard** (`pages/Dashboard.jsx`): monthly overview — target vs collected, calls, disposals, performance cards (Partially verified — header/month selector and summary cards read; lower sections unread).
- **My Idle** (`pages/MyIdle.jsx`): today’s idle seconds and live idle status fed from `/fro/status/me` with refresh (Partially verified — page structure read).
- **History** (`pages/History.jsx`): per-donor log / full history listing (Partially verified — top of page read).
- **Incentive Info** (`pages/IncentiveInfo.jsx`): static in-app copy describing incentive rules (AKI / Sunday Bonus / 10% rules) — Verified as UI text only, not an implementation of payroll logic.
- **Lead Incentive** (`pages/LeadIncentive.jsx`): leaderboard screen live-subscribed to `lead_champion_announcements`, `incentive_slabs` and `fro_donor_logs` (Partially verified).
- **Tickets** (`pages/Tickets.jsx`): raise/list support tickets; realtime on `ticket_replies` and `support_tickets` (Partially verified).
- **Chat**: `ChatWorkspace` (UCS chat) wired as the `chat` route (Verified — route present; full chat read not done).
- **WhatsApp (Planned in panel):** both `whatsapp-chat` routes render `<WhatsAppComingSoon />` (Verified — `FROPanel.jsx` 1408–1409). A full inbox component exists (`components/enhanced/WhatsAppInbox.jsx`, wrapped by `pages/WhatsAppChat.jsx` with `onDbChange` usage) and the entire backend + client API layer is wired, but the FRO panel does not mount it yet.
- **Dynamic WhatsApp nav** (Verified — `FROPanel.jsx` 507–519, 554–559): reads `wa_agents` from `localStorage`; a single agent yields one `Inbox <SHORT>` entry (link goes to `whatsapp-chat?project=…`), multiple agents yield per-project entries `whatsapp-<project>`, none yields the plain `whatsapp-chat`. Unread badges read `waUnreadCounts[whatsapp-<project>]` and `waUnreadCounts.total`.
- **Floating idle widget** (Verified — `FROPanel.jsx` ~280–312): portalled to `document.body`, positioned right 20 px / top 58%; counts down the 4-minute disposition window (`DISPOSITION_WINDOW = 240`) and the settle grace (`SETTLE_SECONDS = 180`); pulse animation `froIdlePulse`.
- **Reminder audio** (Verified — `FROPanel.jsx`): `tele.wav` (suspense alert), `follow_due.mp3`, `call_less.mp3`, `reel.mp3` (entertainment), `congrats.mp3`; custom entertainment audio cached per worker; reload coalesced to 5 000 ms (`REMINDER_RELOAD_COALESCE_MS`).

## 3. Features

- Donor lead queue with connection grouping, status filters and a backend-chosen “next donor” mode (Verified).
- One-tap disposition logging — `call / visit / message / follow_up / donation / note / disposition` — via `DispositionModal` + `CallContext`, recorded to `fro_donor_logs` (Verified — `froController.createDonorLogHandler`, client `CallContext`).
- Suspense receipts: dashboard list, donor search, claim and resolve flows over bank suspense entries (Verified — routes + `froReport`/`bankAudit` controllers).
- Live-status “time machine”: client events (page hidden/visible, meeting start/end, pause, network lost, sleep) are POSTed as state transitions; idle, worked time and performance are derived server-side (Verified — `/fro/status/time-event`, `applyFroTimeEvent`; ledger internals Partially verified).
- A recorded disposition is the only way out of idle; idle-resume was deliberately removed (Verified — `froRoutes.js` design comment, no idle-resume route).
- Idle auto-logout for unresponsive sessions (`froAutoLogoutScheduler` service) (Verified — file + scheduler wiring).
- Monthly collection target resolution: auto salary-scaled target for months 1–3, manual override from HR/Accounts, or carry-forward — single source `froMonthlyTarget.resolveMonthlyTarget` (Verified).
- Performance strip: rank, worked vs 8 h, calls vs 17, idle, performance % (Verified — `MyLeadsSuspense`).
- Team Collection Race board, lead-incentive leaderboard and FRO team-race popup (Partially verified — route/controller confirmed, popup internals not fully read).
- Allotment summary, station scope, scheduled contacts / callbacks / promises / overdue lists, follow-ups, lead stats, monthly donors, full donor history, transferred/re-activated/disposed lead views (Verified — routes + controllers).
- Payment screenshot upload attached to a donation; OCR text extraction is a stub returning nulls (Planned — `utils/ocr.js`).
- Weekly data banking: manual `request-data` plus automatic database requests list (Verified — routes).
- WhatsApp: FRO-scoped agent conversations, unread counts, messaging, templates, quick replies, media, labels, search and auto-login (Backend Verified; in-panel inbox **Planned**).

## 4. Technical Implementation

- **Stack:** React function components + hooks, React Router, `lazy()`/`Suspense` per page, inline styles + CSS variables, CSS container queries for the My-Leads layout, portals for the idle widget, `Intl`-based IST helpers (`fro/utils/time.js`: `istDateString`, `istDateTimeToIso`, `formatIstTime`, `FRO_TIME_ZONE='Asia/Kolkata'`) (Verified).
- **Realtime:** `useRealtime` subscriptions to `messages`, `fro_donor_logs`, `fro_assignments`, `bank_audit_entries`, `receipts`, `ticket_replies`, `support_tickets`, `lead_champion_announcements`, `incentive_slabs`; `CallContext` uses `onDbChange`/`onSocketConnect`/`onFroPause`/`onFroResume` from `lib/socket` (Verified).
- **API helper:** `fro/api/auth.js` — `api(path, opts)` maps `/fro/…` to the `/api/fro/…` mount, attaches Bearer from `ucs_*` storage, JSON content-type (skipped for FormData), default 120 s timeout, clears session on 401 (Verified).
- **Client modules:** `pages/` (Dashboard, MyDonors, Suspense, MyIdle, History, IncentiveInfo, LeadIncentive, Tickets, WhatsAppChat wrapper), `components/` (DispositionModal, CallTimer, IdleNoticeHost, enhanced/WhatsAppInbox…), `api/` (auth, donors, target, whatsappApi…), `store.jsx`, `dispositions.js`, `utils/ocr.js`, `utils/time.js` (Verified).
- **Backend mountpoints** (Verified — `backend/src/index.js` lines 275–277): `POST /api/whatsapp/fro-login` (line 275), `/api/fro/whatsapp` (276), `/api/fro` (277).
- **Controllers:** `froController.js` (7,180 lines, 46 exported handlers) + `froReportController.js` + `froWhatsAppController.js` (16 handlers incl. `listConversations`, `listAgentConversations`, `agentUnreadCount`, `listMessages`, `sendMessage`, `sendDirect`, `createConversation`, `markRead`, `unreadCount`, `listQuickReplies`, `listTemplates`, `sendTemplate`, `searchMessages`, `updateLabels`, `uploadMedia`, `listMyAccounts`, `getMedia`) + `froWhatsAppAuthController.whatsappAutoLogin` + `whatsappEnhancementsController.sendInteractive` (Verified).
- **Services:** `froAutoLogoutScheduler`, `froAutoTarget`, `froCollectionMatch`, `froCounterDay`, `froCoverFreeze`, `froIdleCommit`, `froIdleReconcileScheduler`, `froLiveWindow`, `froMonthlyRollover`, `froMonthlyTarget`, `froRankService`, `froTimeReconcile`, `froTimeReport`, `froTimeSessions`, `froTimeStatus`, `froWhatsAppService` (Verified — present in `backend/src/services/`).
- **Caching:** in-memory `cacheGet` keys `fro:dash:<workerId>:<month>`, `fro:target:<workerId>:<month>` with dedicated TTLs; collection receipts cached by IST day-window key (`froReceiptsCacheKey`) so dashboard, target and collections share one scan; `getMyDonors` is two-level (L1 cache + L2 Upstash redis get) with fail-open on redis error and shape-check (Verified — `froController.js`).
- **Idle time machine data split:** `fro_idle_live` (open ledger, live status) vs `fro_time_sessions` (committed sessions backing idle reports) via `froTimeSessions`/`froTimeReport`; day counters via `froCounterDay`, freeze windows via `froCoverFreeze` (Partially verified — names/roles confirmed; inner arithmetic not fully read).
- **Tests:** `froControllerScope`, `froIdleSurfaceParity`, `froAgentAttribution`, `froCoverIdleParity`, `froIdleStripRead`, `froLateLoginClamp`, `froSessionEndIdle`, `froMonthlyTarget`, `froLiveWindow`, `froCollectionMatch`, `froTimeReconcile`, `froTimeReport`, `froTimeStatus` (Verified — files present).

## 5. Business Logic

- **Access model** (Verified — `froRoutes.js`): `router.use(authenticate)` on the whole router; `/status`, `/status/present`, `/status/logout-all` require `super_admin`/`admin`; `/status/me`, `/status/time-event`, `/status/resume-self` intentionally sit before `requireFro` so any authenticated worker (e.g. telecaller) can be tracked; everything else uses `requireFro` (`role==='fro'` or `department==='fro'`).
- **Idle semantics** (Verified — routes + controllers): no idle-resume route exists by design; recording a disposition is the only way out of idle, and that commit back-dates the open idle period to its expiry so the overrun is still charged. `resume-self` merely re-arms a lapsed disposition deadline (`nextDeadline`) and only ever touches the caller’s own row.
- **Disposition window** (Verified — client `CallContext` imports): `DISPOSITION_WINDOW = 240` s; settle grace `SETTLE_SECONDS = 180` with `settleWindowArm`/`settleSecondsLeft`.
- **Impersonation credit** (Verified — `froController`): when operating under an impersonation code, `creditWorkerId = req.user.imposter_id` is used for collection/receipt credit, targets and donor-log ownership (`fro_worker_id` = covered FRO, `operator_id` = operator).
- **Collection accounting** (Verified): receipts are summed over the IST month-bound day window (`startDay`/`endDay`, not raw instants) so dashboard, collections and target views share the same receipts entry; donor stats exclude `reassigned` assignments.
- **Target precedence** (Verified — `froMonthlyTarget.js`): (1) a `fro_monthly_targets` row for the exact month wins (**manual**); (2) otherwise auto target for months 1–3 from `froAutoTarget.calculateAutoTarget(salary, monthsSinceJoining)` (**auto**); (3) month 4+ with no auto and no current row carries the latest earlier row (**carried_forward**); (4) else `not_set` (0). A stale earlier-month row never overrides the auto value.
- **Controlled queue** (Verified — `froRoutes.js`): `GET /queue/current` reuses the `getMyDonors` pipeline (same scope/order/filter/dedup) but forces `queue_current='true'`, drops `limit`/`offset`, and returns only the next donor + durable progress so the front-end never picks or skips a donor itself.
- **Mark-seen** (Verified): `PUT /donors/:id/mark-seen` sets `fro_assignments.is_new = false` for the caller (non-`reassigned` rows), optionally narrowed by `ngo_id`.
- **Suspense flow** (Partially verified): `listFroSuspense` (bankAuditController) + `searchFroDispositions` + `searchSuspenseDonors` + `PUT /suspense/:id/resolve` + `POST /dashboard/suspense/:receiptId/claim` operate over bank suspense entries; claim-internal logic only partially read.
- **Live status + progress** (Verified — routes): `GET/PUT /status` manage the FRO’s live status string; `froTimeStatus`/`froLiveWindow` services compute the display surface; `GET/PUT /progress` persists per-worker self-reported progress.

## 6. API Endpoints

All **Verified** against `backend/src/routes/froRoutes.js`, `froWhatsAppRoutes.js` and `backend/src/index.js`. Paths shown relative to their mount.

### `/api/fro` — admin roster & self live-status (before `requireFro`)

| Method | Path | Guard | Handler |
|---|---|---|---|
| GET | `/status` | super_admin / admin | `getLiveStatuses` |
| GET | `/status/present` | super_admin / admin | `getPresentToday` |
| POST | `/status/logout-all` | admin / super_admin | `logoutAllFros` |
| GET | `/status/me` | any authenticated | `getMyLiveStatus` |
| POST | `/status/time-event` | any authenticated | `applyFroTimeEvent` |
| POST | `/status/resume-self` | any authenticated | `resumeOwnPause` |
| GET | `/reports/idle/me`, `/reports/idle/me/sessions` | any authenticated | `getMyIdleReport` / `getMyIdleSessions` |
| GET | `/reports/idle`, `/reports/idle/sessions` | super_admin / admin | `getIdleReport` / `getIdleSessions` |

### `/api/fro` — self-service (after `requireFro`)

| Method | Path | Handler |
|---|---|---|
| GET | `/my-stations` | `getMyStations` |
| GET | `/dashboard` | `getDashboard` |
| GET | `/dashboard/collections` | `getMyCollections` |
| GET | `/dashboard/team-collection` | `getMyTeamsCollection` |
| GET | `/dashboard/suspense` | `getSuspenseReceipts` |
| POST | `/dashboard/suspense/:receiptId/claim` | `claimSuspenseReceipt` |
| GET | `/allotment-summary` | `getMyAllotmentSummary` |
| GET | `/my-performance` | `getMyPerformance` |
| GET | `/reactivated-donors` | `getReactivatedDonors` |
| GET | `/donors` | `getMyDonors` |
| GET | `/queue/current` | getMyDonors (`queue_current`) |
| GET | `/transferred-leads` | `getTransferredLeads` |
| GET | `/scheduled` / `/callbacks` / `/promises` / `/overdue` | `getFroScheduled` / `getFroCallbacks` / `getFroPromises` / `getFroOverdue` |
| GET | `/follow-ups` | `getFollowUps` |
| GET | `/lead-stats` | `getLeadStats` |
| GET | `/monthly-donors` | `getMonthlyDonors` |
| GET | `/history` | `getMyHistory` |
| GET | `/target` | `getMyTarget` |
| GET | `/progress` · PUT `/progress` | `getMyProgress` / `saveMyProgress` |
| GET | `/my-disposed-leads` | `getMyDisposedLeads` |
| GET | `/search-donors` | `searchDonors` |
| GET | `/donors/:id/logs` · POST `/donors/:id/logs` | `getDonorLogs` / `createDonorLogHandler` |
| PUT | `/donors/:id/status` · `/donors/:id/donor-type` · `/donors/:id/mark-seen` | `updateDonorStatus` / `updateDonorType` / inline |
| POST | `/donors/:id/schedule` | `scheduleContact` |
| GET | `/donors/:id/history` · `/full-history` · `/donations` · `/receipts` | `getDonorHistory` / `getFullDonorHistory` / `getDonorDonations` / `getDonorReceipts` |
| POST | `/upload-payment-screenshot` | `uploadPaymentScreenshot` |
| POST | `/request-data` · GET `/database-requests` | `requestData` / `getMyDataRequests` |
| PUT | `/status` | `updateLiveStatus` |
| GET | `/suspense` · `/suspense/search-dispositions` · `/suspense/donor-search` | `listFroSuspense` / `searchFroDispositions` / `searchSuspenseDonors` |
| PUT | `/suspense/:id/resolve` | `resolveSuspenseEntry` |

### `/api/fro/whatsapp` — role allowlist + department `fro` (Verified)

`/auto-login` (auth-only) · `/agent-conversations` · `/agent-conversations/unread-count` · `/my-accounts` · POST `/send-direct` · POST `/create-conversation` · GET `/conversations` · GET `/conversations/unread-count` · GET `/conversations/:id/messages` · POST `/conversations/:id/send` · POST `/conversations/:id/send-interactive` · PUT `/conversations/:id/read` · PUT `/conversations/:id/labels` · GET `/search?q=` · GET `/media/:mediaId` · POST `/upload-media` (50 MB multer memory) · POST `/send-template` · GET `/quick-replies` · GET `/templates`. Plus `POST /api/whatsapp/fro-login` (index.js:275) for the WhatsApp auto-login handshake.

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing | **Verified** |
| Auth model (role gate, token, requireFro split) | **Verified** |
| NAV + dynamic WhatsApp nav + idle widget | **Verified** (config read fully) |
| My Leads / Donors / Suspense / Dashboard / My Idle / Tickets screens | **Partially verified** (core shown; long pages read in chunks) |
| Backend endpoints | **Verified** for all cited routes (route files read fully) |
| Idle/time-machine internals (ledger semantics) | **Partially verified** (routes/controllers/services confirmed; some arithmetic unread) |
| In-panel WhatsApp inbox | **Planned** — backend + client API ready; panel mounts a Coming-Soon placeholder |
| OCR of payment screenshots | **Planned** — `utils/ocr.js` returns nulls |
| Screenshots | **screenshots pending** — not yet captured; add under Testing when available |

Note: the FRO panel is also embedded inside the Super Admin panel (iframe, routes dashboard · my-leads · donors · my-idle · lead-incentive · tickets per `embedPanels.js`), which shares this same single-page router.
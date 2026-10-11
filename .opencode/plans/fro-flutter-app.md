# Plan: Flutter FRO App (apps/fro-app)

## Goal
Build an Android Flutter app that replicates the **core FRO workflow** of the React web panel (`client/src/panels/fro/`), talking to the **same existing backend API** (`/api/fro/*`, `/api/auth/*` on `api.beingsevak.org`). Calls are **timer-only** (same as web — no dialer integration).

**Scope (v1):** Login · Dashboard · My Leads (performance strip + controlled call queue) · Suspense claim · Donors list/detail · Disposition modal + 4-min timer engine · My Idle · Lead Incentive · Raise Ticket.
**Out of scope (v1):** WhatsApp chat, Community chat, charts-heavy extras, "work as" impersonation, payment-screenshot OCR, Excel/PDF export.

## Key source references (React panel)
| Concern | File |
|---|---|
| Shell, nav, timer widget, pause/meeting gates | `client/src/panels/fro/FROPanel.jsx` |
| Call/disposition engine (server-authoritative) | `client/src/panels/fro/CallContext.jsx` |
| Disposition enums (connected / not-connected / grouped) | `client/src/panels/fro/dispositions.js` |
| Queue + donor card + call flow | `client/src/panels/fro/pages/MyDonors.jsx` |
| Disposition modal (save payload shape) | `client/src/panels/fro/components/DispositionModal.jsx` |
| Perf strip | `client/src/panels/fro/pages/MyLeadsSuspense.jsx` |
| Dashboard | `client/src/panels/fro/pages/Dashboard.jsx` |
| Suspense claim flow | `client/src/panels/fro/pages/Suspense.jsx` |
| API functions (endpoint paths + query params) | `client/src/panels/fro/api/donors.js`, `api/auth.js`, `api/target.js` |
| Auth/session/401 handling | `client/src/api/auth.js`, `client/src/store.jsx` |
| Socket events (`fro:pause/resume/force-logout/broadcast`) | `client/src/lib/socket.js` |
| Meeting mode | `client/src/meetingStore.js` |
| Flutter conventions to mirror | `apps/attendance/` (config.dart, ApiService with DoH fallback, socket_io_client, shared_preferences) |

## Architecture

**Project:** `apps/fro-app` · Flutter name `fro_app` · applicationId `com.ucs.fro` · Android only · minSdk matched to attendance app.
**Style:** Match `apps/attendance` — `provider` (ChangeNotifier; needed for shared call/auth/realtime state), `http` + `socket_io_client` + `shared_preferences`, `google_fonts`, Material icons. Reuse attendance's DoH-bypass `ApiService` pattern and `Config` remote-config bootstrap (same base URL `https://api.beingsevak.org/api`).

```
apps/fro-app/lib/
  main.dart                  # splash → session restore → login/home
  config.dart                # bootstrap URL
  theme.dart                 # colors matching web panel (ink #17233C, sage, etc.)
  models/                    # user, donor, donor_log, disposition, performance,
                             # dashboard, target, collections, suspense, idle, ticket
  services/
    api_service.dart         # Bearer auth, JSON, timeout, 401 → clear session + login
    auth_service.dart        # login(/auth/login), logout, role gate (fro/worker)
    socket_service.dart      # socket.io: fro:pause/resume/force-logout/broadcast,
                             # db-change on `meetings`, reconnect handling
    call_service.dart        # THE engine: activeCall, call timer, disposition window
                             # (240s), settle grace (180s), idle flag, paused/meeting
                             # holds, today stats; PUTs /fro/status + time-event
    meeting_service.dart     # 12s poll of /meeting + server-clock offset sync
  data/dispositions.dart     # 1:1 port of dispositions.js (ids, labels, groups)
  pages/
    splash_page.dart, login_page.dart
    home_page.dart           # shell: bottom nav (Dashboard | My Leads | Donors | More)
    dashboard_page.dart
    my_leads_page.dart       # perf strip + segmented tabs [Leads | Suspense]
    queue_page.dart          # controlled queue card (core loop from MyDonors.jsx)
    donor_detail_page.dart   # donor info, history, logs, donation-done stamp
    disposition_modal.dart   # bottom sheet: disposition groups, amount (for
                             # lead_done/done), schedule date/time, notes, save
    my_idle_page.dart        # monthly idle report + day sessions
    lead_incentive_page.dart # /incentive/lead/my-summary
    tickets_page.dart        # my tickets/developer tickets + raise + reply
    more_page.dart           # idle, incentive, tickets, profile, logout
  widgets/
    disposition_timer_chip.dart  # floating overlay (right side, 58% height like web)
    status_pill.dart             # Active / Idle / Offline
    pause_gate.dart              # fullscreen admin-pause hold
    meeting_gate.dart            # fullscreen meeting hold
    perf_strip.dart              # Rank / Worked / Calls / Idle / Performance tiles
    donor_card.dart, skeletons.dart, empty_state.dart
```

## Backend contract (no backend changes)

**Auth/session:** `POST /auth/login` (identifier, password → token + user with role `fro|worker`), `POST /auth/logout`. Store token+user in SharedPreferences. 401 → clear + login screen.

**Live status/timer:** `GET /fro/status/me`, `PUT /fro/status` (status online/pause/offline/meeting + active_call payload), `POST /fro/status/time-event`, `POST /fro/status/resume-self`. Server owns disposition deadline + idle; client mirrors like `CallContext.jsx` (monotonic countdown from server seconds — never wall-clock compare).

**Queue/donors:** `GET /fro/my-stations`, `GET /fro/queue/current` (backend-controlled single next donor), `GET /fro/donors` (filters: status_group, station, ngo_id, new/old…), `GET /fro/donors/:id/logs`, `POST /fro/donors/:id/logs` (disposition payload exactly as DispositionModal: action, disposition_category, disposition_detail, amount_collected, schedule fields, notes), `PUT /fro/donors/:id/status`, `PUT /fro/donors/:id/mark-seen`, `GET /fro/donors/:id/donations|receipts|history|full-history`, `GET /fro/search-donors`, `GET /fro/my-disposed-leads|scheduled|callbacks|promises|overdue`.

**Dashboard:** `GET /fro/dashboard` (20s timeout), `/fro/target`, `/fro/my-performance`, `/fro/dashboard/collections`, `/fro/follow-ups`, `/fro/lead-stats`, `/fro/monthly-donors`, `/fro/reactivated-donors`, `POST /fro/request-data`.

**Suspense:** `GET /fro/dashboard/suspense`, `POST /fro/dashboard/suspense/:id/claim`, `GET /fro/suspense/donor-search`.

**Idle:** `GET /fro/reports/idle/me?from&to`, `/fro/reports/idle/me/sessions?date`.
**Incentive:** `GET /incentive/lead/my-summary?date`.
**Tickets:** `GET /tickets/my`, `GET /developer-tickets/my`, `POST /tickets` (with department routing), `POST /developer-tickets`, `GET …/:id`, `POST …/:id/reply`, `GET /assets/my-assigned`.

**Realtime (socket.io):** `fro:pause`, `fro:resume` (by name), `fro:force-logout` (clear session → login), `fro:broadcast` / `fro:team-broadcast` (toast/banner), `db-change` on `meetings` → refresh `/meeting`. Plus 12s `/meeting` poll for clock offset + gate.

## Mobile adaptations (deliberate, not 1:1 desktop)
- Desktop sidebar → **bottom nav** (Dashboard, My Leads, Donors, More); More hosts Idle / Incentive / Tickets / Logout.
- My Leads 60/40 side-by-side → **segmented tabs** (Leads | Suspense) under the perf strip.
- Disposition timer → **floating chip overlay** above all pages (below pause/meeting gates), mirroring web portal behavior.
- Disposition modal → **draggable bottom sheet** with grouped options (port `GROUPED_NOT_CONNECTED` / `GROUPED_CONNECTED`).
- Queue UX: one donor card at a time (backend-authoritative `queue/current`), Call starts timer via `PUT /fro/status` with active_call, End call opens disposition sheet; New/Old + station switcher as dropdowns.

## Build phases
1. **Scaffold + Auth:** `flutter create` in `apps/fro-app`, config/theme, ApiService (DoH fallback), login page, role gate (fro/worker only), session restore, splash.
2. **Shell + Live engine:** home shell + bottom nav, `CallService` (status/me hydration, disposition countdown, settle grace, idle confirm), floating timer chip, status pill, MeetingGate + PauseGate, socket service (pause/resume/force-logout), offline status on app exit.
3. **My Leads core loop:** perf strip (`/fro/my-performance`, 30s poll), stations + queue/current donor card, Call/End flow, disposition modal with full enum port + validation (amount required for lead_done/done), save via `POST /fro/donors/:id/logs` (20s timeout + clear failure toast), optimistic patch + refresh.
4. **Dashboard:** target card + progress, collections by NGO, follow-ups, lead stats, reactivated donors, request-more-data (simple bar visuals instead of recharts).
5. **Donors + detail:** list with debounced search + filters, detail with logs/donations/receipts/history, mark-seen, donor-type change.
6. **Suspense:** receipt list, claim flow (donor search → fields → claim POST).
7. **Idle + Lead Incentive + Tickets:** secondary pages + raise-ticket department routing + reply thread.
8. **Polish + release:** broadcast toasts, skeletons, error/retry states, `flutter analyze` clean, widget tests (dispositions parity, countdown math, role gate), `flutter build apk`.

## Verification
- `flutter analyze` → no errors.
- `flutter test` (dispositions port parity, call timer math, login role gate).
- Manual smoke with a real FRO account: login → queue loads → call → disposition saves → idle resets → dashboard updates → ticket creates → force-logout clears session.
- `flutter build apk --debug`, then `--release`.

## Risks / notes
- Server is authoritative for idle/disposition windows — client must mirror, never invent (port the settle/idle confirm bounded-retry logic from CallContext).
- Meeting/pause gates must block input fullscreen (stack above the timer chip).
- The web panel is ~700KB of React; this app intentionally covers the **core loop** (~25–30 Dart files). WhatsApp/community chat can be a v2 phase.

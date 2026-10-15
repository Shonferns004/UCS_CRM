# Panel: Recruiter

> Generated: 2026-10-13 · Status labels: **Verified** (confirmed in code/config) · **Partially verified** (checked, some depth still unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only). Only what is confirmed in the source is stated as fact; anything else is tagged.

## 1. Panel Overview

- **Route base:** `/recruiter/*` (Verified — `client/src/App.jsx` `ROLE_PATHS.recruiter = '/recruiter'`, resolved by `panelPathFor()`).
- **Entry component:** `RecruiterPanel` (`client/src/panels/recruiter/RecruiterPanel.jsx`).
- **Access control:** guarded for the `recruiter` role via the shared `ProtectedRoute`/`panelPathFor()` in `client/src/App.jsx` and the panel’s own login helper. Backend scoping is role-tiered: leads dashboard/create/transfer are `super_admin | admin | hr | recruiter`, lead read/write additionally allows `telecaller`, deletes only `super_admin | admin | recruiter`, and the recruiter overview/stats routes are HR-tier (`super_admin | admin | hr`) (Verified — `leadRoutes.js`, `recruiterRoutes.js`).
- **Purpose:** the volunteer/NGO staffing recruitment panel — lead capture and disposition, candidate applications, interview scheduling, a daily report, internal tickets and company announcements.
- **Layout:** left sidebar nav (7 entries) + top bar with user menu, settings drawer and notification drawer + routed content area. Theme switchable via `themes`/`applyTheme` applied to `.panel-recruiter`, persisted as `recruiter_theme` (default `sky`) (Verified — `RecruiterPanel.jsx`).

## 2. Screens & UI

Navigation entries (Verified — `RecruiterPanel.jsx` lines 23–30):

| Nav item | Route | Notes |
|---|---|---|
| Dashboard | `/recruiter/dashboard` | eyebrow “Overview” |
| Leads | `/recruiter/leads` | |
| Candidates | `/recruiter/candidates` | |
| Daily Report | `/recruiter/daily-report` | |
| Tickets | `/recruiter/tickets` | `TechnicalTickets panel="recruiter"`, lazy-loaded |
| Chat | `/recruiter/chat` | `ChatWorkspace`, “UCS Chat — announcements, read only”, with `ChatNavBadge` |

`index` and `*` both redirect to `dashboard` (Verified). Internal windows (notes/details) are inline state, not separate routes.

Key screen behaviours (all **Verified** from page sources unless noted):

- **Dashboard** (`components/Dashboard.jsx`): cards **Total Leads / New Today / On Hold** plus candidate/job/feed stats from the store; `STATUS_LABEL` / `STATUS_STYLE` mappings (Partially verified — top of file read fully; lower render sections not all read).
- **Leads** (`components/Leads.jsx`, ~690 lines): lead list with `leadScope` / `canViewAllLeads` gating, `leadFilters`, age calculation (`calcAge`), job-role extraction (`getJobRole` reads `job_role` or the `__meta` JSON in notes), and default source/connected/not-connected option sets. Add / edit / delete / transfer actions with inline detail drawer (`LeadDetail`). Partially verified — helpers and top logic read; lower table render unread.
- **LeadDetail** (`components/LeadDetail.jsx`): status pill, lead fields, and a note list stored as a JSON array; `addNote` appends `{ text, date, by }` (Verified).
- **Candidates** (`components/Candidates.jsx`, ~526 lines): candidate list with stage guard (transitions blocked unless `selected / offer_released / offer_accepted / onboarding / joined / rejected`), disposition mapping `CONNECTED_STATUS_MAP`, and dispositions persisted to `localStorage` via `readList`; the Interviews workflow opens from here (imports `ScheduleForm`, `DetailView`, `CompleteForm`, `CancelForm`, `ivToForm`). Partially verified.
- **CandidateForm** (`components/CandidateForm.jsx`): name / phone / email fields, `SOURCE_OPTIONS`, `STAGE_OPTIONS`, `GENDER_OPTIONS` (`Male`/`Female`/`Other`), image paste helper `usePasteImage` (Verified).
- **CandidateDetail** (`components/CandidateDetail.jsx`): profile built with `getCandidateProfile`, `InfoGrid`, `parseNotes`/`buildCandidateNotes`, `STAGE_PILL` colors, `usePasteImage` (Verified).
- **Interviews** (`components/Interviews.jsx`, ~607 lines): schedule form with round/mode/recommendation/reminder options, overlap detection (`toMin`/`overlaps`), grouping by section (`Completed`/`Cancelled`/`No Show`), and complete/cancel flows that roll the outcome back onto the candidate. Partially verified — helper layer and constants read; form render in chunks.
- **Daily Report** (`components/RecruiterDailyReport.jsx`): thin wrapper over the shared `DailyReport` component with `panel="recruiter"` and `recruiterSections` from `components/DailyReport/configs.js` (Verified):
  - **Recruitment Performance** — 10 numeric fields: total vacancies, new candidates sourced, contacted, calls connected, interviews scheduled / attended, candidates selected, offers released, candidates joined, rejected.
  - **Vacancy-Wise Status** — one row per position (position / required / interviewed / selected / joined / pending).
  - **Recruitment Challenges** — free-text textarea.
  - **Follow-Up Required** — rows (candidate / date / responsible recruiter).
  - plus the four shared `commonSections` appended by `withCommon`.
- **Jobs** (`components/Jobs.jsx`) and **Pipeline** (`components/Pipeline.jsx`): standalone components present (Vacancy form `addJob({title, dept, openings})`; departments Engineering / Design / Sales / People / Operations; Pipeline shows a static “Hiring Pipeline” infographic), but **no route or importer wires them into the panel** (Verified — component files present; no imports found in routes/teachers). Jobs data itself lives in the store and is consumed by Dashboard/Leads.
- **Header**: user menu (profile / settings / sign-out), `SettingsDrawer` (theme picker), `NotificationDrawer` fed by `GET /notifications/:uid` with `recruiter_seen_notifs` dedupe in `localStorage` and desktop notifications via `requestNotifPermission` + `showDesktopNotification`, plus a `NoticePopup` (Verified — `RecruiterPanel.jsx`).

## 3. Features

- Lead intake + status lifecycle: sources (`Walk-in`, `LinkedIn`, `Referral`, `Job Portal`, `Other`), status vocabulary (`held`, `followed_up`, `call_back`, `scheduled`, `not_interested`, `ringing`, `unreachable`, `busy`, `switched_off`, `wrong_number`, `invalid`, `rejected`), transfer, delete (Verified — store + lead routes + controllers).
- Ownership-scoped lead views: recruiters/telecallers see assigned leads; `super_admin`/`admin`/`hr`/`master` users can view all (Verified — `CAN_VIEW_ALL_LEADS` store flag mirrors backend `CAN_SCOPE_ALL`).
- Candidate pipeline: stages map Contacted → Screening → Interview Scheduled → Selected → Offer Sent → Rejected, with internal Onboarding / Joined states and a stage guard that blocks illegal transitions (Verified — store + Candidates/Interviews guards).
- Interview scheduling with rounds, modes, recommendations, reminders and overlap-prevention; Completed / Cancelled / No Show outcomes fold back into the candidate record (Verified — Interviews helpers + store).
- Structured daily report for recruiters (numeric performance, vacancy-wise rows, challenges, follow-ups) persisted through the shared daily-report module (Client Verified; backend persistence Partially verified — `/api/daily-reports` mount confirmed, submit controller not read).
- Call logging for `telecaller` / `hr` / `recruiter` roles (and FRO-department workers) under `/api/call-logs` (Verified — `callLogRoutes.js`).
- Job/vacancy tracking + hiring-pipeline infographic components — present in the panel folder, not yet routed (Verified — files present, unused).
- Worker onboarding tie-in: the `Onboarding` candidate stage leads into the separate worker-facing onboarding module under `/api/onboarding` (verified — routes + stage map).
- In-app/desktop notifications with per-panel seen-dedupe, and read-only company chat announcements (Verified).

## 4. Technical Implementation

- **Stack:** React function components + hooks, React Router, `lazy()`/`Suspense` (TechnicalTickets), a context store (`RecProvider`) in `store.jsx`, inline styles + CSS variables (`.panel-recruiter`), `useRealtime` for activity feed, and custom icons (`icons.jsx`) (Verified).
- **Store** (`store.jsx`, 328 lines): exposes `leads`, `leadsLoading`, `leadStats`, `candidates`, `interviews`, `jobs`, `feed` and CRUD actions; constants `STAGES`, `LEAD_SOURCES`, `LEAD_STATUSES`, `CANDIDATE_STAGES`, `CANDIDATE_SOURCES`, `STAGE_TO_STATUS`, `INTERVIEW_ROUNDS`, `INTERVIEW_MODES`, `RECOMMENDATIONS`, `REMINDER_OPTIONS`, `INTERVIEW_STATUS_COLOR`, `CAN_VIEW_ALL_LEADS`, `getCandidateProfile`, `buildCandidateNotes`, `parseNotes`, `initials`/`avatarColor`/`avatarTint` (Verified — constants/maps read; fetch internals Partially verified).
- **Persistence:** candidate/lead dispositions persisted to `localStorage` via `readList`/`writeList`; theme via `recruiter_theme`; seen notifications via `recruiter_seen_notifs` (Verified).
- **API helper:** panel uses the shared `client/src/api/auth.js` `api(path, { _prefix: 'ucs' })` which adds the `/api` prefix and Bearer token (`GET /notifications/:uid` in `RecruiterPanel.jsx`) (Verified). Backend study uses the same auth middleware (`authenticateRole`) as every other panel.
- **Backend mountpoints** (Verified — `backend/src/index.js`): `/api/leads` (261), `/api/call-logs` (262), `/api/recruiters` (263), `/api/onboarding` (260), and `/api/dashboard` (253, which includes the `/recruiter` handler).
- **Controllers/routes:** `recruiterController.js` (listRecruiters, getRecruiterStats, getRecruiterOverview), `leadController.js` (addLead, listLeads, getLead, editLead, removeLead, transferLeadOwner, dashboard), `onboardingController.js` (512 lines; submit/status/photos/docs/policies/signature), route files `recruiterRoutes.js`, `leadRoutes.js`, `callLogRoutes.js`, `onboardingRoutes.js` (Verified — routes read fully; onboarding controller internals Partially verified).
- **`ui.jsx`**: reusable `Dropdown` with `customTrigger`/`customValue` caps used across forms (Verified).

## 5. Business Logic

- **Role matrix** (Verified — `backend/src/routes/leadRoutes.js`):
  - `hrOrAbove = super_admin | admin | hr | recruiter` → `GET /leads/dashboard`, `POST /leads`, `PUT /leads/:id/transfer`.
  - `leadReadWrite = hrOrAbove + telecaller` → `GET /leads`, `GET /leads/:id`, `PUT /leads/:id`.
  - `DELETE /leads/:id` → `super_admin | admin | recruiter` only.
- **Data scoping** (Verified — `leadController.js`): `CAN_SCOPE_ALL = Set(['super_admin','admin','hr','master'])` bypasses scoping; otherwise leads are filtered to the caller (`recruiterOwner`); `ownsLead(lead, [user.id], user.name)` is the ownership check used by transfer/delete paths. `isRecruiter` and `isTelecaller` helpers gate behaviour; `isTelecaller` is true for role `telecaller` **or** a worker whose department is `fro`.
- **Lead model** (Verified — `leadController.addLead`): stores `name`, `phone`, `age`, `source`, `status`, `notes`, `recruiter_id`, `created_by_name`, `dob`, `scheduled_date`.
- **Candidate disposition mapping** (Verified — `Candidates.jsx`): `CONNECTED_STATUS_MAP = { follow_up:'followed_up', call_back:'call_back', schedule:'scheduled', not_interested:'not_interested' }`; disposition choices come from `DEFAULT_CONNECTED` / `DEFAULT_NOT_CONNECTED`; outcomes persist locally via `readList` (so dispositions live in the browser for now — no backend candidate table read).
- **Stage guard** (Verified): only `selected`, `offer_released`, `offer_accepted`, `onboarding`, `joined`, `rejected` may be set from the interview/candidate flows, preventing free-form stage hops.
- **Interview overlap prevention** (Partially verified): `toMin`/`overlaps` convert `HH:MM` times and reject scheduling conflicts for the same candidate.
- **Recruiter overview (backend)** (Partially verified): `getRecruiterOverview` combines `getRecruiterWorkers` with `getAllLeads` and an in-JS `leadBelongsTo` association to compute per-recruiter performance (approach confirmed; full aggregation not read).
- **Onboarding lifecycle** (Verified — `onboardingRoutes.js`): worker-facing `/submit`, `/status`, `/upload-photo`, `/upload-document`, `/policies`, `/print-profile`; signature is two-phase (`POST /upload-signature` drafts, `POST /signature/commit` locks on final submit, `GET /signature` returns current signature + active policies); admin policy CRUD (`/admin/policies`) and admin photo/signature uploads are `super_admin | admin | hr` (+ `accounts` for the photo) routes.

## 6. API Endpoints

All **Verified** against the route files + `backend/src/index.js` mounts. Paths below are full API paths.

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/api/recruiters/overview` | hrOnly (super_admin, admin, hr) | Recruiter performance overview |
| GET | `/api/recruiters` | hrOnly | List recruiters |
| GET | `/api/recruiters/:id/stats` | hrOnly | Per-recruiter stats |
| GET | `/api/leads/dashboard` | hrOrAbove | Lead funnel dashboard |
| POST | `/api/leads` | hrOrAbove | Create lead |
| GET | `/api/leads` | leadReadWrite (+telecaller) | List leads (scoped) |
| GET | `/api/leads/:id` | leadReadWrite | Lead detail |
| PUT | `/api/leads/:id` | leadReadWrite | Update lead |
| PUT | `/api/leads/:id/transfer` | hrOrAbove | Transfer lead owner |
| DELETE | `/api/leads/:id` | super_admin / admin / recruiter | Delete lead |
| POST | `/api/call-logs` | telecallerOrAbove | Log a call |
| GET | `/api/call-logs` | telecallerOrAbove | List call logs |
| GET | `/api/call-logs/lead/:leadId` | telecallerOrAbove | Call logs for a lead |
| GET | `/api/call-logs/:id` | telecallerOrAbove | Single call log |
| GET | `/api/dashboard/recruiter` | role `recruiter` | Recruiter dashboard statistics |
| POST | `/api/onboarding/submit` | authenticate | Submit onboarding form |
| GET | `/api/onboarding/status` | authenticate | Onboarding status |
| POST | `/api/onboarding/upload-photo`, `/upload-document` | authenticate | Photo/document upload |
| GET | `/api/onboarding/policies` | authenticate | Policies list |
| GET | `/api/onboarding/print-profile` | authenticate | Printable profile |
| POST | `/api/onboarding/upload-signature`, `/signature/commit` | authenticate | Two-phase signature |
| GET | `/api/onboarding/signature` | authenticate | Signature + active policies |
| GET/POST/PUT/DELETE | `/api/onboarding/admin/policies...` | super_admin / admin / hr | Policy CRUD |
| POST | `/api/onboarding/admin/upload-photo/:workerId` | + accounts | Admin photo upload |
| POST | `/api/onboarding/admin/upload-signature/:workerId` | super_admin / admin / hr | Admin signature upload |

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing | **Verified** |
| Auth model (role gate, role-tiered scoping) | **Verified** |
| NAV + Dashboard / Leads / Candidates / Daily Report / Tickets / Chat routes | **Verified** (route/config read fully) |
| Long screens (Leads 690, Candidates 526, Interviews 607) | **Partially verified** (helpers/constants read; render bodies in chunks) |
| Store constants & logic | **Partially verified** (constants read; some fetch internals unread) |
| Jobs / Pipeline components | **Verified present, not wired** — no route or importer; Planned for the panel |
| Candidate/call disposition persistence | **Partially verified** — dispositions live in `localStorage`; no backend candidate/disposition table read |
| Backend endpoint coverage | **Verified** for all cited routes |
| Onboarding controller internals | **Partially verified** (routes read; submit/approval logic partially read) |
| Screenshots | **screenshots pending** — not yet captured; add under Testing when available |

Note: the Recruiter panel is also embedded inside the Super Admin panel (iframe, routes dashboard · leads · candidates · tickets per `embedPanels.js`) and is reachable by Super Admin under the `/sa/recruiter` mount.
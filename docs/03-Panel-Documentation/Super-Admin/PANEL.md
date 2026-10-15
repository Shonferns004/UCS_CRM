# Panel: Super Admin

> Generated: 2026-10-13 · Status labels: **Verified** (confirmed in code/config) · **Partially verified** (checked, some depth still unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only). Only what is confirmed in the source is stated as fact; anything else is tagged.

## 1. Panel Overview

- **Route base:** `/sa/*` (Verified — `client/src/panels/super-admin/SuperAdminPanel.jsx`).
- **Entry component:** `SuperAdminPanel` (`client/src/panels/super-admin/SuperAdminPanel.jsx`).
- **Access control:** guarded for `super_admin` role. Verified twice: the panel's own `api/auth.js` checks the logged-in role before allowing access, and the shared `ProtectedRoute` in `client/src/App.jsx` only matches `/sa/*` to `ROLE_PATHS.super_admin`. Super Admin is also allowed into the HR, Recruiter, Developer and Social panels (Verified — `panelPathFor()` role-first logic in `client/src/App.jsx`).
- **Purpose:** the command-and-control panel for the whole UCS operation — organization setup, volunteer management, donor-data import, finance/lead verification, tickets, notices, incentives, attendance and live field monitoring.
- **Layout:** left sidebar nav with grouped "eyebrow" categories (Data, Organization, People, HR, Support, Admin, Finance, Operations, Events, Recruitment, Inventory, Reports, Team), a top search/status bar (Partially verified — top bar basics confirmed; not read in full) and a routed content area. Several sub-panels are embedded by lazy `iframe` (`PanelFrame`) using the config in `client/src/panels/super-admin/embedPanels.js`.

## 2. Screens & UI

Navigation entries (Verified — `SuperAdminPanel.jsx` lines 43–65). Each ships a route, a label and an eyebrow category:

| Nav item | Route | Eyebrow |
|---|---|---|
| Dashboard | `/sa/dashboard` | Super Admin |
| Data Management | `/sa/data-management` | Data |
| Organization | `/sa/organization` | Organization |
| Volunteers | `/sa/employees` | People |
| Leaves | `/sa/leaves` | HR |
| Tickets | `/sa/tickets` | Support |
| Admin (iframe - NGO Admin) | `/sa/ngo-admin` | Admin |
| Accounts (iframe) | `/sa/accounts` | Finance |
| Metropad (iframe) | `/sa/metropad` | Operations |
| Event Head (iframe) | `/sa/event-head` | Events |
| HR (iframe) | `/sa/hr` | People |
| Attendance (admin) | `/sa/admin-attendance` | People |
| Recruiter (iframe) | `/sa/recruiter` | Recruitment |
| FRO (iframe) | `/sa/fro` | Operations |
| Live FRO Status | `/sa/live-fro` | Operations |
| FRO Idle Report | `/sa/fro-idle` | Operations |
| Assets Overview | `/sa/assets` | Inventory |
| Incentives | `/sa/incentives` | Finance |
| Notices | `/sa/notices` | Broadcast |
| Late Policy | `/sa/late-policy` | HR |
| UCS Chat | `/sa/chat` | Team |
| Daily Reports | `/sa/daily-reports` | Reports |

One further route exists in file (`employees/:id` → worker detail) and there is a deactivated nav item for a dedicated HR & Recruitment Report (`/sa/hr-report`, commented out in the NAV array — Verified).

Key screen behaviours (all **Verified** from page sources):

- **Dashboard** (`pages/Dashboard.jsx`, ~1,431 lines): header period selector (7 Days / 30 Days / 90 Days / 1 Year / All Time), CSV/Excel export button, a **"Needs attention"** live card with Segmented "Pending actions" vs "Risk & alerts" tabs, KPI strip, department shortcut buttons, FRO performance board (today — collection / calls / live / punched-in), and cards for leads pipeline (Converted / In Progress / Negative / Other disposition groups), attendance (Present / Late / Absent), workers, accounts verification, events and NGO-wise worker distribution.
- **Data Management** (`pages/DataManagement.jsx`, ~771 lines): tabs **Data Sources · Import · Fresh New Data · History**; chunked donor uploads with client-side dedupe (≈500 rows/chunk) and live progress; also mounts the older `DataImport` experience used by other panels.
- **Organization** (`pages/Organization.jsx`, ~195 lines): NGO CRUD plus a separate **Causes Management** screen (`pages/Causes.jsx`).
- **Volunteers** (`pages/Workers.jsx`): NGO/department/status filters, free-text search, pagination and a **ResetPasswordModal**.
- **Worker Detail** (`pages/WorkerDetail.jsx`, ~278 lines): worker profile, allocations, salary summary and FRO performance stats.
- **Tickets** (`pages/Tickets.jsx`, ~373 lines): status map `pending / hr_verified / approved / rejected`, pending-count badge, and an `ActionModal` to review HR-verified attendance-correction tickets (approve/reject with remarks).
- **Admin Attendance** (`pages/AdminAttendance.jsx`): PIN-gated (`sa_attendance_pin`), statuses `present / late / absent / leave`, month picker, per-employee drill-down with add/edit/delete record modal.
- **Daily Reports** (`pages/DailyReportsOverview.jsx`): date picker plus department tabs `dev / hr / recruiter / social` (defaults to dev), roster filter.
- **Live FRO Status** (`pages/LiveFroStatus.jsx`, ~526 lines): live roster fed by `/fro/status`, updates via existing socket (onDbChange), server clock, summary cards.
- **FRO Idle Report** (`pages/FroIdleReport.jsx`) = thin wrapper around `components/froIdleReport/FroIdleReportPanel`.
- **Incentives** (`pages/IncentivesPage.jsx`): two tabs — **SIR "NGO wise Incentive"** and **Lead Incentive**; `pages/LeadIncentivePage.jsx` wraps `components/LeadIncentive`.
- **Notices** (`pages/Notices.jsx`): target-audience role options (all / admin / accounts / hr / recruiter / event_head / fro) with media upload.
- **Late Policy** (`pages/LatePolicy.jsx`, ~242 lines): employee picker + per-worker `late_grace_minutes` editor (valid range 30–480), live half-day/full-day threshold preview that scales with the grace value, save/reset actions. Default grace = 180.
- **Asset Overview** (`pages/AssetOverview.jsx`): stat cards (Total Assets / Total Value / Assigned / Available / In Repair / Not Working), status and category breakdowns, department allocation and recent activity.
- **Accounts** (`pages/Accounts.jsx`, ~66 lines): stat cards then an iframe fallback chain `/dashboard/accounts` → `/dashboard/super-admin` (Verified — `PanelFrame`).
- Other smaller pages present in file (Verified): `Users.jsx`, `Holidays.jsx`, `Events.jsx`, `Achievements.jsx`, `AttendanceCalendar.jsx`, `SpecialIncentives.jsx`, `RecruitmentDashboard.jsx`, `HrRecruitmentReport.jsx`, `SocialDashboard.jsx`, `HrDashboard.jsx` variant pages etc. under `pages/`.

Embedded panel catalogue (Verified — `embedPanels.js`):
- **NGO Admin** (internal iframe): dashboard · station-mgmt · attendance · agents · codes · my-tickets.
- **HR**: overview · employees · attendance · leaves · letters · hr-forms · recruiters · reports · quizzes · holidays · qr · loans · ngo/salary · fro-targets · tickets · library.
- **Accounts**: leads · receipt-generator · bill-reminder · attendance · volunteers(salary) · teams · incentive · incentive-verify · fro-targets · incentives · donors · certificates · asset-register · loans · beneficiaries · reports · tickets · library.
- **FRO**: dashboard · my-leads · donors · my-idle · lead-incentive · tickets.
- **Event Head**: dashboard · events · calendar · monthly-planner · ngos · sectors · activities · my-events · media/banners · volunteers(voluntary) · reports · approvals · all-tickets.
- **Recruiter**: dashboard · leads · candidates · tickets.

## 3. Features

- Unified cross-NGO dashboard with perioded KPI drill-downs and CSV export (Verified).
- Organization & cause master-data management (Verified).
- Volunteer directory + per-worker profile with allocations/salary (Verified).
- Attendance correction ticket approval workflow (HR verifies, Super Admin approves/rejects) (Verified).
- PIN-protected attendance admin with record create/edit/delete (Verified).
- Late-policy configuration per employee (grace minutes, scaled half/full-day thresholds) (Verified).
- Donor data import (chunked, deduped) and data-source/history management (Verified).
- Live FRO field status feed (Verified).
- FRO idle reporting (Partially verified — wrapper confirmed; inner panel logic grouped as unread).
- Notices broadcast with role targeting (Verified).
- Incentive management for both SIR (NGO-wise) and Lead incentive schemes (Verified).
- Asset inventory overview (Verified).
- Daily reports overview across dev/hr/recruiter/social departments (Verified).
- Embedded sub-panels for NGO Admin, HR, Accounts, FRO, Event Head and Recruiter (Verified).
- UCS Chat workspace in-panel (Verified — route present; chat implementation not read in full).

## 4. Technical Implementation

- **Stack:** React (function components + hooks), React Router (`Routes`/`Route`/`NavLink`), `lazy()` + `Suspense` per page, local store style: no router-level state library for the panel beyond React hook state; uses `useRealtime` hook and an existing socket (`onDbChange` from `lib/socket`) in LiveFRO/Dashboard (Verified).
- **API helper:** `client/src/panels/super-admin/api/auth.js` — `api(path, options)` prepends `API_BASE`, attaches `Bearer` token from `ucs` storage prefix, JSON content-type (no header for `FormData`), 120 000 ms default timeout, and on HTTP 401 it clears the session and redirects to `/login` (Verified).
- **Endpoints module:** `client/src/panels/super-admin/api/endpoints.js` centralises every backend call used by the pages (Verified; paths listed in §6).
- **Iframing:** embedded panels (`/sa/accounts`, `/sa/hr`, `/sa/ngo-admin`, `/sa/fro`, `/sa/event-head`, `/sa/recruiter`, `/sa/metropad`) render the partner SPA inside a `PanelFrame` (`components/PanelFrame`), configured declaratively in `embedPanels.js` (Verified).
- **Server side:** dedicated router `backend/src/routes/superAdminRoutes.js` (lean; verified — delegates to `superAdminController`, see §6) and a broad set of shared routers consumed by this panel (`/api/workers`, `/api/attendance-corrections`, `/api/dashboard`, `/api/data-import`, `/api/accounts`, `/api/attendance`, `/api/notices`, `/api/incentive/…`, `/api/salary`, `/api/assets`, `/api/causes`, etc.). Mount points verified in `backend/src/index.js` lines 236–325.

## 5. Business Logic

- **Role gating:** `ProtectedRoute` + in-panel login helper both enforce `super_admin`. Super Admin may also open HR/Recruiter/Developer/Social panels (`panelPathFor()` in `client/src/App.jsx`).
- **Ticket lifecycle:** attendance-correction request flows FRO → HR verification (`hr_verified`) → Super Admin approve/reject. Approve writes an `admin_remark`; reject writes a `remark` (Verified — `endpoints.js` + `Tickets.jsx`).
- **Late-policy calculation** (`LatePolicy.jsx`, Verified): `grace` defaults to 180; half-day threshold = `max(1, round(240 * g/180))`, full-day = `max(half+1, round(480 * g/180))`. Stored per worker via `PUT /workers/:id { late_grace_minutes }`; null resets to default.
- **Attendance PIN:** configured under worker settings key `sa_attendance_pin`; screen shows create-PIN flow on first use, unlock flow afterwards (Verified).
- **Import pipeline** (DataManagement/DataImport, Verified): parse CSV → client-side dedupe → chunked upload (~500 rows) → batch record in `/data-import/batches`; also supports "Old Data" upload and "Copy to NGOs" bulk ops.
- **Period semantics:** 7d/30d/90d/1y/all map to the backend `period` query on `/dashboard/super-admin` (Verified).
- **Lead disposition grouping:** Converted / In Progress / Negative / Other buckets map a fixed, verified set of status strings onto colour-coded groups (Verified — Dashboard.jsx lines 431–435).
- NGO-wise target configuration for NGO Admins via `/super-admin/ngo-admin-targets` (Verified — `superAdminController`).

## 6. API Endpoints

All paths below are relative to the `/api` mount; consumer = `client/src/panels/super-admin/api/endpoints.js` unless noted. All **Verified** against `backend/src/index.js` mount table + endpoint modules.

| Method | Path (relative to `/api`) | Purpose | Source |
|---|---|---|---|
| GET | `/auth/login` (via in-panel `api/auth.js`) | Panel session | `api/auth.js` |
| GET | `/dashboard/super-admin?period=` | Aggregate dashboard | `endpoints.js` |
| GET | `/dashboard/super-admin-alerts` | Risk/alert feed | `endpoints.js` |
| GET | `/ngos` | NGO list | `endpoints.js` |
| GET | `/users` | User list | `endpoints.js` |
| GET | `/hrs` | HR list | `endpoints.js` |
| GET | `/workers` (+filters) | Volunteer list | `endpoints.js` |
| GET | `/workers/:id` | Worker detail | `endpoints.js` |
| GET | `/workers/:id/allocations` | Worker allocations | `endpoints.js` |
| PUT | `/workers/:id` | Late-policy / profile updates | `LatePolicy.jsx` |
| GET | `/attendance/all` | Attendance records | `endpoints.js` |
| GET | `/leaves` | Leave list | `endpoints.js` |
| GET | `/holidays` | Holiday list | `endpoints.js` |
| GET | `/salary/workers-summary`, `/salary/worker/:id/allocations` | Salary data | `endpoints.js` |
| GET | `/incentive/monthly-summary` | SIR incentive summary | `endpoints.js` |
| GET | `/events` | Events | `endpoints.js` |
| GET | `/notices` | Notices | `endpoints.js` |
| GET | `/achievements` | Achievements | `endpoints.js` |
| GET | `/causes` | Causes | `endpoints.js` |
| GET | `/data-sources` | Data source list | `endpoints.js` |
| GET | `/data-import/batches`, `/data-import/batch/:id` | Import history | `endpoints.js` |
| POST | `/data-import/*` (inspect/upload/chunk/old/copy) | Import donation data | `dataImportRoutes` |
| GET | `/accounts/leads?status=` | Account leads (pending/verified) | `endpoints.js` |
| GET | `/accounts/receipts?limit=` | Receipt stats | `endpoints.js` |
| GET | `/leads` | Recruiter leads | `endpoints.js` |
| GET | `/attendance-corrections/hr-verified`, `/all`, `/pending-count` | Ticket lists | `endpoints.js` |
| PUT | `/attendance-corrections/:id/approve`, `/reject` | Ticket decision | `endpoints.js` |
| GET | `/super-admin/ngo-admin-targets` | NGO admin daily targets | `endpoints.js` |
| PUT | `/super-admin/ngo-admin-targets/:workerId` | Set NGO admin target | `endpoints.js` |
| GET | `/fro/status` | Live FRO status feed | `LiveFroStatus.jsx` |
| GET | `/accounts/bank-audit/*` | Bank audit data (Accounts embed) | `bankAuditRoutes` |

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing | **Verified** |
| Auth model (role gate, token) | **Verified** |
| NAV + embedded panels | **Verified** (config read fully) |
| Dashboard / Data Mgmt / Org / Workers / Tickets / Notices / LatePolicy / Incentives / Assets / DailyReports screens | **Verified** (page sources read) |
| Live FRO / idle-report inner logic | **Partially verified** (wrapper + feed confirmed; inner panel not read in full) |
| Backend endpoint coverage | **Verified** for cited endpoints; the wider `/api/*` mount table read (lines 236–325) |
| Screenshots | **screenshots pending** — not yet captured; add under Testing when available |

Note: the panel makes extensive use of shared routers (workers, attendance, sales, accounts, salary, cause, notice, incentive). Endpoints shown are those the Super Admin client actually calls; the full list of backend mounts is in `backend/src/index.js`.
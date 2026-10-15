# Panel: HR

> Generated: 2026-10-13 · Status labels: **Verified** (confirmed in code/config) · **Partially verified** (checked, some depth still unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only). Only what is confirmed in the source is stated as fact; anything else is tagged.

## 1. Panel Overview

- **Route base:** `/hr/*` (Verified — `client/src/panels/hr/HRPanel.jsx`).
- **Entry component:** `HRPanel` (same file).
- **Access control:** guarded for role `['hr','HR','super_admin']` via the shared `ProtectedRoute` in `client/src/App.jsx`; rendered with `PanelWrapper roleKey="hr"`, which adds the `panel-hr` scope class. A super_admin or admin can open the HR panel directly (`ROLE_PATHS.hr = '/hr'`).
- **Purpose:** people-ops for the organisation — volunteer registry, attendance, leave, letters/forms, recruitment pipeline (leads → quizzes → recruiter MIS), holidays, QR-based attendance, loans & advances, NGO/salary allocations, FRO collection targets, attendance-correction tickets and daily reports.
- **Layout:** `HRPageShell` — left sidebar (19 NAV entries), top bar with eyebrow/title, hidden ticket-count bell badge, user menu (Settings / Sign out), a NotificationDrawer, and a SettingsDrawer that exposes theme switching plus a "Change Salary Access Code" view. Chat shows a `ChatNavBadge` (Verified — `HRPanel.jsx`).
- **Theme system:** `client/src/panels/hr/theme.js` defines named themes (sage default, ocean, sky, marine — Verified); `applyTheme(themes[themeName], '.panel-hr')` is applied on mount and stored under `localStorage['hr_theme']`; default selection is `'sky'` (Verified).
- **Relationship with other panels:**
  - **Accounts** reuses HR components wholesale: `Workers`, `EmployeeDetail`, `Offboarding`, `Loans`, `Awards` are rendered inside `/accounts/volunteers/*` and `/accounts/awards` (Verified — `AccountsPanel.jsx`). The backend comment "Volunteers tab is also rendered inside the Accounts panel" confirms shared intent (Verified — `workerRoutes.js`, `salaryRoutes.js`).
  - **Super Admin / NGO Admin:** the attendance-correction lifecycle spans HR (verify) → super_admin (approve); `NgoSalary` reads org-wide NGO allocations also used by NGO Admin flows.
  - **Library:** `/hr/library` mounts the shared **Sevak Library** panel (`SevakPanel` from `../sevak-library/SevakPanel`), which likewise is mounted at `/accounts/library` (Verified).
  - **Social:** `/hr/social-report` re-exports the social panel's `SocialDailyReport` ("The Social Media daily report now lives with the social panel… this re-export avoids a duplicate copy" — Verified comment in `SocialReport.jsx`).

## 2. Screens & UI

Navigation entries (Verified — `HRPanel.jsx` NAV, lines 43–63):

| Nav item | Route | Eyebrow / purpose |
|---|---|---|
| Overview | `/hr/overview` | Dashboard — team at a glance (`Visualizations`) |
| Volunteers | `/hr/employees` | Add and manage volunteers (`Workers`) |
| Attendance | `/hr/attendance` | Mark who is in today (`Attendance`) |
| Leaves | `/hr/leaves` | Requests and approvals (`Leaves`) |
| Letters | `/hr/letters` | Generate HR letters (`Letters`) |
| HR Forms | `/hr/hr-forms` | Volunteer onboarding forms (`HRForms`) |
| Recruiters | `/hr/recruiters` | Track leads and hires (`Recruiters`) |
| Reports | `/hr/reports` | Recruiter MIS and attendance (`Reports`) |
| Daily Report | `/hr/daily-report` | HR report for the day (`HrDailyReport`) |
| Social Report | `/hr/social-report` | Social media content and reach (`SocialReport`) |
| Quizzes | `/hr/quizzes` | AI-marked candidate quiz results (`Quizzes`) |
| Holidays | `/hr/holidays` | Plan the holiday chart (`Holidays`) |
| QR Codes | `/hr/qr` | Generate and manage QR codes (`GenerateQR`) |
| Loans & Advances | `/hr/loans` | Approve and manage loans & advances (`Loans`) |
| NGO & Salary | `/hr/ngo` | Allocations, reports and payments (`NgoSalary`) |
| FRO Targets | `/hr/fro-targets` | Monthly collection targets (`FroTargets`, shared) |
| Tickets | `/hr/tickets` | Attendance-correction tickets (`Tickets`) |
| UCS Chat | `/hr/chat` | Company announcements — read only (`ChatWorkspace`) |
| Library | `/hr/library` | Sevak Library memberships (`SevakPanel`) |

Detail/deep routes (Verified — `HRPanel.jsx`): `/hr/employees/:id` (EmployeeDetail via `EmployeeDetailPage`), `/hr/employees/:id/offboard` (`OffboardPage`), `/hr/settings` (`SettingsRoute`). Index and unknown paths redirect to `overview`.

Key screen structures (all **Verified** at structure level unless noted):

- **Overview** (`components/Overview.jsx`, 5 lines) → **Visualizations** (`Visualizations.jsx`): stat cards, NGO-split, "Salary by Department" chart, monthly trends (Verified via headings/state, e.g. lines 364, 524, 587).
- **Volunteers** (`Workers.jsx`, 1168 lines): volunteer list with search/department/NGO filters, add-volunteer form, per-row actions (view, offboard, edit, abscond), bulk print and bulk edit tooling. Behaviour toggled by props when mounted inside Accounts: `showAddForm`, `showNgoSalary`, `showBulkPrint`, `showPagarExport`, `showPayExports`, `title` (Verified — call from `AccountsPanel.jsx` line 271). `onSelect` navigates to the detail page.
- **Employee detail** (`EmployeeDetail.jsx`, 2756 lines): internal tabs **Overview / Attendance / Salary / Leaves / Loans & Advances / Settings** (Verified — `TABS`, lines 402–408). Overview shows photo (click/paste to change), personal details, bank details, signature, documents, generated letters; Attendance filterable per worker; Salary hosts the confidential **Salary Access Bar** (locked/hidden `XXX` until the 4-digit access code is unlocked via `SalaryPrivacyContext`, Verified lines 1106–1134), a salary calculator with per-day rate, Sunday-pay and loan-deduction totals, **Hold / Release Salary**, NGO Employment Split and **NGO Salary Allocation** ("Generate from Payroll"), salary history, FRO Target & Incentives, and Shift Settings; Leaves shows per-worker leave history; Loans & Advances shows per-worker loan table (Type / Amount / Monthly Deduction / Paid So Far / Remaining / Status).
- **Attendance** (`Attendance.jsx`, 1012 lines): tabs **Today's Attendance** and **Attendance History**. History filters: Month, Day, Department (`deptLabel`), Status, punch-status, search; exports Excel + JSON (list and per-worker detail); manual "Add Attendance" record; Sunday-pay eligibility computation (absences ≥6, joined-after-10th edge case, attended Sundays, clean-month free Sunday count) — Verified (code lines 595–614).
- **Leaves** (`Leaves.jsx`): tabs **Active (pending)** / **History**; table Worker / Type / Days / Starts / Status; detail modal with remark; Approve / Reject / Cancel decisions (Verified).
- **Letters** (`Letters.jsx`, 1550 lines): letter templates, "Generate a letter" auto-fills name & role, generated-letter list per worker, download.
- **HR Forms** (`HRForms.jsx`, 878 lines): onboarding form sections: Personal Details, Correspondence Address, Education, Previous Organizations, Family, Bank Details, Declaration & Signature (Verified headings); letterhead-style print rendering.
- **Holidays** (`Holidays.jsx`, 271 lines): month calendar with dots per type — holiday/event (`type`) and birthday (`birthdays` map keyed by `MM-DD`); day detail pane, add holiday (name/type/recurring flag), delete w/ confirm; recurring holidays match month across years (Verified — filtering logic lines 46–60).
- **Recruiters** (`Recruiters.jsx`, 485 lines): tabs **All / Scheduled (interviews)**; leads pipeline with lead status util helpers (`belongsToLead`, `isRejectedStatus`, `isPendingFollowUpStatus` from `utils/leads`); `RecruiterOverview` (394 lines) paginates recruiter leaderboards.
- **Reports** (`Reports.jsx`, 868 lines): one screen, two sections always in the same order — **recruiter MIS first, then attendance** (Verified comment lines 18–19). Derivable figures come from `leads.status` / `notes` meta; **Calls Made, Interviews Attended, Joining Confirmed are NOT derivable** (documented probe: call_logs empty, no held-interview marker, no joining status) and are typed per recruiter then saved in `hr_daily_reports.mis_manual` (Verified comments lines 23–35). Attendance section derives from HR attendance endpoint; WhatsApp body and print output mirror the same two-section order; IST-day bucketing is deliberate (`istDateOf` uses +5.5h, not `iso.slice(0,10)`).
- **Daily Report** (`HrDailyReport.jsx`): shared `DailyReport` component with `panel="hr"`, `hrSections` + `withCommon`, summary cards fed by `/api/hr-reports/attendance-summary?date=` → Total staff / Present / On leave / Absent; prose stored in shared `daily_reports` table (`panel="hr"`) (Verified comments).
- **Social Report** (`SocialReport.jsx`): re-export of `social/pages/SocialDailyReport`.
- **Quizzes** (`Quizzes.jsx`, 210 lines): AI-marked candidate quiz results table (candidates answered via the public recruit-quizz app — Verified route comment in `quizRoutes.js`).
- **QR Codes** (`GenerateQR.jsx`, 229 lines): styled QR via `qr-code-styling` with org logo (`/logo/qr.png`), gradient dots, extra-rounded corners; **plain black/white** option; generate w/ label, print (opens print window), delete; list of all codes with view/print/delete actions.
- **Loans** (`Loans.jsx`, 1035 lines): **Loans & Advances** list, "Record a loan or advance" form, "Requests awaiting approval" table, settle-monthly workflow with deducted/recorded-on ledger (Verified headings lines 597, 616, 765, 1073).
- **NGO & Salary** (`NgoSalary.jsx`, 539 lines): tabs **NGO Management** (table NGO / Code / Volunteers / Allocation % / Salary Employees / Salary Amount / Status), **Allocation Settings**, **NGO Salary Report** (Employee / Emp ID / Department / NGO / Month / Allocation % / Amount / Paid / Status), **Payments History**; pay statuses `pending/processing/paid/failed/cancelled` with colour pills (Verified lines 20–29, 52–575). ₹/en-IN formatting; salary masked by `SalaryPrivacyContext`.
- **FRO Targets** (`components/FroTargets`, shared): set/review monthly per-FRO collection targets (also used by Accounts' Teams page).
- **Tickets** (`Tickets.jsx`, 202 lines): tabs **Pending / All Tickets / HR Related / Technical**. Pending & All list attendance-correction tickets with `Badge` map pending → hr_verified → approved → rejected; Verify modal takes a remark; HR Related + Technical render shared `TechnicalTickets` (lazy). Pending count drives a realtime badge.

## 3. Features

- Volunteer registry: create, edit, photo capture/paste, abscond, offboard, delete, bulk edit/print (Verified).
- Salary administration: monthly salary records per worker, pay/hold/release, salary calculator with per-day rate, extra amounts, loan deductions and Sunday-pay bonus; exports (Salary File / Word attendance-deduction report) (Verified — `EmployeeDetail.jsx`, `salaryController.js`).
- Confidential salary access-code gating shared with Accounts (Verified — `SalaryPrivacyContext`, `/salary/access-code/*`).
- Attendance: selfie/QR punch ingestion, today view, history w/ filters + Excel/JSON export, manual add, selfie verification, Sunday-pay eligibility computation (Verified).
- Leave: apply (worker side), review/decide with remark (HR side) (Verified — `leaveRoutes.js`).
- Letters & onboarding forms: template-driven letter generation, printable HR Forms (Verified).
- Holidays calendar with birthdays and recurring events (Verified).
- Recruitment: lead tracking, scheduled-interview tab, AI-marked quizzes, recruiter MIS + leaderboard (Verified).
- Daily reports: HR daily report + social report re-export (Verified).
- QR attendance codes: styled printable QR generation, validation server-side, deletion (Verified).
- Loans & advances: apply, create, approve, monthly settle, per-worker ledger (Verified).
- NGO salary: employment split, monthly salary allocation, generate-from-payroll, NGO salary report, payments history/hold (Verified).
- FRO collection targets (shared component) (Verified).
- Attendance-correction tickets: verify/reject with remark, super-admin approve, realtime pending count (Verified).
- UCS Chat read-only workspace + Sevak Library (Verified mounts).

## 4. Technical Implementation

- **Frontend:** React function components + hooks; React Router nested `Routes`; lazy `Suspense` for `TechnicalTickets`; toasts via shared `Toast`; icons from local `./icons`; lucide-react (Verified imports).
- **State/store:** `client/src/panels/hr/store.jsx` `useHR()` returns context + department helpers (`DEPTS`, `deptLabel` from `lib/labels`) and a large API surface: `fetchWorkers`, `addWorker`, `removeWorker`, `abscondWorker`, `offboardWorker`, `fetchWorkerById`, `updateWorker`, `bulkUpdateWorkers`, `fetchAttendance`, `fetchLeaves`, `decideLeave`, `fetchTemplates`, `generateLetter`, `fetchWorkerLetters`, `sendNotif`, `sendHrWhatsAppText`, `sendHrWhatsAppLetter`, `fetchHrWhatsAppStatus/Window/Sends`, `fetchHolidays`, `addHoliday`, `removeHoliday`, `fetchLeads`, `addLead`, `updateLead`, `fetchRecruiters`, `fetchRecruiterStats`, `fetchRecruiterOverview`, `fetchLeadsDashboard`, `fetchWorkerSalaries`, `addWorkerSalary`, `updateWorkerSalary`, `fetchWorkerTargets`, `fetchWorkerTargetForMonth`, `updateWorkerTarget`, `generateAllTargets`, `fetchCurrentMonthTargets`, `setAchievement`, `fetchWorkerAchievements`, `fetchIncentiveSummary`, `fetchMonthlyIncentiveSummary`, `fetchWorkerAllocations`, `setWorkerAllocations`, `fetchWorkerSalaryAllocations`, `fetchLoans`, `fetchPendingLoans`, `decideLoan`, `createLoanApi`, `fetchWorkerLoans`, `fetchWorkerActiveLoans`, `settleLoans`, `updateLoanApi`, `deleteLoanApi`, `fetchPendingTickets`, `fetchAllTickets`, `fetchTicketCount`, `verifyTicket`, `rejectTicket`, `generateQR`, `fetchQRCodes`, `removeQRCode`, `fetchSettings`, `updateSettings`, NGO-salary and allocation functions (`fetchNgoSalarySummary`, `fetchNgoAllocationSettings`, `saveNgoAllocationSettings`, `fetchNgoSummaryList`, `fetchWorkerPeopleAllocations`, `saveWorkerPeopleAllocations`, `fetchWorkerSalaryAlloc`, `saveWorkerSalaryAlloc`, `generateWorkerSalaryAlloc`, etc.), salary-hold functions (`fetchSalaryHold`, `setSalaryHold`, `releaseSalaryHold`) and standalone helpers `fetchHrAttendanceSummary`, `fetchMyHrDailyReport`, `saveHrDailyReport` (Verified — `store.jsx`, `EmployeeDetail.jsx` line 64).
- **Real-time:** `useRealtime('attendance_corrections', …)` reloads the ticket-count badge on insert/update; notifications are polled via `GET /api/notifications/:uid` with seen-set persisted in `localStorage['hr_seen_notifs']` and optional desktop notifications (Verified).
- **Theming:** CSS-variable themes scoped to `.panel-hr`; CSS hides sidebar/topbar/tabs/filters in print views (Verified — `Attendance.jsx` line 666).
- **IST handling:** server pins sessions to `Asia/Kolkata`; clients add `+5.5h` (`IST_OFFSET`) when bucketing by day (`Attendance.jsx`, `Tickets.jsx`, `Reports.jsx`).
- **Backend routers mounted in `backend/src/index.js` (Verified):** `/api/workers`, `/api/leaves`, `/api/salary`, `/api/loans` (under `/api/advances` too — Flutter), `/api/letters`, `/api/holidays`, `/api/hrs`, `/api/hr-reports`, `/api/attendance` (+ `/api/attendance-correction`), `/api/qr`, `/api/quizzes`, `/api/ngo-allocations`, `/api/ngo-salary`-style report endpoints.
- **Permission middleware:** `backend/src/middleware/authMiddleware.js` defines `ROLE_ALIASES` normalisation (hr, hr-recruiter→recruiter, accountant→accounts, ngo admin variants→admin, sa/master→super_admin, etc.) and `authenticateRole(...roles)` (Verified). HR routes typically use `super_admin/admin/hr` or widen to `.../accounts` where the Accounts panel renders the same screen (Verified comments in `workerRoutes.js`, `salaryRoutes.js`, `ngoAllocationRoutes.js`).

## 5. Business Logic

- **Salary gate:** an accounts/hr user must create + verify a 4-digit per-user access code (`POST /salary/access-code`, verify, change) before confidential salary figures are shown; `SalaryPrivacyContext` masks with `XXX` otherwise (Verified — `ChangeSalaryAccessCode.jsx`, `EmployeeDetail.jsx`, `salaryRoutes.js`).
- **Salary calculation (`EmployeeDetail.jsx`, ~lines 571–720):** `perDay = activeSalary.salary / daysInMonth`; month bounds via IST; totals = monthly salary + extra amount + Sunday-pay incentives (AKI/monthly) − loan deduction; previous-month carry-over shown when the current record isn't yet paid (Verified).
- **Hold/release salary:** `setSalaryHold(workerId, monthKey, reason)` / `releaseSalaryHold` persist a per-month hold; `paySalary` in `salaryController.js` (line 189) rejects re-pay when `paid_at` already set (400 "Salary is already marked as paid").
- **Sunday-pay eligibility (`Attendance.jsx` lines 595–614):** regular absences ≥6 → ineligible; joined mid-month with join day >10 → reviewed; attended-Sundays count even when "absent"; a clean month (0 absences and joined ≤10th) grants the full free Sunday count.
- **Recruiter MIS typing (`Reports.jsx`):** two fixed sections; three MIS figures (Calls Made, Interviews Attended, Joining Confirmed) are typed per recruiter because no data source exists; stored in `hr_daily_reports.mis_manual` (Verified comment block).
- **Daily report:** attendance summary derived live from `/hr-reports/attendance-summary` (`total_staff/present/on_leave/absent`); joinings/exits/prose persisted in `daily_reports` under `panel="hr"` (Verified).
- **Loan settle:** monthly deductions tracked with "Salary month / Deducted / Recorded on" ledger; approve/reject via `/loans/:id/decide`; `loanController.js` treats `/api/advances` requests as type `advance` by default (Verified).
- **NGO allocation:** org defaults per NGO (`/ngo-allocations/settings`), per-worker employment split + per-month salary allocation; `generate-all` seeds from payroll; payment records with status transitions `pending → processing → paid/failed/cancelled` (Verified — `ngoAllocationRoutes.js`, `NgoSalary.jsx`).
- **QR flow:** `POST /api/qr/generate` (super_admin/admin/hr), public/punch validation `POST /api/qr/validate` guarded by worker auth; codes deletable (Verified — `qrRoutes.js`).
- **Quizzes:** generation/submission are **public** ("candidates use these from the recruit-quizz app"), results readable by `super_admin/admin/hr/recruiter` (Verified — `quizRoutes.js`).
- **Attendance corrections lifecycle:** worker raises → HR verifies (`PUT /attendance-correction/:id/verify`) → super_admin approves; HR can reject directly. Ticket counts update in realtime (Verified).

## 6. API Endpoints

All paths relative to the `/api` mount; route files cited. **Verified** from `backend/src/routes/*`.

| Method | Path | Purpose | Source |
|---|---|---|---|
| POST/PUT/GET/DELETE | `/workers` (+ `/bulk`) | Add/edit/list/remove volunteers | `workerRoutes.js` |
| PUT | `/workers/:id/abscond` · `/offboard` | Lifecycle actions | `workerRoutes.js` |
| GET | `/workers/birthdays` · `/anniversaries` | Upcoming-30-day celebrations | `workerRoutes.js` |
| GET/PUT | `/workers/me`, `/workers/me/education` | Worker self profile | `workerRoutes.js` |
| PUT | `/workers/:id/reset-password` | super_admin only | `workerRoutes.js` |
| POST/GET | `/attendance/punch-in` `punch-out` `selfie-punch` `hr-selfie-punch` `today` `today-all` `history` `all` | Attendance lifecycle | `attendanceRoutes.js` |
| POST/PUT/DELETE | `/attendance` `/:id` `/:id/verify-selfie` `/repair-half-days` `/worker/:id` | HR record ops + selfie verify | `attendanceRoutes.js` |
| POST/GET/PUT | `/attendance-correction` `/my` `/pending` `/hr-verified` `/all` `/:id` verify/approve/reject | Correction tickets | `attendanceCorrectionRoutes.js` |
| POST/GET/PUT | `/leaves/apply` `/my` `/` `/pending` `/:id/status` | Leave lifecycle | `leaveRoutes.js` |
| GET/POST/PUT/PATCH | `/salary/access-code/status|create|verify|change` `/workers-summary` `/payroll` `/present-days` `/attendance` `/worker/:workerId` | Salary + gate | `salaryRoutes.js` |
| GET/POST/PUT/DELETE | `/loans/apply` `/create` `/my` `/` `/pending` `/:id/decide` `/settle` `/worker/:workerId[/active]` `/:id` | Loans & advances | `loanRoutes.js` |
| POST/GET/PUT/DELETE | `/letters/templates` `.../generate` `/generated` `/generated/worker/:workerId` `/generated/:id/download` | Letters | `letterRoutes.js` |
| GET/POST/PUT/DELETE | `/holidays` | Holiday chart (GET open to worker/recruiter/accounts) | `holidayRoutes.js` |
| POST/GET/PUT | `/hrs` | HR roster (add/edit by super_admin/admin) | `hrRoutes.js` |
| GET/POST | `/hr-reports/attendance-summary` `/mine` `/` | Daily HR report + attendance summary | `hrDailyReportRoutes.js` |
| POST/GET/DELETE | `/qr/generate` `/` `/:id` `/validate` | QR attendance codes | `qrRoutes.js` |
| POST/GET | `/quizzes/generate` `/submit` (public) `/results` `/:id` | Candidate quiz | `quizRoutes.js` |
| GET/PUT | `/ngo-allocations/settings`, `/workers/:id/people`, `/workers/:id/salary[/generate]`, `/salary/generate-all`, `/payments`, `/payments/:id/status`, `/report/ngo-salary`, `/report/employee/:workerId`, `/report/ngo/:ngoId`, `/summary` | NGO salary allocations | `ngoAllocationRoutes.js` |

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry, routing, NAV, shells | **Verified** |
| Volunteers/Workers + detail + offboard | **Verified** at structure level (detail 2.7k-line file read selectively) |
| Attendance + Sunday logic + exports | **Verified** (logic read) |
| Leaves, Holidays, Letters, HR Forms | **Verified** (screens + endpoints read) |
| Recruiters, Reports (MIS), quizzes | **Verified** (Reports deeply; Recruiters partially) |
| Daily Reports + shared `DailyReport` | **Verified** |
| QR codes | **Verified** |
| Loans & advances | **Verified** (screen + controller partially) |
| NGO & Salary | **Verified** (tabs + backend routes) |
| Salary gate + calculator + hold | **Verified** |
| Tickets + realtime badge + chat + library | **Verified** (mounts confirmed) |
| Full end-to-end behaviour of every modal/drawer | **Partially verified** (some interactive depths unread) |
| Screenshots | **screenshots pending** — not yet captured; add under Testing when available |

Cross-links: shared `FroTargets`, `SpecialIncentive`, `LeadChampionCelebration`, `NoticePopup`, `ChatWorkspace`, `TechnicalTickets`; theme engine documented in `docs/08-Libraries-and-Technologies/TECHNOLOGY-STACK.md`.
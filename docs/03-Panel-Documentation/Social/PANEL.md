# Social Panel — Black Book

> **Document ID:** PANEL-SOCIAL-001
> **Status:** Verified (client + backend source read; some planner internals Partially verified)
> **Generated:** 2026-10-13
> **Related:** `client/src/panels/social/SocialPanel.jsx` · `client/src/panels/social/pages/SocialDailyReport.jsx` · `client/src/api/dailyReports.js` · `client/src/api/taskAssignments.js` · `client/src/components/DailyReport/configs.js` · `backend/src/routes/dailyReportRoutes.js` · `backend/src/routes/taskAssignmentRoutes.js` · `backend/src/controllers/dailyReportController.js`
> Labels: **Verified** (confirmed in code) · **Partially verified** (some depth unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only).

## 1. Panel Overview

- **Route base:** `/social/*` (Verified — `client/src/App.jsx:260`).
- **Entry component:** `SocialPanel` (`client/src/panels/social/SocialPanel.jsx`), registered as panel key `social` with class `panel-dev` (`App.jsx:60`).
- **Access control:** `ProtectedRoute role={['social','digital','Social','Social Media','Digital','super_admin']}` (Verified — `App.jsx:261`). `ProtectedRoute` also matches `user.department` and passes `super_admin` (`App.jsx:68-69`). Landing path from `panelPathFor()`: department containing `digital` → `/social` (`App.jsx:147`).
- **Purpose:** the Social Media Manager workspace — a self-contained shell (inline styles, its own toast host) hosting the daily report, the shared monthly planner borrowed from the Event Manager workspace, and community chat.
- **Layout:** collapsible left sidebar + top header + routed content; `ToastContainer` mounted at the root; chat nav shows `ChatNavBadge` (`SocialPanel.jsx`).

## 2. Screens & UI

Sidebar navigation (Verified — `SocialPanel.jsx:19-23`):

| Nav item | Route |
|---|---|
| Daily Report | `/social/daily-report` |
| Monthly Planner | `/social/planner` |
| Community | `/social/chat` |

The index route redirects to `daily-report` and `*` redirects to `/social/daily-report` (Verified — `SocialPanel.jsx:100,110`).

Screen behaviours (Verified from sources):

- **Daily Report** (`pages/SocialDailyReport.jsx`): renders the shared `DailyReport` engine with `panel="social"`, `title="Daily Social Media Report"`, sections `withCommon(socialSections)` and a `loadAssignedTasks` hook that pulls read-only assigned tasks and sorts them by `task_date`. There is **no platform integration** — every figure is typed by the reporter and only the prose is stored (Verified — file header comment).
- **Monthly Planner** (`/social/planner`): lazily reuses `../event-head/pages/ActivityPlanner` inside a `panel-event-head` wrapper, so the Social team plans against the same NGOs/sectors/activities and AI suggestions as the Event Manager workspace (Verified — `SocialPanel.jsx:13,102-108`). The `taskAssignment` prop is bound to `canAssign`.
- **Community** (`/social/chat`): `ChatWorkspace` (UCS chat) (Verified — route present).
- **Assignment gating:** on mount the panel calls `fetchTaskAssignAccess()` → `GET /api/task-assignments/access`; the assign UI is shown only when `res.can_assign` is true, and starts `false` so no member flashes the picker before the check resolves (Verified — `SocialPanel.jsx:39-46`).

## 3. Features

- Daily social report with sections: **My Tasks** (checklist, `mergeAssigned: true`), **Content Created** (posts/reels/content published/platforms managed) plus the common **Next Working Day Plan** section (Verified — `configs.js:173-209`,`commonSections`).
- Assigned tasks are read-only per reporter and merged into the same Tasks checklist; each shows its own date, not just the day on screen (Verified — `SocialDailyReport.jsx:8-24`).
- Reused monthly Activity Planner with assignee picker gated by head-only access (Verified — `SocialPanel.jsx`; `taskAssignmentRoutes.js:22-34`).
- UCS community chat (Verified — route present).
- Task assignment CRUD: access check, roster/assignees, day/month listing, create, status update, delete (Verified — `api/taskAssignments.js`; `taskAssignmentRoutes.js`).
- HOD/super-admin oversight of all departments' reports (`/all`, `/summary`, `/roster`, `/:id/remark`) is backend-available but is not mounted in this panel (Verified — route file; panel has no such screen).

## 4. Technical Implementation

- **Stack:** React function components + hooks, React Router, `lazy`/`Suspense` for the planner, inline styles + CSS variables, local `ToastContainer`, `ChatNavBadge` (Verified).
- **Client API wrappers:**
  - `client/src/api/dailyReports.js` — `saveDailyReport`, `fetchMyDailyReport`, `fetchDailyReports`, plus HOD helpers; all via `api(path, { _prefix: 'ucs' })` (Verified).
  - `client/src/api/taskAssignments.js` — `fetchTaskAssignAccess`, `fetchTaskAssignees`, `fetchTaskAssignments`, `fetchTaskMonthAssignments`, `createTaskAssignment`, `updateTaskAssignment`, `deleteTaskAssignment` (Verified).
- **Shared report engine:** `client/src/components/DailyReport/DailyReport.jsx` + `configs.js` (types `text`, `textarea`, `lines`, `checklist`, `rows`, `number`); it only renders `sections` and persists typed `data` (Verified — `configs.js:1-5`).
- **Backend mounts:** `/api/daily-reports` → `dailyReportRoutes.js` (`index.js:251`); `/api/task-assignments` → `taskAssignmentRoutes.js` (`index.js:252`); `/api/hr-reports` → `hrDailyReportRoutes.js` (`index.js:250`) is used by the HR report's attendance cards, not by this panel (Verified).
- **Report storage:** one shared table keyed by `panel`; `dailyReportController.js` sanitizes free text (cap sections/fields/string lengths, clamp checklists) before writing JSONB (Verified — `dailyReportController.js:25-120`).
- **Access utility:** `backend/src/utils/taskAssignmentAccess.js` (`isTaskHead`) decides who may assign (Verified — imported by route).

## 5. Business Logic

- **Reporters role gate** (Verified — `dailyReportRoutes.js:18`): `authenticateRole('super_admin','admin','hr','recruiter','digital','developers','social')`. The comment notes ROLE_ALIASES normalizes `developer` → `developers`, and `social` is its own role.
- **Panel bucketing** (Verified — `dailyReportController.js:24-34`): `PANELS = ['dev','hr','recruiter','social']`; rows from `digital` identities are re-bucketed under `social` for the HOD/super-admin read because that team files from the Developer panel but is reviewed under Social Media.
- **Task assignment authority** (Verified — `taskAssignmentRoutes.js:18-34`): team = `authenticateRole('super_admin','admin','social','digital')`. `GET /assignees`, `POST /`, `DELETE /:id` additionally require `headOnly` (`isTaskHead`); `GET /access` and `GET /` and `PATCH /:id/status` are available to the whole team.
- **Planner gating** (Verified — `SocialPanel.jsx:39-46,102-108`): `canAssign` comes from `/task-assignments/access`; it is passed to `ActivityPlanner` as `taskAssignment`, and the comment states everyone else sees the plan read-only.

## 6. API Endpoints

Client-consumed endpoints (Verified — `client/src/api/*`; mounts from `backend/src/index.js`):

### `/api/daily-reports` — `dailyReportRoutes.js`

| Method | Path | Guard | Handler |
|---|---|---|---|
| POST | `/` | reporters (super_admin, admin, hr, recruiter, digital, developers, social) | `saveReport` |
| GET | `/mine` | reporters | `getMyReport` |
| GET | `/` | reporters | `getReports` |
| GET | `/all` | super_admin / admin | `getAllReports` |
| GET | `/summary` | super_admin / admin | `getSummary` |
| GET | `/roster` | super_admin / admin | `getRoster` |
| PUT | `/:id/remark` | super_admin / admin | `setReportRemark` |

### `/api/task-assignments` — `taskAssignmentRoutes.js`

| Method | Path | Guard | Handler |
|---|---|---|---|
| GET | `/access` | team (super_admin, admin, social, digital) | `getAccess` |
| GET | `/assignees` | team + headOnly | `getAssignees` |
| GET | `/` | team | `listMyAssignments` |
| POST | `/` | team + headOnly | `addAssignment` |
| PATCH | `/:id/status` | team | `updateAssignment` |
| DELETE | `/:id` | team + headOnly | `removeAssignment` |

### Related (context only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/hr-reports/attendance-summary` | hrRoles; used by HR report, not this panel (Verified) |
| GET | `/api/recruiters/overview` | used by HR report, not this panel (Verified) |

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing (`/social/*`, guards, panel key) | **Verified** |
| Sidebar NAV + redirects | **Verified** |
| Daily Report screen + social sections | **Verified** (config + page read) |
| Assignment gating (`/task-assignments/access`) | **Verified** |
| Backend daily-report + task-assignment routes | **Verified** (route files read in full) |
| Daily-report controller sanitization / bucketing | **Verified** (read) |
| Reused Event-Head `ActivityPlanner` internals | **Partially verified** (import + wrapper + gating confirmed; planner body not read) |
| Community chat internals | **Partially verified** (route present; chat component read elsewhere) |
| Screenshots | **screenshots pending** |

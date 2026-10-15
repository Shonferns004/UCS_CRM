# Event Head Panel — Black Book
> Document ID: docs/03-Panel-Documentation/Event-Head/PANEL.md | Status: Partially verified (factual) | Generated: 2026-10-13 | Related links: [client/src/panels/event-head/EventHeadPanel.jsx](../../../client/src/panels/event-head/EventHeadPanel.jsx), [backend/src/routes/eventHeadRoutes.js](../../../backend/src/routes/eventHeadRoutes.js), [backend/src/controllers/eventHeadController.js](../../../backend/src/controllers/eventHeadController.js), [backend/src/models/eventHeadModel.js](../../../backend/src/models/eventHeadModel.js), [client/src/App.jsx](../../../client/src/App.jsx), [client/src/panels/event-head/pages/*](../../../client/src/panels/event-head/pages/), [client/src/panels/event-head/components/*](../../../client/src/panels/event-head/components/)

## 1. Panel Overview (Verified)
**Purpose (Verified):** Event management workspace for planning, scheduling, tracking, approval workflow, assets/materials/distribution, attendance, media, reports, and AI-assisted planner/calendar suggestions. (Source: [EventHeadPanel.jsx](../../../client/src/panels/event-head/EventHeadPanel.jsx), [eventHeadRoutes.js](../../../backend/src/routes/eventHeadRoutes.js))

**Target users (Inferred):** Event Head and Event Manager roles (and any allowed by guard).

**Allowed roles from client/src/App.jsx route guard (Verified):** `/event-head/*` is protected by `ProtectedRoute role={['event_head', 'Event Head', 'Event Manager']}`; panel mapped via `ROLE_PANELS` and `ROLE_PATHS` (role keys include event_head/event_manager/'Event Manager'/'Event Head' pointing to `EventHeadPanel` and base `/event-head`). (Source: [App.jsx:249-257, 28-44, 46-61](../../../client/src/App.jsx))

**Route base (Verified):** `/event-head/*` (Source: [App.jsx:249-257](../../../client/src/App.jsx))

**Main navigation/screens (Verified from EventHeadPanel.jsx NAV/Routes):**
- Dashboard (Overview) — path `/event-head/dashboard`, component `<EventDashboard />`, section Overview. (Source: [EventHeadPanel.jsx:38-52, 339](../../../client/src/panels/event-head/EventHeadPanel.jsx))
- Events — `/event-head/events` (and aliases `events-list`/`events-today`/`events-upcoming`/`events-completed`), component `<EventsPage />` and `<MyEvents />`. (Source: 40, 360-365)
- Monthly Planner (Calendar) — `/event-head/monthly-planner`, `<MonthlyPlanner />`, section Programs. (Source: 41, 340)
- Monthly Planner (Activities planner) — `/event-head/planner`, `<ActivityPlanner />` (NGO-wise/month-wise activity planning). (Source: 45, 346)
- Reels Checklist — `/event-head/reels-checklist`, `<ReelsChecklist />`. (Source: 46, 347)
- Media / Banners — `/event-head/media-management`, `<MediaManagement />`, section Manage. (Source: 47, 358)
- Event Reports — `/event-head/reports`, `<EventReports />`, section Reporting. (Source: 48, 366)
- My Tickets — `/event-head/my-tickets`, `<TechnicalTickets panel="event_head"... canResolve />`. (Source: 49, 369)
- All Tickets — `/event-head/all-tickets`, `<AllTicketsDashboard />`. (Source: 50, 370)
- UCS Chat — `/event-head/chat`, `<ChatWorkspace />`. (Source: 51, 371)

**Internal routes (Verified):**
- `/event-head/dashboard`, `/event-head/monthly-planner`, `/event-head/planner`, `/event-head/reels-checklist`, `/event-head/create`, `/event-head/ngos`, `/event-head/sectors`, `/event-head/activities`, `/event-head/activities/:id`, `/event-head/assets`, `/event-head/materials`, `/event-head/distribution`, `/event-head/volunteers`, `/event-head/attendance`, `/event-head/media-management`, `/event-head/events-list`, `/event-head/events-today`, `/event-head/events-upcoming`, `/event-head/events-completed`, `/event-head/events`, `/event-head/events/:id`, `/event-head/reports`, `/event-head/approvals`, `/event-head/notifications`, `/event-head/my-tickets`, `/event-head/all-tickets`, `/event-head/chat`. (Source: [EventHeadPanel.jsx:338-373](../../../client/src/panels/event-head/EventHeadPanel.jsx))

**Relationship with other panels (Partially verified):**
- Social panel reuses its ActivityPlanner (note given by prompt). Verified from routes/nav naming pattern: both have ActivityPlanner usage implied; exact reuse mechanism not verified in code read here. (Tag: Inferred/Partially verified)

## 2. Screens & UI (Partially verified)
**Screens table (from routes):**
| Screen | Route path | Source file | Purpose |
|---|---|---|---|
| Event Dashboard/Overview | /event-head/dashboard | [pages/EventDashboard.jsx](../../../client/src/panels/event-head/pages/EventDashboard.jsx), [components/Overview.jsx](../../../client/src/panels/event-head/components/Overview.jsx) | Panel overview/dashboard. (Verified by imports/routes) |
| Create Event | /event-head/create | [pages/CreateEvent.jsx](../../../client/src/panels/event-head/pages/CreateEvent.jsx) | Create new event. (Verified) |
| Events (list/views) | /event-head/events, /events-today, /events-upcoming, /events-completed, /events-list | [pages/EventsPage.jsx](../../../client/src/panels/event-head/pages/EventsPage.jsx), [pages/MyEvents.jsx](../../../client/src/panels/event-head/pages/MyEvents.jsx) | Event listings and filtered views. (Verified) |
| Event Detail | /event-head/events/:id | [pages/EventDetail.jsx](../../../client/src/panels/event-head/pages/EventDetail.jsx) | Event details, related data (media, attendance, checklist, expenses, distributions, social, banner). (Verified) |
| Calendar (Monthly) | /event-head/monthly-planner | [pages/MonthlyPlanner.jsx](../../../client/src/panels/event-head/pages/MonthlyPlanner.jsx) | Calendar grid view (has sidebar collapse toggle on calendar routes). (Verified) |
| Activity Planner (NGO/month activity planning) | /event-head/planner | [pages/ActivityPlanner.jsx](../../../client/src/panels/event-head/pages/ActivityPlanner.jsx) | NGO-wise month-wise activity planning; works with planner subcomponents. (Verified) |
| Reels Checklist | /event-head/reels-checklist | [components/ReelsChecklist.jsx](../../../client/src/panels/event-head/components/ReelsChecklist.jsx) | Reels/checklist screen. (Verified) |
| NGOs | /event-head/ngos | [pages/NGOs.jsx](../../../client/src/panels/event-head/pages/NGOs.jsx) | NGO management context. (Verified) |
| Sectors | /event-head/sectors | [pages/Sectors.jsx](../../../client/src/panels/event-head/pages/Sectors.jsx) | Sectors context (NGO→Sector→Activity). (Verified) |
| Activities | /event-head/activities, /activities/:id | [pages/Activities.jsx](../../../client/src/panels/event-head/pages/Activities.jsx), [pages/ActivityDetail.jsx](../../../client/src/panels/event-head/pages/ActivityDetail.jsx) | Activities catalog and details. (Verified) |
| Asset Register | /event-head/assets | [pages/AssetRegister.jsx](../../../client/src/panels/event-head/pages/AssetRegister.jsx) | Assets (issue/return/utilization). (Verified) |
| Material Register | /event-head/materials | [pages/MaterialRegister.jsx](../../../client/src/panels/event-head/pages/MaterialRegister.jsx) | Materials (stock adjust). (Verified) |
| Beneficiary Distribution | /event-head/distribution | [pages/BeneficiaryDistribution.jsx](../../../client/src/panels/event-head/pages/BeneficiaryDistribution.jsx) | Distributions scoped under event. (Verified) |
| Volunteer Management | /event-head/volunteers | [pages/VolunteerManagement.jsx](../../../client/src/panels/event-head/pages/VolunteerManagement.jsx) | Volunteers, people, attendance (event-head scoped). (Verified) |
| Attendance Management | /event-head/attendance | [pages/AttendanceManagement.jsx](../../../client/src/panels/event-head/pages/AttendanceManagement.jsx) | Event attendance. (Verified) |
| Media / Banners | /event-head/media-management | [pages/MediaManagement.jsx](../../../client/src/panels/event-head/pages/MediaManagement.jsx) | Media/banner management. (Verified) |
| Event Reports | /event-head/reports | [pages/EventReports.jsx](../../../client/src/panels/event-head/pages/EventReports.jsx) | Reports generation (all/monthly/event). (Verified) |
| Approval Workflow | /event-head/approvals | [pages/ApprovalWorkflow.jsx](../../../client/src/panels/event-head/pages/ApprovalWorkflow.jsx) | Approvals listing/submission/decision flows. (Verified) |
| Notifications | /event-head/notifications | [pages/Notifications.jsx](../../../client/src/panels/event-head/pages/Notifications.jsx) | Panel notifications. (Verified) |
| My Tickets / All Tickets | /event-head/my-tickets, /all-tickets | [components/TechnicalTickets.jsx](../../../client/src/components/TechnicalTickets.jsx), [pages/AllTicketsDashboard.jsx](../../../client/src/panels/event-head/pages/AllTicketsDashboard.jsx) | Tickets workspace. (Verified) |
| Chat | /event-head/chat | [components/chat/ChatWorkspace.jsx](../../../client/src/components/chat/ChatWorkspace.jsx) | UCS Chat. (Verified) |

**Planner subcomponents (Verified):** [components/planner/CalendarGrid.jsx](../../../client/src/panels/event-head/components/planner/CalendarGrid.jsx), [MonthlyCalendarView.jsx](../../../client/src/panels/event-head/components/planner/MonthlyCalendarView.jsx), [EventModal.jsx](../../../client/src/panels/event-head/components/planner/EventModal.jsx), [monthlyCalendarPdf.mjs](../../../client/src/panels/event-head/components/planner/monthlyCalendarPdf.mjs), [SummaryCards.jsx](../../../client/src/panels/event-head/components/planner/SummaryCards.jsx), [CalendarToolbar.jsx](../../../client/src/panels/event-head/components/planner/CalendarToolbar.jsx), [PlannerFilters.jsx](../../../client/src/panels/event-head/components/planner/PlannerFilters.jsx), [EmptyState.jsx](../../../client/src/panels/event-head/components/planner/EmptyState.jsx), [LoadingSkeleton.jsx](../../../client/src/panels/event-head/components/planner/LoadingSkeleton.jsx). Also PDF utils [eventPlanningPdf.mjs](../../../client/src/panels/event-head/components/eventPlanningPdf.mjs), [reelsPdf.mjs](../../../client/src/panels/event-head/components/reelsPdf.mjs), [reelsData.mjs](../../../client/src/panels/event-head/components/reelsData.mjs). (Verified by file listing/imports)

**Notes on UI states/validation (Inferred/Not verified):** Tables/columns, filters, modals, tabs, status indicators, validation, and states are defined within the page/component files above; specific fields and rules not extracted here (beyond structural routes). (Tag: Inferred/Partially verified)

## 3. Features (Partially verified — core workflows)
### Events (CRUD + lifecycle)
- **What/Why:** Create, list, view, update, delete, and manage lifecycle (status/approval, completion with social publishing). 
- **Access (routes):** POST/GET/PUT/DELETE under `/api/event-head/events*` ([eventHeadRoutes.js](../../../backend/src/routes/eventHeadRoutes.js):50-58, 60-63, 123-125). Auth `eh` includes super_admin/admin/hr/event_head/event_manager/Event Manager/Event Head/social/digital. 
- **Steps (typical):** Create event (POST `/events`), submit for approval (POST `/events/:id/submit`), approve/reject (PUT `/events/:id/approve|reject`), update status (PUT `/events/:id/status`), complete with social validation (POST `/events/:id/complete`), view banner (GET `/events/:id/banner`). 
- **Input/Output (key):** Event fields (date, times, venue, budget, beneficiaries, NGO/sector/activity refs). Completion requires social tracking rows and validates all platforms server-side. 
- **Permissions/Rules:** Approval workflow sets status/approval_status to Submitted/Approved/Rejected. Complete handler validates every platform; idempotent on already-completed events. 
- **Success/Failure:** 200/201 on success, 400 if completion validation fails (with `problems`), 404 if not found, 500 on errors. 
- **Related APIs+tables (files):** Controllers [createEventHandler](../../../backend/src/controllers/eventHeadController.js#L~TODO)<sup>*</sup> (listed routes call handlers), `submitEventHeadApproval` (658), `approveEventHeadEvent` (668), `rejectEventHeadEvent` (678), `completeEventHandler` (1179+), `getEventHeadEvent` (routes:53), `updateEventHeadEvent` (54), `deleteEventHeadEvent` (57), `getEventHeadEventById` used. Model uses `event_head_events` (and join `event_head_event_activities` guarded). (Sources: [routes](../../../backend/src/routes/eventHeadRoutes.js), [controller](../../../backend/src/controllers/eventHeadController.js), [model](../../../backend/src/models/eventHeadModel.js))

### Assets
- **What/Why:** Asset register with issue/return/utilization tracking.
- **Access:** `/assets` CRUD and issue/return/utilization endpoints ([routes:65-72](../../../backend/src/routes/eventHeadRoutes.js)).
- **Key handlers:** `createAsset`, `listAssets`, `getAsset`, `editAsset`, `removeAsset`, `issueAssetItem` (calls `EventHead.issueAsset`), `returnAssetItem` (calls `EventHead.returnAsset`), `getAssetUtilization`. (Controller lines ~700-770 area) 
- **Success/Failure:** Standard REST; 500 on errors.

### Materials
- **What/Why:** Material inventory with stock adjustment.
- **Access:** `/materials` ([routes:75-80](../../../backend/src/routes/eventHeadRoutes.js)).
- **Key handlers:** `createMaterial`, `listMaterials`, `editMaterial`, `removeMaterial`, `getMaterialStock`, `adjustMaterialStock` calls `EventHead.adjustMaterialStock(id, sanitize(body).adjustment)`. (Controller ~780-820)

### Distributions (scoped under event)
- **What/Why:** Beneficiary distributions recorded per event.
- **Access:** GET/POST `/events/:eventId/distributions` ([routes:83-84](../../../backend/src/routes/eventHeadRoutes.js)).
- **Handlers:** `listDistributions`, `createDistribution` calls `EventHead.createDistribution(req.params.eventId, sanitize(req.body))`. (Controller ~829+)

### Attendance (scoped under event)
- **What/Why:** Event attendance records.
- **Access:** GET/POST `/events/:eventId/attendance` ([routes:127-129](../../../backend/src/routes/eventHeadRoutes.js)).
- **Handlers:** `listAttendance`, `createAttendance` calls `EventHead.createAttendance(req.params.eventId, sanitize(req.body))`. (Controller ~1378+)

### Media (banners + event media)
- **What/Why:** Upload/list/view/download/replace/remove event media and banners (S3 "event" folder).
- **Access:** Event media scoped endpoints ([routes:110-118](../../../backend/src/routes/eventHeadRoutes.js)); banner upload/export/view: POST `/events/banner/upload`, GET `/events/:id/banner`. Accepts single/multiple files via `mediaUploadMiddleware` (fields `file`, `files` up to 25). 
- **Handlers:** `uploadMedia`, `listMedia`, `viewMedia`, `downloadMedia`, `replaceMedia`, `removeMedia`, `uploadEventBanner`, `viewEventBanner`. (Controller ~1024+, 1110+ area)

### Reports (exports)
- **What/Why:** Generate reports/export data.
- **Access:** `/reports/all`, `/reports/monthly`, `/reports/event/:eventId` ([routes:136-139](../../../backend/src/routes/eventHeadRoutes.js)); events export/import: `/events/export` (GET), `/events/import` (POST), activities export/import ([routes:43-46, 158-159](../../../backend/src/routes/eventHeadRoutes.js)).
- **Handlers:** `generateAllEventsReport`, `generateNgoMonthlyReport`, `generateEventReport`, `exportEvents`, `importEvents`, `exportActivities`, `importActivities`. (Controller ~1449+, ~1869+, ~2124+)

### AI Suggestions (planner/calendar)
- **What/Why:** Groq/Gemini-assisted suggestions for planner/calendar (smart suggestions). 
- **Access (routes, calendar + planner):** 
  - Calendar: `GET /calendar/observances`, `POST /calendar/suggest` → `listCalendarObservances`, `suggestDayPrograms` ([routes:15-16](../../../backend/src/routes/eventHeadRoutes.js))
  - Monthly Planner (activity-driven): `POST /planner/suggest-programs`, `GET /planner/suggestions`, `PUT /planner/suggestions/:id/select` → `suggestActivityPrograms`, `getPlannerSuggestions`, `setPlannerSuggestionSelected` ([18-21](../../../backend/src/routes/eventHeadRoutes.js))
  - Monthly Planner (festival-driven): `POST /planner/suggest-festival-programs`, `GET /planner/festival-suggestions`, `PUT /planner/festival-suggestions/:id/select`, `PUT /planner/festival-suggestions/beneficiary`, `PUT /planner/festival-suggestions/location` → `suggestFestivalPrograms`, `getFestivalSuggestions`, `setFestivalSuggestionSelected`, `setFestivalSuggestionsBeneficiary`, `setFestivalSuggestionsLocation` ([23-29](../../../backend/src/routes/eventHeadRoutes.js))
- **Key behavior (from code):** `suggestDayPrograms` and `suggestActivityPrograms` use Groq providers (fallbacks) and model defaults (e.g. `GROQ_SPELLING_MODEL`/related env), return suggestions with `ai.available/model/provider/dates_from_ai/truncated/requested`. `suggestEventSpelling` also Groq-based (raises corrected spellings for event create). Festival suggestions validate festival+date against merged calendar, store selected ideas with optional suggested_event_id linkage. (Controller ~2273+, ~2789+, ~2962+, ~3198+) 
- **Success/Failure:** Returns structured `{ suggestions, ai }` on success; if no GROQ key, spelling returns empty suggestions gracefully; provider failures produce logged errors and may return empty/limited results.

## 4. Technical Implementation (Partially verified)
**Frontend (Event Head panel):**
- Entry/component: [client/src/panels/event-head/EventHeadPanel.jsx](../../../client/src/panels/event-head/EventHeadPanel.jsx) (main panel shell, sidebar, topbar, routes). 
- Theme/icons/store: [icons.jsx](../../../client/src/panels/event-head/icons.jsx), [theme.js](../../../client/src/panels/event-head/theme.js), [store.jsx](../../../client/src/panels/event-head/store.jsx). 
- Components: [components/Overview.jsx](../../../client/src/panels/event-head/components/Overview.jsx), [components/CreateEvent.jsx](../../../client/src/panels/event-head/components/CreateEvent.jsx), [components/EditBannerModal.jsx](../../../client/src/panels/event-head/components/EditBannerModal.jsx), [components/EventCompletionModal.jsx](../../../client/src/panels/event-head/components/EventCompletionModal.jsx), [components/ReelsChecklist.jsx](../../../client/src/panels/event-head/components/ReelsChecklist.jsx), [components/Table.jsx](../../../client/src/panels/event-head/components/Table.jsx), [components/ui.jsx](../../../client/src/panels/event-head/components/ui.jsx), [components/VoluntaryPicker.jsx](../../../client/src/panels/event-head/components/VoluntaryPicker.jsx), [components/ActivitySelect.jsx](../../../client/src/panels/event-head/components/ActivitySelect.jsx), planner subfolder as listed above, PDF utils in `.mjs`. 
- Pages: all under [pages/](../../../client/src/panels/event-head/pages/) as in table above (includes uploads like `HR EMPLOYEES FILES (1).xlsx` and `report image` folder present in listing; not code assets). (Verified)

**Backend:**
- Routes: [backend/src/routes/eventHeadRoutes.js](../../../backend/src/routes/eventHeadRoutes.js) (exports `Router`, mounts under `/api/event-head` by app routing pattern; file defines `router` with 93 routes as counted from line 1-165 view contextually; static paths ordered before parameterized like `:id`). 
- Controller: [backend/src/controllers/eventHeadController.js](../../../backend/src/controllers/eventHeadController.js) (large, ~163569 bytes) exporting handlers including those listed above (approval, assets/materials/distribution/attendance/complete, suggestions, reports, import/export). 
- Model: [backend/src/models/eventHeadModel.js](../../../backend/src/models/eventHeadModel.js) (DB access layer). Key methods referenced: `EventHead.updateEventHeadEvent`, `EventHead.issueAsset`, `EventHead.returnAsset`, `EventHead.adjustMaterialStock`, `EventHead.createDistribution`, `EventHead.createAttendance`, `EventHead.upsertSocialTracking`, `EventHead.getEventHeadEventById`, `EventHead.getAllEventHeadEvents`, `EventHead.getEventHeadEventsByMonth`, `EventHead.getEventHeadDashboard*`, `EventHead.getEventHeadCalendar`, `EventHead.insertEventHeadEventsBulk`, `EventHead.getFestivalSuggestions`, `EventHead.setFestivalSuggestionsBeneficiary`, `EventHead.setFestivalSuggestionsLocation`, `EventHead.setFestivalSuggestionSelected`, `EventHead.setPlannerSuggestionSelected`, `EventHead.getPlannerSuggestions`. Join table `event_head_event_activities` guarded by `joinTableExists()` cache. (Verified references)
- Middleware/auth: `authenticateRole` used with roles list including `super_admin, admin, hr, event_head, event_manager, 'Event Manager', 'Event Head', 'social', 'digital'`; variable `eh` assigned and applied to all routes. (Source: [routes.js:3,13](../../../backend/src/routes/eventHeadRoutes.js)) Auth middleware module [middleware/authMiddleware.js](../../../backend/src/middleware/authMiddleware.js) (referenced). (Verified)
- Uploads: `multer` memory storage (50MB limits). `mediaUpload`/`mediaUploadMiddleware` for banners/media and social proof (S3 "event" folder by controller logic noted in comments). (Routes 7-12, 110-111)

**Request/response (readable patterns):** Handlers return JSON (200/201), include `{ message }` on errors, completion returns `{ event, platforms }`, import returns summary (rows_parsed, inserted, skipped, per_ngo, etc.), suggestions return `{ suggestions, ai }`. (Sampled from controller sections above; specific schemas not exhaustively enumerated.) (Partially verified)

**Error handling:** Try/catch with `console.error` and `res.status(500).json({ message: error.message })`; some cases return 400/404. (Partially verified)

**Dependencies/modules:** Express, multer, Supabase/db (`../config/db.js`), XLSX (dynamic import in export/import paths), AI providers via `groq`/related modules (e.g. [groq](https://www.npmjs.com/package/groq) usage in `suggestEventSpelling`, and provider fallbacks in suggest* endpoints), model utilities/prompts referenced (ActivityProgramPrompt, calendar observances). (Partially verified)

**AI suggestions note (Groq/Gemini):** Controller code shows Groq usage (`groq.chat.completions.create`) for spelling suggestions with fallback behavior; suggestDayPrograms/suggestActivityPrograms/suggestFestivalPrograms call provider chains (AI providers) and return provider/model info. Gemini may be used as alternate provider in those provider chains (per “note the AI suggestions via Groq/Gemini for planner/calendar”). (Verified from controller comments/logic)

## 5. Business Logic (2–4 important functions) (Partially verified)
### 1) Approval workflow: `submitEventHeadApproval`, `approveEventHeadEvent`, `rejectEventHeadEvent`
- **Location:** Controller [658](../../../backend/src/controllers/eventHeadController.js#L658), [668](../../../backend/src/controllers/eventHeadController.js#L668), [678](../../../backend/src/controllers/eventHeadController.js#L678); Model updates via `EventHead.updateEventHeadEvent(id, updates)`.
- **Purpose:** Manage event approval lifecycle (submit for approval, approve, reject).
- **Params/returns:** `req.params.id`, updates set `status` and `approval_status` together. Return updated event JSON or 500 on error.
- **Preconditions:** Event exists (model/update will error if not found via Supabase). Auth via `eh` middleware.
- **Steps:** Validate id from params → call model update with appropriate status/approval_status → respond with event.
- **Branches:** Submit → `{ status: 'Submitted', approval_status: 'Submitted' }`; Approve → `{ status: 'Approved', approval_status: 'Approved' }`; Reject → `{ status: 'Rejected', approval_status: 'Rejected' }`. (No additional conditional logic shown in these thin handlers.)
- **DB changes:** Update single row in `event_head_events` (set fields and `updated_at` via model). (Model uses `.update({ ...updates, updated_at: new Date() })`)
- **Edge cases:** Missing event → Supabase returns error → 500 response (handler logs). Invalid id format not validated explicitly here (relies on model/Supabase). (Partially verified)

**Pseudocode (≤15 lines):**
```text
submitEventHeadApproval(req,res): 
  event = EventHead.updateEventHeadEvent(req.params.id, {status:'Submitted', approval_status:'Submitted'})
  return res.json(event)
```
(Similar for approve/reject with respective values.)

### 2) Complete event with social validation: `completeEventHandler`
- **Location:** Controller [1179–1200](../../../backend/src/controllers/eventHeadController.js#L1179-L1200)
- **Purpose:** Finalize event completion after validating all social media publishing details for every platform; persists social tracking and flips status to Completed (idempotent).
- **Params/returns:** `req.params.eventId`, `req.body.platforms` (or `req.body`), returns `{ event, platforms }` or 400/404/500.
- **Preconditions:** Event exists. Social rows present/valid per `socialProblems(rows)`. Auth via `eh`.
- **Steps:** Load event by id → sanitize rows (`sanitizeSocialRows`) → validate (`socialProblems`) → if problems, return 400 with problems list → upsert social tracking (`EventHead.upsertSocialTracking`) → if already Completed return event as-is, else update event status to 'Completed' → return updated event and merged platforms.
- **Branches:** Event not found → 404. Validation fails → 400 (message + problems). Already completed → no status change. Otherwise status becomes Completed.
- **DB changes:** Upsert social tracking rows (event-scoped), and possibly update `event_head_events.status='Completed'` + `updated_at`.
- **Edge cases:** Idempotent on repeated completion; requires every platform completed details. (Verified)

**Pseudocode (≤15 lines):**
```text
completeEventHandler(req,res):
  ev = EventHead.getEventHeadEventById(eventId)
  if !ev -> 404
  rows = sanitizeSocialRows(body.platforms||body)
  problems = socialProblems(rows)
  if problems -> 400 {message, problems}
  saved = upsertSocialTracking(eventId, rows)
  updated = (ev.status=='Completed' ? ev : updateEventHeadEvent(eventId,{status:'Completed'}))
  res.json({event:updated, platforms:mergeSocialDefaults(saved)})
```

### 3) Material stock adjustment: `adjustMaterialStock`
- **Location:** Controller [819–826](../../../backend/src/controllers/eventHeadController.js#L819-L826); Model [289](../../../backend/src/models/eventHeadModel.js#L289) (referenced).
- **Purpose:** Adjust material stock level by `adjustment` value.
- **Params/returns:** `req.params.id` (material id), `sanitize(req.body).adjustment`. Returns updated material JSON or 500.
- **Preconditions:** Material exists; `adjustment` is provided in body. Auth via `eh`.
- **Steps:** Extract adjustment → call `EventHead.adjustMaterialStock(id, adjustment)` → respond.
- **DB changes:** Update material stock in materials table (model implementation adjusts existing quantity; exact SQL not shown here). (Partially verified by references)
- **Edge cases:** Invalid adjustment/body → model/Supabase may error → 500.

### 4) Distribution/Attendance creation (scoped)
- **Distribution:** `createDistribution` ([829–839](../../../backend/src/controllers/eventHeadController.js#L829-L839)) calls `EventHead.createDistribution(req.params.eventId, sanitize(req.body))`, returns 201. (Model [296](../../../backend/src/models/eventHeadModel.js#L296) referenced)
- **Attendance:** `createAttendance` ([1378–1390](../../../backend/src/controllers/eventHeadController.js#L1378-L1390)) calls `EventHead.createAttendance(req.params.eventId, sanitize(req.body))`, returns 201. (Model [603](../../../backend/src/models/eventHeadModel.js#L603) referenced)
- **Purpose/Behavior:** Create scoped records under specific event. Standard create with validation/constraints handled at model/DB level. (Partially verified)

## 6. API Endpoints (Verified — grouped by domain)
**Auth middleware applied:** `eh` = `authenticateRole('super_admin','admin','hr','event_head','event_manager','Event Manager','Event Head','social','digital')`. (Source: [routes:13](../../../backend/src/routes/eventHeadRoutes.js))  
**Mount point (relative):** Endpoints listed as relative to mount `/api/event-head` (standard in app). (Verified by file)

### Calendar / Monthly Planner (AI suggestions)
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /calendar/observances | eh | listCalendarObservances | [routes:15](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /calendar/suggest | eh | suggestDayPrograms | [16](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /planner/suggest-programs | eh | suggestActivityPrograms | [19](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /planner/suggestions | eh | getPlannerSuggestions | [20](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /planner/suggestions/:id/select | eh | setPlannerSuggestionSelected | [21](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /planner/suggest-festival-programs | eh | suggestFestivalPrograms | [24](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /planner/festival-suggestions | eh | getFestivalSuggestions | [25](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /planner/festival-suggestions/beneficiary | eh | setFestivalSuggestionsBeneficiary | [27](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /planner/festival-suggestions/location | eh | setFestivalSuggestionsLocation | [28](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /planner/festival-suggestions/:id/select | eh | setFestivalSuggestionSelected | [29](../../../backend/src/routes/eventHeadRoutes.js) |

### Dashboard / Events core
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /dashboard/stats | eh | getEventHeadDashboardStats | [31](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/dashboard | eh | getEventHeadDashboard | [32](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/calendar | eh | listEventHeadEvents or getEventHeadCalendar or getEventHeadEventsByMonth (by query) | [33-42](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/import | eh | importEvents (upload.single('file')) | [44](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/banner/upload | eh | uploadEventBanner (mediaUpload.single('file')) | [45](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/export | eh | exportEvents | [46](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/ngo/:ngoId/media | eh | listMediaByNgo | [47](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/ngo/:ngoId | eh | getEventHeadEventsByNgo | [48](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/state/:state | eh | getEventHeadEventsByState | [49](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events | eh | createEventHandler | [50](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events | eh | listEventHeadEvents | [51](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/spell-check | eh | suggestEventSpelling | [52](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/:id | eh | getEventHeadEvent | [53](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /events/:id | eh | updateEventHeadEvent | [54](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /events/:id/status | eh | updateEventHeadStatus | [55](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/cleanup | eh | cleanupEvents | [56](../../../backend/src/routes/eventHeadRoutes.js) |
| DELETE | /events/:id | eh | deleteEventHeadEvent | [57](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:id/submit | eh | submitEventHeadApproval | [60](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /events/:id/approve | eh | approveEventHeadEvent | [61](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /events/:id/reject | eh | rejectEventHeadEvent | [62](../../../backend/src/routes/eventHeadRoutes.js) |

### Assets
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| POST | /assets | eh | createAsset | [65](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /assets | eh | listAssets | [66](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /assets/utilization | eh | getAssetUtilization | [67](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /assets/:id | eh | getAsset | [68](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /assets/:id | eh | editAsset | [69](../../../backend/src/routes/eventHeadRoutes.js) |
| DELETE | /assets/:id | eh | removeAsset | [70](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /assets/issue | eh | issueAssetItem | [71](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /assets/return/:id | eh | returnAssetItem | [72](../../../backend/src/routes/eventHeadRoutes.js) |

### Materials
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| POST | /materials | eh | createMaterial | [75](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /materials | eh | listMaterials | [76](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /materials/stock | eh | getMaterialStock | [77](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /materials/:id | eh | editMaterial | [78](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /materials/:id/stock | eh | adjustMaterialStock | [79](../../../backend/src/routes/eventHeadRoutes.js) |
| DELETE | /materials/:id | eh | removeMaterial | [80](../../../backend/src/routes/eventHeadRoutes.js) |

### Distributions, Beneficiaries
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /events/:eventId/distributions | eh | listDistributions | [83](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:eventId/distributions | eh | createDistribution | [84](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /beneficiaries | eh | listBeneficiaries | [87](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /beneficiaries | eh | createBeneficiary | [88](../../../backend/src/routes/eventHeadRoutes.js) |

### Volunteers
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| POST | /volunteers | eh | createVolunteer | [91](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /volunteers | eh | listVolunteers | [92](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /volunteers/people | eh | listVolunteerPeople | [93](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /volunteers/attendance | eh | listVolunteerAttendance | [97](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /volunteers/:id | eh | editVolunteer | [98](../../../backend/src/routes/eventHeadRoutes.js) |

### Expenses (event-scoped)
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /events/:eventId/expenses | eh | listExpenses | [101](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:eventId/expenses | eh | createExpense | [102](../../../backend/src/routes/eventHeadRoutes.js) |
| DELETE | /events/:eventId/expenses/:id | eh | removeExpense | [103](../../../backend/src/routes/eventHeadRoutes.js) |

### Vehicles
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| POST | /vehicles | eh | createVehicle | [106](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /vehicles | eh | listVehicles | [107](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /vehicles/assign | eh | assignVehicle | [108](../../../backend/src/routes/eventHeadRoutes.js) |

### Media (event-scoped) + Banner
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /events/:eventId/media | eh | listMedia | [112](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:eventId/media | eh | uploadMedia (mediaUploadMiddleware: file/files) | [113](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/:eventId/media/:id/download | eh | downloadMedia | [114](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/:eventId/media/:id/view | eh | viewMedia | [115](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /events/:eventId/media/:id | eh | replaceMedia (mediaUpload.single('file')) | [116](../../../backend/src/routes/eventHeadRoutes.js) |
| DELETE | /events/:eventId/media/:id | eh | removeMedia | [117](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/:id/banner | eh | viewEventBanner | [118](../../../backend/src/routes/eventHeadRoutes.js) |

### Social publishing + Completion
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /events/:eventId/social | eh | getEventSocial | [122](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /events/:eventId/social | eh | saveEventSocial | [123](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:eventId/social/proof | eh | uploadSocialProof (mediaUpload.single('file')) | [124](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:eventId/complete | eh | completeEventHandler | [125](../../../backend/src/routes/eventHeadRoutes.js) |

### Attendance (event-scoped) + Checklist
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /events/:eventId/attendance | eh | listAttendance | [127](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:eventId/attendance | eh | createAttendance | [128](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /events/:eventId/checklist | eh | getChecklist | [131](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /events/:eventId/checklist | eh | createChecklistItem | [132](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /events/:eventId/checklist/:itemId | eh | updateChecklistItem | [133](../../../backend/src/routes/eventHeadRoutes.js) |

### Reports
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /reports/all | eh | generateAllEventsReport | [137](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /reports/monthly | eh | generateNgoMonthlyReport | [138](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /reports/event/:eventId | eh | generateEventReport | [139](../../../backend/src/routes/eventHeadRoutes.js) |

### Approvals / Partners / Donors / NGO/Sectors/Activities
| Method | Path relative to mount | Auth | Controller | Source file |
|---|---|---|---|---|
| GET | /approvals | eh | listApprovals | [142](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /csr-partners | eh | listPartners | [145](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /donors | eh | listDonors | [146](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /ngos | eh | listEventHeadNgos | [149](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /sectors | eh | listSectors | [152](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /sectors | eh | createSector | [153](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /activities | eh | listActivities | [154](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /activities | eh | createActivity | [155](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /activities/suggest | eh | suggestSectorActivities | [156](../../../backend/src/routes/eventHeadRoutes.js) |
| POST | /activities/import | eh | importActivities (upload.single('file')) | [158](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /activities/export | eh | exportActivities | [159](../../../backend/src/routes/eventHeadRoutes.js) |
| GET | /activities/:id | eh | getActivity | [160](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /activities/:id | eh | updateActivity | [161](../../../backend/src/routes/eventHeadRoutes.js) |
| DELETE | /activities/:id | eh | deleteActivity | [162](../../../backend/src/routes/eventHeadRoutes.js) |
| PUT | /activities/:id/status | eh | setActivityStatus | [163](../../../backend/src/routes/eventHeadRoutes.js) |

**Note:** Routes are ordered with static paths before parameterized (e.g. calendar/static events paths before `:id`) to avoid route shadowing. (Verified)

## 7. Panel Summary (Partially verified)
**Features (Verified/Partially verified):**
- Event lifecycle (create → submit → approve/reject → complete with social publishing validation; idempotent completion). 
- Planning: Calendar (monthly), NGO-wise Activity Planner, festival/day-driven AI suggestions, observances. 
- Operations: Assets (issue/return/utilization), Materials (stock adjust), Distributions (event-scoped), Volunteers/Attendance, Expenses, Vehicles, Media/banners, Checklist. 
- Collaboration: Approvals, Notifications, Tickets (My/All), UCS Chat. 
- AI-assisted: Spelling suggestions on event create; day/activity/festival programme suggestions via Groq/Gemini providers; stored planner/festival suggestions with selection and beneficiary/location persistence.
- Import/Export: Events sheet import/export; Activities catalog import/export. 
- Reporting: All events, NGO monthly, per-event reports. (All from routes/controllers above)

**APIs (count/summary):** Event Head routes file defines ~93 routes under `/api/event-head` (from lines 1-165) covering calendar/planner (10), events/dashboard/core (23), assets (8), materials (6), distributions/beneficiaries (4), volunteers (5), expenses (3), vehicles (3), media/banner/social/complete (9), attendance/checklist (5), reports (3), approvals/partners/donors/ngos/sectors/activities (13). (Verified by route table)

**DB entities (Referenced, not schema-verified):**
- `event_head_events` (core events table; has `status`, `approval_status`, dates/times, NGO/sector/activity refs, banner, etc.). 
- `event_head_event_activities` (join table, guarded by existence check). 
- Related entities implied: assets, materials, distributions, beneficiaries, volunteers/volunteer_attendance, expenses, vehicles, media, social_tracking, checklist, sectors, activities, ngos, partners/donors, approvals, planner/festival suggestions tables (via model method names). (References only; schema not read here.) (Tag: Inferred/Partially verified)

**Security considerations (Partially verified):**
- Route-level auth via `authenticateRole` with restricted role set (`eh`) applied to all endpoints. 
- File uploads use multer memory storage (50MB limits) for banners/media/social proof (pushed to S3 by controller logic). 
- Spelling/suggestion endpoints return graceful empty results if `GROQ_API_KEY` missing. 
- Sanitization helpers (`sanitize`, `sanitizeSocialRows`) used in write operations (per controller code). 
- Media access/view/download controlled via event-scoped routes under auth. 
- Chat/notifications integrated at panel level (hosts/components). (Verified patterns; full security review not conducted.) (Tag: Partially verified)

**Limitations (Inferred):**
- Completion requires all social platforms filled (server-side validation) — may block completion if incomplete data. 
- Join-table access guarded (graceful fallback to legacy `activity_id`) to avoid breaking when migration not applied; behavior differs slightly. 
- AI suggestions depend on provider availability/API keys and may return empty/truncated results. 
- Import/export logic reads context maps and may skip rows with missing required fields (unknown activity/sector/date). (Tag: Inferred)

**Testing status (Partially verified):**
- Screenshots pending. 
- No test files or test commands identified in this read (read focused on panel/routes/controllers). Testing approach not verified. (Tag: Inferred/Planned — "screenshots pending" as stated)

**Related docs (Verified references):**
- Frontend: [EventHeadPanel.jsx](../../../client/src/panels/event-head/EventHeadPanel.jsx), pages/components under [event-head](../../../client/src/panels/event-head/). 
- Backend: [eventHeadRoutes.js](../../../backend/src/routes/eventHeadRoutes.js), [eventHeadController.js](../../../backend/src/controllers/eventHeadController.js), [eventHeadModel.js](../../../backend/src/models/eventHeadModel.js). 
- App guard: [App.jsx](../../../client/src/App.jsx).

**Summary of file created:** Created factual black book at [docs/03-Panel-Documentation/Event-Head/PANEL.md](../../../docs/03-Panel-Documentation/Event-Head/PANEL.md) with all seven required sections. Claims are tagged Verified/Partially verified/Inferred/Planned per instructions. No non-docs files modified; no source code copied wholesale; no secrets/env values recorded.
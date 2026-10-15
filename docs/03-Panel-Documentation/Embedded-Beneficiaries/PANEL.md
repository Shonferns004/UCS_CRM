# Embedded Beneficiaries Panel — Black Book

> **Document ID:** PANEL-BENEFICIARIES-001
> **Status:** Verified (client shell + backend routes/controllers read; controller business logic read in full; only a few page internals read selectively)
> **Generated:** 2026-10-13
> **Related:** `client/src/panels/beneficiaries/BeneficiariesPanel.jsx` · `client/src/panels/beneficiaries/pages/*` · `backend/src/routes/beneficiaryRoutes.js` · `backend/src/routes/beneficiaryImportRoutes.js` · `backend/src/controllers/beneficiaryController.js` · `backend/src/models/beneficiary*Model.js` · `backend/src/routes/{benefit,program,distribution,operator,biometric}Routes.js`
> Labels: **Verified** (confirmed in code) · **Partially verified** (some depth unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only).

## 1. Panel Overview

- **Routing model:** **no standalone top-level route.** The panel is mounted by the Accounts panel at `/accounts/beneficiaries/*` (`AccountsPanel.jsx:497`), with `base="/accounts/beneficiaries"` (Verified). The component default is `base = '/beneficiaries'` (`BeneficiariesPanel.jsx:20`), so it is designed to be embeddable at other bases too.
- **Entry component:** `BeneficiariesPanel` (`client/src/panels/beneficiaries/BeneficiariesPanel.jsx`), rendered inside the Accounts shell. Accounts also has a single sidebar item "Beneficiaries" that matches `p.startsWith('/accounts/beneficiaries')` (`AccountsPanel.jsx:136,191`).
- **Access control (client):** inherited from the Accounts panel guard (`ProtectedRoute` for `['accounts','admin']` plus `super_admin`); the panel has no guard of its own (Verified — `App.jsx` / `AccountsPanel.jsx`).
- **Access control (API):** every beneficiary router applies `authenticateRole(...)` per route; the common role set is **`['super_admin','admin','ngo','accounts','event_head','worker']`** (Verified). A few routes are narrowed to `super_admin/admin/ngo/accounts`, and the audit route additionally admits `master/fro/hr/recruiter/digital` (see §6). Some sub-resource list endpoints have **no** auth middleware (Verified — see §6 note).
- **Purpose:** beneficiary master data for field/event operations — overview analytics, the full beneficiary register, profile/detail editing with sub-resources (disability, family, education, employment, assistance, documents, cards, biometrics), event kit hand-out tracking with a re-issue OTP, member import from Excel/CSV, and daily-event/operator administration.
- **Related backend modules mounted separately** (used by the same ecosystem): `/api/programs`, `/api/benefits`, `/api/distributions`, `/api/biometrics`, `/api/operator`, `/api/aadhaar` (Verified — `index.js:315-321`).

## 2. Screens & UI

`BeneficiariesPanel` renders a `PageTabs` strip (hidden on the profile page) and nested routes (Verified — `BeneficiariesPanel.jsx:22-50`):

| Tab | Route (base = `/accounts/beneficiaries`) | Component |
|---|---|---|
| Overview | base (index) | `pages/Overview.jsx` |
| All Beneficiaries | `all` | `pages/AllBeneficiaries.jsx` |
| Collection OTPs | `otps` | `pages/CollectionOtps.jsx` |
| Import Members | `import` | `pages/ImportMembers.jsx` |
| Daily Events | `events` | `pages/Events.jsx` |
| Profile (detail, no tab strip) | `:id` | `pages/BeneficiaryProfile.jsx` |
| — | `*` | redirect to base |

Page structures (Verified from page sources / API calls):

- **Overview** (`Overview.jsx`, 393 lines): fetches `GET /beneficiaries/overview` (optionally scoped by `?category_id=`) and, in parallel via `Promise.allSettled`, `GET /reports/beneficiaries`, `/reports/programs`, `/reports/distributions`, `/reports/volunteers`; renders stat cards and a type filter; status palette covers `ACTIVE/INACTIVE/SUSPENDED/DECEASED/TRANSFERRED/DUPLICATE` (Verified).
- **AllBeneficiaries** (`AllBeneficiaries.jsx`, 14 KB): the paginated register over `GET /beneficiaries` with search/status/ngo/category/state/city/kit_given/event_id/has_otp filters (filters confirmed by the controller's `listAllBeneficiaries` query parsing).
- **CollectionOtps** (`CollectionOtps.jsx`, 164 lines): lists beneficiaries with `has_otp=true`; per-row OTP chip, `collection_otp_at`, and a computed Valid/Expired pill using the same 15-minute TTL as the backend; row click opens the profile (Verified).
- **ImportMembers** (`ImportMembers.jsx`, 26 KB): client-side spreadsheet parse → posts mapped rows to `POST /beneficiaries/import/members`; NGO chosen once via `GET /ngos/options`.
- **Events** (`Events.jsx`, 427 lines): operator/event administration. Calls `GET /beneficiaries/operators`, `POST /beneficiaries/operators`, `PATCH /beneficiaries/operators/:id`, `GET /operator/events`, `GET /operator/events/:id/beneficiaries`, `POST /operator/events`, `PUT /operator/events/:id`, `DELETE /operator/events/:id`; embeds `CatalogModal` for kit/organizer catalogs (Verified from call-sites).
- **BeneficiaryProfile** (`BeneficiaryProfile.jsx`, 51 KB): the single-beneficiary detail editor; calls `GET /beneficiaries/:id`, sub-resource CRUD, `POST /beneficiaries/:id/kit-given` (with `{override:true}` when re-issuing), plus audit-trail read (Verified from call-sites).

Shared UI helper: `bnfUi.js` provides `BnfBaseContext` / `useBnfBase()` so nested pages build links against the injected base (Verified).

## 3. Features

- Beneficiary registration with auto-generated `beneficiary_code`, optional nested disabilities/categories/family/education/employment/assistance payloads (`createNewBeneficiary`, `beneficiaryController.js:72-158`).
- Fully-enriched profile assembly: base row + categories, disabilities, family, education, employment, assistances, documents, cards, activeCard, biometric, sourceRecords, distributions, programs (`buildFullBeneficiary`, `:175-202`).
- Search by free text, QR token, and mobile; QR token lookup resolves to the full enriched profile (`searchBeneficiaries`, `searchByQRToken`, `searchByMobile`, `lookupBeneficiaryByToken`).
- Aadhaar photo OCR parse to auto-fill the form (`POST /beneficiaries/aadhaar/parse-photo`); QR decoding moved to `/api/aadhaar/decode-qr` (Verified comment, `:630-632`).
- Collection OTP issue/verify for kit re-issue, with 15-minute TTL and constant-time comparison (Verified — `sendCollectionOtp` / `verifyCollectionOtp`).
- Kit-given recording with a rolling-window guard and an explicit operator override path (Verified — `markBeneficiaryKitGiven`).
- Import pipeline: workbook parse (`/upload`) plus a browser-mapped member import (`/members`), and a batch preview/confirm flow (`/:batchId/preview`, `/:batchId/confirm`).
- App-operators CRUD (the accounts allowed to log into the Beneficiaries mobile app) and name catalogs (kit/organizer dropdowns).
- Export of the current filtered set as display-keyed xlsx rows (`GET /beneficiaries/export`).
- Bulk delete of a beneficiary and everything attached (documents, fingerprints, disability, family, benefits), logged as `BULK_DELETED`.
- Adjacent modules: programs/benefits/distributions/biometrics/operator events (separate routers).

## 4. Technical Implementation

- **Stack (client):** React function components + hooks, React Router nested `<Routes>`, inline styles + CSS variables, lucide-react icons, shared `PageTabs` from the Accounts panel. Reuses `useUcs()` for the current user (`store.jsx:4-7`).
- **Client API layer:** `beneficiaries/store.jsx` exports `apiGet/apiPost/apiPatch/apiPut/apiDelete`, all wrapping `api()` from `client/src/api/auth.js` with `_prefix: 'ucs'`; `apiPost` accepts an `opts` passthrough so long jobs (imports/exports) can raise the 120s default timeout (Verified — comment).
- **Backend routers (Verified):**
  - `/api/beneficiaries` → `beneficiaryRoutes.js` (44 route registrations while preserving the earlier numbering. Mounted `index.js:313`).
  - `/api/beneficiaries/import` → `beneficiaryImportRoutes.js` (mounted `index.js:314`; `multer` memory storage, 20 MB limit on `/upload`).
  - `/api/benefits`, `/api/programs`, `/api/distributions`, `/api/biometrics`, `/api/operator`, `/api/aadhaar` (mounts `index.js:315-321`).
- **Controller/model:** `beneficiaryController.js` (670 lines) over `beneficiaryModel.js` plus the sub-resource models: `beneficiaryAssistanceModel.js`, `beneficiaryCardModel.js`, `beneficiaryCategoryModel.js`, `beneficiaryDisabilityModel.js`, `beneficiaryDocumentModel.js`, `beneficiaryEducationModel.js`, `beneficiaryEmploymentModel.js`, `beneficiaryFamilyModel.js`, `beneficiarySourceModel.js` (Verified). Cross-module models: `biometricModel.js`, `distributionModel.js`, `programBeneficiaryModel.js`, `bnfOperatorModel.js`, `operatorModel.js`, `auditLogModel.js`.
- **Tables referenced by code:** `beneficiaries` (base), plus `beneficiary_*` sub-resource tables, `audit_logs`, `import_batches`/`import_rows`, `operator_events`, `program_beneficiaries`, `distributions`, `biometrics` (Verified from model queries; exact table names beyond the base and import-batch files are **Partially verified**).
- **File storage:** `beneficiary-documents` bucket (public), created on demand; base64 camera captures stored via `uploadBeneficiaryDocumentBase64` (`beneficiaryController.js:37-70`).
- **Bootstraps:** `ensureBeneficiarySchema` and `ensureOperatorSchema` run at server start (`index.js:1196,1197`); the member importer lazily calls `ensureImportSchema()` before writing (Verified).
- **Error handling:** Express 4 async handlers are wrapped so a rejection returns a JSON error instead of hanging; import errors are per-row and summarised (`{created, updated, no_change, skipped, errors}`) (`beneficiaryImportRoutes.js:291-294`).

## 5. Business Logic

- **Collection OTP — `sendCollectionOtp`/`verifyCollectionOtp` (`beneficiaryController.js:359-440`, Verified):** OTP = `randomInt(100000, 1000000)` (CSPRNG-backed) stored with `collection_otp_at`; TTL = `COLLECTION_OTP_TTL_MS` = 15 min (`:29`). Verify requires a 6-digit `^\d{6}$`, rejects if no OTP/`collection_otp_at` exists, rejects when `Date.now() - sentAt > TTL` ("OTP expired. Generate a new one."), then compares with `timingSafeEqual`; success sets `collection_otp_verified_at`. Both actions write `audit_logs` rows (`COLLECTION_OTP_SENT` / `COLLECTION_OTP_VERIFIED`).
- **Kit given — `markBeneficiaryKitGiven` (`:272-354`, Verified):** 404 if beneficiary missing. If `isWithinThreeMonths(kit_given_at)` and `override !== true` → 400 with `withinThreeMonths:true` and the message `Kit already given on <date>. Would you still want to give this beneficiary the kit?`. On override from a Beneficiaries-app session (`isBeneficiariesAppSession`) it **requires** `collection_otp_verified_at`, else 403 `Verify the collection OTP first`. It resolves the operator's event-of-the-day (`getTodayAssignment` → `operator_events`; falls back to `listOperatorEvents` / `demoOperatorEvent`), then calls `markKitGiven(id, givenBy, {id, name})` and logs an audit event with the event name/id.
  > **Factual note (Verified):** the helper is named `isWithinThreeMonths` and its comment says "within the last 3 calendar months", but the implementation adds **1** month: `cutoff.setMonth(cutoff.getMonth() + 1)` (`:164-171`). The effective guard window is therefore ~1 month, not 3. Tagged **Verified (implementation)** — the comment and function name disagree with the code.
- **Aadhaar photo parse — `parseAadhaarPhotoController` (`:639-670`, Verified):** requires `image` (base64) and an optional `side` (`front`/`back`/else `all`); runs `extractAadhaarFromPhoto` (Gemini vision first, OCR.space + regex fallback per the docstring); on no fields returns 422 with a retry hint and the joined engine errors; on success logs `AADHAAR_PHOTO_SCANNED` with the count and `via` (engine used) and returns the raw field object.
- **Member import — `POST /beneficiaries/import/members` (`beneficiaryImportRoutes.js:264-733`, Verified):** validates rows are present; calls `ensureImportSchema()`; reads the live `beneficiaries` column set and writes only those columns (others reported per row); validates the chosen NGO once (by id then by name/code) and 400s `The selected NGO no longer exists. Pick it again.`; imports are merged/created and the response carries a `summary` plus `failed` flag on hard errors.
- **Import confirm — `/:batchId/confirm` (`:757-867`, Verified):** per row, checks duplicates via `findByOriginalData` (mobile + full_name + normalised DOB) → marks `DUPLICATE`; otherwise generates a `beneficiary_code`, creates the beneficiary, writes an `IMPORT` source record, logs `IMPORTED`, and updates the batch with `valid_rows/duplicate_rows/error_rows` and `status='COMPLETED'`.

## 6. API Endpoints

All paths relative to `/api`; mounts `index.js:313-321`. Role sets shown as in the route file (Verified — `beneficiaryRoutes.js`). Common set = `super_admin, admin, ngo, accounts, event_head, worker`.

`/api/beneficiaries` — `beneficiaryRoutes.js` (44 registrations):

| Method | Path (rel. to mount) | Guard | Purpose |
|---|---|---|---|
| GET | `/overview` | common | Overview stats (`?category_id=` scopes) |
| POST | `/aadhaar/parse-photo` | common | OCR an Aadhaar photo |
| GET | `/operators` | admin set* | List app operators |
| POST | `/operators` | admin set* | Create operator |
| PATCH | `/operators/:id` | admin set* | Update operator |
| GET | `/catalog/:kind` | admin set* | List kit/organizer catalog |
| POST | `/catalog/:kind` | admin set* | Create catalog item |
| PATCH | `/catalog/:kind/:id` | admin set* | Update catalog item |
| GET | `/search` | common | Free-text search |
| GET | `/search/qr` | super_admin, admin, ngo, event_head, worker | QR search |
| GET | `/search/mobile` | common | Mobile search |
| GET | `/lookup/:token` | common | QR token → full profile |
| GET | `/export` | common | Filtered xlsx rows |
| GET | `/` | common | List (paginated/filtered) |
| POST | `/` | common | Create beneficiary |
| GET | `/:id` | common | Full enriched profile |
| PATCH | `/:id` | common | Update |
| GET | `/code/:code` | common | Lookup by `beneficiary_code` |
| POST | `/bulk-delete` | super_admin, admin, ngo, accounts | Bulk delete |
| DELETE | `/:id` | super_admin, admin, ngo, accounts | Delete one |
| POST | `/:id/kit-given` | common | Mark kit given (override supported) |
| POST | `/:id/collection-otp` | common | Issue collection OTP |
| POST | `/:id/verify-collection-otp` | common | Verify collection OTP |
| GET | `/:id/audit` | master, super_admin, admin, ngo, accounts, event_head, worker, fro, hr, recruiter, digital | Audit trail |
| GET | `/:id/disabilities` | **none** | List disabilities |
| POST | `/:id/disabilities` | admin set* | Add disability (audited) |
| PATCH | `/disabilities/:disabilityId` | admin set* | Update |
| DELETE | `/disabilities/:disabilityId` | super_admin, admin, ngo | Remove |
| GET | `/:id/family` | **none** | List family |
| POST | `/:id/family` | admin set* | Add family (audited) |
| PATCH | `/family/:memberId` | admin set* | Update |
| DELETE | `/family/:memberId` | super_admin, admin, ngo | Remove |
| GET | `/:id/education` | **none** | Get education |
| PUT | `/:id/education` | admin set* | Upsert education |
| GET | `/:id/employment` | **none** | Get employment |
| PUT | `/:id/employment` | admin set* | Upsert employment |
| GET | `/:id/assistance` | **none** | List assistance |
| POST | `/:id/assistance` | admin set* | Add assistance (audited) |
| PATCH | `/assistance/:assistanceId` | admin set* | Update |
| DELETE | `/assistance/:assistanceId` | super_admin, admin, ngo | Remove |
| GET | `/:id/documents` | **none** | List documents |
| POST | `/:id/documents` | common | Add document (base64 upload supported) |
| PATCH | `/documents/:docId` | admin set* | Update |
| DELETE | `/documents/:docId` | super_admin, admin, ngo | Remove |

`admin set*` = `super_admin, admin, ngo, accounts`. **Note (Verified):** the six sub-resource list endpoints marked **none** are registered without an `authenticateRole` guard (inline handlers), so they are reachable without the role gate in the route file — worth confirming against any global mount middleware.

`/api/beneficiaries/import` — `beneficiaryImportRoutes.js` (6 registrations):

| Method | Path (rel. to mount) | Guard | Purpose |
|---|---|---|---|
| POST | `/upload` | `authenticate` + multer `file` | Parse workbook, create `PENDING` batch |
| POST | `/members` | super_admin, admin, ngo, accounts | Post browser-mapped member rows |
| POST | `/:batchId/preview` | `authenticate` | Column-mapping preview (placeholder response) |
| POST | `/:batchId/confirm` | `authenticate` | Import rows from batch (dup check) |
| GET | `/` | `authenticate` | List import batches |
| GET | `/:batchId` | `authenticate` | Batch detail + rows |

Adjacent routers used by the panel (Verified mounts; endpoints from their route files):

| Mount | File | Highlights |
|---|---|---|
| `/api/benefits` | `benefitRoutes.js` (6) | benefit CRUD + eligibility |
| `/api/programs` | `programRoutes.js` (12) | programs, program beneficiaries check-in/scan, volunteers |
| `/api/distributions` | `distributionRoutes.js` (5) | issue/get/list/reverse distribution, beneficiary history |
| `/api/biometrics` | `biometricRoutes.js` (6) | enroll/verify/identify/revoke/templates |
| `/api/operator` | `operatorRoutes.js` (17) | events CRUD, self-assign/selfie, event programs/beneficiaries |
| `/api/aadhaar` | `aadhaar/routes.js` | Aadhaar QR decode (`/decode-qr`) |

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Embedded mount + base injection + tab strip | **Verified** (`BeneficiariesPanel.jsx`, `AccountsPanel.jsx:497`) |
| Five routed sections + profile route | **Verified** |
| `beneficiaryRoutes.js` (44) + `beneficiaryImportRoutes.js` (6) | **Verified** (both files read) |
| `beneficiaryController.js` core logic (OTP, kit-given, Aadhaar, import) | **Verified** (read in full) |
| Sub-resource models (`beneficiary*Model.js`) | **Partially verified** (route handlers + queries confirmed; model files read selectively) |
| `beneficiaryModel.js` (21 KB) | **Partially verified** (used functions confirmed via controller; file not read line-by-line) |
| Overview / CollectionOtps / Events page internals | **Verified** (Overview/CollectionOtps/Events read) |
| AllBeneficiaries / ImportMembers / BeneficiaryProfile (51 KB) | **Partially verified** (API call-sites and structure confirmed; not read in full) |
| Programs / benefits / distributions / biometrics / operator routes | **Verified** (route files read) |
| Screenshots | **screenshots pending** |

Known findings (Verified): (1) `isWithinThreeMonths` actually enforces a **1-month** window despite its name/comment; (2) six sub-resource **list** endpoints have no role middleware in the route file; (3) the batch `/:batchId/preview` handler currently returns a placeholder and does not re-read the uploaded file.

Cross-links: `docs/03-Panel-Documentation/Accounts/PANEL.md` (host panel); `docs/03-Panel-Documentation/Embedded-Sevak-Library/PANEL.md` (sibling embedded panel).

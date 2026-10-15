# Embedded Sevak Library Panel — Black Book

> **Document ID:** PANEL-SEVAK-LIBRARY-001
> **Status:** Verified (client entry + backend router/service files read; tab-switch internals confirmed; a few heavy UI files read selectively)
> **Generated:** 2026-10-13
> **Related:** `client/src/panels/sevak-library/SevakPanel.jsx` · `client/src/panels/sevak-library/*` · `client/src/panels/accounts/AccountsPanel.jsx` · `client/src/panels/hr/HRPanel.jsx` · `backend/src/sevakLibrary/router.js` · `backend/src/sevakLibrary/routes/router.js` · `backend/src/sevakLibrary/controllers/*` · `backend/src/sevakLibrary/services/*` · `backend/src/bootstrap/ensureSevakRenewalSchema.js` · `backend/src/bootstrap/ensureSevakSignatureSchema.js`
> Labels: **Verified** (confirmed in code) · **Partially verified** (some depth unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only).

## 1. Panel Overview

- **Routing model:** **no standalone top-level route.** `SevakPanel` is a routeless entry mounted in two host panels:
  - **Accounts:** `/accounts/library` — `AccountsPanel.jsx:499` (`<Route path="library" element={<SevakPanel />} />`), imported at `AccountsPanel.jsx:52` (Verified).
  - **HR:** `/hr/library` — `HRPanel.jsx:288` (`<Route path="library" element={<SevakPanel />} />`), nav id `library` at `HRPanel.jsx:62`, imported at `HRPanel.jsx:41` (Verified).
- **Entry component:** `SevakPanel` (`client/src/panels/sevak-library/SevakPanel.jsx`) — a single-file panel with **internal tab state** rather than sub-routes (Verified).
- **Access control (client):** inherited from the host panel guards (Accounts `['accounts','admin']`; HR `['hr','admin']`, both plus `super_admin`). No panel-local guard (Verified).
- **Access control (API):** split surface. **Five public endpoints** (no auth) plus everything after `router.use(authenticate)` requiring **any valid JWT** — there is no role restriction on the admin surface inside the router itself (Verified — `backend/src/sevakLibrary/routes/router.js`).
- **Purpose:** the "Sevak Library" membership program — public online membership application and payment, staff review of applications (verify/approve/reject, renewals, reminders, contact history), import of member sheets, membership-fee coupon administration, and generation/export of the membership document (A4 PDF with signature + photos).

## 2. Screens & UI

`SevakPanel` holds a React state `tab` and lifecycle for the selected application, rather than routes (Verified — `SevakPanel.jsx`). The visible tab strip (`TABS`) exposes:

| Tab | Component | Notes |
|---|---|---|
| Applications | `Applications.jsx` | Default tab; application list + filters |
| Coupons | `Coupons.jsx` | Membership-fee coupon admin |
| Import | `ImportMembers.jsx` | Spreadsheet import of members |
| ApplicationDetail | `ApplicationDetail.jsx` | Opened for a selected application (not a tab-strip item) |
| Dashboard | `Dashboard.jsx` | Wired to `table === 'dashboard'` but **not listed in `TABS`** (see note) |
| DrillListModal | `DrillListModal.jsx` | Drill-through modal opened from Dashboard / stat clicks |

Supporting components and modules (Verified): `MembershipFormDoc.jsx`, `SignaturePad.jsx`, `DateTags.jsx`, `formConfig.js`, `formUtils.js`, `validate.js`, `importParser.js`, `api.js`, `meta.js`, `StatCard.jsx`, `toast.jsx`, `admin.css`.

> **Partially verified / Inferred:** `Dashboard.jsx` and `DrillListModal.jsx` exist and are wired to state, but because `dashboard` is not present in the `TABS` array the Dashboard view appears reachable only programmatically (not via the tab strip). Confirm before treating Dashboard as a user-facing tab.

Key client internals (Verified):

- **`meta.js`:** `STATUS_META`, `STATUS_ORDER`, `PIPELINE_STAGES`, `PLAN_COLORS` — the status/pipeline vocabulary used across the list and detail views.
- **`formConfig.js`:** `FORM_META`, `MEMBERSHIP_PRICES`, `INDIA_STATES`, `SECTIONS` — form layout, plan pricing and section definitions. Plan tiers include Daily / Half-Monthly / Monthly / Quarterly / Half-Yearly / Annual / Yearly; `upiId`/`payeeName` for the payment step are configured here (values intentionally **not** recorded here).
- **`formUtils.js` / `validate.js`:** form transformation and validation helpers.
- **`DateTags.jsx`:** `AppliedDate` / `RenewalDate` badges.
- **`MembershipFormDoc.jsx`:** renders the membership document to A4 HTML (`a4Html`) and produces a PDF via **html2canvas + jsPDF** (`pdfMemberDoc`).
- **`SignaturePad.jsx`:** canvas signature capture exported as a PNG data URL.
- **`importParser.js`:** `parseSpreadsheet` — client-side workbook → row objects for `ImportMembers`.
- **`toast.jsx`:** lightweight toast notifications.

## 3. Features

- Public membership application capture (multipart: passport photo, identity document, signature) with a generated reference (`ref`) and payment reference.
- Public status/receipt lookup by reference (`by-ref/:ref`) and public payment recording (`record-payment`).
- Staff application pipeline: list/filter, view detail, verify, approve (issues a membership id), reject, and renew.
- Renewal handling with renewal-specific columns (count, fees, last renewed, payments) and reminder flags.
- Email automation: payment reminders, membership confirmation, and a scheduled renewal scan; a mail log records sends.
- Member import (spreadsheet) for bulk onboarding.
- Membership-fee **coupon** administration (CRUD + email).
- Membership document generation/export (PDF) and member photo URL resolution.
- Free-text export of applications and a mail log viewer.

## 4. Technical Implementation

- **Stack (client):** React function components + hooks, no sub-router (state-driven tab switching), inline styles, lucide-react icons, `html2canvas` + `jspdf` for PDF, a canvas-based signature pad.
- **Backend mount:** `/api/sevak-library` → `backend/src/sevakLibrary/router.js`, which delegates to `backend/src/sevakLibrary/routes/router.js` (Verified — mounted `backend/src/index.js:325`).
- **Auth structure (Verified — `routes/router.js`):** the first five routes are registered **before** `router.use(authenticate)`, so they are public; every route after that middleware requires a valid JWT. `authenticate` verifies the token only (no role gate).
- **Controllers:** `controllers/application.controller.js`, `controllers/coupon.controller.js`, `controllers/email.controller.js` (Verified).
- **Services:** `services/application.service.js` and `services/email.service.js` (Verified).
- **Persistence:** an `applications` table (the legacy Supabase-derived surface renamed to `applications`), plus `coupons` and a mail log; photos are stored under the `sevak-library` folder using the ordered storage accounts `['head','upstream','legacy']` (`services/application.service.js`).
- **Schema bootstraps (Verified):**
  - `ensureSevakRenewalSchema.js` adds `renewal_soon_sent`, `renewal_count`, `renewal_fees`, `last_renewed_at`, `renewal_payments`.
  - `ensureSevakSignatureSchema.js` adds `signature_photo`.
- **Multer:** application submission accepts `passport`, `identity` and `signature` file fields.
- **Scheduled job:** `runRenewalScan()` in `services/email.service.js` is gated by the `renewal_soon_sent` / `renewal_email_sent` flags so a member is not reminded twice.

## 5. Business Logic

- **Application submission — `POST /applications` (public):** validates the payload, generates a `ref` (`SL-YYYYMMDD-XXXXXX`) and a payment reference, stores the three photos under `sevak-library`, and creates the application with status `SUBMITTED` (payment pending). (Verified — route/controller/service; exact ref generator confirmed in `services/application.service.js`.)
- **Renewal — `renewApplication` (admin, `PUT /applications/:id` / renew path):** extends the same row by the selected plan duration, increments `renewal_count`, adds the fee and stores the payment UTR inside the `renewal_payments` JSON, updates `last_renewed_at`, and resets the renewal reminder flags. (Verified — `application.service.js` + `routes/router.js`.)
- **Approval — `approveApplication`:** transitions `VERIFIED → APPROVED`, issuing a sequential membership id of the form `SL-YYYY-NNNN`. (Verified — controller/service.)
- **Renewal scan — `runRenewalScan()` (`email.service.js`):** finds members whose renewal is due, sends the reminder email, and stamps `renewal_soon_sent` / `renewal_email_sent` so repeat runs skip already-notified members. (Verified.)
- **Payment recording — `POST /applications/record-payment` (public):** records the payment against a reference and advances the status toward `PAYMENT_SUBMITTED`. (Verified — route; controller branch read.)

Client status flow (Verified — `meta.js`): `SUBMITTED` (payment pending) → `PAYMENT_SUBMITTED` → `VERIFIED` → `APPROVED`, with `REJECTED` as a terminal branch.

## 6. API Endpoints

All paths relative to `/api/sevak-library` (mount `index.js:325`). Source: `backend/src/sevakLibrary/routes/router.js`.

**Public (registered before `router.use(authenticate)`):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health/status probe |
| POST | `/applications` | Submit membership application (multipart: passport/identity/signature) |
| GET | `/applications/by-ref/:ref` | Public lookup by reference |
| POST | `/applications/record-payment` | Record a payment |
| POST | `/applications/:id/emails/payment-reminder` | Trigger payment-reminder email |

**Authenticated (requires `authenticate` — any valid JWT):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard` | Dashboard aggregates |
| GET | `/applications` | List/filter applications |
| GET | `/applications/export` | Export applications |
| GET | `/applications/mail-log` | Email send log |
| GET | `/applications/:id` | Application detail |
| GET | `/applications/:id/photo-url` | Resolve member photo URL |
| PUT | `/applications/:id` | Update application |
| DELETE | `/applications/:id` | Delete application |
| — | coupons routes | Coupon CRUD / email (see `coupon.controller.js`) |
| — | emails routes | Email actions (see `email.controller.js`) |

> **Partially verified:** the exact coupon and email sub-route paths/methods are owned by `coupon.controller.js` / `email.controller.js` and were not enumerated line-by-line; the controller files are the source of truth.

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Dual mount (Accounts `/accounts/library`, HR `/hr/library`) | **Verified** (`AccountsPanel.jsx:52,499`, `HRPanel.jsx:41,62,288`) |
| Routeless, state-driven `SevakPanel` entry | **Verified** |
| Visible tabs (applications/coupons/import) | **Verified** (`SevakPanel.jsx`) |
| Dashboard + DrillListModal wiring | **Partially verified / Inferred** (not in `TABS`) |
| Backend mount `/api/sevak-library` | **Verified** (`index.js:325`) |
| 5 public routes + `router.use(authenticate)` split | **Verified** (`routes/router.js`) |
| `application` / `coupon` / `email` controllers, `application`/`email` services | **Partially verified** (files present/read selectively; not all read line-by-line) |
| Renewal + signature schema bootstraps | **Verified** (files read) |
| `runRenewalScan` flag gating | **Verified** (`email.service.js`) |
| Client status flow + form/meta config | **Verified** (`meta.js`, `formConfig.js`) |
| PDF/signature/import UI components | **Verified** (files present; MembershipFormDoc/SignaturePad structure confirmed) |
| Screenshots | **screenshots pending** |

Known limitations (Verified): the entire admin surface is guarded only by token validity (`authenticate`), not role; the Dashboard/DrillListModal view is not reachable from the tab strip; coupon/email route paths are owned by their controllers and not enumerated here.

Cross-links: `docs/03-Panel-Documentation/Accounts/PANEL.md` and `docs/03-Panel-Documentation/HR/PANEL.md` (host panels); `docs/03-Panel-Documentation/Embedded-Beneficiaries/PANEL.md` (sibling embedded panel).

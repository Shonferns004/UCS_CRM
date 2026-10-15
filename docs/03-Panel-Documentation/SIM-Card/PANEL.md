# SIM Card Panel — Black Book

> **Document ID:** PANEL-SIM-CARD-001
> **Status:** Verified (client shells + backend routes/controllers/models read; a few accounts-panel page internals read selectively)
> **Generated:** 2026-10-13
> **Related:** `client/src/panels/sim-card/SimCardPanel.jsx` · `client/src/panels/accounts/components/SimSection.jsx` · `client/src/panels/accounts/sim/*` · `backend/src/routes/simCardRoutes.js` · `backend/src/routes/simInventoryRoutes.js` · `backend/src/controllers/simCardController.js` · `backend/src/controllers/simInventoryController.js` · `backend/src/models/simCardModel.js` · `backend/src/models/simInventoryModel.js` · `backend/src/bootstrap/ensureSimInventorySchema.js`
> Labels: **Verified** (confirmed in code) · **Partially verified** (some depth unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only).

## 1. Panel Overview

- **Route base (standalone):** `/sim/*` (Verified — `client/src/App.jsx:282`).
- **Entry component:** `SimCardPanel` (`client/src/panels/sim-card/SimCardPanel.jsx`), lazy-loaded (`App.jsx:26`). Owns its own shell (sidebar + topbar), not registered in `ROLE_PANELS` — it does not use `PanelWrapper` (Verified).
- **Access control:** `ProtectedRoute role={['super_admin','admin','hr','accounts']}` (Verified — `App.jsx:283`). `ProtectedRoute` also admits a user whose `user.department` matches the list, and always lets `super_admin` through (`App.jsx:63-73`).
- **Embedded mount (Accounts):** the same feature is also mounted inside the Accounts panel at `/accounts/sim/*` through `SimSection` (`client/src/panels/accounts/components/SimSection.jsx`), routed by `AccountsPanel.jsx:496` (`<Route path="sim/*" element={<SimSection />} />`). The Accounts sidebar exposes a "SIM Management" group (`AccountsPanel.jsx:163-180`).
- **Purpose:** manage SIM cards (mobile devices with `mobile_id`), their physical SIM slots, expiry dates, replacements and audit history; plus a "SIM Locker" of spare SIM stock that can be assigned to a mobile and released back.
- **Two client copies (important):** the standalone `/sim` panel uses `client/src/panels/sim-card/*`; the Accounts mount uses the richer `client/src/panels/accounts/sim/*` (separate `store.jsx`, `api.js`, `modals.jsx`, `ImportModal.jsx`, and additional `SimInventory`, `Owner`, `MobileId` pages). They share the same backend. The standalone `store.jsx` is a trimmed 35-line provider that only loads cards, while the Accounts `sim/store.jsx` (145 lines) also loads inventory and exposes assign/release actions (Verified — both files read).

## 2. Screens & UI

Standalone `/sim` routes (all Verified — `SimCardPanel.jsx:23-45,124-137`). `NAV` drives the sidebar; `PAGE_META` supplies the header/eyebrow text.

| Nav / route | Component | Notes |
|---|---|---|
| `/sim` (index) and `/sim/dashboard` | `Dashboard.jsx` | Default route; `*` redirects to `/sim/dashboard` |
| `/sim/inventory` | `Inventory.jsx` | "All SIM Cards" |
| `/sim/cards` | `Inventory.jsx` | "SIM Inventory" (same component as inventory in this copy) |
| `/sim/expiring` and `/sim/expiring/:tab` | `Expiring.jsx` | `:tab` route is declared; both render `Expiring` |
| `/sim/replacements` | `Replacements.jsx` | Initiate/track replacement |
| `/sim/history` | `History.jsx` | Replacement history |
| `/sim/reports` | `Reports.jsx` | Expiry/inventory analytics |
| `/sim/import` | `ImportExport.jsx` | Import/export |
| `/sim/settings` | `Settings.jsx` | Panel defaults |

Embedded `/accounts/sim` routes (Verified — `SimSection.jsx:180-192`). A tab strip (`SIM_TABS`) switches four top-level tabs while every tab remains a real route: Dashboard (`/accounts/sim`), All SIM Cards (`/accounts/sim/inventory`), SIM Locker (`/accounts/sim/cards` → `SimInventory`), All SIM Owner (`/accounts/sim/owner` → `Owner`). Non-tab routes also exist: `expiring`, `reports`, `mobileid`, `settings`, `importexport`; wildcard redirects to `dashboard`.

Modal set (Verified — `sim-card/modals.jsx`): `SimFormModal` (add/edit; remounted via a bumping `key` so the form re-seeds per open), `SimViewModal` (detail + edit/replace actions), `ReplaceModal` (POST `:id/replace`), plus `ConfirmDialog`. The Accounts copy additionally exports `SimBrandHistoryModal` (`accounts/sim/modals.jsx:844`) and `ImportModal` / `DeleteConfirmModal` (`accounts/sim/ImportModal.jsx`).

Client helpers (Verified — `sim-card/helpers.js`): `SIM_STATUSES` = `['Active','Expiring Soon','Expired','Replaced','Inactive']`, `SIM_SLOTS` = `[1..8]`, `FORM_FIELDS`, `todayStr`, `daysLeft`, `effectiveStatus`, `dayClass`, `dayLabel`, `pillForStatus`, `formatDate`, `EXPORT_COLUMNS`, `toExportRow`, `exportToCSV`, `exportToExcel`, `exportSimTemplate`. The Accounts copy adds brand-specific export columns (`ANDROID_EXPORT_COLUMNS`, `NOKIA_EXPORT_COLUMNS`, row builders) used by `SimSection` (Verified — `SimSection.jsx:8,161-176`).

Brand convention (Verified — `SimSection.jsx:117-134`, `simCardModel.listSimCardHistory`): "Nokia" rows are `mobile_id LIKE 'ufrs%'`; "Android" rows are `mobile_id LIKE 'android %'` excluding the `android whatsapp %` companion rows. Android cards merge numbers from their `android whatsapp N` twin for display.

## 3. Features

- Add/edit/delete SIM cards with a fixed writable-column whitelist and auto-derived status (Verified — `simCardController.js:39-64,86-212`).
- Derived expiry/status computed on every read: `>5 days` = Active, `1–5 days` = Expiring Soon, `<=0 days` = Expired; explicit `Replaced`/`Inactive`/`Expired` statuses are preserved (`computeExpiry`/`finalStatus`, `simCardController.js:66-84,105-119`).
- Audit history: every edit records a per-column before/after diff into `sim_card_history` (`editSimCard`, `simCardController.js:184-207`); brand-wide read via `historyAll` (Nokia/Android/all filters).
- Replacements: `replaceSimCard` writes a `sim_card_replacements` row, moves the new number into `sim_1`, bumps `replacement_count`, and re-activates the card (`simCardController.js:253-285`).
- Bulk status change and bulk delete over selected ids (`updateStatusBulk` / `deleteBulk`).
- Excel/JSON import with per-row validation (required `mobile_id`, in-file duplicate detection) returning `valid`/`invalid`/`invalidRows` (`importSimCards`, `simCardController.js:341-379`).
- SIM Locker (Accounts mount): stock items with 28-day auto-expiry, duplicate `sim_number` protection (HTTP 409), assign/status/delete, and a two-way sync that writes the locker SIM number into the target mobile's first free `sim_1..sim_20` slot (and clears it on release) (`simInventoryController.js`, §5).
- CSV/Excel export (standalone: `exportToCSV`/`exportToExcel`; Accounts: brand-aware columns).
- Legacy/status repair at boot: `ensureSimInventorySchema.js` adds `sim_name` and normalises rows still carrying the `sim_cards` status vocabulary.

## 4. Technical Implementation

- **Stack (client):** React function components + hooks, React Router nested `<Routes>`, lucide-react icons, local CSS (`simCard.css`, `simScope.css`), shared `Toast`/`ToastContainer`. Two independent `SimProvider` contexts (one per client copy).
- **API layer:** both `api.js` files wrap `api()` from `client/src/api/auth.js` with `_prefix: 'ucs'`. Standalone exposes `fetchSimCards/addSimCard/updateSimCard/deleteSimCard/replaceSimCard/fetchReplacements/importSimCards/bulkChangeStatus/bulkDelete`; the Accounts copy additionally calls `fetchReplacementsForCard`, `fetchSimHistory`, `fetchBrandSimHistory`, and the `/sim-inventory` helpers (`fetchInventory`, `addInventoryItem`, `updateInventoryItem`, `assignInventoryItem`, `updateInventoryStatus`, `deleteInventoryItem`, `importInventoryItems`). Verified against `accounts/sim/api.js:11-92`.
- **Backend routers (Verified):**
  - `/api/sim-cards` → `simCardRoutes.js` (mounted `backend/src/index.js:308`). `const ANY_AUTH = authenticate` (`simCardRoutes.js:21`) — i.e. **any authenticated JWT**, no role restriction. The comment ordering matters: `/replacements` and `/history/all` are declared before `/:id` so they are not swallowed by the id param (Verified comment, lines 25-27).
  - `/api/sim-inventory` → `simInventoryRoutes.js` (mounted `index.js:309`). Same `ANY_AUTH = authenticate` (`simInventoryRoutes.js:17`).
  - `authenticate` (`authMiddleware.js:78-85`) verifies `JWT_SECRET` and normalises the role; it does not restrict roles. `authenticateRole(...)` is the role-restricting variant and is not used by these routers (Verified).
- **Controllers/models:**
  - `simCardController.js` + `simCardModel.js` — base table `sim_cards`; also `sim_card_replacements` and `sim_card_history` (Verified from model queries).
  - `simInventoryController.js` + `simInventoryModel.js` — table `sim_inventory` (Verified).
- **Bootstraps / migrations:** `ensureSimInventorySchema` runs at server start (`index.js:1203`) adding `sim_name` and repairing legacy statuses/expiry; controller comments reference `migrations/154` for the full `sim_cards`/`sim_inventory` schema (Verified comments).
- **Error handling:** controllers return 400 for missing required fields / invalid status, 404 for missing ids, 409 for duplicate `sim_number`, 500 for DB errors; inventory Locker sync failures are returned as a non-fatal `warning` string rather than failing the request (Verified — `syncWarn`).
- **Write whitelisting:** both controllers reduce request bodies to a fixed `writableFields` list before writing, because PostgREST rejects a statement with any non-existent column; this lets un-migrated databases still save (`simCardController.js:19-64`, `simInventoryController.js:19-52`).

## 5. Business Logic

- **`computeExpiry(expiryDate, today)` — `simCardController.js:66-76` (Verified):** calendar-day diff between today and `expiry_date`; `>5` → `{daysLeft, dcStatus:'Active'}`, `>=1` → `'Expiring Soon'`, else `'Expired'`; missing date → `{daysLeft:null, dcStatus:'Inactive'}`. `finalStatus` (`:78-84`) lets an explicit `Replaced`/`Inactive`/`Expired` override the derived value.
- **`replaceSimCard` — `simCardController.js:253-285` (Verified):** 404 if the card is missing; 400 if `new_sim` empty; inserts a `sim_card_replacements` row with `old_sim = sim.sim_1 || sim.mobile_id`, records `changed_by` from `req.user`, then updates `sim_1 = new_sim`, `replacement_count += 1`, `status = 'Active'`, and optionally `expiry_date`.
- **Locker → All SIM Cards sync — `simInventoryController.js` (Verified):**
  - `autoExpiryDate(issueDate)` = issue date + `SIM_VALIDITY_DAYS` (28), computed with `setDate` to avoid DST drift (`addDaysStr`, `:57-67`).
  - `assignInventoryItem` (`:366-392`) requires `mobile_id`, sets `status='Assigned'`, then `linkNumberToMobile` writes the SIM number into the first free `sim_N` slot of the mobile's `sim_cards` row — preferring the `android whatsapp N` twin for Android phones (`findCardByMobile`, `:158-167`); a missing mobile row or full slots returns a warning instead of failing.
  - `updateStatus` (`:394-427`) clearing out of `Assigned` nulls `mobile_id`/`device`/`imei`/`assignment_date` and calls `unlinkNumber`; `assigned_to` (owner name) is deliberately preserved.
  - `editInventoryItem`/`removeInventoryItem`/`deleteBulk` re-run link/unlink so number changes propagate to `sim_cards`; every slot write goes through `writeCardPatch` which also records `sim_card_history` (`:169-190`).

> **Factual note (Verified):** the SIM Locker validity window is fixed at 28 days (`SIM_VALIDITY_DAYS`, `simInventoryController.js:17`). The inventory `computeExpiry` treats `days === 0` as still valid ("Expiring Soon") while `simCardController.computeExpiry` treats `0` as Expired — the two controllers intentionally use different cut-offs, explained in the comments at `simInventoryController.js:84-91`.

## 6. API Endpoints

All paths relative to `/api`; mounts from `backend/src/index.js:308-309`. Auth = `authenticate` (any valid JWT), because `ANY_AUTH` in both route files maps to `authenticate` (Verified).

`/api/sim-cards` — `simCardRoutes.js` (13 endpoints):

| Method | Path (rel. to mount) | Handler |
|---|---|---|
| GET | `/` | `listSimCards` |
| GET | `/replacements` | `listReplacements` |
| GET | `/history/all` | `historyAll` |
| GET | `/:id` | `getSimCard` |
| GET | `/:id/replacements` | `replaceHistoryForSim` |
| GET | `/:id/history` | `historyForSim` |
| POST | `/` | `addSimCard` |
| POST | `/import` | `importSimCards` |
| POST | `/replacements/bulk` | `updateStatusBulk` |
| POST | `/replacements/bulk-delete` | `deleteBulk` |
| POST | `/:id/replace` | `replaceSimCard` |
| PUT | `/:id` | `editSimCard` |
| DELETE | `/:id` | `removeSimCard` |

`/api/sim-inventory` — `simInventoryRoutes.js` (9 endpoints):

| Method | Path (rel. to mount) | Handler |
|---|---|---|
| GET | `/` | `listInventoryItems` |
| GET | `/:id` | `getInventoryItem` |
| POST | `/` | `addInventoryItem` |
| POST | `/import` | `importInventoryItems` |
| POST | `/bulk` | `deleteBulk` |
| POST | `/:id/assign` | `assignInventoryItem` |
| POST | `/:id/status` | `updateStatus` |
| PUT | `/:id` | `editInventoryItem` |
| DELETE | `/:id` | `removeInventoryItem` |

`historyAll` accepts query `?brand=all|nokia|android` and `?from=YYYY-MM-DD` (Verified — `simCardController.js:226-241`).

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing (`/sim/*` guard, lazy load) | **Verified** |
| Standalone NAV/routes/meta + modal wiring | **Verified** (`SimCardPanel.jsx` read) |
| Accounts embed (`/accounts/sim/*`, tabs, brand filters) | **Verified** (`SimSection.jsx` read) |
| Backend `sim-cards` + `sim-inventory` routers (13 + 9) | **Verified** (route files read in full) |
| `simCardController` / `simCardModel` | **Verified** (read in full) |
| `simInventoryController` / `simInventoryModel` | **Verified** (read in full) |
| `ANY_AUTH` = `authenticate` (any JWT, no role gate) | **Verified** (`authMiddleware.js`) |
| `ensureSimInventorySchema` bootstrap | **Verified** (file read) |
| Accounts page internals (`SimInventory`, `Owner`, `MobileId`, `Reports`) | **Partially verified** (structure/mounts verified; pages 16–40 KB not read in full) |
| Standalone `Expiring :tab`, `History` internals | **Partially verified** |
| Screenshots | **screenshots pending** |

Known limitations (Verified): the API routers accept any authenticated user regardless of role, so access control for SIM endpoints is enforced only at the client route; the two client copies maintain separate stores and can drift; slot sync depends on `sim_cards` rows existing for the mobile_id, and failures surface only as warning strings.

Cross-links: `docs/03-Panel-Documentation/Accounts/PANEL.md` (parent panel and `/accounts/sim` mount).

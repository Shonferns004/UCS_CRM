# Documentation Panel — Black Book

> **Document ID:** PANEL-DOCUMENTATION-001
> **Status:** Verified (client source read in full; data schema confirmed across files)
> **Generated:** 2026-10-13
> **Related:** `client/src/panels/documentation/DocumentationPanel.jsx` · `store.jsx` · `components/` · `data/index.js` · `data/*.js`
> Labels: **Verified** (confirmed in code) · **Partially verified** (some depth unread) · **Inferred** (indirect evidence) · **Planned** (recommendation only).

## 1. Panel Overview

- **Route base:** `/docs/*` (Verified — `client/src/App.jsx:274`).
- **Entry component:** `DocumentationPanel` (`client/src/panels/documentation/DocumentationPanel.jsx`), lazy-loaded (`App.jsx:22`).
- **Access control:** `ProtectedRoute role={['*']}` — any authenticated user (Verified — `App.jsx:274-280`).
- **Purpose:** an in-app, static knowledge base that documents the other panels (screens, features, API calls, business rules, workflows, DB tables and Mermaid diagrams).
- **Not router-driven (Verified):** the panel does **not** use React Router `Routes`. `DocumentationPanel.jsx` mounts a `DocProvider` and keeps its own navigation state — `activePanel`, `activeScreen`, `searchQuery`, `expandedFeatures` — in `client/src/panels/documentation/store.jsx:6-39`. The sidebar panel-selection and top search are plain click handlers, not route links.
- **Layout:** dark top bar (title, `SearchBar`, user name, Logout) over a flex body of `DocSidebar` + scrollable content (`DocumentationPanel.jsx:50-81`).
- **No backend endpoints specific to this panel** — it renders bundled JS data objects only, with Mermaid lazy-imported for diagram rendering (Verified).

## 2. Screens & UI

The panel is a single workspace composed from these components (Verified — `components/`):

| Component | Role |
|---|---|
| `DocSidebar.jsx` | Lists `panels` with emoji icons; selecting one sets `activePanel`, clears `activeScreen` and `searchQuery`. |
| `SearchBar.jsx` | Input; when `searchQuery.length >= 2` renders `searchResults`; clicking a result sets panel + screen. |
| `PanelInfoCard.jsx` | Panel header: icon, title, roles badge, description, stats (screen count, total API count, entry path), collapsible Architecture notes, Diagrams and Key Features. |
| `ScreenDetail.jsx` | One screen: name, path, optional `component`, collapsible body with `description`, "How It Works" (`logicDescription`), screen-level `diagrams`, and `FeatureCard`s. |
| `FeatureCard.jsx` | One feature: description, "How It Works", API calls, business rules, workflow steps, request body, DB table, diagrams; badges for each present section. |
| `DiagramViewer.jsx` | Tabbed Mermaid renderer; lazy `import('mermaid')`, `theme: 'neutral'`, per-type labels (flowchart, architecture, sequence, er, network, state, process, journey, mindmap); "View Mermaid Source" `<details>`; render errors shown inline. |
| `ApiCallBlock.jsx` | One API: method chip (color-coded), path, collapsible `description`/`auth`/`curl`/`requestBody`/`responseBody`. |
| `DatabaseTableCard.jsx` | Collapsible table schema: column name / type / description. |

Screen-selector tabs render from `currentPanel.screens`; the active tab filters which `ScreenDetail`s show (`DocumentationPanel.jsx:18-39`). If no panel is selected it shows "Select a panel from the sidebar".

## 3. Features

- Sidebar browse across all documented panels with per-panel icons (Verified — `DocSidebar.jsx:3-16`; unknown ids fall back to `📄`).
- Global search across panel titles/descriptions, screen names/paths/logic and feature names/logic/API paths, capped at 20 results (`searchAll`, Verified — `data/index.js:33-53`).
- Per-panel info card with roles badge, screen/API counts, architecture notes, key features and Mermaid diagrams (Verified — `PanelInfoCard.jsx`).
- Drill-down: panel → screen → feature → API call with cURL / request / response JSON (Verified — `ScreenDetail`, `FeatureCard`, `ApiCallBlock`).
- Mermaid diagram tabs with graceful error display (Verified — `DiagramViewer.jsx`).
- Database schema cards inside panels that declare `databaseTables` (Verified — `DatabaseTableCard`; e.g. `accounts.js` declares `fro_donor_logs`, `bank_audit_entries`, etc.).
- Session identity + logout from the top bar (`useUcs`, `navigate('/login')`) (Verified — `DocumentationPanel.jsx:44-72`).

## 4. Technical Implementation

- **Stack:** React function components + hooks, a React context (`DocProvider`/`useDoc`), inline styles plus CSS classes (`panel-documentation`, `doc-*`), lazy Mermaid, no dedicated router (Verified).
- **State (`store.jsx`):** `createContext` holds `panels`, `activePanel` (defaults to `panels[0]?.id || 'super-admin'`), `activeScreen`, `searchQuery`, `expandedFeatures`; `currentPanel` via `getPanel(activePanel)`, `searchResults` via `searchAll(searchQuery)` (Verified — `store.jsx:6-39`).
- **Data aggregation (`data/index.js`):** imports 12 panel data modules and exports them as `panels` plus `getPanel(id)` and `searchAll(query)` (Verified — `data/index.js:1-53`). The documented panels are: `auth`, `super-admin`, `hr`, `accounts`, `fro`, `ngo-admin`, `recruiter`, `event-head`, `flutter-app`, `web-pwa`, `database`, `whatsapp-crm`.
- **Data schema (per panel module)** (Verified — read from `accounts.js`, `whatsapp-crm.js`, `index.js`):
  - Panel: `id`, `title`, `icon`, `roles[]`, `description`, `architectureNotes`, optional `diagrams: { <mermaidKey>: string }`, `keyFeatures[]`, `screens[]`, and optional `databaseTables[]`, `coreWorkflow[]`, plus a `noSearch` flag honoured by `searchAll`.
  - Screen: `name`, `path`, `description`, optional `logicDescription`, `component`, optional `diagrams`, and `features[]`.
  - Feature: `name`, `description`, optional `logicDescription`, `apis[]`, `businessRules[]`, `workflow[]`, `requestBody`, `dbTable`, `diagrams`.
  - API: `method`, `path`, `auth`, `description`, `curl`, `requestBody`, `responseBody`.
- **Mermaid diagrams** are present in only some data files (Verified count — `super-admin.js` and `whatsapp-crm.js` declare `diagrams`; the others did not match at scan time).

## 5. Business Logic

- **Search rules** (Verified — `data/index.js:33-53`): returns `[]` for queries shorter than 2 chars; skips panels flagged `noSearch`; matches panel `title`/`description`, screen `name`/`path`/`logicDescription`, and feature `name`/`logicDescription`/API `path`; each hit carries `{ panel, type: 'panel'|'screen'|'feature', label, path }`; results sliced to the first 20.
- **Navigation semantics** (Verified — `store.jsx` + `DocSidebar.jsx`): selecting a sidebar item resets `activeScreen` and `searchQuery`; selecting a search result sets both `activePanel` and `activeScreen` to the result's `path`; `setActiveScreen` toggling in `DocumentationPanel` collapses a tab when the same screen is re-clicked.
- **Feature expansion** (Verified — `store.jsx:15-18` + `FeatureCard`/`ApiCallBlock`): expansion is tracked by a `${screenPath}-${featureIdx}` (or `api-${method}-${path}-0`) key in `expandedFeatures`; `toggleFeature` flips it.

## 6. API Endpoints

- **None specific to this panel.** It is a static knowledge base; the API blocks it displays are documentation *content*, not live calls (Verified).
- The panel consumes only the shared auth context (`useUcs`) for the displayed user and `logout()`; it installs no route and issues no backend request of its own (Verified — `DocumentationPanel.jsx`).
- The API payloads it *documents* live inside `data/*.js` as `{ method, path, auth, curl, requestBody, responseBody }` objects — for example `accounts.js` documents `GET /api/accounts/leads`, `POST /api/accounts/leads/:logId/verify`, `POST /api/whatsapp/send-receipt/:logId` (these are illustrative documentation entries, not verified live endpoints) (Verified as data content).

## 7. Panel Summary

| Aspect | Status |
|---|---|
| Entry + routing (`/docs/*`, `['*']` guard) | **Verified** |
| Non-router store-driven navigation | **Verified** |
| All 8 components | **Verified** (files read in full) |
| Data aggregation (`index.js`, 12 panels) | **Verified** |
| Data schema (panel/screen/feature/api) | **Verified** |
| `searchAll` logic + 20-result cap | **Verified** |
| Mermaid rendering | **Verified** (lazy import + tab logic) |
| Diagram coverage across data files | **Partially verified** (only `super-admin.js` and `whatsapp-crm.js` matched a `diagrams` scan; others not exhaustively read) |
| Screenshots | **screenshots pending** |

# UCS CRM — Change History

> **Document ID:** 15-Change-History/CHANGE-HISTORY
> **Status:** Repository history reference
> **Generated:** 2026-10-13

## Repo baseline

| Item | Value |
| --- | --- |
| Branch | `master` |
| HEAD | `7b48b000` ("bugs") — parent `460e3328` ("ACC-BUG-004 ,ACC-BUG-006") |
| Backend history | ~1,800+ commits on `backend/` (HEAD 2026-10-12) |
| Client history | ~490 commits on `client/` (HEAD 2026-10-13) |

## Documentation change log (this set)

| Date | Change | Docs |
| --- | --- | --- |
| 2026-10-13 | Initial documentation build (Phases 1–8) | all under `docs/` |
| 2026-10-13 | Diagrams rendered to PNG images (26 figures) and embedded in Markdown; DOCX builder now embeds images + List of Figures; added 10 Plain-English (non-technical) guides in `docs/16-Plain-English/` | `docs/diagrams/`, `docs/tools/gen-diagrams.mjs`, `16-Plain-English/*` |
| 2026-10-13 | Fixed missing labels in all diagrams (Mermaid HTML labels via `foreignObject` were dropped by the SVG rasterizer). Renderer now screenshots the headless-browser layout instead, so all box/edge text appears. Re-rendered 27 figures (incl. recovered `er-diagram-3`), 0 errors; recovered `16-Plain-English`/architecture diagrams to natural aspect. | `docs/tools/gen-diagrams.mjs`, `docs/tools/render-canvas.html`, `docs/diagrams/` |
| 2026-10-15 | Synced documentation to the backend **CRM-agents removal** (login Agents feature, `crm_agents` table + `crmAgentModel.js`/`crmAgentsController.js`/`stationAgentOfRecord.js` and the FRO agent-attribution schema helpers deleted; `/api/ngo-admin/agents*` and `/api/auth/agent-context` endpoints gone). Added newly-mounted `absence_proofs`/daily-report/dashboard routes to the API reference; regenerated it (the generator now skips the hand-maintained `API-11`). Refreshed counts: 86 route files / 89 controllers / 91 models / 76 services / 27 bootstraps; 1,032 indexed endpoints; 598 client files. | `06-API-Reference/*`, `05-Database-Documentation/*`, `02-System-Architecture/*`, `00-Project-Overview/PROJECT-INVENTORY.md`, `03-Panel-Documentation/{NGO-Admin,Super-Admin}/PANEL.md`, `13-User-Manual/USER-MANUAL.md`, `README.md`, `AUDIT-REPORT.md`, `security/{BACKEND,DATABASE}-SECURITY.md` |

## Maintenance notes

- Documentation status of a claim is tagged per sentence/fact; keep the tags when editing.
- When the API surface changes, re-run `docs/tools/gen-api-ref.mjs` to refresh `docs/06-API-Reference/`. It covers `API-01`–`API-10`; `API-11-Special-Apps.md` (Metropad/Sevak-Library/Aadhaar sub-apps under `backend/src/{metropad,sevakLibrary,aadhaar}`) is **hand-maintained** and the generator intentionally does not touch it.
- When models/`from()` calls change, re-run the DATA-DICTIONARY and MODELS-INDEX generators documented in `docs/README.md`.
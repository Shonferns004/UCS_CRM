# UCS CRM — Black Book Documentation

> **Workspace root:** this documentation set covers the primary CRM at the repo root (`backend/` + `client/`).
> **Spec:** `docs/blackbookdocs.md` (this set is the deliverable).
> **Status labels:** `Verified | Partially verified | Inferred | Planned` apply to every factual claim; unlabeled text is orientation/overview.

## 00 — Project Overview
- [PROJECT-OVERVIEW](00-Project-Overview/PROJECT-OVERVIEW.md) — objectives, scope, modules, stack, architecture summary
- [PROJECT-INVENTORY](00-Project-Overview/PROJECT-INVENTORY.md) — repo structure, module counts, env names, integrations, known unknowns

## 01 — Requirements
- [REQUIREMENTS](01-Requirements/REQUIREMENTS.md) — FRs (F1–F10) + NFRs (NFR1–NFR10) mapped to evidence, assumptions, out-of-scope

## 02 — System Architecture
- [SYSTEM-ARCHITECTURE](02-System-Architecture/SYSTEM-ARCHITECTURE.md) — component & deployment diagrams (Mermaid)
- [REQUEST-FLOW](02-System-Architecture/REQUEST-FLOW.md) — auth/middleware/routing, guards, error handling
- [PANEL-NAVIGATION](02-System-Architecture/PANEL-NAVIGATION.md) — role → panel map (`App.jsx`), navigation tree

## 03 — Panel Documentation (black books)
| Panel | Doc | panel dir prefix |
| --- | --- | --- |
| Accounts | [PANEL](03-Panel-Documentation/Accounts/PANEL.md) | `/accounts` |
| Developer (Digital) | [PANEL](03-Panel-Documentation/Developer/PANEL.md) | `/dev-panel` |
| Documentation | [PANEL](03-Panel-Documentation/Documentation/PANEL.md) | `/docs` |
| Event Head | [PANEL](03-Panel-Documentation/Event-Head/PANEL.md) | `/event-head` |
| FRO | [PANEL](03-Panel-Documentation/FRO/PANEL.md) | `/fro` |
| HR | [PANEL](03-Panel-Documentation/HR/PANEL.md) | `/hr` |
| NGO Admin | [PANEL](03-Panel-Documentation/NGO-Admin/PANEL.md) | `/ngo-admin` |
| Recruiter | [PANEL](03-Panel-Documentation/Recruiter/PANEL.md) | `/recruiter` |
| SIM Card | [PANEL](03-Panel-Documentation/SIM-Card/PANEL.md) | `/sim` |
| Social | [PANEL](03-Panel-Documentation/Social/PANEL.md) | `/social` |
| Super Admin | [PANEL](03-Panel-Documentation/Super-Admin/PANEL.md) | `/sa` |
| WhatsApp | [PANEL](03-Panel-Documentation/WhatsApp/PANEL.md) | `/wa` |
| Embedded — Beneficiaries | [PANEL](03-Panel-Documentation/Embedded-Beneficiaries/PANEL.md) | embedded in Accounts/Super-Admin |
| Embedded — Sevak Library | [PANEL](03-Panel-Documentation/Embedded-Sevak-Library/PANEL.md) | `/api/sevak-library` |

Each PANEL.md: Overview (Verified) · Screens & UI · Features · Technical Implementation · Business Logic · API Endpoints · Panel Summary.

## 04 — Module Workflows (Mermaid)
- [WF-LEAD-RECEIPT](04-Module-Workflows/WF-LEAD-RECEIPT.md) · [WF-ATTENDANCE](04-Module-Workflows/WF-ATTENDANCE.md) · [WF-PAYROLL](04-Module-Workflows/WF-PAYROLL.md) · [WF-FRO-TIME](04-Module-Workflows/WF-FRO-TIME.md)

## 05 — Database Documentation
- [DATA-DICTIONARY](05-Database-Documentation/DATA-DICTIONARY.md) — 179 tables with backend provenance
- [MODELS-INDEX](05-Database-Documentation/MODELS-INDEX.md) — 88 model files + primary table
- [ER-DIAGRAM](05-Database-Documentation/ER-DIAGRAM.md) — core CRM / beneficiary / event / communication domains

## 06 — API Reference
- [README](06-API-Reference/README.md) — module index (1,039+ routes) · [API-01](06-API-Reference/API-01-Authentication.md) … [API-11](06-API-Reference/API-11-Special-Apps.md)

## 07 — Business Logic
- [BUSINESS-LOGIC-INDEX](07-Business-Logic/BUSINESS-LOGIC-INDEX.md) — logic → controller/service → panel-doc map + deep-dive pointers

## 08 — Libraries & Technologies
- [TECHNOLOGY-STACK](08-Libraries-and-Technologies/TECHNOLOGY-STACK.md) · [DEPENDENCY-REFERENCE](08-Libraries-and-Technologies/DEPENDENCY-REFERENCE.md) — locked versions from lockfiles

## 09 — Testing & QA
- [TESTING](09-Testing-and-QA/TESTING.md) — framework, 44-test inventory, traceability matrix
- [MANUAL-TESTING](09-Testing-and-QA/MANUAL-TESTING.md) — checklist by module

## 10 — Security
- [SECURITY-OVERVIEW](10-Security/SECURITY-OVERVIEW.md) — digest and index; authoritative detail in [docs/security/](security/README.md) (incl. **open P0** S3 exposure backlog)

## 11 — Deployment & Setup
- [README](11-Deployment-and-Setup/README.md) — quick start, build, deploy map
- [ENV-REFERENCE](11-Deployment-and-Setup/ENV-REFERENCE.md) — variable names & purpose only (no values)
- [DEPLOYMENT](11-Deployment-and-Setup/DEPLOYMENT.md) — prod/HEAD/Vercel runbook, rollback

## 12 — Troubleshooting
- [TROUBLESHOOTING](12-Troubleshooting/TROUBLESHOOTING.md) — startup/auth/data/realtime/edge issues + diagnostic endpoints

## 13 — User Manual
- [USER-MANUAL](13-User-Manual/USER-MANUAL.md) — sign-in, per-panel quick start, everyday tasks

## 14 — Glossary & 15 — Change History
- [GLOSSARY](14-Glossary/GLOSSARY.md) · [CHANGE-HISTORY](15-Change-History/CHANGE-HISTORY.md)

## 16 — Plain-English Guides (for non-technical readers)
| Guide | Explains (no jargon) |
| --- | --- |
| [START-HERE](16-Plain-English/START-HERE.md) | The whole system in one page + how to read these docs |
| [HOW-DONATIONS-WORK](16-Plain-English/HOW-DONATIONS-WORK.md) | Leads → donors → receipts → bank matching |
| [HOW-ATTENDANCE-WORKS](16-Plain-English/HOW-ATTENDANCE-WORKS.md) | Punch in/out, QR + location, corrections |
| [HOW-PAYROLL-WORKS](16-Plain-English/HOW-PAYROLL-WORKS.md) | Salary, NGO allocation, holds, loans, pay |
| [HOW-FRO-TIME-WORKS](16-Plain-English/HOW-FRO-TIME-WORKS.md) | Work hours, idle time, auto-logout, monthly targets |
| [HOW-BENEFICIARIES-WORK](16-Plain-English/HOW-BENEFICIARIES-WORK.md) | Profiles, Aadhaar, collection OTP, kits |
| [HOW-EVENTS-WORK](16-Plain-English/HOW-EVENTS-WORK.md) | Planner, approvals, assets, distribution |
| [HOW-INCENTIVES-WORK](16-Plain-English/HOW-INCENTIVES-WORK.md) | Rules, targets, competitions, claims |
| [HOW-COMMUNICATION-WORKS](16-Plain-English/HOW-COMMUNICATION-WORKS.md) | Chat, notices, tickets, WhatsApp |
| [HOW-ADMIN-TOOLS-WORK](16-Plain-English/HOW-ADMIN-TOOLS-WORK.md) | Dashboards, data import, SIM cards, docs |

---

## Figure / Screenshot Manifest
Diagrams are rendered to real images in [docs/diagrams/](diagrams/) (manifest: [MANIFEST.json](diagrams/MANIFEST.json)) and embedded in the Markdown — they display in **VS Code preview, GitHub, and Word** without any Mermaid extension. Report: **27 diagrams, 0 render errors.**

Screenshots of the running app are **pending** — the application was not run during this build. Routes to capture:

| Figure | Panel | Route to capture |
| --- | --- | --- |
| F01 | Super Admin | `/sa` dashboard |
| F02 | NGO Admin | `/ngo-admin` dashboard |
| F03 | HR | `/hr` dashboard |
| F04 | Accounts | `/accounts` dashboard |
| F05 | FRO | `/fro` dashboard |
| F06 | Recruiter | `/recruiter` |
| F07 | Event Head | `/event-head/planner` |
| F08 | Developer | `/dev-panel` |
| F09 | Social | `/social` |
| F10 | WhatsApp | `/wa` inbox |
| F11 | SIM | `/sim` |
| F12 | Documentation | `/docs` |

## Regeneration & Maintenance
- **Diagrams → images:** `node docs/tools/gen-diagrams.mjs` (renders every fenced `mermaid` code block in `docs/` headlessly with the installed browser; requires Chrome/Edge on the machine).
- **API reference:** `node docs/tools/gen-api-ref.mjs` (regenerates `docs/06-API-Reference/`).
- **DOCX black book:** `node docs/tools/gen-docx.mjs` (outputs the consolidated .docx to `docs/output/`, images included).
- **Audits:** `node docs/tools/check-links.mjs`, `node docs/tools/check-mermaid.mjs`, `node docs/tools/check-png.mjs`.
- **Status labels** must be updated when a claim changes; keep `file:line` traces accurate.

## Coverage Report (build-time)
| Area | Count | Status |
| --- | --- | --- |
| Panels (12 + 2 embedded) | 14 | Documented |
| Route files | 85 | Indexed → 1,039+ endpoints |
| Controllers / Models / Services / Bootstraps | 90 / 91 / 79 / 28 | Indexed |
| Tables | 179 | Dictionary |
| Model files | 88 | Indexed |
| Backend tests | 44 | Inventoried (not executed) |
| Diagrams (rendered PNG) | 27 | Rendered, 0 errors |
| Plain-English guides | 10 | Written, linked from Fast-Start section |
| Security docs | pre-existing set | Summarized + linked |
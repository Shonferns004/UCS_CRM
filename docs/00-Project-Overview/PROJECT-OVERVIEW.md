# UCS CRM — Project Overview

> **Document ID:** 00-Project-Overview/PROJECT-OVERVIEW
> **Status:** Verified (based on inventory)
> **Generated:** 2026-10-13
> **Related:** [PROJECT-INVENTORY](PROJECT-INVENTORY.md) · [REQUIREMENTS](../01-Requirements/REQUIREMENTS.md) · [ARCHITECTURE](../02-System-Architecture/SYSTEM-ARCHITECTURE.md)

## 1. Introduction

UCS CRM is a web-based CRM and attendance platform used by NGO and non-profit teams. It manages field officers (FROs), donor relationships and collections, receipts, bank reconciliation, worker HR (attendance, salary, leaves, loans), incentives, beneficiary programs, events, recruitment, SIM inventory, and internal communication (chat, notices, tickets).

## 2. Problem Statement

NGO field and back-office operations relied on disconnected spreadsheets and ad-hoc processes. Donor follow-up, receipting, attendance enforcement, and incentive payouts lacked a single system of record, realtime coordination, and controlled role-based access.

## 3. Objectives

- Single system of record for donors, receipts, workers, attendance, salary and NGO allocations (verified: entities in PostgreSQL via `backend/src/models`, `backend/src/bootstrap`).
- Role-based panels so each team sees only its work (verified: `client/src/App.jsx` role→panel map, `authMiddleware.js` role guards).
- Realtime coordination for active field work (verified: Socket.IO, `client/src/lib/socket.js`).
- Traceable money path: lead → donor → receipt → bank match (verified: Accounts flows).
- Extensible via sub-apps (Sevak Library, Metropad) and mobile/worker apps.

## 4. Scope and Limitations

| Item | Detail |
| --- | --- |
| In scope (this set) | Primary CRM: `backend/` + `client/` (12 panels + embedded panels). |
| Out of scope (this set) | Flutter apps (`apps/`), vendored WhatsApp workspace (`whtsapp/`), standalone SPAs (`others/`). |
| Limitations | No automated regression suite executed in this build; screenshots pending; column-level schema truth requires per-bootstrap verification. |

## 5. Functional Requirements (summary)

See [REQUIREMENTS](../01-Requirements/REQUIREMENTS.md) for the detailed list with module mapping and verification tags.

## 6. Non-Functional Requirements (summary)

- **Performance:** dashboard aggregations server-side; 120s client timeout; server-anchored clock.
- **Availability:** production behind Caddy on EC2 with PM2; health check + auto-rollback in CI; monthly backup restore test.
- **Security:** JWT + role gates; salary privacy code; cron key; security doc set (with open P0 remediation backlog).
- **Realtime:** Socket.IO for chat/notices/FRO actions with DB-change helpers.
- **Maintainability:** schema bootstraps, shared utils, generator scripts for this documentation.

## 7. User Roles (verified in `authMiddleware.js` + `App.jsx`)

`super_admin`, `admin`, `hr`, `accounts`, `fro`, `worker`, `recruiter`, `event_head`, `event_manager`, `developer`/`developers`, `digital`, `social`. Aliases in `ROLE_ALIASES`.

## 8. Major Modules

Authentication · Workers/HR · Attendance · Payroll/NGO · Leads/Donors/Receipts · Bank Audit · Incentives · Beneficiaries · Events · Recruitment · FRO operations · Communication (chat/notices/tickets) · SIM inventory · Admin/Platform tools.

## 9. Technology Stack

See [TECHNOLOGY-STACK](../08-Libraries-and-Technologies/TECHNOLOGY-STACK.md): Node 24 + Express 4 backend; React 19 + Vite 6 client; PostgreSQL via Supabase client + `pg`; JWT + bcryptjs; Socket.IO; Firebase FCM; WhatsApp Cloud API; Razorpay/Paytm; Groq/Gemini.

## 10. High-Level Architecture

See [SYSTEM-ARCHITECTURE](../02-System-Architecture/SYSTEM-ARCHITECTURE.md): browser SPA → reverse proxy (Caddy/nginx) → Express API → PostgreSQL/S3/Redis + external services; realtime over Socket.IO; scheduled jobs + cron endpoints.

## 11. System Dependencies

See [DEPENDENCY-REFERENCE](../08-Libraries-and-Technologies/DEPENDENCY-REFERENCE.md) for locked versions.

## 12. Key Assumptions and Constraints

- PostgreSQL is the system of record; schema is bootstrap-enforced at boot.
- Client-side role checks are rendering sugar only; backend guards authority.
- Documentation is derived from source; status labels (Verified/Partial/Inferred/Planned) apply to every claim.
# UCS CRM — User Manual

> **Document ID:** 13-User-Manual/USER-MANUAL
> **Status:** Partially verified (screens verified; screenshots pending)
> **Generated:** 2026-10-13

## 1. Signing In

Open the CRM URL, enter your identifier and password. After login you are taken to the panel matching your role:

| Role | Panel | Base URL |
| --- | --- | --- |
| Super Admin | Super Admin | `/sa` |
| Admin (NGO) | NGO Admin | `/ngo-admin` |
| HR | HR | `/hr` |
| Accounts | Accounts | `/accounts` |
| FRO / Worker | FRO | `/fro` |
| Recruiter | Recruiter | `/recruiter` |
| Event Head / Manager | Event Head | `/event-head` |
| Developer / Digital | Developer / Social | `/dev-panel` · `/social` |
| Any authenticated | WhatsApp · Docs · SIM (role-gated) | `/wa` · `/docs` · `/sim` |

Staff **cannot** see other panels they are not entitled to; the app redirects to Access Denied and clears the session.

## 2. Per-Panel Quick Start

- **Super Admin** — dashboard KPIs; `Data Management` to import donor data; `Organization`, `Employees`, `Tickets`, `Notices`, `Incentives`, `Live FRO`, `Fro Idle`. Embeds other panels read-only.
- **NGO Admin** — station management, FRO attendance, master search, codes, agents, meeting mode, logout-all-FROs.
- **HR** — employees, attendance, leaves, letters, HR forms, recruiters, reports, daily/social reports, quizzes, holidays, QR, loans, NGO salary, FRO targets, library.
- **Accounts** — lead audit, receipts, donors, volunteers/payroll, teams & targets, incentive setup/verification, certificates, asset register, reports, SIM, beneficiaries, bill reminders, library.
- **FRO** — dashboard, my leads, call/workflow (suspense), donors, idle, history, incentive info, lead incentive, tickets, chat.
- **Recruiter** — leads, candidates, pipeline, daily report, tickets.
- **Event Head** — planner, events, activities, NGOS/sectors, assets/materials, distribution, volunteers, attendance, media, reports, approvals.
- **Developer** — ticket dashboard, my/all/unassigned tickets, daily report.
- **Social** — daily report, shared monthly planner, community chat.
- **SIM Card** — inventory, expiring, replacements, history, reports, import/settings.
- **WhatsApp** — shared WhatsApp inbox (works if your account is assigned; check `/api/whatsapp/agents`).
- **Documentation** — in-app reference with search and diagrams.

## 3. Everyday Tasks

1. **Find a person** — use each panel's search (e.g. NGO Admin master search, Accounts donor search, FRO searched donors).
2. **Mark a receipt** — Accounts → Receipts → generate/queue, `mark-sent`, or undo.
3. **Raise a ticket** — any panel: Tickets → New; developers triage via `/dev-panel`.
4. **Read a notice** — notices appear in the bar and popups; marked seen server-side.
5. **Change password** — from the panel settings/menu (`POST /api/auth/change-password`).

## 4. Reading This Manual With Code

Every screen's behavior is documented in the panel black-book pages (`docs/03-Panel-Documentation/<Panel>/PANEL.md`), which list endpoints and business rules verbatim.

## 5. Limits

- Screenshots are **pending** (application not run during documentation build). Replace the marked placeholders with real capture instructions -> see `docs/output/` black book Figures list.
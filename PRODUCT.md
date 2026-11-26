# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Multiple roles share the product equally. The same system serves:

- Super Admin, who oversees every panel, role and data source.
- NGO Admin, who manages stations, FROs, lead allocation and operational reporting.
- FRO / field worker, who works leads, calls donors, collects donations and tracks daily targets.
- Accounts, who manage receipts, bank matching, incentives and donor records.
- HR, who manages volunteers, attendance, leaves, letters, salary and recruitment.
- Recruiter and Event Head / Event Manager, who run hiring and event operations.
- Developer / Digital / Social, who run the internal build, QA and communications surfaces.

No single role is the primary audience for the product as a whole; each panel is shaped for the team that uses it.

## Product Purpose

UCS CRM is a web-based CRM and attendance platform used by NGO and non-profit teams. It exists to replace disconnected spreadsheets and ad-hoc processes with one system of record for field officers, donors and collections, receipts, bank reconciliation, worker HR, attendance, salary, incentives, beneficiary programs, events, recruitment, SIM inventory and internal communication. Success means each team can complete its own work in one place while the organisation keeps a shared, traceable record across roles.

## Positioning

A role-specific, multi-panel NGO operations suite built on one shared system of record. Its distinguishing mechanism is that field work, the donor-to-receipt-to-bank money trail, and the worker's attendance and incentive record live in the same product rather than in separate tools. A neighbouring product could copy a donor CRM or an HR tool; it could not truthfully copy the combined, role-shaped operating record.

## Operating Context

- Internal, browser-based application used by NGO and non-profit teams, with field and back-office work in the same estate.
- IST-anchored clocks and dates are part of the operating reality (`utils/istDate`).
- FROs work leads, calls, donor follow-up, collections and daily targets; admins allocate and monitor that work.
- Accounts follow the money path from lead to donor to receipt to bank match.
- HR and attendance records, salary, leaves and recruitment are handled in their own panels.
- Events, beneficiaries, recruitment, SIM inventory and internal chat/notices/tickets are part of the same suite.
- Realtime coordination (chat, notices, FRO actions) is part of daily operation.

## Capabilities and Constraints

Confirmed capabilities present in the repository and its generated documentation:

- Authentication with role and department resolution, JWT sessions and per-route role guards.
- Role-based panels for Super Admin, NGO Admin, HR, Accounts, FRO, Recruiter, Event Head/Manager, Developer, Digital/Social and SIM Card.
- Donor and lead management, receipting, bank statement matching and suspense resolution.
- Attendance punch-in/out, corrections, leaves, letters, salary, loans and NGO allocation.
- Incentive rules (AKI), targets, daily aggregation, special campaigns and lead slabs.
- Beneficiary programs, distributions and kit issue.
- Event lifecycle, planner/calendar, media, materials and checklists.
- Realtime chat, notices, support and developer tickets, and WhatsApp operations.
- Data import, daily reports, employee/station structure and the Sevak Library / Metropad sub-apps.
- SIM inventory with stock, expiry, replacements and import/export.

Constraints and undecided facts:

- PostgreSQL is the system of record; client-side role checks are rendering sugar and the backend guards authority.
- The existing stack is React + Vite on the client and Node/Express on the backend; the product is not greenfield.
- No single primary role was confirmed; the product is intentionally multi-role.
- No product-specific accessibility standard, pricing, licensing or deployment claim was confirmed by this record.
- No visual direction, palette or typography is confirmed here; init does not write DESIGN.md.

## Brand Commitments

- Product name: **UCS CRM** (confirmed).
- The login surface uses the UCS mark; several panel sidebars currently use a UFS wordmark. Future work should use UCS CRM consistently and treat the UFS wordmark as an unresolved naming inconsistency, not a second product.
- The repository's generated documentation and the existing interface are the current source of truth for product language; no new voice or personality was confirmed by init.

## Evidence on Hand

- Generated product documentation under `docs/00-Project-Overview`, `docs/01-Requirements`, `docs/02-System-Architecture`, `docs/03-Panel-Documentation` and `docs/04-Module-Workflows`.
- The working client (`client/`), backend (`backend/`) and database bootstraps (`backend/src/bootstrap`).
- Real application data and role flows in the running product; no marketing testimonials, customer quotes, benchmarks or press assets were found for this record.

## Product Principles

1. **One record, many roles.** Every panel should write to the same operational truth; no team gets a private, divergent copy of donors, workers or money.
2. **Shape the surface to the role.** Each team sees its own work, language and actions; sharing a database does not mean sharing a dashboard.
3. **Keep the money path traceable.** Lead, donor, collection, receipt and bank match must remain connected end to end.
4. **Make field work first-class.** FRO calls, leads, attendance and incentives are core product work, not an afterthought to back-office reporting.
5. **Preserve the suite's breadth.** HR, accounts, events, recruitment, SIM and communication are part of the product's value; future work should not collapse them into a generic single-purpose CRM.

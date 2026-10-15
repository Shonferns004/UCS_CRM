# UCS CRM — Glossary

> **Document ID:** 14-Glossary/GLOSSARY
> **Status:** Verified (terms traced to code where possible)
> **Generated:** 2026-10-13

| Term | Meaning |
| --- | --- |
| AKI / Aki config | Incentive engine configuration (routes under `/api/incentive/aki-*`). |
| CRON key | `CRON_API_KEY` env gate for `/api/cron/*`. |
| FRO | Field Relationship Officer — telecaller/field donor-relationship role. |
| Work-as | Impersonation session where an admin operates as an FRO, tracked in `work_as_sessions`. |
| Suspense | Donation/receipt rows not yet linked to a donor (`suspense_donations`); resolved by accounts/ngo/fro. |
| Donor log | Interaction log against a donor (`fro_donor_logs`). |
| Idle / cover | FRO live-window pause tracking and its coverage attribution (`fro_live_status`, `froIdle*` services). |
| Present days | Days counted from attendance used by salary (`/api/salary/present-days`). |
| Pagar export | Payroll export file (salary route `pagar-export`). |
| SIR / sirLevel | Special Incentive Rules access level (middleware token used in `specialIncentiveRoutes`/`leadIncentiveRoutes`). |
| NGO allocation | Split of worker cost across NGOs (`worker_ngo_allocations`, `ngo_allocations` routes). |
| Sevak Library | Membership-library sub-app (Supabase-backed) mounted at `/api/sevak-library`. |
| Metropad | Bin/shelf-pad maintenance sub-app (`/api/metropad`). |
| BNF | Beneficiary prefix used for operator records (`bnf_operators`, `bnf_programs`). |
| Collection OTP | One-time code to verify a beneficiary's collection event (1-month validity enforced in controller). |
| P0 / P1 / P2 / P3 | Severity levels in `docs/security/SECURITY.md` backlog. |
| PanelFrame | Super-admin iframe embedding of other panels (`embedPanels.js`). |
| Status labels (docs) | `Verified / Partially verified / Inferred / Planned` — traceability status of each claim in this documentation set. |
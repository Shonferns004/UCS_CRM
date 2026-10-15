# UCS CRM — Requirements

> **Document ID:** 01-Requirements/REQUIREMENTS
> **Status:** Partially verified — FRs map to modules and endpoint evidence; NFRs reflect repo/config evidence.
> **Generated:** 2026-10-13
> **Related:** [PROJECT-OVERVIEW](../00-Project-Overview/PROJECT-OVERVIEW.md) · [Traceability Matrix](../09-Testing-and-QA/TESTING.md#4-feature-to-test-traceability-matrix)

## 1. Functional Requirements

### F1. Authentication & Role-Based Access
| ID | Requirement | Evidence |
| --- | --- | --- |
| F1.1 | Unified login with role/department resolution. | `POST /api/auth/login`, `authController.js` |
| F1.2 | JWT session with per-route role guards. | `middleware/authMiddleware.js` |
| F1.3 | Impersonation (work-as) with scoped FRO stations. | `impersonateFRO`, `workAsSessionModel.js` |
| F1.4 | Password change and access-code-gated salary. | `change-password` route, salary access codes |

### F2. Donor Management & Receipting
| ID | Requirement | Evidence |
| --- | --- | --- |
| F2.1 | Partner/lead collection, quick/verify/done/reject workflows. | `accountsController.js` |
| F2.2 | Donor profiles with searchable history. | `GET /api/donors`, donor models |
| F2.3 | Receipt generation (idempotent), queue, mark-sent/undo. | `generateReceipt`, receipt routes |
| F2.4 | Bank statement matching / audit. | `bankAuditController.js`, `autoMatchService.js` |
| F2.5 | Suspense donations resolution. | `suspense_donations` flows |

### F3. HR, Attendance, Payroll
| ID | Requirement | Evidence |
| --- | --- | --- |
| F3.1 | Attendance punch-in/out incl. QR+geo and selfie punch. | `attendanceController.js`, `qrController.js` |
| F3.2 | Attendance corrections: raise → verify → approve. | `attendanceCorrectionController.js` |
| F3.3 | Leaves, letters (templates→generate→print). | `leaveController.js`, `letterController.js` |
| F3.4 | Salary CRUD, holds, compensations, pay, exports; NGO allocation. | `salaryController.js`, `ngoAllocationController.js` |
| F3.5 | Loans/advances with monthly deductions. | `loanController.js`, `loanTerm.js` |

### F4. Incentives
| ID | Requirement | Evidence |
| --- | --- | --- |
| F4.1 | Configurable incentive rules (AKI), targets, daily aggregation. | `incentiveController.js`, `dailyAchievementAggregator.js` |
| F4.2 | Special incentive campaigns (leaderboard, claims, AI drafts). | `specialIncentiveService.js` |
| F4.3 | Lead slab competitions. | `leadIncentiveService.js` |

### F5. Beneficiaries & Programs
| ID | Requirement | Evidence |
| --- | --- | --- |
| F5.1 | Beneficiary profiles + sub-records (family/education/employment/assistance/disabilities/documents). | `beneficiaryController.js` |
| F5.2 | Aadhaar parse (OCR), collection OTP with 1-month window. | `aadhaarDecoder.js`, `generateCollectionOtp` |
| F5.3 | Distribution, kit issue, programs, BNF operators/programs. | `distributionController.js`, `programController.js` |

### F6. Events
| ID | Requirement | Evidence |
| --- | --- | --- |
| F6.1 | Event lifecycle with approval workflow. | `eventHeadController.js` |
| F6.2 | Planner, calendar suggestions, festival observances. | `calendarific.js`, `festivalSuggestions*` |
| F6.3 | Asset issue/return, materials, checklist, media. | `eventHeadController.js` |

### F7. Communication
| ID | Requirement | Evidence |
| --- | --- | --- |
| F7.1 | Realtime chat (direct/group, realtime, realtime-actions). | `chatController.js`, socket emitters |
| F7.2 | Notices with popup + seen tracking. | `noticeController.js` |
| F7.3 | Tickets (support + developer) with assignments and popups. | `ticketController.js`, `developerTicketController.js` |
| F7.4 | WhatsApp inbox/routing/broadcasts. | `whatsappController.js` |

### F8. Operations & Admin
| ID | Requirement | Evidence |
| --- | --- | --- |
| F8.1 | Data import (batch → preview → confirm). | `dataImportController.js` |
| F8.2 | Daily reports per department. | `dailyReportController.js`, `hrDailyReportController.js` |
| F8.3 | Employee management, NGO/station structure. | `employeeRoutes` tree |
| F8.4 | Sub-apps: Sevak Library, Metropad. | `sevak-library/router.js`, `/api/metropad` |

### F9. SIM Inventory
| ID | Requirement | Evidence |
| --- | --- | --- |
| F9.1 | Stock, expiry tracking, replacements, import/settings. | `simCardController`/routes |

### F10. Documentation
| ID | Requirement | Evidence |
| --- | --- | --- |
| F10.1 | `/docs` in-app documentation with search and diagrams. | `documentationController.js` |

## 2. Non-Functional Requirements

| ID | Requirement | Evidence / Notes |
| --- | --- | --- |
| NFR1 | Client requests time out at 120s. | `client/src/lib/apiBase.js` (client timeout) |
| NFR2 | Timezone-anchored clocks (IST helpers). | `utils/ist.js` |
| NFR3 | Serverless-friendly backend (skip listen under `VERCEL`). | `index.js` |
| NFR4 | Health check endpoint + CI auto-rollback. | `deploy.yml`, `/api/health` |
| NFR5 | Encrypted backups with monthly restore test. | AWS Backup + `backup-restore-test.yml` |
| NFR6 | TLS + reverse proxy in front of API. | `infra/caddy/Caddyfile` (prod), nginx (HEAD) |
| NFR7 | Backend enforces authorization (client gates are UI sugar). | `authMiddleware.js` |
| NFR8 | Secrets never in repos/`VITE_` vars. | `docs/security/SECRETS-MANAGEMENT.md` |
| NFR9 | Schema enforced by idempotent bootstraps at boot. | `src/bootstrap/`, `migrations/` |
| NFR10 | Realtime via Socket.IO with DB-change mirrors. | socket module, `watchTables` helpers |

## 3. Assumptions

- PostgreSQL is the sole system of record.
- FRO attendance is enforced by positive-location validation (QR + geo) not by device trust.
- Documentation status labels (Verified/Partially verified/Inferred/Planned) are authoritative; unlabeled claims count as unverified.

## 4. Out of Scope (this build)

- Full automated E2E suite (partially exists; not executed).
- Column-level DB documentation (row-level index + model index provided).
- Live screenshots (placeholders with capture instructions).
- S3 P0 remediation execution (tracked in `docs/security/`).
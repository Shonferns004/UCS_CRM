# UCS CRM — Business Logic Index

> **Document ID:** 07-Business-Logic/BUSINESS-LOGIC-INDEX
> **Status:** Partially verified — each item cross-references the file where the logic lives and the panel/marker doc where it was read.
> **Generated:** 2026-10-13

This index maps the important business-logic areas of the CRM to their backend implementation and to the documentation that describes them. Detailed step-by-step write-ups live in the panel docs (Section 5 of each `PANEL.md`) and in `docs/04-Module-Workflows/`.

---

## 1. Authentication & Session

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Login / unified login, refresh, logout | `backend/src/controllers/authController.js` | Accounts, Super-Admin, NGO-Admin |
| Role normalization and guards | `backend/src/middleware/authMiddleware.js` | Request-Flow (`02-System-Architecture`) |
| Impersonation / work-as sessions | `authController.js` (`impersonateFRO`, `getFroWorkAsStations`, `releaseWorkAs`), `workAsSessionModel.js` | Super-Admin |
| Change password, salary login | `authController.js` | HR |
| Access codes (salary) | `salaryRoutes.js` / `salaryController.js` | Accounts |

## 2. Lead → Donor → Receipt pipeline

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Manual/quick/done/reject verification, credit rules | `backend/src/controllers/accountsController.js` (`verifyLead`, `quickVerifyLead`, `doneLead`), `leads.js` util | Accounts, FRO |
| Address suggestions, field patching | `accountsController.js` | Accounts |
| Receipt generation (idempotent) | `accountsController.js` (`generateReceipt`), `receiptLookup.js` | Accounts |
| Queue, mark-sent, undo, fix-and-queue | `accountsController.js`, `receipts` flows | Accounts |
| Bank statement matching / bank audit | `bankAuditController.js`, `autoMatchService.js` | Accounts |
| Email import (bank statements) | `emailImportController.js`, `emailImporter.js` | Accounts, Troubleshooting |

## 3. FRO timekeeping, idle/cover, rollover

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Punch in/out, selfie punch, today status | `attendanceController.js` | HR, Accounts |
| FRO live status + time events | `froController.js`, `froLiveWindow.js`, `froTimeSessions.js` | FRO |
| Idle reconciliation & reports | `froIdleReconcileScheduler.js`, `froIdle.js`, `froIdleCommit.js` | FRO, Super-Admin |
| Auto-logout scheduler | `froAutoLogoutScheduler.js` | FRO, Admin |
| Monthly rollover of targets | `froMonthlyRollover.js`, `froMonthlyTarget.js` | Admin, Super-Admin |

## 4. Incentives

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| AKI config, incentives rules, targets | `incentiveController.js`, `incentive.js`, `dailyAchievementAggregator.js` | Accounts, Super-Admin |
| Special incentive campaigns (AI draft, leaderboard, claims) | `specialIncentiveService.js`, `specialIncentiveController.js` | Accounts, Super-Admin |
| Lead slab competitions | `leadIncentiveService.js`, `leadIncentiveController.js` | Accounts, FRO |

## 5. Payroll & NGO allocation

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Salary CRUD, holds, compensations, pay | `salaryController.js`, `salaryModel.js` | Accounts, HR |
| NGO salary allocation generation | `ngoAllocationController.js`, `ngoAllocationModel.js` | HR, Accounts |
| Loans / advances monthly deduction | `loanController.js`, `loanTerm.js` | HR |

## 6. Attendance, leaves, letters, QR

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Attendance punch + geo/QR validate | `attendanceController.js`, `qrController.js`, `geo.js` | HR, Attendance |
| Attendance corrections (raise → verify → approve) | `attendanceCorrectionController.js` | HR, Super-Admin |
| Letters (templates → generate → print) | `letterController.js`, `letterModel.js` | HR |
| Quiz generation & submission | `quizController.js`, `quizBank.js` | HR |

## 7. Beneficiaries & distributions

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Beneficiary profile + sub-records | `beneficiaryController.js` | Beneficiaries |
| Collection OTP (1-month window enforcement) | `beneficiaryController.js` (`generateCollectionOtp`) | Beneficiaries |
| Aadhaar parse / OCR | `aadhaarDecoder.js`, `ocrController.js` | Beneficiaries, FRO |
| Kit issue, distributions, programs | `distributionController.js`, `programController.js` | Beneficiaries, Event-Head |

## 8. Events (Event Head)

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Approval workflow (submit → approve/reject) | `eventHeadController.js` | Event-Head |
| Planner/calendar AI suggestions | `eventHeadController.js`, `activityProgramPrompt.js`, `festivalSuggestions*` | Event-Head |
| Asset issue/return, material stock | `eventHeadController.js` | Event-Head |

## 9. Communication

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Chat rooms, messages, groups, realtime | `chatController.js`, `chatModel.js`, socket | All panels |
| Notices & notification scheduling | `noticeController.js`, `notificationScheduler.js` | Admin |
| Tickets (support + developer) | `ticketController.js`, `developerTicketController.js` | Developer, All |
| WhatsApp inbox / broadcast / routing | `whatsappController.js`, `whatsappService.js`, `whatsappEnhancementsController.js` | WhatsApp, FRO |

## 10. Cross-cutting

| Logic | Backend location | Panel doc |
| --- | --- | --- |
| Dashboard aggregation (per role) | `dashboardController.js` | Super-Admin, NGO-Admin, FRO |
| Data import (batch → inspect → confirm) | `dataImportController.js` | Super-Admin |
| Daily reports (per department) | `dailyReportController.js`, `hrDailyReportController.js` | HR, Social, Recruiter |
| Sevak renewals / signatures | `sevakLibrary/router.js`, `application.service.js` | Sevak Library |

---

## 11. Deep dives

| Document | Content |
| --- | --- |
| `docs/04-Module-Workflows/WF-LEAD-RECEIPT.md` | Lead → verification → receipt, frontend→API→DB |
| `docs/04-Module-Workflows/WF-ATTENDANCE.md` | Attendance lifecycle incl. QR/geo and corrections |
| `docs/04-Module-Workflows/WF-PAYROLL.md` | Salary, NGO allocation, holds, pay |
| `docs/04-Module-Workflows/WF-FRO-TIME.md` | FRO live status, idle, cover, rollover |

All functions referenced here are traceable by name in the listed files. Where a write-up read only part of a file, the panel doc marks it **Partially verified**.
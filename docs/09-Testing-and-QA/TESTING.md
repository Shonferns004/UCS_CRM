# UCS CRM — Testing & Quality Assurance

> **Document ID:** 09-Testing-and-QA/TESTING
> **Status:** Verified (test files + framework) / **Tests not executed** during this build
> **Generated:** 2026-10-13

## 1. Test Framework

| Item | Value | Evidence |
| --- | --- | --- |
| Framework | Node.js built-in test runner (`node:test`) | `backend/package.json` |
| Run command | `npm test` → `node --test "src/**/*.test.js"` | `backend/package.json` |
| Client test | `npm run test:sidebar` → `node sidebar-smoke.mjs` | `client/package.json` |
| Security checks | `npm run security:check` / `security:check:staged` → `node scripts/security-check.mjs` | `backend/package.json` |
| Coverage tool | None detected | — |

## 2. Test Inventory (44 backend test files, **not executed**)

| Area | Files |
| --- | --- |
| Aadhaar | `src/aadhaar/aadhaar.test.js` |
| Config | `src/config/db.storagePresign.test.js` |
| Middleware | `src/middleware/localDbAccess.test.js` |
| Controllers | `froControllerScope.test.js`, `froIdleSurfaceParity.test.js` |
| Models | `audienceVotingModel.test.js`, `leadOwnership.test.js`, `votingModel.test.js` |
| Services (FRO heavy) | `froAgentAttribution`, `froCollectionMatch`, `froCoverIdleParity`, `froIdleStripRead`, `froLateLoginClamp`, `froLiveWindow`, `froMonthlyTarget`, `froSessionEndIdle`, `froTimeReconcile`, `froTimeReport`, `froTimeStatus` |
| Services (other) | `hrWhatsAppService`, `mediaReachability`, `operatorNameService`, `receiptFileLink`, `signatureMediaLink`, `teamCollectionService` |
| Utils | `activityProgramPrompt`, `calendarific`, `dailyReportPanels`, `documentsValue`, `festivalSuggestions`, `froCounterDay`, `froIdleCoverFreezeRead`, `froIdleStaleCounterRead`, `froSettleWindow`, `froTimeState`, `importantDays`, `ist`, `leads`, `loanTerm`, `observances`, `stationDonorScope`, `teamCollection`, `workAs`, `workAsCoverFreeze` |

**Observation:** test coverage is concentrated on FRO time/idle/cover logic, incentives-adjacent math, and aadhaar/utils — i.e., the highest-risk business rules. General CRUD controllers have little unit coverage.

## 3. Execution Status

| Command | Status | Result |
| --- | --- | --- |
| `npm test` (backend) | **Not executed** | Tests may attempt DB connections; DB/env required to run safely. Run against a dev DB, not production. |
| `npm run test:sidebar` (client) | **Not executed** | Requires built client/dist. |
| `npm run security:check` | **Not executed** | — |

**Label:** all test results in this documentation set are *not executed* unless a command is run here with output recorded.

## 4. Feature-to-Test Traceability Matrix

| Feature/Business area | Automated tests | Manual QA |
| --- | --- | --- |
| FRO live-window/idle/cover | `froLiveWindow`, `froIdle*`, `froTime*` suites | FRO panel idle widget |
| FRO monthly target & rollover | `froMonthlyTarget`, `froAgentAttribution` | Admin monthly target view |
| FRO collection matching | `froCollectionMatch`, `teamCollectionService` | Bank audit matching |
| Aadhaar decode | `aadhaar.test.js` | Beneficiary import |
| Lead verification credits | `leads.test.js`, `leadOwnership.test.js` | Accounts LeadAudit |
| Salary/attendance math | `workAs`, `loanTerm`, `salaryDays` (util) | Payroll exports |
| WhatsApp HR service | `hrWhatsAppService.test.js` | HR WhatsApp sends |
| Media/signature linking | `mediaReachability`, `receiptFileLink`, `signatureMediaLink` | Certificate generation |
| Voting/audience voting models | `votingModel`, `audienceVotingModel` | Award ceremonies |

## 5. Manual Testing Checklist

See [MANUAL-TESTING](MANUAL-TESTING.md).
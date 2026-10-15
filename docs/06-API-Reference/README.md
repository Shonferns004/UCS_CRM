# UCS CRM — API Reference (Index)

> Generated 2026-10-13 from `backend/src/routes/*.js` and mount prefixes in `backend/src/index.js`.

> Status: **Verified** (routes read from source). Auth/controller column reproduces route-file text verbatim; some rows truncated.
> Endpoint paths shown are full paths = mount prefix + route path. Relative route paths are available inside each group file.

Route extraction covers `router.METHOD(...)` calls. Inline handlers, cron endpoints and non-router mounts in `index.js` are documented in `../12-Troubleshooting/` and panel docs.

## Group index

| Module group | File | Route files |
| --- | --- | --- |
| Authentication | `API-01-Authentication.md` | `authRoutes`, `codeRoutes`, `configRoutes`, `userRoutes`, `userSettingsRoutes`, `profileUpdateRequestRoutes` |
| Workers-HR | `API-02-Workers-HR.md` | `workerRoutes`, `workerBankImportRoutes`, `leaveRoutes`, `salaryRoutes`, `loanRoutes`, `letterRoutes`, `holidayRoutes`, `hrRoutes`, `hrDailyReportRoutes`, `quizRoutes` |
| Attendance-QR | `API-03-Attendance-QR.md` | `attendanceRoutes`, `attendanceCorrectionRoutes`, `qrRoutes`, `biometricRoutes`, `meetingRoutes` |
| Recruitment | `API-04-Recruitment.md` | `leadRoutes`, `callLogRoutes`, `recruiterRoutes`, `onboardingRoutes` |
| FRO-Incentives | `API-05-FRO-Incentives.md` | `froRoutes`, `froWhatsAppRoutes`, `incentiveRoutes`, `specialIncentiveRoutes`, `leadIncentiveRoutes`, `causeRoutes` |
| Accounts-Finance | `API-06-Accounts-Finance.md` | `accountsRoutes`, `bankAuditRoutes`, `bankStatementRoutes`, `emailImportRoutes`, `scraperRoutes`, `webhookRoutes`, `whatsappRoutes` |
| Beneficiaries | `API-07-Beneficiaries.md` | `beneficiaryRoutes`, `beneficiaryImportRoutes`, `programRoutes`, `benefitRoutes`, `distributionRoutes`, `operatorRoutes`, `reportRoutes`, `ocrRoutes` |
| Events | `API-08-Events.md` | `eventRoutes`, `eventHeadRoutes`, `importantDaysRoutes`, `calendarRoutes` |
| Communication | `API-09-Communication.md` | `chatRoutes`, `noticeRoutes`, `notificationRoutes`, `notificationAdminRoutes`, `ticketRoutes`, `hrWhatsAppRoutes`, `reminderRoutes`, `whatsappCrmRoutes`, `whatsappCrmDataRoutes`, `whatsappEnhancementsRoutes` |
| Admin-Platform | `API-10-Admin-Platform.md` | `ngoAdminRoutes`, `superAdminRoutes`, `ngoRoutes`, `ngoAllocationRoutes`, `taskRoutes`, `taskAssignmentRoutes`, `assetsRoutes`, `settingsRoutes`, `teamRoutes`, `dataSourceRoutes`, `dataImportRoutes`, `s3BrowserRoutes`, `envAdminRoutes`, `tempCleanupRoutes`, `simCardRoutes`, `simInventoryRoutes`, `votingRoutes`, `audienceVotingRoutes`, `achievementRoutes`, `developerTicketRoutes`, `certificateRoutes`, `bulkAgentImportRoutes`, `agentTransferRoutes` |
| Special-Apps | `API-11-Special-Apps.md` | `sevakLibraryRouter`, `metropadRouter`, `aadhaarRoutes` |

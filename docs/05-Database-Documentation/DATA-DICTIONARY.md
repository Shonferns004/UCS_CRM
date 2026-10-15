# UCS CRM — Database Data Dictionary

> Generated 2026-10-13 by scanning `backend/src` for `.from('<table>')` references.
> Status: **Partially verified**. Table names are read directly from code; column-level definitions live in schema bootstraps (`backend/src/bootstrap/`) and model files and are documented per panel where verified.
> Excludes any records/credentials. This is an inventory, not a dump of production data.

## Usage

Every key is a table name referenced by the backend. For schema truth cross-check each table against its bootstrap/model: table names that appear only in one spot were kept for completeness.

## Table inventory

| Table | Referenced from (backend files) |
| --- | --- |
| `achievements` | `models/achievementModel.js` |
| `agent_phone_assignments` | `controllers/bulkAgentImportController.js`, `controllers/froWhatsAppAuthController.js`, `controllers/froWhatsAppController.js`, `services/froWhatsAppService.js` |
| `anything` | `aadhaar/aadhaar.test.js` |
| `app_config` | `models/configModel.js` |
| `applications` | `bootstrap/ensureSevakRenewalSchema.js`, `bootstrap/ensureSevakSignatureSchema.js`, `sevakLibrary/services/application.service.js`, `sevakLibrary/services/email.service.js` |
| `assets` | `controllers/dashboardController.js`, `index.js`, `routes/assetsRoutes.js` |
| `attendance` | `config/db.js`, `controllers/attendanceController.js`, `controllers/authController.js`, `controllers/dashboardController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `models/attendanceModel.js`, `models/attendanceReportModel.js`, `models/eventHeadModel.js`, `models/salaryModel.js`, `services/froRankService.js`, `services/notificationScheduler.js`, `utils/froIdle.js` |
| `attendance_corrections` | `config/db.js`, `models/attendanceCorrectionModel.js` |
| `audit_logs` | `metropad/models/audit.model.js` |
| `auth_logout_events` | `controllers/authController.js` |
| `auth_sessions` | `controllers/authController.js`, `controllers/crmAgentsController.js`, `controllers/ngoAdminController.js` |
| `bank_audit_entries` | `config/db.js`, `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/bankStatementController.js`, `controllers/dashboardController.js`, `controllers/emailImportController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `controllers/scraperController.js`, `models/bankAuditModel.js`, `services/autoMatchService.js`, `services/creditService.js`, `services/dbHealthWatchdog.js`, `services/paymentScraperService.js`, `services/paymentWebhookService.js` |
| `bank_audit_sources` | `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/bankStatementController.js`, `controllers/emailImportController.js`, `controllers/scraperController.js`, `models/bankAuditModel.js`, `services/emailImporter.js`, `services/paymentScraperService.js`, `services/paymentWebhookService.js` |
| `beneficiaries` | `bootstrap/ensureBeneficiarySchema.js`, `controllers/authController.js`, `controllers/beneficiaryController.js`, `controllers/biometricController.js`, `controllers/bnfOperatorController.js`, `controllers/distributionController.js`, `controllers/programController.js`, `models/beneficiaryModel.js`, `models/beneficiarySourceModel.js`, `models/biometricModel.js`, `models/operatorModel.js`, `routes/reportRoutes.js`, `utils/activityProgramPrompt.js` |
| `beneficiary_assistance_requirements` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryAssistanceModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_audit_logs` | `bootstrap/ensureBeneficiarySchema.js`, `models/auditLogModel.js`, `models/operatorModel.js` |
| `beneficiary_cards` | `bootstrap/ensureBeneficiarySchema.js`, `controllers/programController.js`, `models/beneficiaryCardModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_categories` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryCategoryModel.js` |
| `beneficiary_category_assignments` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryCategoryModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_disabilities` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryDisabilityModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_documents` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryDocumentModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_education` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryEducationModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_employment` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryEmploymentModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_family_members` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryFamilyModel.js`, `models/beneficiaryModel.js` |
| `beneficiary_sequences` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryModel.js` |
| `beneficiary_source_records` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryModel.js`, `models/beneficiarySourceModel.js` |
| `benefit_distribution_items` | `bootstrap/ensureBeneficiarySchema.js`, `controllers/distributionController.js`, `models/distributionModel.js` |
| `benefit_distributions` | `bootstrap/ensureBeneficiarySchema.js`, `controllers/distributionController.js`, `models/beneficiaryModel.js`, `models/benefitModel.js`, `models/distributionModel.js`, `models/programBeneficiaryModel.js`, `routes/reportRoutes.js` |
| `benefit_eligibility_rules` | `bootstrap/ensureBeneficiarySchema.js`, `models/benefitModel.js` |
| `benefits` | `bootstrap/ensureBeneficiarySchema.js`, `models/benefitModel.js` |
| `biometric_credentials` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryModel.js`, `models/biometricModel.js` |
| `bnf_operators` | `models/bnfOperatorModel.js` |
| `bnf_programs` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryModel.js`, `models/programBeneficiaryModel.js`, `models/programModel.js`, `routes/reportRoutes.js` |
| `bnf_volunteers` | `bootstrap/ensureBeneficiarySchema.js`, `models/volunteerModel.js`, `routes/reportRoutes.js` |
| `call_logs` | `controllers/dashboardController.js`, `controllers/hrDailyReportController.js`, `models/callLogModel.js` |
| `cash_collections` | `metropad/models/cashCollection.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/station.model.js`, `metropad/services/monthlyData.service.js`, `metropad/services/refill.service.js`, `metropad/services/report.service.js`, `metropad/services/stock.service.js` |
| `causes` | `models/causeModel.js` |
| `company_policies` | `models/onboardingModel.js` |
| `contacts` | `controllers/whatsappController.js`, `controllers/whatsappWebhookController.js`, `index.js`, `services/broadcastService.js`, `services/froWhatsAppService.js`, `services/hrWhatsAppService.js` |
| `conversations` | `config/db.js`, `controllers/agentTransferController.js`, `controllers/froWhatsAppController.js`, `controllers/whatsappController.js`, `controllers/whatsappCrmDataController.js`, `controllers/whatsappEnhancementsController.js`, `controllers/whatsappWebhookController.js`, `index.js`, `services/aiReplyService.js`, `services/froWhatsAppService.js`, `services/hrWhatsAppService.js`, `services/routingService.js` |
| `coupons` | `sevakLibrary/services/coupon.service.js`, `sevakLibrary/services/email.service.js` |
| `crm_agents` | `bootstrap/ensureStationAgentOfRecordSchema.js`, `controllers/accountsController.js`, `controllers/ngoAdminController.js`, `models/crmAgentModel.js`, `services/operatorNameService.js` |
| `daily_achievements` | `controllers/ngoAdminController.js`, `models/dailyAchievementModel.js`, `models/salaryModel.js` |
| `daily_reports` | `models/dailyReportModel.js` |
| `data_sources` | `models/dataSourceModel.js` |
| `developer_ticket_replies` | `models/developerTicketModel.js` |
| `developer_tickets` | `bootstrap/ensureTicketSchema.js`, `config/db.js`, `controllers/dashboardController.js`, `controllers/ticketController.js`, `models/developerTicketModel.js` |
| `donor_profiles` | `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/dashboardController.js`, `controllers/dataImportController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `controllers/superAdminController.js`, `models/bankAuditModel.js`, `models/donorProfileModel.js`, `models/froAssignmentModel.js`, `models/newDataModel.js`, `services/assignmentHelpers.js`, `services/creditService.js`, `services/leadIncentiveService.js`, `services/notificationScheduler.js` |
| `email_import_accounts` | `models/emailAccountModel.js` |
| `email_import_log` | `models/emailAccountModel.js`, `models/emailImportLogModel.js` |
| `event` | `controllers/authController.js`, `controllers/eventHeadController.js`, `middleware/authMiddleware.js`, `routes/calendarRoutes.js`, `routes/eventHeadRoutes.js`, `services/notificationScheduler.js`, `utils/panel.js` |
| `event_head_activities` | `models/eventHeadModel.js` |
| `event_head_assets` | `models/eventHeadModel.js` |
| `event_head_attendance` | `models/eventHeadModel.js` |
| `event_head_checklist` | `models/eventHeadModel.js` |
| `event_head_distributions` | `models/eventHeadModel.js` |
| `event_head_donors` | `models/eventHeadModel.js` |
| `event_head_event_activities` | `models/eventHeadModel.js` |
| `event_head_events` | `controllers/eventHeadController.js`, `models/eventHeadModel.js` |
| `event_head_expenses` | `models/eventHeadModel.js` |
| `event_head_festival_suggestions` | `models/eventHeadModel.js` |
| `event_head_materials` | `models/eventHeadModel.js` |
| `event_head_media` | `bootstrap/ensureEventHeadSchema.js`, `models/eventHeadModel.js` |
| `event_head_partners` | `models/eventHeadModel.js` |
| `event_head_planner_suggestions` | `models/eventHeadModel.js` |
| `event_head_sectors` | `models/eventHeadModel.js` |
| `event_head_social_tracking` | `models/eventHeadModel.js` |
| `event_head_vehicles` | `models/eventHeadModel.js` |
| `event_head_volunteers` | `models/eventHeadModel.js` |
| `event_programs` | `models/operatorModel.js` |
| `events` | `controllers/dashboardController.js`, `models/eventModel.js`, `routes/calendarRoutes.js` |
| `fcm_tokens` | `index.js`, `models/notificationModel.js`, `services/fcmService.js` |
| `fro_assignments` | `config/db.js`, `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/dashboardController.js`, `controllers/dataImportController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `controllers/superAdminController.js`, `models/bankAuditModel.js`, `models/froAssignmentModel.js`, `models/froDonorLogModel.js`, `models/newDataModel.js`, `routes/froRoutes.js`, `services/creditService.js`, `services/dbHealthWatchdog.js`, `services/froWhatsAppService.js`, `services/notificationScheduler.js` |
| `fro_daily_stats` | `controllers/ngoAdminController.js`, `models/salaryModel.js` |
| `fro_data_requests` | `controllers/dashboardController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js` |
| `fro_donor_logs` | `bootstrap/ensureFroDonorLogOperatorSchema.js`, `config/db.js`, `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/dashboardController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `controllers/notificationController.js`, `controllers/superAdminController.js`, `controllers/whatsappController.js`, `models/bankAuditModel.js`, `models/froDonorLogModel.js`, `models/salaryModel.js`, `services/autoMatchService.js`, `services/creditService.js`, `services/dbHealthWatchdog.js`, `services/leadIncentiveService.js` |
| `fro_live_status` | `config/db.js`, `controllers/authController.js`, `controllers/dashboardController.js`, `controllers/froController.js`, `controllers/froIdleSurfaceParity.test.js`, `controllers/ngoAdminController.js`, `models/workAsSessionModel.js`, `services/froIdleCommit.js`, `services/froLiveWindow.js`, `services/froLiveWindow.test.js` |
| `fro_monthly_targets` | `controllers/dashboardController.js`, `controllers/ngoAdminController.js`, `models/froTargetModel.js`, `models/incentiveModel.js`, `models/salaryModel.js`, `services/froRankService.js` |
| `fro_scheduled_contacts` | `controllers/accountsController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `models/froAssignmentModel.js`, `services/notificationScheduler.js` |
| `fro_station_assignments` | `bootstrap/ensureStationAgentOfRecordSchema.js`, `controllers/accountsController.js`, `controllers/authController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `controllers/notificationController.js`, `controllers/specialIncentiveController.js`, `models/froAssignmentModel.js`, `models/froStationAssignmentModel.js`, `models/salaryModel.js`, `services/specialIncentiveService.js` |
| `fro_targets` | `controllers/ngoAdminController.js` |
| `fro_transfers` | `controllers/dashboardController.js`, `controllers/ngoAdminController.js`, `models/froAssignmentModel.js`, `services/notificationScheduler.js` |
| `fro_whatsapp_assignments` | `controllers/froWhatsAppController.js`, `models/froWhatsAppAssignmentModel.js`, `services/froWhatsAppService.js` |
| `generated_letters` | `models/letterModel.js` |
| `holidays` | `controllers/accountsController.js`, `controllers/eventHeadController.js`, `models/attendanceReportModel.js`, `models/holidayModel.js`, `models/salaryModel.js`, `routes/calendarRoutes.js`, `utils/observanceMerge.js`, `utils/observances.js` |
| `hr_daily_reports` | `models/hrDailyReportModel.js` |
| `hr_whatsapp_sends` | `models/hrWhatsAppSendModel.js` |
| `hrs` | `controllers/dailyReportController.js`, `controllers/onboardingController.js`, `models/hrModel.js` |
| `impersonation_codes` | `config/db.js`, `models/impersonationCodeModel.js` |
| `import_batches` | `bootstrap/ensureBeneficiarySchema.js`, `models/importBatchModel.js` |
| `import_rows` | `bootstrap/ensureBeneficiarySchema.js`, `models/importBatchModel.js` |
| `incentive_settings` | `models/incentiveSettingsModel.js` |
| `incentive_slab_fros` | `models/incentiveSlabModel.js` |
| `incentive_slab_tiers` | `models/incentiveSlabTierModel.js` |
| `incentive_slabs` | `config/db.js`, `models/incentiveSlabModel.js`, `services/leadIncentiveService.js` |
| `incentive_targets` | `controllers/ngoAdminController.js`, `models/incentiveModel.js`, `models/salaryModel.js` |
| `lead_assignments` | `controllers/ngoAdminController.js` |
| `lead_champion_announcements` | `bootstrap/ensureSpecialIncentiveSchema.js`, `config/db.js`, `models/leadChampionModel.js`, `services/leadIncentiveService.js` |
| `leads` | `bootstrap/ensureLeadsRecruiterFkSchema.js`, `config/db.js`, `controllers/dashboardController.js`, `controllers/ngoAdminController.js`, `middleware/authMiddleware.js`, `models/leadModel.js`, `models/noticeModel.js`, `routes/achievementRoutes.js`, `routes/calendarRoutes.js`, `routes/dashboardRoutes.js`, `routes/eventRoutes.js`, `routes/holidayRoutes.js` |
| `leaves` | `config/db.js`, `controllers/dashboardController.js`, `index.js`, `models/leaveModel.js`, `models/salaryModel.js` |
| `letter_templates` | `models/letterModel.js` |
| `machine_status_history` | `metropad/models/machine.model.js`, `metropad/models/machineStatusHistory.model.js` |
| `machines` | `metropad/models/machine.model.js`, `metropad/models/machineStatusHistory.model.js`, `metropad/models/maintenance.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/recordEnricher.js`, `metropad/models/refill.model.js`, `metropad/models/station.model.js`, `metropad/models/stockIssue.model.js`, `metropad/services/dashboard.service.js`, `metropad/services/import.service.js`, `metropad/services/monthlyData.service.js`, `metropad/services/refill.service.js`, `metropad/services/report.service.js`, `metropad/services/stock.service.js` |
| `mail_log` | `sevakLibrary/services/application.service.js` |
| `maintenance_records` | `metropad/models/machine.model.js`, `metropad/models/maintenance.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/station.model.js`, `metropad/services/monthlyData.service.js`, `metropad/services/report.service.js` |
| `media_library` | `services/froWhatsAppService.js` |
| `meetings` | `controllers/meetingController.js` |
| `messages` | `config/db.js`, `controllers/froWhatsAppController.js`, `controllers/whatsappController.js`, `controllers/whatsappCrmDataController.js`, `controllers/whatsappEnhancementsController.js`, `controllers/whatsappWebhookController.js`, `index.js`, `services/aiReplyService.js`, `services/froWhatsAppService.js` |
| `metro_lines` | `metropad/models/machine.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/recordEnricher.js`, `metropad/models/station.model.js`, `metropad/services/cashCollection.service.js`, `metropad/services/dashboard.service.js`, `metropad/services/import.service.js`, `metropad/services/monthlyData.service.js`, `metropad/services/report.service.js`, `metropad/services/stock.service.js` |
| `metropad_users` | `metropad/models/machineStatusHistory.model.js`, `metropad/models/user.model.js` |
| `monthly_data` | `metropad/models/machine.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/monthlyData.model.js`, `metropad/models/station.model.js`, `metropad/services/report.service.js` |
| `monthly_refill_status` | `metropad/models/machine.model.js`, `metropad/services/stock.service.js` |
| `new_data` | `controllers/dataImportController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `models/donorProfileModel.js`, `models/froAssignmentModel.js`, `models/newDataModel.js`, `services/assignmentHelpers.js` |
| `ngo_allocation_settings` | `models/ngoAllocationModel.js` |
| `ngos` | `bootstrap/ensureBeneficiarySchema.js`, `bootstrap/ensureCertificateSchema.js`, `bootstrap/ensureEventHeadSchema.js`, `controllers/accountsController.js`, `controllers/authController.js`, `controllers/bankAuditController.js`, `controllers/dashboardController.js`, `controllers/dataImportController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `models/bankAuditModel.js`, `models/beneficiaryModel.js`, `models/eventHeadModel.js`, `models/froDonorLogModel.js`, `models/newDataModel.js`, `models/ngoAllocationModel.js`, `models/ngoModel.js`, `models/salaryModel.js`, `models/userNgoAccessModel.js`, `routes/beneficiaryImportRoutes.js`, `services/paymentScraperService.js` |
| `notices` | `bootstrap/ensureNoticeSchema.js`, `controllers/dashboardController.js`, `models/noticeModel.js` |
| `notification_log` | `config/db.js`, `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/dashboardController.js`, `controllers/developerTicketController.js`, `controllers/froController.js`, `controllers/leadIncentiveController.js`, `controllers/notificationController.js`, `models/notificationModel.js`, `services/chatNotificationService.js`, `services/creditService.js`, `services/leadIncentiveService.js`, `services/notificationScheduler.js`, `services/specialIncentiveService.js` |
| `operator_assignments` | `bootstrap/ensureOperatorSchema.js`, `models/operatorModel.js` |
| `operator_events` | `models/operatorModel.js` |
| `pad_stock` | `metropad/models/machine.model.js`, `metropad/services/refill.service.js` |
| `payment_webhook_log` | `models/paymentWebhookLogModel.js` |
| `program_beneficiaries` | `bootstrap/ensureBeneficiarySchema.js`, `models/beneficiaryModel.js`, `models/programBeneficiaryModel.js`, `routes/reportRoutes.js` |
| `program_beneficiary_requirements` | `bootstrap/ensureBeneficiarySchema.js`, `models/programModel.js` |
| `program_requirements` | `bootstrap/ensureBeneficiarySchema.js`, `models/programModel.js` |
| `program_service_requirements` | `bootstrap/ensureBeneficiarySchema.js`, `models/programModel.js` |
| `program_volunteer_requirements` | `bootstrap/ensureBeneficiarySchema.js`, `models/programModel.js` |
| `program_volunteers` | `bootstrap/ensureBeneficiarySchema.js`, `models/programBeneficiaryModel.js`, `models/volunteerModel.js` |
| `qr_codes` | `models/attendanceModel.js`, `models/qrModel.js` |
| `quick_replies` | `services/froWhatsAppService.js` |
| `quiz_results` | `controllers/quizController.js` |
| `razorpay_accounts` | `models/razorpayAccountModel.js` |
| `receipt_claims` | `controllers/froController.js` |
| `receipts` | `config/db.js`, `config/db.storagePresign.test.js`, `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/bankStatementController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `controllers/whatsappController.js`, `controllers/whatsappWebhookController.js`, `models/bankAuditModel.js`, `models/receiptModel.js`, `models/salaryModel.js`, `services/autoMatchService.js`, `services/creditService.js`, `services/dbHealthWatchdog.js`, `services/receiptLookup.js` |
| `refill_records` | `metropad/models/machine.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/refill.model.js`, `metropad/models/station.model.js`, `metropad/services/dashboard.service.js`, `metropad/services/monthlyData.service.js`, `metropad/services/refill.service.js`, `metropad/services/report.service.js`, `metropad/services/stock.service.js` |
| `rejected_lead_tickets` | `config/db.js`, `controllers/accountsController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `index.js` |
| `reminder_device_tokens` | `models/reminderModel.js`, `services/reminderNotificationScheduler.js` |
| `salary_allocations` | `controllers/ngoController.js`, `models/ngoAllocationModel.js` |
| `salary_history` | `controllers/dashboardController.js`, `models/ngoAllocationModel.js`, `models/salaryModel.js` |
| `salary_holds` | `controllers/salaryController.js`, `models/salaryModel.js` |
| `salary_payments` | `models/ngoAllocationModel.js` |
| `scheduled_notifications` | `models/notificationAdminModel.js` |
| `scraper_run_entries` | `controllers/scraperController.js`, `services/paymentScraperService.js` |
| `scraper_runs` | `controllers/scraperController.js`, `services/paymentScraperService.js` |
| `settings` | `models/settingsModel.js`, `services/teamCollectionService.js` |
| `sim_card_history` | `models/simCardModel.js` |
| `sim_card_replacements` | `models/simCardModel.js` |
| `sim_cards` | `models/simCardModel.js` |
| `sim_inventory` | `models/simInventoryModel.js` |
| `special_incentive_progress` | `config/db.js`, `services/specialIncentiveService.js` |
| `special_incentives` | `config/db.js`, `controllers/specialIncentiveController.js`, `services/specialIncentiveService.js` |
| `stations` | `metropad/models/machine.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/recordEnricher.js`, `metropad/models/station.model.js`, `metropad/services/cashCollection.service.js`, `metropad/services/dashboard.service.js`, `metropad/services/import.service.js`, `metropad/services/monthlyData.service.js`, `metropad/services/report.service.js`, `metropad/services/stock.service.js` |
| `stock_config` | `metropad/services/stock.service.js` |
| `stock_issues` | `metropad/models/machine.model.js`, `metropad/models/metroLine.model.js`, `metropad/models/station.model.js`, `metropad/models/stockIssue.model.js`, `metropad/services/monthlyData.service.js`, `metropad/services/report.service.js` |
| `support_tickets` | `bootstrap/ensureTicketSchema.js`, `config/db.js`, `controllers/dashboardController.js`, `controllers/ticketController.js` |
| `suspense_donations` | `controllers/accountsController.js` |
| `tasks` | `models/taskModel.js` |
| `ticket_replies` | `bootstrap/ensureTicketSchema.js`, `config/db.js`, `controllers/ticketController.js` |
| `user_ngo_access` | `models/userNgoAccessModel.js` |
| `user_settings` | `models/userSettingsModel.js` |
| `users` | `bootstrap/ensureChatSchema.js`, `controllers/accountsController.js`, `controllers/dailyReportController.js`, `controllers/dashboardController.js`, `controllers/froController.js`, `controllers/hrDailyReportController.js`, `controllers/ngoAdminController.js`, `controllers/notificationAdminController.js`, `controllers/onboardingController.js`, `controllers/ticketController.js`, `models/chatModel.js`, `models/userModel.js`, `models/userNgoAccessModel.js`, `services/operatorNameService.js` |
| `whatsapp-media` | `controllers/whatsappWebhookController.js`, `index.js`, `services/froWhatsAppService.js`, `services/signatureMediaLink.js` |
| `whatsapp_accounts` | `controllers/bulkAgentImportController.js`, `controllers/froWhatsAppController.js`, `index.js`, `models/whatsappAccountModel.js`, `services/froWhatsAppService.js` |
| `whatsapp_ai_settings` | `services/aiReplyService.js` |
| `whatsapp_ai_suggestions` | `controllers/whatsappEnhancementsController.js`, `services/aiReplyService.js` |
| `whatsapp_broadcast_recipients` | `controllers/whatsappWebhookController.js`, `services/broadcastService.js` |
| `whatsapp_broadcasts` | `services/broadcastService.js` |
| `whatsapp_routing_rules` | `services/routingService.js` |
| `whatsapp_templates` | `services/froWhatsAppService.js`, `services/templateSyncService.js` |
| `whatsapp_webhook_logs` | `controllers/whatsappWebhookController.js` |
| `work_as_sessions` | `models/workAsSessionModel.js` |
| `work_queue` | `controllers/accountsController.js`, `controllers/ngoAdminController.js`, `models/workQueueModel.js` |
| `worker-documents` | `controllers/attendanceController.js`, `controllers/froController.js`, `controllers/leadIncentiveController.js`, `controllers/onboardingController.js`, `controllers/operatorController.js`, `controllers/selfiePunchController.js`, `controllers/specialIncentiveController.js` |
| `worker_agent_assignments` | `controllers/froWhatsAppController.js`, `services/froWhatsAppService.js` |
| `worker_aliases` | `controllers/accountsController.js`, `models/crmAgentModel.js`, `models/froDonorLogModel.js`, `utils/workerNameMatch.js` |
| `worker_loan_deductions` | `models/loanModel.js` |
| `worker_loans` | `config/db.js`, `controllers/dashboardController.js`, `models/loanModel.js`, `models/salaryModel.js` |
| `worker_ngo_allocations` | `controllers/accountsController.js`, `controllers/froController.js`, `controllers/ngoAdminController.js`, `models/ngoAllocationModel.js`, `models/salaryModel.js`, `models/userNgoAccessModel.js`, `models/workerModel.js`, `models/workerNgoAllocationModel.js` |
| `worker_people_allocations` | `controllers/ngoController.js`, `models/ngoAllocationModel.js` |
| `workers` | `bootstrap/ensureChatSchema.js`, `bootstrap/ensureDocumentsSchema.js`, `bootstrap/ensureFroTimeSessionsAgentSchema.js`, `bootstrap/ensureLeadsRecruiterFkSchema.js`, `bootstrap/ensureOperatorSchema.js`, `bootstrap/ensureSignatureSchema.js`, `controllers/accountsController.js`, `controllers/bankAuditController.js`, `controllers/dailyReportController.js`, `controllers/dashboardController.js`, `controllers/developerTicketController.js`, `controllers/froController.js`, `controllers/froReportController.js`, `controllers/hrWhatsAppController.js`, `controllers/leadIncentiveController.js`, `controllers/meetingController.js`, `controllers/ngoAdminController.js`, `controllers/ngoController.js`, `controllers/specialIncentiveController.js`, `controllers/superAdminController.js`, `controllers/ticketController.js`, `controllers/workerBankImportController.js`, `index.js`, `models/attendanceReportModel.js`, `models/chatModel.js`, `models/developerTicketModel.js`, `models/eventHeadModel.js`, `models/froDonorLogModel.js`, `models/froWhatsAppAssignmentModel.js`, `models/incentiveModel.js`, `models/ngoAllocationModel.js`, `models/onboardingModel.js`, `models/salaryModel.js`, `models/userNgoAccessModel.js`, `models/workerModel.js`, `routes/calendarRoutes.js`, `services/assignmentHelpers.js`, `services/autoMatchService.js`, `services/creditService.js`, `services/froRankService.js`, `services/froTimeSessions.js`, `services/leadIncentiveService.js`, `services/operatorNameService.js`, `services/specialIncentiveService.js`, `services/teamCollectionService.js`, `utils/dailyReportPanels.js`, `utils/froIdle.js`, `utils/workerNameMatch.js` |

## Notes

- Names include sub-app tables (metropad: `machines`, `metro_lines`, `refill_records`, `pad_stock`; sevak-library: `applications`, `coupons`; whatsapp CRM: `conversations`, `messages`, `contacts`).
- `anything` is a placeholder string in sample/test code, listed for completeness.
- Cards/schema clues are in `backend/src/bootstrap/ensure*.js` files.

## Cross-reference

- ER diagram seed: `docs/05-Database-Documentation/ER-DIAGRAM.md`
- Model inventory: `docs/05-Database-Documentation/MODELS-INDEX.md`
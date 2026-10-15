# UCS CRM — Models Index

> Generated 2026-10-13. Status: Verified (names/counts); table column = first `.from('<table>')` in the file (may be the model's primary table).
> These are data-access modules, not ORM entity classes. Column-level truth lives in schema bootstraps.

| Model file | Primary table (first `.from()`) | Lines | Fn-like defs | Has test |
| --- | --- | --- | --- | --- |
| `absenceProofModel.js` | `absence_proofs` | 119 | 7 |  |
| `achievementModel.js` | `achievements` | 54 | 5 |  |
| `attendanceCorrectionModel.js` | `attendance_corrections` | 106 | 8 |  |
| `attendanceModel.js` | `attendance` | 174 | 32 |  |
| `attendanceReportModel.js` | `workers` | 393 | 74 |  |
| `audienceVotingModel.js` | `—` | 464 | 48 | ✓ |
| `auditLogModel.js` | `beneficiary_audit_logs` | 62 | 7 |  |
| `bankAuditModel.js` | `receipts` | 719 | 67 |  |
| `beneficiaryAssistanceModel.js` | `beneficiary_assistance_requirements` | 41 | 4 |  |
| `beneficiaryCardModel.js` | `beneficiary_cards` | 103 | 10 |  |
| `beneficiaryCategoryModel.js` | `beneficiary_categories` | 60 | 6 |  |
| `beneficiaryDisabilityModel.js` | `beneficiary_disabilities` | 71 | 10 |  |
| `beneficiaryDocumentModel.js` | `beneficiary_documents` | 104 | 14 |  |
| `beneficiaryEducationModel.js` | `beneficiary_education` | 42 | 2 |  |
| `beneficiaryEmploymentModel.js` | `beneficiary_employment` | 41 | 2 |  |
| `beneficiaryFamilyModel.js` | `beneficiary_family_members` | 41 | 4 |  |
| `beneficiaryModel.js` | `beneficiary_sequences` | 557 | 57 |  |
| `beneficiarySourceModel.js` | `beneficiary_source_records` | 48 | 5 |  |
| `benefitModel.js` | `benefits` | 120 | 12 |  |
| `biometricModel.js` | `biometric_credentials` | 183 | 12 |  |
| `bnfCatalogModel.js` | `—` | 38 | 4 |  |
| `bnfOperatorModel.js` | `bnf_operators` | 76 | 10 |  |
| `callLogModel.js` | `call_logs` | 75 | 9 |  |
| `causeModel.js` | `causes` | 55 | 5 |  |
| `chatModel.js` | `—` | 874 | 63 |  |
| `configModel.js` | `app_config` | 49 | 6 |  |
| `dailyAchievementModel.js` | `daily_achievements` | 95 | 9 |  |
| `dailyReportModel.js` | `daily_reports` | 139 | 9 |  |
| `dataSourceModel.js` | `data_sources` | 51 | 5 |  |
| `developerTicketModel.js` | `developer_tickets` | 168 | 19 |  |
| `distributionModel.js` | `benefit_distributions` | 100 | 11 |  |
| `donorProfileModel.js` | `donor_profiles` | 196 | 26 |  |
| `emailAccountModel.js` | `email_import_accounts` | 95 | 8 |  |
| `emailImportLogModel.js` | `email_import_log` | 82 | 5 |  |
| `eventHeadModel.js` | `event_head_events` | 1138 | 172 |  |
| `eventModel.js` | `events` | 67 | 6 |  |
| `froAssignmentModel.js` | `fro_assignments` | 464 | 54 |  |
| `froDonorLogModel.js` | `fro_donor_logs` | 803 | 120 |  |
| `froStationAssignmentModel.js` | `fro_station_assignments` | 124 | 12 |  |
| `froTargetModel.js` | `fro_monthly_targets` | 182 | 13 |  |
| `froWhatsAppAssignmentModel.js` | `fro_whatsapp_assignments` | 55 | 5 |  |
| `holidayModel.js` | `holidays` | 63 | 6 |  |
| `hrDailyReportModel.js` | `hr_daily_reports` | 99 | 6 |  |
| `hrModel.js` | `hrs` | 57 | 5 |  |
| `hrWhatsAppSendModel.js` | `hr_whatsapp_sends` | 38 | 3 |  |
| `impersonationCodeModel.js` | `impersonation_codes` | 66 | 9 |  |
| `importBatchModel.js` | `import_batches` | 74 | 9 |  |
| `incentiveModel.js` | `incentive_targets` | 105 | 9 |  |
| `incentiveSettingsModel.js` | `incentive_settings` | 34 | 4 |  |
| `incentiveSlabModel.js` | `incentive_slabs` | 229 | 20 |  |
| `incentiveSlabTierModel.js` | `incentive_slab_tiers` | 73 | 7 |  |
| `leadChampionModel.js` | `lead_champion_announcements` | 165 | 11 |  |
| `leadModel.js` | `leads` | 215 | 34 |  |
| `leaveModel.js` | `leaves` | 86 | 8 |  |
| `letterModel.js` | `letter_templates` | 98 | 9 |  |
| `loanModel.js` | `worker_loans` | 248 | 25 |  |
| `newDataModel.js` | `new_data` | 151 | 22 |  |
| `ngoAllocationModel.js` | `ngo_allocation_settings` | 494 | 64 |  |
| `ngoModel.js` | `ngos` | 72 | 7 |  |
| `noticeModel.js` | `notices` | 140 | 19 |  |
| `notificationAdminModel.js` | `scheduled_notifications` | 64 | 6 |  |
| `notificationModel.js` | `fcm_tokens` | 88 | 8 |  |
| `onboardingModel.js` | `company_policies` | 254 | 19 |  |
| `operatorModel.js` | `operator_events` | 342 | 29 |  |
| `paymentWebhookLogModel.js` | `payment_webhook_log` | 62 | 5 |  |
| `profileUpdateRequestModel.js` | `—` | 65 | 7 |  |
| `programBeneficiaryModel.js` | `program_beneficiaries` | 148 | 10 |  |
| `programModel.js` | `bnf_programs` | 135 | 15 |  |
| `qrModel.js` | `qr_codes` | 40 | 4 |  |
| `razorpayAccountModel.js` | `razorpay_accounts` | 128 | 11 |  |
| `receiptModel.js` | `receipts` | 69 | 7 |  |
| `reminderModel.js` | `—` | 286 | 40 |  |
| `salaryModel.js` | `salary_history` | 1276 | 227 |  |
| `settingsModel.js` | `settings` | 33 | 4 |  |
| `simCardModel.js` | `sim_cards` | 151 | 13 |  |
| `simInventoryModel.js` | `sim_inventory` | 54 | 6 |  |
| `taskAssignmentModel.js` | `—` | 60 | 7 |  |
| `taskModel.js` | `tasks` | 61 | 6 |  |
| `userModel.js` | `users` | 85 | 8 |  |
| `userNgoAccessModel.js` | `ngos` | 87 | 4 |  |
| `userSettingsModel.js` | `user_settings` | 34 | 4 |  |
| `volunteerModel.js` | `bnf_volunteers` | 90 | 9 |  |
| `votingModel.js` | `—` | 640 | 85 | ✓ |
| `whatsappAccountModel.js` | `whatsapp_accounts` | 191 | 13 |  |
| `workAsSessionModel.js` | `work_as_sessions` | 325 | 31 |  |
| `workQueueModel.js` | `work_queue` | 241 | 45 |  |
| `workerModel.js` | `workers` | 226 | 25 |  |
| `workerNgoAllocationModel.js` | `worker_ngo_allocations` | 41 | 4 |  |
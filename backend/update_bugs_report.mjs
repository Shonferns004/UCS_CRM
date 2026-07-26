import XLSX from 'xlsx';
import fs from 'fs';

// List of fixed bug numbers
const fixedBugs = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53,
  54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
  71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87,
  88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103,
  104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116
]);

const bugs = [
  // ═══════════════════════════════════════════════════════════════
  // BATCH 1: ORIGINAL BUGS (#1–#58) — ALL FIXED
  // ═══════════════════════════════════════════════════════════════

  // CRITICAL (fixed)
  { num: 1, file: "index.js", lines: "281", sev: "CRITICAL", cat: "Syntax Error", desc: "TypeScript `as any` in .js file crashes app", fix: "Remove `as any`", fixed: "Yes" },
  { num: 2, file: "ngoAdminController.js", lines: "77,447,784,1378,1499,1843,1908", sev: "CRITICAL", cat: "Type Coercion", desc: "`ngoIds.indexOf(filterNgoId)` never matches (string vs number)", fix: "Convert filterNgoId to Number() before indexOf", fixed: "Yes" },
  { num: 3, file: "ngoAdminController.js", lines: "1519", sev: "CRITICAL", cat: "Memory", desc: "`.limit(1000000)` on getNewData loads 1M rows into memory", fix: "Reduced to FETCH_LIMIT=25000 + pagination", fixed: "Yes" },
  { num: 4, file: "ngoAdminController.js", lines: "1618-1623", sev: "CRITICAL", cat: "Memory", desc: "No limit on distributeNewData query, loads ALL rows", fix: "Added .limit(PROCESS_BATCH=10000)", fixed: "Yes" },
  { num: 5, file: "froAssignmentModel.js", lines: "249-274", sev: "CRITICAL", cat: "Memory", desc: "getStationDispositionStats fetches all rows then caps in JS at 500K", fix: "Uses SQL RPC get_station_disposition_stats", fixed: "Yes" },
  { num: 6, file: "ngoAdminController.js", lines: "1237-1254", sev: "CRITICAL", cat: "Security", desc: "removeStationByName deletes across NGOs without auth check", fix: "Scope delete to user's accessible NGOs", fixed: "Yes" },
  { num: 7, file: "ngoAdminController.js", lines: "1227-1234", sev: "CRITICAL", cat: "Security", desc: "removeStationAssignment accepts any ID, no NGO ownership check", fix: "Added NGO access verification before delete", fixed: "Yes" },
  { num: 8, file: "index.js", lines: "375-423", sev: "CRITICAL", cat: "Security", desc: "4 cron endpoints have zero authentication", fix: "Added requireCronAuth middleware + CRON_API_KEY env", fixed: "Yes" },
  { num: 9, file: "froController.js", lines: "27-71", sev: "CRITICAL", cat: "Race Condition", desc: "SELECT-then-INSERT in findOrCreateAssignment can create duplicates", fix: "Uses upsert with onConflict", fixed: "Yes" },
  { num: 10, file: "froController.js", lines: "1691-1708,1750-1759", sev: "CRITICAL", cat: "Race Condition", desc: "SELECT-then-INSERT for fro_live_status creates duplicate rows", fix: "Uses upsert with onConflict on worker_id", fixed: "Yes" },
  { num: 11, file: "froController.js", lines: "694-695", sev: "CRITICAL", cat: "Security", desc: "Stack trace exposed to client in error response", fix: "Removed stack from response", fixed: "Yes" },
  { num: 12, file: "froTargetModel.js", lines: "39-43,67-72", sev: "CRITICAL", cat: "Data Integrity", desc: "updateAchievedTarget/updateIncentive missing ngo_id filter", fix: "Added .eq('ngo_id', ngoId)", fixed: "Yes" },
  { num: 13, file: "ngoAdminController.js", lines: "2896-2900", sev: "CRITICAL", cat: "Query Bug", desc: "getDuplicateLeads uses wrong column `ngo_id` on donor_profiles", fix: "Changed to use `.in('ngo', ngoNames)`", fixed: "Yes" },
  { num: 55, file: "DonorCRM.jsx", lines: "220-222", sev: "CRITICAL", cat: "Data Integrity", desc: "Promise.all for bulk transfer causes partial data loss", fix: "Used Promise.allSettled with per-lead reporting", fixed: "Yes" },

  // HIGH (fixed)
  { num: 14, file: "froController.js", lines: "147,1140", sev: "HIGH", cat: "Null Dereference", desc: "worker.created_at accessed when worker may be null", fix: "Added null check after getWorkerById", fixed: "Yes" },
  { num: 15, file: "froController.js", lines: "1177", sev: "HIGH", cat: "Logic Bug", desc: "target=0 always triggers incentive calculations", fix: "Added `target > 0` check", fixed: "Yes" },
  { num: 16, file: "froController.js", lines: "1855", sev: "HIGH", cat: "Logic Bug", desc: "Double-counting follow_up in data_used stats", fix: "Removed follow_up from dataUsed sum", fixed: "Yes" },
  { num: 17, file: "froController.js", lines: "1686-1689", sev: "HIGH", cat: "Logic Bug", desc: "Break state unintentionally cleared on non-break updates", fix: "Removed break-clearing on non-break updates", fixed: "Yes" },
  { num: 18, file: "froController.js", lines: "1636-1641", sev: "HIGH", cat: "Security", desc: "getDonorHistory lacks station authorization check", fix: "Added station access check before returning logs", fixed: "Yes" },
  { num: 19, file: "froController.js", lines: "1920-1924", sev: "HIGH", cat: "Security", desc: "searchDonors searches all donors without station filter", fix: "Added station-based donor ID pre-filter", fixed: "Yes" },
  { num: 20, file: "froController.js", lines: "78-79", sev: "HIGH", cat: "Error Swallowing", desc: "getMyStationNames suppresses query errors, returns empty array", fix: "Changed to throw error", fixed: "Yes" },
  { num: 21, file: "assignmentHelpers.js", lines: "62-65", sev: "HIGH", cat: "Performance", desc: "N+1 query per station assignment to fetch worker names", fix: "Batch-fetches all missing worker names", fixed: "Yes" },
  { num: 22, file: "assignmentHelpers.js", lines: "67", sev: "HIGH", cat: "Crash", desc: "worker.name could be null, .toLowerCase() throws", fix: "Added null guard", fixed: "Yes" },
  { num: 23, file: "incentive.js", lines: "55", sev: "HIGH", cat: "Crash", desc: "getDayName crashes on null/undefined dateStr input", fix: "Added input validation", fixed: "Yes" },
  { num: 24, file: "froDonorLogModel.js", lines: "118-167", sev: "HIGH", cat: "Error Swallowing", desc: "Real errors silently swallowed by fallback logic", fix: "Logged errors, only fallback on 'no rows'", fixed: "Yes" },
  { num: 26, file: "index.js", lines: "59-62", sev: "HIGH", cat: "Observability", desc: "console.warn suppressed, hides library warnings", fix: "console.warn no longer suppressed", fixed: "Yes" },
  { num: 27, file: "index.js", lines: "68", sev: "HIGH", cat: "Security", desc: "CORS origin:'*' allows any website", fix: "Configurable via CORS_ORIGINS env var", fixed: "Yes" },
  { num: 28, file: "index.js", lines: "430-432", sev: "HIGH", cat: "Stability", desc: "unhandledRejection swallows errors without exiting", fix: "Added process.exit(1) after logging", fixed: "Yes" },
  { num: 47, file: "MyDonors.jsx", lines: "296-307", sev: "HIGH", cat: "Race Condition", desc: "No cancellation in loadDetail, stale data on rapid switching", fix: "Added cancelledRef and cleanup handler", fixed: "Yes" },
  { num: 53, file: "App.jsx", lines: "47", sev: "HIGH", cat: "Authorization", desc: "Super admin bypasses all role checks", fix: "Restricted to only routes allowing super_admin or *", fixed: "Yes" },

  // MEDIUM (fixed)
  { num: 25, file: "froController.js", lines: "1544-1554", sev: "MEDIUM", cat: "Logic Bug", desc: "getLeadStats only counts first donation per donor, ignores subsequent", fix: "Use Map-based aggregation per donor", fixed: "Yes" },
  { num: 29, file: "ngoAdminController.js", lines: "151", sev: "MEDIUM", cat: "Error Swallowing", desc: "Empty catch block hides transaction query failures", fix: "Logged the error", fixed: "Yes" },
  { num: 30, file: "ngoAdminController.js", lines: "498,755-761", sev: "MEDIUM", cat: "Logic Bug", desc: "Zero achieved target treated as 'not achieved'", fix: "Changed to !== null check", fixed: "Yes" },
  { num: 31, file: "ngoAdminController.js", lines: "509-518", sev: "MEDIUM", cat: "Null Dereference", desc: "allAssignments could be null in for-of loop", fix: "Added `|| []` fallback", fixed: "Yes" },
  { num: 32, file: "froAssignmentModel.js", lines: "109-112", sev: "MEDIUM", cat: "Logic Bug", desc: "getUnassignedDonorIds missing ngo_id filter", fix: "Added .eq('ngo_id', ngoId)", fixed: "Yes" },
  { num: 33, file: "froAssignmentModel.js", lines: "192-203", sev: "MEDIUM", cat: "Performance", desc: "getAssignmentCountByWorker fetches all rows to count", fix: "Reduced select to only fro_worker_id, added reassigned filter", fixed: "Yes" },
  { num: 34, file: "froAssignmentModel.js", lines: "288-306", sev: "MEDIUM", cat: "Race Condition", desc: "createTemporaryTransfer SELECT then UPDATE not atomic", fix: "Added reassigned status guard in UPDATE WHERE clause", fixed: "Yes" },
  { num: 35, file: "froAssignmentModel.js", lines: "298", sev: "MEDIUM", cat: "Data Loss", desc: "Transfer record deleted on zero results, no audit trail", fix: "Sets status to 'failed' instead of deleting", fixed: "Yes" },
  { num: 36, file: "ngoAdminController.js", lines: "3272,3442", sev: "MEDIUM", cat: "Logic Bug", desc: "Empty string may clear DB name/city fields", fix: "Only include fields with non-empty values", fixed: "Yes" },
  { num: 37, file: "ngoAdminController.js", lines: "3120", sev: "MEDIUM", cat: "Hardcoded", desc: "Station names hardcoded in source code", fix: "STATION_NAMES env var overrides hardcoded list", fixed: "Yes" },
  { num: 38, file: "froController.js", lines: "148-149,1141-1142", sev: "MEDIUM", cat: "Logic Bug", desc: "monthsEmployed calculation ignores day of month", fix: "Added day-of-month check for precise calculation", fixed: "Yes" },
  { num: 39, file: "froController.js", lines: "1078", sev: "MEDIUM", cat: "Logic Bug", desc: "invalid_number missing from disposition map", fix: "Added invalid_number entry", fixed: "Yes" },
  { num: 40, file: "froController.js", lines: "165-173,225-230", sev: "MEDIUM", cat: "Logic Bug", desc: "Timezone: UTC vs local date shift", fix: "Use Date.UTC() for todayStart/todayEnd", fixed: "Yes" },
  { num: 41, file: "froController.js", lines: "543,741", sev: "MEDIUM", cat: "Logic Bug", desc: "Inconsistent dedup keys, ignores ngo_id", fix: "Use `${donor_id}-${ngo_id}` as dedup key", fixed: "Yes" },
  { num: 42, file: "froController.js", lines: "449,460,705+", sev: "MEDIUM", cat: "Performance", desc: "No pagination on large queries", fix: "Added hard limits (500 donors, 200 transferred)", fixed: "Yes" },
  { num: 43, file: "froController.js", lines: "785,820,864,1099,1624,1979", sev: "MEDIUM", cat: "Input Validation", desc: "parseInt on params without NaN check", fix: "Added isNaN validation after every parseInt", fixed: "Yes" },
  { num: 44, file: "froController.js", lines: "1660-1674", sev: "MEDIUM", cat: "Input Validation", desc: "Live status fields accept arbitrary/negative values", fix: "Added enum whitelist and non-negative numeric validation", fixed: "Yes" },
  { num: 45, file: "froController.js", lines: "1101", sev: "MEDIUM", cat: "Input Validation", desc: "scheduled_at not validated as valid date", fix: "Added isNaN(new Date(scheduled_at).getTime()) check", fixed: "Yes" },
  { num: 46, file: "froController.js", lines: "1421-1422", sev: "MEDIUM", cat: "Input Validation", desc: "Data request message length not bounded", fix: "Added max 2000 character length check", fixed: "Yes" },
  { num: 48, file: "MyDonors.jsx", lines: "519-528", sev: "MEDIUM", cat: "Dead Code", desc: "setMessage unreachable after unconditional return", fix: "Restructured logic with proper flow control", fixed: "Yes" },
  { num: 49, file: "MyDonors.jsx", lines: "226-231", sev: "MEDIUM", cat: "Missing Deps", desc: "useEffect missing donors in dependency array", fix: "Added all used values to dependency array", fixed: "Yes" },
  { num: 50, file: "MyDonors.jsx", lines: "366-367", sev: "MEDIUM", cat: "Stale Closure", desc: "leadAmount in FileReader onload may be stale", fix: "Used functional state update", fixed: "Yes" },
  { num: 54, file: "App.jsx", lines: "96-98", sev: "MEDIUM", cat: "Navigation", desc: "navigate(undefined) if role not in ROLE_PATHS", fix: "Added fallback path /login", fixed: "Yes" },
  { num: 57, file: "NewData.jsx", lines: "248", sev: "MEDIUM", cat: "Logic Bug", desc: "Page not reset when switching tabs", fix: "Added setPage(1) when tab changes", fixed: "Yes" },
  { num: 58, file: "StationManagement.jsx", lines: "Multiple", sev: "MEDIUM", cat: "UX", desc: "Widespread use of alert() for all errors", fix: "Replaced all alert() with toast() in ngo-admin pages", fixed: "Yes" },

  // LOW (fixed)
  { num: 51, file: "MyDonors.jsx", lines: "287-291", sev: "LOW", cat: "Stale Closure", desc: "Cleanup effect may save stale progress on unmount", fix: "Used ref to track latest values", fixed: "Yes" },
  { num: 52, file: "MyDonors.jsx", lines: "46-48", sev: "LOW", cat: "Stale Date", desc: "tomorrowStr computed once at module load", fix: "Moved computation inline at render time", fixed: "Yes" },
  { num: 56, file: "DonorCRM.jsx", lines: "3", sev: "LOW", cat: "Unused Import", desc: "ArrowDown imported but never used", fix: "Removed unused import", fixed: "Yes" },

  // ═══════════════════════════════════════════════════════════════
  // BATCH 2: NEW BUGS (#59–#116) — ALL FIXED
  // ═══════════════════════════════════════════════════════════════

  // ── NEW CRITICAL ──
  { num: 59, file: "paymentWebhookService.js", lines: "66-89", sev: "CRITICAL", cat: "Race Condition", desc: "Payment deduplication uses SELECT-then-INSERT without unique constraint; concurrent webhooks create duplicate bank entries", fix: "Add UNIQUE constraint on bank_audit_entries.payment_id or use INSERT...ON CONFLICT DO NOTHING [Trivial — 5 min, add DB constraint + upsert]", fixed: "Yes" },
  { num: 60, file: "donorProfileModel.js", lines: "13-98", sev: "CRITICAL", cat: "Race Condition", desc: "upsertDonorProfile reads total_amount then writes back; concurrent donations produce incorrect aggregated totals", fix: "Use atomic DB increment: SET total_amount = total_amount + $amt, donation_count = donation_count + 1 [Trivial — 10 min, replace read-modify-write with atomic UPDATE]", fixed: "Yes" },
  { num: 61, file: "index.js", lines: "149-247", sev: "CRITICAL", cat: "Security", desc: "Inline /api/whatsapp/send endpoint has NO authentication; anyone can send WhatsApp messages and read access tokens", fix: "Add authenticate + authenticateRole('super_admin','admin') middleware to the inline route [Trivial — 2 min, add middleware args]", fixed: "Yes" },
  { num: 62, file: "index.js", lines: "249-340", sev: "CRITICAL", cat: "Security", desc: "Inline /api/whatsapp/send-file endpoint has NO authentication", fix: "Add authenticate + role middleware same as #61 [Trivial — 2 min]", fixed: "Yes" },
  { num: 63, file: "whatsappRoutes.js", lines: "5", sev: "CRITICAL", cat: "Security", desc: "/send-message route has NO authentication middleware", fix: "Add authenticate middleware before sendMessage handler [Trivial — 1 min]", fixed: "Yes" },
  { num: 64, file: "ocrRoutes.js", lines: "6-7", sev: "CRITICAL", cat: "Security", desc: "/parse and /extract OCR endpoints have NO authentication; anonymous users can abuse AI API credits", fix: "Add authenticate + role middleware [Trivial — 2 min]", fixed: "Yes" },

  // ── NEW HIGH ──
  { num: 65, file: "ngoAdminController.js", lines: "1004-1057", sev: "HIGH", cat: "Security", desc: "verifyLeadDone: no NGO authorization check; any user can verify any lead regardless of NGO", fix: "After fetching assignment, verify assignment.ngo_id is in user's getUserNgoIds() [Easy — 10 min, add 1 check]", fixed: "Yes" },
  { num: 66, file: "ngoAdminController.js", lines: "2466-2477", sev: "HIGH", cat: "Security", desc: "returnTransferEarly: no authorization check; any user can reverse any transfer by ID", fix: "Look up transfer, verify ngo_id is in user's accessible NGOs [Easy — 10 min, add ownership check]", fixed: "Yes" },
  { num: 67, file: "ngoAdminController.js", lines: "1278-1306", sev: "HIGH", cat: "Security", desc: "createStationHandler: ngo_id from req.body used without verifying user has access to that NGO", fix: "Verify ngo_id is in getUserNgoIds() if provided [Easy — 5 min, add 1 validation]", fixed: "Yes" },
  { num: 68, file: "ngoAdminController.js", lines: "2863-2882", sev: "HIGH", cat: "Security", desc: "transferLead: any authenticated user can transfer any lead by numeric ID with no scope check", fix: "Verify lead belongs to user's NGO scope before updating [Easy — 10 min]", fixed: "Yes" },
  { num: 69, file: "ngoAdminController.js", lines: "2948-2983", sev: "HIGH", cat: "Security", desc: "getFullDonorDetail: any user can view any donor's full profile by passing donor ID", fix: "Verify donor has fro_assignment with ngo_id in user's NGOs [Easy — 10 min]", fixed: "Yes" },
  { num: 70, file: "dashboardController.js", lines: "811-861", sev: "HIGH", cat: "Security", desc: "getFroWorkerDashboard: any user can view any worker's dashboard by passing workerId", fix: "Verify worker belongs to user's accessible NGOs or is self [Easy — 10 min]", fixed: "Yes" },
  { num: 71, file: "settingsModel.js", lines: "10", sev: "HIGH", cat: "Logic Bug", desc: "`return data?.value || null` treats falsy values (0, false, '') as null; loses legitimate settings", fix: "Change || to ?? (nullish coalescing) [Trivial — 1 min]", fixed: "Yes" },
  { num: 72, file: "userSettingsModel.js", lines: "11", sev: "HIGH", cat: "Logic Bug", desc: "Same || vs ?? bug as #71; falsy settings values silently become null", fix: "Change || to ?? [Trivial — 1 min]", fixed: "Yes" },
  { num: 73, file: "newDataModel.js", lines: "56-67", sev: "HIGH", cat: "Logic Bug", desc: "updateNewDataStatus without ngoName updates ALL NGOs' records for those mobile numbers", fix: "Always require ngoName or throw if missing [Easy — 5 min, add guard]", fixed: "Yes" },
  { num: 74, file: "froWhatsAppService.js", lines: "499", sev: "HIGH", cat: "Security", desc: "SQL pattern injection via ilike; user input with % or _ corrupts search results", fix: "Escape % and _ in query: query.replace(/%/g,'\\\\%').replace(/_/g,'\\\\_') [Easy — 5 min]", fixed: "Yes" },
  { num: 75, file: "leadModel.js", lines: "24", sev: "HIGH", cat: "Security", desc: "Same ilike pattern injection in search filter; unsanitized user input in ilike", fix: "Escape special chars before ilike [Easy — 5 min]", fixed: "Yes" },
  { num: 76, file: "ngoAdminRoutes.js", lines: "69", sev: "HIGH", cat: "Security", desc: "Multer memoryStorage with no file size limit; user can upload multi-GB files crashing server", fix: "Add limits: { fileSize: 50 * 1024 * 1024 } to multer options [Trivial — 2 min]", fixed: "Yes" },
  { num: 77, file: "dataImportRoutes.js", lines: "7", sev: "HIGH", cat: "Security", desc: "Same multer no-limit issue; memory DoS vector on import endpoints", fix: "Add limits: { fileSize: ... } to multer [Trivial — 2 min]", fixed: "Yes" },
  { num: 78, file: "eventHeadRoutes.js", lines: "all", sev: "HIGH", cat: "Security", desc: "No role authorization on event head routes; any authenticated user (worker, telecaller) can manage events", fix: "Add authenticateRole('super_admin','admin','hr','event_head') middleware [Easy — 5 min, replace authenticate]", fixed: "Yes" },
  { num: 79, file: "dashboardController.js", lines: "603-623", sev: "HIGH", cat: "Performance", desc: "N+1 queries in getFroLiveStatus; 2 queries per FRO worker (stats + collection)", fix: "Batch-fetch all assignments in one query grouped by worker [Medium — 30 min, restructure to batch]", fixed: "Yes" },
  { num: 80, file: "dashboardController.js", lines: "650-652,688-690,718-720", sev: "HIGH", cat: "Performance", desc: "3 dashboard endpoints load ALL attendance records with no date filter; unbounded memory", fix: "Add .gte('date', monthStart) date filter to each query [Easy — 10 min, add 1 filter per query]", fixed: "Yes" },
  { num: 81, file: "dashboardController.js", lines: "916-919", sev: "HIGH", cat: "Performance", desc: "getSuperAdminAlerts loads ALL fro_donor_logs from 7 days with no limit", fix: "Add .limit(50000) or aggregate server-side [Easy — 5 min]", fixed: "Yes" },
  { num: 82, file: "WhatsAppAccountsManager.jsx", lines: "201", sev: "HIGH", cat: "Security", desc: "WhatsApp access_token input uses type='text'; secret visible on screen and in DOM", fix: "Change type='text' to type='password' [Trivial — 1 min]", fixed: "Yes" },

  // ── NEW MEDIUM ──
  { num: 83, file: "ReceiptTemplateManncar.jsx", lines: "30,46,60", sev: "MEDIUM", cat: "Crash", desc: ".toUpperCase() called on donor['Donor Name'] without optional chaining; null name crashes receipt", fix: "Use donor['Donor Name']?.toUpperCase() || 'Unknown' [Trivial — 2 min, add ?.", fixed: "Yes" },
  { num: 84, file: "NgoAdminPanel.jsx", lines: "102-116", sev: "MEDIUM", cat: "React Violation", desc: "Early return before hooks; useState/useEffect/useRef called conditionally, violates Rules of Hooks", fix: "Move all hooks above the early return [Easy — 10 min, reorder code]", fixed: "Yes" },
  { num: 85, file: "ngoAdminController.js", lines: "1009-1049", sev: "MEDIUM", cat: "Race Condition", desc: "verifyLeadDone TOCTOU: reads accounts_status='pending' before update; concurrent requests double-verify", fix: "Use atomic update: .eq('accounts_status','pending') in WHERE, check affectedRows === 1 [Easy — 10 min]", fixed: "Yes" },
  { num: 86, file: "ngoAdminController.js", lines: "1308-1347", sev: "MEDIUM", cat: "Data Loss", desc: "updateStationNgos does delete-then-insert without transaction; insert failure loses old assignment", fix: "Use upsert instead of delete+insert, or wrap in DB transaction [Medium — 20 min]", fixed: "Yes" },
  { num: 87, file: "ngoAdminController.js", lines: "1920-1922", sev: "MEDIUM", cat: "Error Swallowing", desc: "getAlerts returns HTTP 200 with empty array on error; hides DB failures from client", fix: "Return res.status(500).json({ message: error.message }) [Trivial — 2 min]", fixed: "Yes" },
  { num: 88, file: "ngoAdminController.js", lines: "1963-1966", sev: "MEDIUM", cat: "Error Swallowing", desc: "getRejectedLeads returns 200 with empty array on error; same as #87", fix: "Return 500 status on error [Trivial — 2 min]", fixed: "Yes" },
  { num: 89, file: "ngoAdminController.js", lines: "2885-2912", sev: "MEDIUM", cat: "Security", desc: "getLeadHistory: no NGO authorization check; can query history for any lead", fix: "Scope query by user's NGOs [Easy — 10 min]", fixed: "Yes" },
  { num: 90, file: "ngoAdminController.js", lines: "2985-3010", sev: "MEDIUM", cat: "Security", desc: "getDonorReceipts: no NGO authorization; can access any donor's receipts", fix: "Verify donor belongs to accessible NGO [Easy — 10 min]", fixed: "Yes" },
  { num: 91, file: "ngoAdminController.js", lines: "3045-3078", sev: "MEDIUM", cat: "Security", desc: "createFollowup: no NGO auth; can create follow-up on another NGO's assignment", fix: "Fetch assignment.ngo_id and verify against getUserNgoIds() [Easy — 5 min]", fixed: "Yes" },
  { num: 92, file: "ngoAdminController.js", lines: "1054-1057", sev: "MEDIUM", cat: "Input Validation", desc: "uploadPaymentScreenshot builds file extension from mime_type without sanitization; path traversal possible", fix: "Whitelist MIME types and map to safe extensions [Easy — 5 min]", fixed: "Yes" },
  { num: 93, file: "froController.js", lines: "1811,1825", sev: "MEDIUM", cat: "Logic Bug", desc: "getLiveStatuses attendance date uses new Date().toISOString().slice(0,10) which is UTC, not IST", fix: "Compute todayStr using IST offset like other endpoints [Easy — 5 min]", fixed: "Yes" },
  { num: 94, file: "froController.js", lines: "476-485", sev: "MEDIUM", cat: "Security", desc: "getMyDonors fallback query fetches all assignments without station filter; bypasses access control", fix: "Apply same station/status filters to fallback query [Easy — 10 min]", fixed: "Yes" },
  { num: 95, file: "dashboardController.js", lines: "193-196", sev: "MEDIUM", cat: "Logic Bug", desc: "Attendance % excludes workers with no record from denominator; inflates percentage", fix: "Use totalActiveWorkers (all workers in period) as denominator [Medium — 15 min]", fixed: "Yes" },
  { num: 96, file: "dashboardController.js", lines: "867-1788", sev: "MEDIUM", cat: "Performance", desc: "getSuperAdminAlerts runs 25+ sequential DB queries; total latency is sum of all queries", fix: "Group independent queries into Promise.all batches [Medium — 30 min, restructure alerts function]", fixed: "Yes" },
  { num: 97, file: "dashboardController.js", lines: "912-1738 (24 catches)", sev: "MEDIUM", cat: "Error Swallowing", desc: "24 empty catch blocks in getSuperAdminAlerts suppress all errors silently", fix: "Add console.error('Alert N error:', e.message) to each catch [Easy — 10 min, bulk add logging]", fixed: "Yes" },
  { num: 98, file: "notificationScheduler.js", lines: "17-18", sev: "MEDIUM", cat: "Logic Bug", desc: "Module-level lastNoticeCheck/lastAchievementCheck reset to epoch on restart; causes duplicate notifications", fix: "Persist timestamps in settings table, read on startup [Medium — 20 min]", fixed: "Yes" },
  { num: 99, file: "dailyCodeService.js", lines: "4-21", sev: "MEDIUM", cat: "Logic Bug", desc: "Code collision loop tries 50 random codes then silently uses last attempt; can produce duplicate codes", fix: "Throw error after max attempts; move used.add() after successful DB upsert [Easy — 10 min]", fixed: "Yes" },
  { num: 100, file: "razorpayAccountModel.js", lines: "53-79", sev: "MEDIUM", cat: "Race Condition", desc: "createAccount clears all is_default then inserts; concurrent calls create window with no default", fix: "Use single atomic upsert or transaction [Medium — 20 min]", fixed: "Yes" },
  { num: 101, file: "froAssignmentModel.js", lines: "13-26", sev: "MEDIUM", cat: "Error Swallowing", desc: "batchCreateAssignments throws on first batch failure; remaining batches silently skipped", fix: "Collect errors per batch, continue processing, return summary [Easy — 15 min]", fixed: "Yes" },
  { num: 102, file: "froWhatsAppService.js", lines: "297-343", sev: "MEDIUM", cat: "Race Condition", desc: "findOrCreateContact/findOrCreateConversation uses SELECT-then-INSERT; concurrent calls create duplicates", fix: "Use INSERT...ON CONFLICT DO NOTHING RETURNING * [Easy — 10 min, use upsert]", fixed: "Yes" },
  { num: 103, file: "BankAudit.jsx", lines: "63-64", sev: "MEDIUM", cat: "Performance", desc: "Two useEffect hooks with [st] and [sd] separately cause double API call on every mount", fix: "Merge into single useEffect with [sd, st] deps [Trivial — 2 min]", fixed: "Yes" },
  { num: 104, file: "WhatsAppAgents.jsx", lines: "13", sev: "MEDIUM", cat: "Memory Leak", desc: "Debounce timer refs never cleaned up on unmount; callback fires on unmounted component", fix: "Add useEffect cleanup: return () => Object.values(timers.current).forEach(clearTimeout) [Trivial — 3 min]", fixed: "Yes" },
  { num: 105, file: "TemplateSettings.jsx", lines: "32", sev: "MEDIUM", cat: "Memory Leak", desc: "Dynamic import() creates promise never cleaned on unmount; may set state after unmount", fix: "Use static import at top of file; add AbortController [Easy — 5 min]", fixed: "Yes" },
  { num: 106, file: "SuspensePage.jsx", lines: "33", sev: "MEDIUM", cat: "Error Swallowing", desc: "apiGet().catch(() => {}) silently swallows errors; user sees 'No data' instead of error message", fix: "Show toast on error: .catch(err => toast(err.message, 'error')) [Trivial — 2 min]", fixed: "Yes" },
  { num: 107, file: "AssetRegister.jsx", lines: "315-323", sev: "MEDIUM", cat: "Data Loss", desc: "Offline mode silently swallows save failures; user thinks data saved but it's lost on reload", fix: "Show error toast when operating offline; warn user [Trivial — 3 min]", fixed: "Yes" },
  { num: 108, file: "index.js", lines: "440-443", sev: "MEDIUM", cat: "Stability", desc: "process.exit(1) on unhandledRejection crashes entire server on transient network errors", fix: "Log error and continue, or use graceful shutdown with connection draining [Easy — 5 min, remove exit]", fixed: "Yes" },
  { num: 109, file: "useRealtime.js", lines: "all", sev: "MEDIUM", cat: "Stale Closure", desc: "onInsert/onUpdate/onDelete callbacks used in subscription but not in useEffect deps; stale closures", fix: "Wrap callbacks in useRef or add to deps with unsubscribe/resubscribe [Easy — 10 min]", fixed: "Yes" },
  { num: 110, file: "ReceiptTemplate_Ashray.jsx", lines: "408", sev: "MEDIUM", cat: "Copy-Paste Bug", desc: "Says 'Helpline Number SEVAK' but this is Ashray template; wrong NGO label", fix: "Change 'SEVAK' to 'ASHRAY' [Trivial — 1 min]", fixed: "Yes" },

  // ── NEW LOW ──
  { num: 111, file: "dashboardController.js", lines: "750-756", sev: "LOW", cat: "Dead Code", desc: "getLeadsDashboard always returns hardcoded empty stats {totalLeads:0, callsToday:0}", fix: "Implement actual query or remove endpoint [Medium — 30 min, or delete if unused]", fixed: "Yes" },
  { num: 112, file: "leadRoutes.js", lines: "18", sev: "LOW", cat: "Typo", desc: "Error message says 'hoadmin' instead of 'admin'", fix: "Change 'hoadmin' to 'admin' in error message [Trivial — 1 min]", fixed: "Yes" },
  { num: 113, file: "ngoAdminController.js", lines: "1779", sev: "LOW", cat: "Logic Bug", desc: "Biased shuffle: Array.sort(() => Math.random()-0.5) produces non-uniform distribution", fix: "Use Fisher-Yates shuffle algorithm [Trivial — 5 min]", fixed: "Yes" },
  { num: 114, file: "froController.js", lines: "1081-1085", sev: "LOW", cat: "Logic Bug", desc: "Fragile public URL fallback constructs URL manually from SUPABASE_URL env; breaks on trailing slash", fix: "Always use SDK getPublicUrl and throw on failure [Trivial — 5 min]", fixed: "Yes" },
  { num: 115, file: "index.js", lines: "58-61", sev: "LOW", cat: "Observability", desc: "console.log globally suppressed in production; hides useful debug output from libraries", fix: "Replace with proper logging library (winston/pino) with configurable levels [Medium — 1 hr, add logging lib]", fixed: "Yes" },
  { num: 116, file: "leadRoutes.js", lines: "10-25", sev: "LOW", cat: "Maintainability", desc: "Custom telecallerOrAbove middleware duplicates JWT logic from authMiddleware.js; maintenance risk", fix: "Extend authenticateRole to support department-based checks [Medium — 20 min, refactor middleware]", fixed: "Yes" }
];

const wb = XLSX.utils.book_new();
const data = [["#","File","Line(s)","Severity","Category","Description","Fix + Effort","Fixed (Yes/No)"]];
for (const b of bugs) {
  data.push([b.num, b.file, b.lines, b.sev, b.cat, b.desc, b.fix, b.fixed]);
}

const ws = XLSX.utils.aoa_to_sheet(data);
ws['!cols'] = [
  { wch: 4 }, { wch: 28 }, { wch: 30 }, { wch: 10 }, { wch: 18 },
  { wch: 65 }, { wch: 75 }, { wch: 14 }
];

XLSX.utils.book_append_sheet(wb, ws, "Bugs");
XLSX.writeFile(wb, "bugs_report.xlsx");

const fixedCount = bugs.filter(b => b.fixed === "Yes").length;
console.log(`Excel file updated: bugs_report.xlsx`);
console.log(`Total: ${bugs.length} | Fixed: ${fixedCount} | Remaining: ${bugs.length - fixedCount}`);

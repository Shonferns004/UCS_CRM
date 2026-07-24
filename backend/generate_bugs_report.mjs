import XLSX from 'xlsx';
import fs from 'fs';

const bugs = [
  // CRITICAL
  ["1","index.js","281","CRITICAL","Syntax Error","TypeScript `as any` in .js file crashes app","Remove `as any`","No"],
  ["2","ngoAdminController.js","77,447,784,1378,1499,1843,1908","CRITICAL","Type Coercion","`ngoIds.indexOf(filterNgoId)` never matches (string vs number)","Convert filterNgoId to Number() before indexOf","No"],
  ["3","ngoAdminController.js","1519","CRITICAL","Memory","`.limit(1000000)` on getNewData loads 1M rows into memory","Add real pagination with page/per_page params","No"],
  ["4","ngoAdminController.js","1618-1623","CRITICAL","Memory","No limit on distributeNewData query, loads ALL rows","Process in bounded batches of 5000","No"],
  ["5","froAssignmentModel.js","249-274","CRITICAL","Memory","getStationDispositionStats fetches all rows then caps in JS at 500K","Use SQL GROUP BY + COUNT() instead","No"],
  ["6","ngoAdminController.js","1237-1254","CRITICAL","Security","removeStationByName deletes across NGOs without auth check","Scope delete to user's accessible NGOs","No"],
  ["7","ngoAdminController.js","1227-1234","CRITICAL","Security","removeStationAssignment accepts any ID, no NGO ownership check","Look up assignment first to verify NGO access","No"],
  ["8","index.js","375-423","CRITICAL","Security","4 cron endpoints have zero authentication","Add API key check or IP restriction","No"],
  ["9","froController.js","27-71","CRITICAL","Race Condition","SELECT-then-INSERT in findOrCreateAssignment can create duplicates","Use upsert with unique constraint","No"],
  ["10","froController.js","1691-1708,1750-1759","CRITICAL","Race Condition","SELECT-then-INSERT for fro_live_status creates duplicate rows","Use upsert with onConflict on worker_id","No"],
  ["11","froController.js","694-695","CRITICAL","Security","Stack trace exposed to client in error response","Remove stack from response","No"],
  ["12","froTargetModel.js","39-43,67-72","CRITICAL","Data Integrity","updateAchievedTarget/updateIncentive missing ngo_id filter, may update wrong NGO","Add .eq('ngo_id', ngoId) to all queries","No"],
  ["13","ngoAdminController.js","2896-2900","CRITICAL","Query Bug","getDuplicateLeads uses wrong column `ngo_id` on donor_profiles (should be `ngo`)","Use `.in('ngo', ngoNames)` instead","No"],

  // HIGH
  ["14","froController.js","147,1140","HIGH","Null Dereference","worker.created_at accessed when worker may be null","Add null check after getWorkerById","No"],
  ["15","froController.js","1177","HIGH","Logic Bug","target=0 always triggers incentive calculations","Add target > 0 check","No"],
  ["16","froController.js","1855","HIGH","Logic Bug","Double-counting follow_up in data_used stats","Remove follow_up from dataUsed sum (already in contacted)","No"],
  ["17","froController.js","1686-1689","HIGH","Logic Bug","Break state unintentionally cleared on non-break updates","Preserve on_break state unless transitioning away","No"],
  ["18","froController.js","1636-1641","HIGH","Security","getDonorHistory lacks station authorization check","Add station filter before returning logs","No"],
  ["19","froController.js","1920-1924","HIGH","Security","searchDonors searches all donors without station filter","Add station filter in initial query","No"],
  ["20","froController.js","78-79","HIGH","Error Swallowing","getMyStationNames suppresses query errors, returns empty array","Change to throw error instead of console.error only","No"],
  ["21","assignmentHelpers.js","62-65","HIGH","Performance","N+1 query per station assignment to fetch worker names","Batch-fetch all missing worker names at once","No"],
  ["22","assignmentHelpers.js","67","HIGH","Crash","worker.name could be null, .toLowerCase() throws","Add null guard for worker.name","No"],
  ["23","incentive.js","55","HIGH","Crash","getDayName crashes on null/undefined dateStr input","Add input validation before .split()","No"],
  ["24","froDonorLogModel.js","118-167","HIGH","Error Swallowing","Real errors silently swallowed by fallback logic in donor log queries","Log error, only fall back on 'no rows' errors","No"],
  ["25","froController.js","1544-1554","MEDIUM","Logic Bug","getLeadStats only counts first donation per donor, ignores subsequent","Aggregate amounts per donor, don't deduplicate","No"],
  ["26","index.js","59-62","HIGH","Observability","console.log replaced with no-op suppresses all library warnings","Use proper logging library instead of mutating globals","No"],
  ["27","index.js","68","HIGH","Security","CORS origin:'*' allows any website to make requests","Restrict CORS to known frontend origins","No"],
  ["28","index.js","430-432","HIGH","Stability","unhandledRejection swallows errors without exiting","Call process.exit(1) after logging","No"],

  // MEDIUM
  ["29","ngoAdminController.js","151","MEDIUM","Error Swallowing","Empty catch block hides transaction query failures","Log the error","No"],
  ["30","ngoAdminController.js","498,755-761","MEDIUM","Logic Bug","Zero achieved target treated as 'not achieved', falls back to raw amount","Use !== null check instead of > 0","No"],
  ["31","ngoAdminController.js","509-518","MEDIUM","Null Dereference","allAssignments could be null in for-of loop","Use `for (const a of allAssignments || [])`","No"],
  ["32","froAssignmentModel.js","109-112","MEDIUM","Logic Bug","getUnassignedDonorIds missing ngo_id filter, may include donors from other NGOs","Add .eq('ngo_id', ngoId)","No"],
  ["33","froAssignmentModel.js","192-203","MEDIUM","Performance","getAssignmentCountByWorker fetches all rows to count in JS","Use count query with head:true or DB GROUP BY","No"],
  ["34","froAssignmentModel.js","288-306","MEDIUM","Race Condition","createTemporaryTransfer SELECT then UPDATE not atomic","Use single UPDATE...RETURNING or transaction","No"],
  ["35","froAssignmentModel.js","298","MEDIUM","Data Loss","Transfer record deleted on zero results, no audit trail","Set status to 'failed' instead of deleting","No"],
  ["36","ngoAdminController.js","3272,3442","MEDIUM","Logic Bug","Empty string '' || undefined may clear DB name/city fields","Only include fields with actual values in update object","No"],
  ["37","ngoAdminController.js","3120","MEDIUM","Hardcoded","Station names hardcoded in source code, changes require redeploy","Move station list to DB config table","No"],
  ["38","froController.js","148-149,1141-1142","MEDIUM","Logic Bug","monthsEmployed calculation ignores day of month","Add day-of-month check to month calculation","No"],
  ["39","froController.js","1078","MEDIUM","Logic Bug","invalid_number missing from disposition map, defaults to contacted","Add invalid_number entry to map","No"],
  ["40","froController.js","165-173,225-230","MEDIUM","Logic Bug","Timezone: local midnight converted to UTC shifts 'today' window by 5.5hrs","Use UTC consistently for date boundaries","No"],
  ["41","froController.js","543,741","MEDIUM","Logic Bug","Inconsistent dedup keys, getMyDonors ignores ngo_id","Use `${donor_id}-${ngo_id}` as dedup key","No"],
  ["42","froController.js","449,460,705+","MEDIUM","Performance","No pagination on large queries (getMyDonors, getTransferredLeads, etc.)","Add hard limits (e.g., 500 for donors, 200 for history)","No"],
  ["43","froController.js","785,820,864,1099,1624,1979","MEDIUM","Input Validation","parseInt on params without NaN check","Add isNaN validation after parseInt","No"],
  ["44","froController.js","1660-1674","MEDIUM","Input Validation","Live status fields accept arbitrary/negative values","Add validation for status enum and numeric fields","No"],
  ["45","froController.js","1101","MEDIUM","Input Validation","scheduled_at not validated as valid date","Add isNaN(new Date(scheduled_at)) check","No"],
  ["46","froController.js","1421-1422","MEDIUM","Input Validation","Data request message length not bounded","Add max length check","No"],

  // FRONTEND BUGS
  ["47","MyDonors.jsx","296-307","HIGH","Race Condition","No cancellation in loadDetail, rapid donor switching shows stale data","Add AbortController or cancelled flag","No"],
  ["48","MyDonors.jsx","519-528","MEDIUM","Dead Code","setMessage({error}) unreachable after unconditional return","Move setMessage before return or restructure logic","No"],
  ["49","MyDonors.jsx","226-231","MEDIUM","Missing Deps","useEffect missing donors, endDonorView, startDonorView in dependency array","Add all used values to dependency array","No"],
  ["50","MyDonors.jsx","366-367","MEDIUM","Stale Closure","leadAmount in FileReader onload may be stale with rapid uploads","Use functional state update","No"],
  ["51","MyDonors.jsx","287-291","LOW","Stale Closure","Cleanup effect may save stale progress on unmount","Use ref to track latest values","No"],
  ["52","MyDonors.jsx","46-48","LOW","Stale Date","tomorrowStr computed once at module load, goes stale after midnight","Move computation inside component","No"],
  ["53","App.jsx","47","HIGH","Authorization","Super admin bypasses all role checks, can access any panel","Add panel allow-list or remove blanket bypass","No"],
  ["54","App.jsx","96-98","MEDIUM","Navigation","navigate(undefined) if role not in ROLE_PATHS","Add fallback path","No"],
  ["55","DonorCRM.jsx","220-222","CRITICAL","Data Integrity","Promise.all for bulk transfer causes silent partial data loss with no rollback","Use Promise.allSettled or server-side batch endpoint","No"],
  ["56","DonorCRM.jsx","3","LOW","Unused Import","ArrowDown imported but never used","Remove unused import","No"],
  ["57","NewData.jsx","248","MEDIUM","Logic Bug","Page not reset when switching tabs, may show empty page","Add setPage(1) when tab changes","No"],
  ["58","StationManagement.jsx","Multiple","MEDIUM","UX","Widespread use of alert() for all errors","Replace with toast/inline error messages","No"]
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ["#","File","Line(s)","Severity","Category","Description","Fix","Fixed (Yes/No)"],
  ...bugs.map(b => [...b])
]);

ws['!cols'] = [
  { wch: 4 }, { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 18 },
  { wch: 60 }, { wch: 50 }, { wch: 14 }
];

XLSX.utils.book_append_sheet(wb, ws, "Bugs");
XLSX.writeFile(wb, "bugs_report.xlsx");
console.log("Excel file created: bugs_report.xlsx");
console.log(`Total bugs: ${bugs.length}`);

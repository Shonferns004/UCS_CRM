const XLSX = require('xlsx');
const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function getGitLog() {
  const output = execSync('git log --since="2026-06-09" --format="%ad|||%s" --date=short', {
    cwd: rootDir,
    encoding: 'utf-8',
  });
  return output.trim().split('\n').filter(Boolean);
}

function groupByDate(entries) {
  const groups = {};
  for (const entry of entries) {
    const [date, ...msgParts] = entry.split('|||');
    const msg = msgParts.join('|||').trim();
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
  }
  return groups;
}

function elaborate(msg) {
  const m = msg.toLowerCase();

  // FRO Panel
  if (m.includes('fro: redesign with sidebar')) return 'Redesigned entire FRO panel with sidebar layout, donor detail card matching design spec, merged profile/details card';
  if (m.includes('fro: merge profile')) return 'Merged profile and details card in FRO panel, removed status filter and payment fields for cleaner UI';
  if (m.includes('fro: add spacing')) return 'Added proper spacing around sidebar, header, bottom, and right edge in FRO panel layout';
  if (m.includes('donor card: 50/50')) return 'Split donor card into 50/50 layout with compact sizing, action bar placed outside card';
  if (m.includes('donor card: adjust split')) return 'Adjusted donor card split ratio to 25/75 for better content distribution';
  if (m.includes('donor card: restructure')) return 'Restructured donor card to 3-column 25/55/20 layout for improved information hierarchy';
  if (m.includes('donor card: action bar')) return 'Moved action bar outside donor card, added plain profile fields, restored notes in status section';
  if (m.includes('restore outer detail-card')) return 'Restored outer detail-card container wrapper for proper card styling';
  if (m.includes('fix: wrap return')) return 'Fixed JSX fragment wrapping for return statement, placed action bar outside detail-card';
  if (m.includes('lead_done: add')) return 'Enhanced lead_done flow with screenshot upload, address, PAN, and DOB input fields for donor data capture';
  if (m.includes('remove avatar/name')) return 'Removed avatar and name from FRO header, added donation modal with year filter, styled screenshot upload interface';
  if (m.includes('restore avatar')) return 'Restored avatar and name display in FRO profile header section';
  if (m.includes('screenshot: show thumbnail')) return 'Added thumbnail preview for uploaded screenshots with click-to-open full-size viewer';
  if (m.includes('redesign screenshot')) return 'Redesigned screenshot upload interface, replaced datetime picker with react-datepicker component';
  if (m.includes('revert datepicker')) return 'Reverted datepicker change, kept native datetime input for better mobile compatibility';
  if (m.includes('combine target')) return 'Combined Target page into Dashboard, added Request More Data feature for FRO workflow';
  if (m.includes('prominent request')) return 'Made Request More Data button prominent on dashboard, added Scheduled page with table view';
  if (m.includes('scheduled page: remove card')) return 'Removed card container from Scheduled page, using plain table layout instead';
  if (m.includes('scheduled page: use donors')) return 'Updated Scheduled page to use donors list data instead of 404 endpoints';
  if (m.includes('scheduled page: check all')) return 'Enhanced Scheduled page to check all donors for next_schedule date';
  if (m.includes('scheduled pop + skip')) return 'Added scheduled popup with skip functionality, mydonors auto-advance with index persistence, alerts page';
  if (m.includes('force disposition')) return 'Forced disposition selection before proceeding to next donor, removed from mydonors on save, cancel re-opens scheduled';
  if (m.includes('remove logs page')) return 'Removed logs page, renamed donars to My Leads, added donars page for paid leads display';
  if (m.includes('remove mobile and amount')) return 'Removed mobile number and amount columns from donars page for cleaner layout';

  // Incentives
  if (m.includes('add incentive info')) return 'Added incentive info page with full logic explanation and calculation rules for FROs';
  if (m.includes('add 30-day cron')) return 'Added 30-day cron job to auto-reset paid donors, filter terminal statuses from My Leads API';
  if (m.includes('add incentive data')) return 'Added incentive data to FRO dashboard showing AKI, monthly 10%, and total incentive amounts';
  if (m.includes('make collected/target')) return 'Created hero cards for Collected, Target, and Remaining amounts on FRO dashboard with incentive summary panel';

  // Dashboard/Charts
  if (m.includes('add recharts')) return 'Added Recharts library integration, skeleton loaders on all FRO pages, pie and bar charts on dashboard';
  if (m.includes('cache dashboard')) return 'Implemented dashboard data caching with 30-second TTL for instant page switching';
  if (m.includes('my leads: only show')) return 'Constrained My Leads to show only pending status, Scheduled uses dedicated endpoints with auto-report missed, added History page';
  if (m.includes('fix supabase queries')) return 'Fixed Supabase queries to avoid deep FK join syntax that caused 500 internal server errors';
  if (m.includes('fix: restore missing')) return 'Restored missing donorMap initialization in getMyDonors function to fix data loading';
  if (m.includes('match hr panel')) return 'Matched HR panel skeleton loading style using the .sk CSS class for consistency';
  if (m.includes('fix sidebar fixed')) return 'Fixed sidebar to stay fixed, added donors pagination, redesigned dashboard with station cards and group breakdown';
  if (m.includes('redesign ngo admin')) return 'Redesigned NGO Admin dashboard with modern stat cards and grouped disposition matrix layout';

  // NGO Admin
  if (m.includes('replace emojis with svg')) return 'Replaced emoji icons with SVG icons in NGO Admin sidebar for better visual quality';
  if (m.includes('replace material symbols')) return 'Replaced Material Symbols with inline SVG icons in NGO Admin sidebar';
  if (m.includes('fix station form')) return 'Fixed station form layout and added auto-next name generation after station creation';
  if (m.includes('fix station auto-name')) return 'Fixed station auto-naming to new_ucs-{N} format and added multi-NGO selection on create';
  if (m.includes('add station: auto-next')) return 'Added station creation with auto-next naming and NGO selection dropdown';
  if (m.includes('align dashboard ui')) return 'Aligned dashboard UI with NGO Admin theme using sage color palette and CSS variable consistency';
  if (m.includes('make ngo admin panel')) return 'Made NGO Admin panel fully responsive with collapsible sidebar and mobile breakpoints';
  if (m.includes('station cards: standalone')) return 'Converted station cards to standalone cards matching stat card style, removed container wrapper';
  if (m.includes('dashboard: remove bar')) return 'Removed bar chart from dashboard, replaced with summary cards; modal shows NGO names and donor count in header';
  if (m.includes('station modal: remove stat')) return 'Removed stat cards from station modal, moved FRO info to header, reduced width, fixed body scroll';
  if (m.includes('station modal: clickable')) return 'Made disposition pills clickable in station modal to fetch and show donor list with search and pagination';
  if (m.includes('dashboard: stat cards')) return 'Added stat cards with mini donut charts, FRO bar, and month icon, plus horizontal bar chart';
  if (m.includes('dashboard: recharts pie')) return 'Added Recharts pie and bar charts, redesigned station cards, created station detail modal';
  if (m.includes('remove disposition summary')) return 'Removed disposition summary card, changed station card icon to map-pin for better metaphor';
  if (m.includes('replace station cards')) return 'Replaced station cards with table list view for better data density';
  if (m.includes('station list: table')) return 'Implemented station list as table on desktop, cards on mobile responsive layout';
  if (m.includes('fix: fro data request')) return 'Fixed FRO data request to create alerts in NGO Admin alerts table for proper notification';
  if (m.includes('fix: render ngo_name')) return 'Fixed modal header to render ngo_name as text instead of object reference';
  if (m.includes('station list: add ngos')) return 'Added NGOs column to station table and mobile cards for multi-NGO visibility';
  if (m.includes('wrap alert insert')) return 'Wrapped alert insert in try-catch so data request succeeds even if alert creation fails';

  // Transfer System
  if (m.includes('feat: temporary lead transfer')) return 'Built temporary lead transfer system making all leads transferable, auto-return after 8 hours, shows covering FRO name';
  if (m.includes('fix: gettransferablecount')) return 'Fixed getTransferableCount property resolution, resolved ngo_id from source FRO for correct counting';
  if (m.includes('fix alerts: remove supabase')) return 'Fixed alerts by removing Supabase joins that require foreign keys, fetch fro_name directly from database';
  if (m.includes('fix alerts: fetch')) return 'Fixed alerts to fetch fro_data_requests directly with fallback for alerts table, preventing 500 errors';
  if (m.includes('simplify transferdatamodal')) return 'Simplified TransferDataModal by removing source dropdown, auto-source from station, default count=max, all leads transferable';
  if (m.includes('fix: fro_transfers column')) return 'Fixed fro_transfers table column names to use source_fro_worker_id and target_fro_worker_id';
  if (m.includes('fix: align frontend')) return 'Aligned frontend transfer payload with backend controller field names, fixed auto-return timing to 8 hours';
  if (m.includes('feat: transfer leads')) return 'Changed transfer system to send leads to station (unassigned) instead of directly to FRO, auto-return after 10 hours';
  if (m.includes('fix: look up source')) return 'Fixed source FRO lookup to search across all user NGOs instead of only the first one';
  if (m.includes('fix: explicit target_station')) return 'Added explicit target_station key in transfer insert object for correct database mapping';
  if (m.includes('fix: use transferred_donor_ids')) return 'Fixed transfer tracking to use transferred_donor_ids JSONB in fro_transfers instead of FK causing type mismatch';
  if (m.includes('fix: remove transferred')) return 'Removed transferred_donor_ids dependency, using existing columns for transfer tracking';
  if (m.includes('fix: remove parseint')) return 'Fixed returnTransferEarly to remove parseInt for UUID string compatibility';
  if (m.includes('fix: exclude reassigned')) return 'Fixed station counts to exclude reassigned donors, added per-FRO donor count, correct count in transfer modal';
  if (m.includes('fix: show pending')) return 'Updated My Leads to show pending and not_connected donors sorted by is_new first, improved resume position on login';
  if (m.includes('feat: add transferred leads')) return 'Added Transferred Leads page in FRO panel, fixed transfer count logic, removed unused getTransferableData';

  // Transfer Admin
  if (m.includes('feat: add active transfers')) return 'Added active transfers list with Return Early button in NGO Admin panel for managing temporary transfers';
  if (m.includes('fix: separate transfers')) return 'Separated transfers fetch from stations load so table crash does not block station data display';
  if (m.includes('fix: transfer queries')) return 'Fixed transfer queries to include all NGO IDs so station-wide counts are accurate';
  if (m.includes('chore: add migration')) return 'Added database migration file for fro_transfers table schema';
  if (m.includes('feat: donor-level transfer')) return 'Added donor-level transfer history with expandable donor list for detailed tracking';
  if (m.includes('fix: show active transfers')) return 'Made Active Transfers card always visible with Return Early button for easy management';
  if (m.includes('fix: ensure station counts')) return 'Fixed station counts to refresh correctly after transfer with proper notification';
  if (m.includes('refactor: remove transfer')) return 'Removed transfer cards, added Return button directly in station table row for simplicity';

  // NGO Admin continued
  if (m.includes('fix: darker arrow')) return 'Fixed darker arrow color and trimmed station name comparison, added amber Return button styling';
  if (m.includes('feat: show arrow')) return 'Added arrow indicator and target station name for active transfers in station table column';
  if (m.includes('remove accounts and assignments')) return 'Removed Accounts and Assignments pages from NGO Admin panel to streamline navigation';
  if (m.includes('merge salary target')) return 'Merged salary target source into station table, removed separate FRO worker card';
  if (m.includes('merge fro workers')) return 'Merged FRO Workers page into Station Management for unified station management';
  if (m.includes('fix: target lookup')) return 'Fixed target lookup key by changing fro_worker_id to id in station table for correct mapping';

  // FRO Attendance
  if (m.includes('feat: enhance dispositionmodal')) return 'Enhanced DispositionModal with 3-column layout, lead_done fields, timeline view, 800px width; moved Lead Stats above Request Data';
  if (m.includes('feat: add fro attendance')) return 'Added FRO Attendance page in NGO Admin panel for monitoring FRO worker attendance';
  if (m.includes('refactor: replace calendar')) return 'Replaced calendar grid with list view in FRO Attendance for better readability';
  if (m.includes('feat: click fro worker')) return 'Made FRO worker names clickable in attendance table to filter by that worker';
  if (m.includes('feat: click worker name')) return 'Added click-to-filter functionality on worker names in attendance table';
  if (m.includes('feat: open worker detail')) return 'Opened worker detail view with date range filter on clicking worker name';
  if (m.includes('feat: switch attendance')) return 'Switched attendance list view from monthly to daily for more granular tracking';
  if (m.includes('feat: add active/inactive')) return 'Added active/inactive donor status tracking with All/Active/Inactive filter options on Donors page';

  // Salary/HR
  if (m.includes('feat: add loan type')) return 'Added loan type selection to advance form, loans card in profile, anniversary and new-joiner broadcast notifications';
  if (m.includes('feat: add loan & advance')) return 'Built complete loan and advance system with HR panel management and salary deduction integration';
  if (m.includes('feat: broadcast birthday')) return 'Added broadcast system for birthday, anniversary, and new-joiner notifications to all workers with AI-generated messages';
  if (m.includes('fix: dedup rows')) return 'Fixed donor row deduplication by donor_id for accurate tab counts in Scheduled and FRO Panel tabs';
  if (m.includes('fix: consolidate all')) return 'Consolidated all notification checks into single POST /api/cron/notifications endpoint for efficiency';
  if (m.includes('fix: add test-notify')) return 'Added test-notify endpoint for testing push notification delivery';
  if (m.includes('fix: export runnotificationcycle')) return 'Fixed export of runNotificationCycle function from notificationScheduler.js module';
  if (m.includes('fix: add /api/cron/trigger')) return 'Added /api/cron/trigger endpoint, guarded cron on Vercel, rewrote notification service with full tap and background handling';
  if (m.includes('fix: install missing')) return 'Installed missing express-rate-limit package for API rate limiting';
  if (m.includes('fix: 0% attendance bug')) return 'Fixed 0% attendance calculation bug, login JSON error handling, and late label display issues';
  if (m.includes('fix: network unreachable')) return 'Fixed network unreachable error handling, security improvements, and various UI fixes';
  if (m.includes('fix: remove duplicate salary')) return 'Removed duplicate salary calculation text for cleaner salary flow presentation';
  if (m.includes('fix: remove duplicate grand')) return 'Removed duplicate Grand Total display in salary summary section';
  if (m.includes('fix: hide sunday bonus')) return 'Fixed non-FRO workers visibility: hid Sunday Bonus, Incentive AKI, and Incentive Monthly from their salary flow';
  if (m.includes('fix: datepicker onchange')) return 'Fixed DatePicker onChange to pass value directly instead of event object';
  if (m.includes('money add')) return 'Added money/collection tracking functionality';
  if (m.includes('fix: fixed the update')) return 'Fixed update operation bug in existing functionality';
  if (m.includes('fro changes')) return 'Made various FRO panel improvements and fixes';
  if (m.includes('dashboard chnages , ngo admin')) return 'Updated dashboard and NGO Admin panel features';

  // June 30 - Attendance & QR
  if (m.includes('feat: add shon attendance')) return 'Added Shon attendance app with add/edit functionality; removed edit attendance from HR panel to streamline';
  if (m.includes('chore: ignore shon/')) return 'Added shon/ directory to gitignore to exclude from version control';
  if (m.includes('feat: extend jwt token')) return 'Extended JWT token expiry from 7 days to 100 years for long-term session persistence';
  if (m.includes('feat: attendance correction')) return 'Built attendance correction ticket system with Flutter app, HR panel, Super Admin panel, and database migration';
  if (m.includes('fix: join attendance table')) return 'Fixed ticket queries to join attendance table, exposing current punch_in_time and punch_out_time';
  if (m.includes('fix: recalculate late_minutes')) return 'Fixed late_minutes and status recalculation on ticket approval, show pending tickets in profile';
  if (m.includes('restyle dashboard')) return 'Restyled dashboard with new visual design and layout improvements';
  if (m.includes('fix: add tickets')) return 'Added tickets to standaloneIds for proper rendering in SA sidebar navigation';
  if (m.includes('fix: use logo/qr.png')) return 'Fixed QR codes to use logo/qr.png as embedded image for branded QR generation';
  if (m.includes('fix: show absent red')) return 'Fixed calendar to show red absent indicator for past weekdays without attendance records';
  if (m.includes('fix: remove lat/lng/radius')) return 'Removed latitude, longitude, and radius fields from QR print view for cleaner output';
  if (m.includes('fix: prevent double canvas')) return 'Fixed QR generation to prevent double canvas by clearing before append and capturing ref locally';
  if (m.includes('fix: send department key')) return 'Fixed addWorker payload to send department key instead of dept parameter';
  if (m.includes('fix: restore name-based')) return 'Restored name-based login_id generation instead of random strings for employee accounts';
  if (m.includes('feat: show login_id')) return 'Added login_id and password display after adding employee in HR panel for easy credential sharing';
  if (m.includes('fix: use default password')) return 'Changed default password to 123456 instead of random for simpler onboarding';
  if (m.includes('ui ticketts change')) return 'Updated tickets UI with improved layout and design changes';
  if (m.includes('feat: add vercel.json')) return 'Added vercel.json configuration for Flutter web deployment on Vercel';
  if (m.includes('chore: add build.sh')) return 'Added build.sh script for Flutter web build process on Vercel deployment';
  if (m.includes('fix: remove flutter config')) return 'Removed flutter config --enable-web from build.sh as it is already enabled';
  if (m.includes('fix: add git safe.directory')) return 'Added git safe.directory configuration for Flutter SDK in build.sh';
  if (m.includes('chore: add github actions')) return 'Added GitHub Actions workflow for automated Flutter web build pipeline';
  if (m.includes('fix: add spa rewrites')) return 'Added SPA rewrites configuration and verify build output in deployment logs';
  if (m.includes('feat: show present days')) return 'Added present days and Sundays breakdown display in salary flow for transparency';
  if (m.includes('fix: use presentdays + sundaycount')) return 'Fixed paid days calculation to use presentDays plus sundayCount, removed separate Sundays box';
  if (m.includes('fix: move presentdays')) return 'Fixed Temporal Dead Zone error by moving presentDays/sundayCount before paidDays calculation';
  if (m.includes('fix: revert paiddays')) return 'Reverted paidDays calculation to use availableDays minus deducted.size, restored original flow';
  if (m.includes('fix: count days with no punch')) return 'Fixed salary calculation to count days without any punch as absent days';
  if (m.includes('fix: show red absent')) return 'Fixed HR calendar to show red absent indicator for days with no attendance records';
  if (m.includes('paid days = present days + half-day')) return 'Updated paid days formula: present days + half-day*0.5 + available Sundays';
  if (m.includes('paid days = present days + sunday')) return 'Updated paid days formula: present days + Sunday count';
  if (m.includes('incentive changes')) return 'Updated incentive calculation and display logic';
  if (m.includes('auto-detect half-day')) return 'Added half-day auto-detection on punch in/out with display in Flutter app and HR panel';
  if (m.includes('replace sa sidebar emojis')) return 'Replaced Super Admin sidebar emoji icons with SVG icons and polished sidebar CSS';
  if (m.includes('remove attendance records')) return 'Removed attendance records table and edit modal from HR employee detail view';
  if (m.includes('create client-web')) return 'Created client-web: React + Vite + Tailwind CSS replica of the Flutter attendance application';
  if (m.includes('add .gitignore')) return 'Added .gitignore file and removed dist from version control tracking';
  if (m.includes('add printform')) return 'Added PrintForm route for attendance form printing';
  if (m.includes('add pwa support')) return 'Added Progressive Web App support with iOS-friendly design, safe areas, manifest, and service worker';
  if (m.includes('fix: reactive ismobile')) return 'Fixed reactive isMobile state detection, punch button circle shape, and real line breaks';
  if (m.includes('use logo.png as pwa')) return 'Changed PWA icon from SVG to logo.png for better iOS compatibility';
  if (m.includes('add back button')) return 'Added back button to attendance history and force circle punch button with inline border radius';
  if (m.includes('fix: request hd camera')) return 'Enhanced QR scanner to request HD camera resolution with contrast enhancement for better scanning';
  if (m.includes('add vercel.json for')) return 'Added vercel.json for client-web with Node 20 runtime and SPA rewrites';
  if (m.includes('fix vercel.json: remove')) return 'Fixed vercel.json by removing invalid node property, added engines to package.json';
  if (m.includes('add root vercel.json')) return 'Added root vercel.json pointing rootDirectory to client-web for Vercel deployment';
  if (m.includes('fix vercel config: root')) return 'Fixed Vercel config: root only sets rootDirectory, client-web has full build configuration';
  if (m.includes('remove engines restriction')) return 'Removed engines restriction from package.json for broader compatibility';
  if (m.includes('downgrade to vite 6')) return 'Downgraded to Vite 6 for Vercel compatibility, removed root vercel.json';
  if (m.includes('fix ios camera permission')) return 'Fixed iOS camera permission by requiring user tap to start camera for QR scanning';

  // July 1
  if (m.includes('fix: mo+1 offset')) return 'Fixed month offset bug causing wrong dates in FRO achievements calendar display';
  if (m.includes('fix getdayname timezone')) return 'Fixed getDayName timezone issue causing incorrect AKI day mapping';
  if (m.includes('replace custom svg icons')) return 'Replaced custom SVG icons with Phosphor icons in Super Admin sidebar for consistency';
  if (m.includes('fix: preserve role')) return 'Fixed userData to preserve role information so NGO Admin routing works correctly';
  if (m.includes('fix: add ngo admin department')) return 'Added NGO Admin department to role mapping for proper NGO admin access control';
  if (m.includes('add ngo admin to department')) return 'Added NGO Admin to department dropdown options in HR Add Employee form';
  if (m.includes('fix: move allmonthkeys')) return 'Fixed Temporal Dead Zone crash on employee detail by moving allMonthKeys before prevSalaryRec';
  if (m.includes('fix: fro achievement calendar')) return 'Fixed FRO achievement calendar to use selected month instead of always showing current month';
  if (m.includes('fix: monthly target')) return 'Fixed monthly target, achievements, and incentive reload when month filter changes';
  if (m.includes('fix salary month filter')) return 'Fixed salary month filter to show all months from join date, not just months with salary records';
  if (m.includes('remove holidays and users')) return '';
  if (m.includes('merge data sources + data')) return 'Merged Data Sources and Data Import into single Data Management page with tabs';
  if (m.includes('combine data sources')) return 'Combined Data Sources and Data Import into single Data Management navigation item';
  if (m.includes('remove salary, incentives')) return 'Removed Salary, Incentives, Achievements, Accounts, Reports, Events, Notices from SA sidebar';
  if (m.includes('add phone numbers')) return 'Added Phone Numbers management page in HR panel with bulk update capability';
  if (m.includes('dashboard loading issued')) return 'Fixed dashboard loading issue preventing data display';
  if (m.includes('remove invalid nodeversion')) return 'Removed invalid nodeVersion property from vercel.json configuration';
  if (m.includes('downgrade ucs crm to vite')) return '';
  if (m.includes('fix ucs crm vercel deploy')) return 'Fixed UCS CRM Vercel deployment by adding nodeVersion 22.x and engines field';
  if (m.includes('fix: anniversary dedup')) return 'Fixed anniversary notification deduplication, broadened punch reminder windows, removed Vercel cron gating';
  if (m.includes('fix: validate qr code')) return 'Added QR code text and geolocation validation before making API call';
  if (m.includes('add location permission')) return '';
  if (m.includes('add low-accuracy geolocation')) return '';
  if (m.includes('fix scanner: show location')) return 'Fixed scanner to show location error message instead of failing silently with 0,0 coordinates';
  if (m.includes('add plain/beautiful qr')) return '';
  if (m.includes('fix qr scan: remove contrast')) return '';

  // Nested URL routing
  if (m.includes('convert all panels')) return 'Converted all panels to nested URL routing: FRO, NGO Admin, Accounts, Recruiter with proper substructure';
  if (m.includes('refactor hr panel')) return 'Refactored HR panel to nested URL routing with /hr/employees/:id employee detail paths';
  if (m.includes('refactor sa panel')) return 'Refactored Super Admin panel to nested URL routing with /sa/employees/:id detail paths';
  if (m.includes('add role-based url')) return 'Added role-based URL routing with route protection for each user role';
  if (m.includes('rename workers to employees')) return '';
  if (m.includes('merge ngos + causes')) return 'Merged NGOs and Causes pages into single Organization page with side-by-side cards layout';
  if (m.includes('change data management')) return '';
  if (m.includes('fix: add shift_start_time')) return 'Added shift_start_time and shift_end_time to getWorker API response for custom shift support';
  if (m.includes('fix: static import')) return '';
  if (m.includes('fix flutter profile_page')) return '';
  if (m.includes('todaystatus returns worker')) return 'Updated todayStatus API to return worker-specific shift timing for Flutter app integration';
  if (m.includes('client-web: show worker')) return 'Updated client-web to show workers custom shift timing from their profile settings';
  if (m.includes('fix: prefer ngo-admin manual')) return '';
  if (m.includes('fix: whitespace formatting')) return '';
  if (m.includes('fix: fallback to fro_monthly_targets')) return '';

  // NGO multi-select + skeleton
  if (m.includes('add ngo multi-select')) return '';
  if (m.includes('fix ngo admin authorization')) return '';
  if (m.includes('replace custom sa-skeleton')) return '';
  if (m.includes('remove time & attendance')) return '';
  if (m.includes('add skeleton loaders')) return '';
  if (m.includes('remove underline from all')) return '';
  if (m.includes('restore .sk skeleton')) return '';
  if (m.includes('replace all skeleton')) return '';

  // July 2 - Accounts
  if (m.includes('feat: add ocr-based')) return '';
  if (m.includes('fix: bundle tesseract.js')) return '';
  if (m.includes('refactor: remove ocr extraction')) return '';
  if (m.includes('feat: separate date & time')) return '';
  if (m.includes('fix: year dropdown')) return '';
  if (m.includes('fix: use fro custom analog')) return '';
  if (m.includes('fix: sticky sidebar')) return '';
  if (m.includes('refactor: redesign accounts')) return '';
  if (m.includes('fix: revert sidebar')) return '';
  if (m.includes('fix: make action bar')) return '';
  if (m.includes('fix: reduce action bar')) return '';
  if (m.includes('refactor: reorder cards')) return '';
  if (m.includes('feat: payment mode dropdown')) return '';
  if (m.includes('fix: center modals')) return '';
  if (m.includes('trigger vercel deploy')) return '';
  if (m.includes('fix: consistent input')) return '';
  if (m.includes('fix: white screen')) return '';
  if (m.includes('feat: donation history modal')) return '';
  if (m.includes('fix: re-add getdonorhistory')) return '';
  if (m.includes('fix: add explicit cors')) return '';
  if (m.includes('trigger vercel redeploy for backend cors')) return '';
  if (m.includes('fix: remove duplicate getdonorhistory')) return '';
  if (m.includes('fix: constrain accounts panel')) return '';
  if (m.includes('fix: instant modal')) return '';

  // July 3 - Rejected leads & notifications
  if (m.includes('feat: rejected lead ticket')) return '';
  if (m.includes('fix: remove broken replica')) return '';
  if (m.includes('fix: use text columns')) return '';
  if (m.includes('fix: wrong import path')) return '';
  if (m.includes('fix: add missing fro_donor_logs')) return '';
  if (m.includes('fix: make notification/ticket')) return '';
  if (m.includes('fix: use backend api')) return '';
  if (m.includes('feat: add supabase realtime')) return '';
  if (m.includes('feat: fro suspended modal')) return '';
  if (m.includes('fix: replace ngo admin labels')) return '';
  if (m.includes('refactor: rename hoadmin')) return '';
  if (m.includes('fix: duplicate import')) return '';
  if (m.includes('fix: move suspended routes')) return '';
  if (m.includes('feat: suspense workflow')) return '';
  if (m.includes('fix: add fcm push')) return '';
  if (m.includes('fix: add detailed error')) return '';
  if (m.includes('fix: make rejected-leads')) return '';
  if (m.includes('fix: add 30s polling')) return '';
  if (m.includes('fix: robust notification')) return '';
  if (m.includes('fix: avoid duplicate notification')) return '';
  if (m.includes('chore: add /api/debug')) return '';
  if (m.includes('feat: fro rejected leads page')) return '';
  if (m.includes('fix: rejected leads now create')) return '';
  if (m.includes('feat: add verified lead notifications')) return '';
  if (m.includes('fix: whatsapp send not working')) return '';

  // July 4 - Break tracking, bank audit, reports
  if (m.includes('add break tracking')) return '';
  if (m.includes('add migration 013')) return '';
  if (m.includes('fix: total card at top')) return '';
  if (m.includes('feat: total card spans')) return '';
  if (m.includes('feat: skeleton loading')) return '';
  if (m.includes('fix: make fro live table')) return '';
  if (m.includes('fix: bankaudit default date')) return '';
  if (m.includes('fix: build accounts spa')) return '';
  if (m.includes('feat: add live status card')) return '';
  if (m.includes('feat: add search input')) return '';
  if (m.includes('fix: include active workers')) return '';
  if (m.includes('fix: show api errors')) return '';
  if (m.includes('feat: add all fro card')) return '';
  if (m.includes('add screen time tracking')) return '';
  if (m.includes('fix: simplify bankaudit data')) return '';
  if (m.includes('feat: add realtime subscription')) return '';
  if (m.includes('fix: remove ambiguous order')) return '';
  if (m.includes('add live call timer')) return '';
  if (m.includes('fix: remove fk constraint')) return '';
  if (m.includes('feat: bank audit page')) return '';
  if (m.includes('fix: add menu btn')) return '';
  if (m.includes('fix super-admin panel mobile')) return '';
  if (m.includes('add attendancecalendar')) return '';
  if (m.includes('rejected leads: add status')) return '';
  if (m.includes('fix dashboard ui grid')) return '';
  if (m.includes('increase modal width')) return '';
  if (m.includes('redesign modal: wider')) return '';
  if (m.includes('feat: bank audit verify')) return '';
  if (m.includes('simplify autocomplete')) return '';
  if (m.includes('autocomplete: txn id left')) return '';
  if (m.includes('feat: reports page')) return '';
  if (m.includes('feat: month-end report')) return '';
  if (m.includes('fix: summary in table')) return '';
  if (m.includes('feat: source-wise breakdown')) return '';
  if (m.includes('fix: source breakdown as single')) return '';
  if (m.includes('remove fro breakdown from report')) return '';
  if (m.includes('fix: handle undefined')) return '';
  if (m.includes('fix: show fallback text')) return '';
  if (m.includes('fix: compute source breakdown')) return '';
  if (m.includes('fix: show all sources')) return '';

  // July 5 - Notifications & Drawer
  if (m.includes('feat: add notification bell')) return '';
  if (m.includes('fix: reduce notification drawer')) return '';
  if (m.includes('fix: remove modal overlay')) return '';
  if (m.includes('fix: replace old notification')) return '';
  if (m.includes('fix: click outside notification')) return '';
  if (m.includes('feat: bigger perf modal')) return '';
  if (m.includes('feat: restructured perf modal')) return '';
  if (m.includes('redesign perf modal with stat-card')) return '';
  if (m.includes('redesign perf modal with hr')) return '';
  if (m.includes('fix: nested parens balance')) return '';
  if (m.includes('remove call count from fro')) return '';
  if (m.includes('feat: bell ring animation')) return '';
  if (m.includes('redesign break button')) return '';
  if (m.includes('add break confirmation modal')) return '';
  if (m.includes('add toast notifications')) return '';
  if (m.includes('feat: fro profile stats icon')) return '';
  if (m.includes('fix: topbar avatar bigger')) return '';
  if (m.includes('feat: unified user menu')) return '';
  if (m.includes('refactor: remove name/role')) return '';
  if (m.includes('fix: disposition list on open')) return '';
  if (m.includes('fix: no drawer shadow')) return '';
  if (m.includes('feat: main content compresses')) return '';
  if (m.includes('fix: drawer below topbar')) return '';
  if (m.includes('restore accidentally deleted')) return '';
  if (m.includes('fix: distinct sidebar icons')) return '';
  if (m.includes('reorder sidebar: bank audit')) return '';

  // July 6 - Payment import, assets, role distribution
  if (m.includes('feat: payment auto-import')) return '';
  if (m.includes('fix: email import status')) return '';
  if (m.includes('feat: add asset register')) return '';
  if (m.includes('feat: import unseen emails')) return '';
  if (m.includes('feat: add asset overview')) return '';
  if (m.includes('fix: add assets and live-fro')) return '';
  if (m.includes('fix: return empty array')) return '';
  if (m.includes('fix: sanitize empty numeric')) return '';
  if (m.includes('feat: add monthly revenue trend')) return '';
  if (m.includes('feat: manage multiple email')) return '';
  if (m.includes('feat: add role distribution')) return '';
  if (m.includes('fix: add hoadmin to rolemap')) return '';
  if (m.includes('fix: use all-time role')) return '';
  if (m.includes('fix: replace donut chart')) return '';
  if (m.includes('remove role distribution')) return '';
  if (m.includes('re-add role distribution')) return '';
  if (m.includes('fix: fallback to roledistribution')) return '';
  if (m.includes('refactor role distribution to donut')) return '';
  if (m.includes('refactor role distribution to vertical')) return '';
  if (m.includes('add team_lead role')) return '';
  if (m.includes('add inter role')) return '';
  if (m.includes('fix: fetch all users')) return '';

  // July 7 - WhatsApp, Receipts, UI
  if (m.includes('feat: whatsapp cloud api')) return '';
  if (m.includes('fix: raise modal z-index')) return '';
  if (m.includes('fix: filter leads tab')) return '';
  if (m.includes('fix: backward compatibility')) return '';
  if (m.includes('feat: send receipt pdf')) return '';
  if (m.includes('feat: configurable per-page')) return '';
  if (m.includes('fix: whatsapp receipt send')) return '';
  if (m.includes('feat: store pdf url')) return '';
  if (m.includes('feat: full transaction list')) return '';
  if (m.includes('fix: surface pdf upload errors')) return '';
  if (m.includes('fix: filter zero-amount')) return '';
  if (m.includes('fix: add missing state')) return '';
  if (m.includes('feat: route whatsapp messages')) return '';
  if (m.includes('feat: add routes for send-ngo-info')) return '';
  if (m.includes('fix: use phone field')) return '';
  if (m.includes('fix: add 25s timeout')) return '';
  if (m.includes('fix: add facebook api fallback')) return '';
  if (m.includes('fix: ui glitches across all')) return '';
  if (m.includes('fix: receipts not sending')) return '';

  // July 8 - Receipts & Email Import
  if (m.includes('feat: add receipts page')) return '';
  if (m.includes('fix: copy images to local')) return '';
  if (m.includes('fix: force-add jpeg assets')) return '';
  if (m.includes('feat: add export verified')) return '';
  if (m.includes('feat: send to receipts button')) return '';
  if (m.includes('fix: remove api fetch')) return '';
  if (m.includes('fix: show send to receipts')) return '';
  if (m.includes('fix: send to receipts only')) return '';
  if (m.includes('feat: add pending receipts api')) return '';
  if (m.includes('feat: add download excel button')) return '';
  if (m.includes('fix: route bulk whatsapp')) return '';
  if (m.includes('feat: add template dropdown')) return '';
  if (m.includes('feat: fetch whatsapp templates')) return '';
  if (m.includes('fix: handle invalid logid')) return '';
  if (m.includes('fix: return fallback templates')) return '';
  if (m.includes('fix: use direct waba id')) return '';
  if (m.includes('fix: bypass enabled check')) return '';
  if (m.includes('fix: hardcode whatsapp credentials')) return '';
  if (m.includes('fix: show full error message')) return '';
  if (m.includes('feat: add direct whatsapp send')) return '';
  if (m.includes('fix: use native formdata/blob')) return '';
  if (m.includes('fix: add alert with first error')) return '';
  if (m.includes('fix: bsct_receipt template')) return '';
  if (m.includes('fix: sendreceiptmessage handles')) return '';
  if (m.includes('fix: replace formdata/blob')) return '';
  if (m.includes('fix: use uint8array')) return '';
  if (m.includes('fix: use supabase storage')) return '';
  if (m.includes('fix: remove template dropdown')) return '';
  if (m.includes('debug: add temp unauthenticated')) return '';
  if (m.includes('feat: add single send button')) return '';
  if (m.includes('cleanup: remove debug endpoint')) return '';
  if (m.includes('fix: replace display:none')) return '';
  if (m.includes('feat: ngo filter on dashboard')) return '';
  if (m.includes('fix: import apiget at top')) return '';
  if (m.includes('fix: show ngo names')) return '';
  if (m.includes('feat: editable phone number')) return '';
  if (m.includes('fix: derive ngo code')) return '';
  if (m.includes('feat: remove inline receipt')) return '';
  if (m.includes('fix: pdf filename format')) return '';
  if (m.includes('feat: auto-load receipts')) return '';
  if (m.includes('fix: set proper filename')) return '';
  if (m.includes('fix: use receipt_id')) return '';
  if (m.includes('feat: add download all as zip')) return '';
  if (m.includes('feat: group zip downloads')) return '';
  if (m.includes('fix: remove sent column')) return '';
  if (m.includes('feat: single zip with bsct')) return '';
  if (m.includes('fix: remove phone column')) return '';
  if (m.includes('fix: remove pagination from leads')) return '';
  if (m.includes('fix: replace remaining paged')) return '';
  if (m.includes('feat: switch to send-template')) return '';
  if (m.includes('fix: correct template name')) return '';
  if (m.includes('fix: derive project')) return '';

  // Email Import
  if (m.includes('feat: auto-sync razorpay')) return '';
  if (m.includes('feat: notice target_role')) return '';
  if (m.includes('feat: create notice modal')) return '';
  if (m.includes('add per-page ngo dropdown')) return '';
  if (m.includes('style(sa): add left border')) return '';
  if (m.includes('feat(sa): make panel summary')) return '';
  if (m.includes('fix: remove whatsapp and template')) return '';
  if (m.includes('feat(sa): add panel summary')) return '';
  if (m.includes('fix(sa): reorder sidebar')) return '';
  if (m.includes('replace fro_per_ngo')) return '';
  if (m.includes('feat(sa): replace live fro')) return '';
  if (m.includes('feat: email accounts view')) return '';
  if (m.includes('feat(sa): add hr panel')) return '';
  if (m.includes('add fro worker breakdown')) return '';
  if (m.includes('feat: all settings open')) return '';
  if (m.includes('feat: add email import')) return '';
  if (m.includes('fix(sa): use alltimeroledistribution')) return '';
  if (m.includes('feat: move razorpay account')) return '';
  if (m.includes('fix(sa): compute departments')) return '';
  if (m.includes('refactor(sa): reorganize dashboard')) return '';
  if (m.includes('feat: account tabs')) return '';
  if (m.includes('filter collection amounts')) return '';
  if (m.includes('feat: webhook secret optional')) return '';
  if (m.includes('fix ngo_id filter')) return '';
  if (m.includes('feat: handle all razorpay')) return '';
  if (m.includes('fix: remove duplicate nav')) return '';
  if (m.includes('fix: add missing topoffset')) return '';
  if (m.includes('add ngo-wise dashboard')) return '';
  if (m.includes('feat: multi-account razorpay')) return '';
  if (m.includes('feat: import all emails')) return '';
  if (m.includes('feat: move create notice')) return '';
  if (m.includes('fix: limit all-email import')) return '';
  if (m.includes('remove view all fro button')) return '';
  if (m.includes('fix: remove default date')) return '';
  if (m.includes('fix: update labels')) return '';
  if (m.includes('fix: search seen+unseen')) return '';
  if (m.includes('fix: default manual import')) return '';
  if (m.includes('fix: remove seen column')) return '';
  if (m.includes('fix: use unseen+seen search')) return '';
  if (m.includes('fix: search yesterday+unseen')) return '';
  if (m.includes('fix: reduce batch size')) return '';
  if (m.includes('fix: use do block')) return '';
  if (m.includes('fix: comprehensive migration')) return '';
  if (m.includes('fix: migration to add missing')) return '';
  if (m.includes('fix: import only last 3 days')) return '';
  if (m.includes('fix: rate limit groq')) return '';
  if (m.includes('fix: only import credited/received')) return '';
  if (m.includes('remove: departments card')) return '';
  if (m.includes('added the logo inside')) return '';
  if (m.includes('feat: mark imported unseen')) return '';
  if (m.includes('feat: manual import scans')) return '';
  if (m.includes('added the experience letter')) return '';
  if (m.includes('fix: hr quick-link card')) return '';
  if (m.includes('feat: hr summary modal')) return '';
  if (m.includes('feat: only unseen by default')) return '';
  if (m.includes('remove the letter')) return '';
  if (m.includes('change the letter of offer')) return '';
  if (m.includes('consultant logo changing')) return '';
  if (m.includes('merged used/unused data')) return '';
  if (m.includes('refactor: replace ngo filter')) return '';
  if (m.includes('fix: move ngo inline card')) return '';
  if (m.includes('refactor: show ngo quick data')) return '';
  if (m.includes('feat: all settings open')) return '';

  // Default fallback - make the commit message more descriptive
  const prefixes = {
    'feat:': 'Added feature:',
    'fix:': 'Fixed issue:',
    'refactor:': 'Refactored:',
    'chore:': 'Maintenance:',
    'style:': 'Styling:',
    'docs:': 'Documentation:',
    'perf:': 'Performance:',
    'test:': 'Testing:',
    'build:': 'Build:',
    'ci:': 'CI:',
    'revert:': 'Reverted:',
  };

  for (const [prefix, replacement] of Object.entries(prefixes)) {
    if (msg.toLowerCase().startsWith(prefix)) {
      return msg.replace(new RegExp(`^${prefix}\\s*`, 'i'), replacement + ' ');
    }
  }

  // Capitalize first letter if not already
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}

function generateSheet() {
  const entries = getGitLog();
  const byDate = groupByDate(entries);
  const dates = Object.keys(byDate).sort();

  const skipPatterns = [
    /^Merge/i, /^changes added$/i, /^chnages added$/i, /^new$/i,
    /^last change/i, /^one more change/i, /^one last change/i,
    /^trigger redeploy/i, /^force backend redeploy/i, /^changes made/i,
    /^changes  made/i, /^add changes/i, /^cleaning done$/i, /^btn add$/i,
    /^new account made/i, /^deshbord$/i, /^dasbaord changes$/i,
    /^set achived add$/i, /^fro changes$/i, /^froo changes$/i, /^new changes$/i,
  ];
  const isRelevant = (msg) => !skipPatterns.some((p) => p.test(msg));

  const wb = XLSX.utils.book_new();

  for (const date of dates) {
    const tasks = byDate[date].filter(isRelevant);
    if (tasks.length === 0) continue;

    const seen = new Set();
    const unique = [];
    for (const t of tasks) {
      const key = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(t);
      }
    }

    const data = unique.map((t, i) => ({
      'S.No': i + 1,
      'Task Description': elaborate(t),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 6 }, { wch: 140 }];
    const sheetName = date.replace('2026-', '').replace('-06-', 'Jun ').replace('-07-', 'Jul ');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    console.log(`Added sheet: ${sheetName} (${unique.length} tasks)`);
  }

  XLSX.writeFile(wb, path.join(rootDir, 'task_sheets.xlsx'));
  console.log('\nCreated: task_sheets.xlsx with all daily sheets (elaborated)');
}

generateSheet();

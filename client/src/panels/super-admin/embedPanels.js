// Panels that Super Admin shows *inside its own layout*.
//
// Each of these panels is a full app with its own sidebar and topbar. Super
// Admin loads it in an iframe, and (embedCss below) hides that panel's own
// chrome so only the page content is visible. Navigation between that panel's
// pages happens through the Super Admin sidebar sub-menu instead.
//
// Everything lives in the super-admin folder: no other panel is modified.

export const EMBED_PANELS = {
  'ngo-admin': {
    base: '/ngo-admin',
    label: 'Admin',
    items: [
      { path: 'dashboard', label: 'Dashboard' },
      { path: 'station-mgmt', label: 'Stations & FROs' },
      { path: 'attendance', label: 'Attendance' },
      { path: 'codes', label: 'Acting FRO Codes' },
      { path: 'my-tickets', label: 'Tickets' },
    ],
  },
  hr: {
    base: '/hr',
    label: 'HR',
    items: [
      { path: 'overview', label: 'Overview' },
      { path: 'employees', label: 'Volunteers' },
      { path: 'attendance', label: 'Attendance' },
      { path: 'leaves', label: 'Leaves' },
      { path: 'letters', label: 'Letters' },
      { path: 'hr-forms', label: 'HR Forms' },
      { path: 'recruiters', label: 'Recruiters' },
      { path: 'reports', label: 'Reports' },
      { path: 'quizzes', label: 'Quizzes' },
      { path: 'holidays', label: 'Holidays' },
      { path: 'qr', label: 'QR Codes' },
      { path: 'loans', label: 'Loans & Advances' },
      { path: 'ngo', label: 'NGO & Salary' },
      { path: 'fro-targets', label: 'FRO Targets' },
      { path: 'tickets', label: 'Tickets' },
      { path: 'library', label: 'Library' },
    ],
  },
  accounts: {
    base: '/accounts',
    label: 'Accounts',
    items: [
      { path: 'leads', label: 'Lead and Audit' },
      { path: 'receipt-generator', label: 'Receipts' },
      { path: 'bill-reminder', label: 'Bill Reminder' },
      { path: 'attendance', label: 'Attendance' },
      { path: 'volunteers', label: 'Salary' },
      { path: 'teams', label: 'Teams' },
      { path: 'incentive', label: 'Incentive' },
      { path: 'incentive-verify', label: 'Incentive Verify' },
      { path: 'fro-targets', label: 'FRO Targets' },
      { path: 'incentives', label: 'NGO wise Incentive' },
      { path: 'donors', label: 'Donors' },
      { path: 'certificates', label: 'Certificates' },
      { path: 'asset-register', label: 'Asset Register' },
      { path: 'loans', label: 'Loan & Advance' },
      { path: 'beneficiaries', label: 'Beneficiaries' },
      { path: 'reports', label: 'Reports' },
      { path: 'tickets', label: 'Tickets' },
      { path: 'library', label: 'Library' },
    ],
  },
  fro: {
    base: '/fro',
    label: 'FRO',
    items: [
      { path: 'dashboard', label: 'Dashboard' },
      { path: 'my-leads', label: 'My Leads' },
      { path: 'donors', label: 'Donors' },
      { path: 'my-idle', label: 'My Idle' },
      { path: 'lead-incentive', label: 'Lead Incentive' },
      { path: 'tickets', label: 'Tickets' },
    ],
  },
  'event-head': {
    base: '/event-head',
    label: 'Event Head',
    items: [
      { path: 'dashboard', label: 'Dashboard' },
      { path: 'events', label: 'Events' },
      { path: 'monthly-planner', label: 'Calendar' },
      { path: 'planner', label: 'Monthly Planner' },
      { path: 'ngos', label: 'NGOs' },
      { path: 'sectors', label: 'Sectors' },
      { path: 'activities', label: 'Activities' },
      { path: 'events-list', label: 'My Events' },
      { path: 'media-management', label: 'Media / Banners' },
      { path: 'volunteers', label: 'Voluntary' },
      { path: 'reports', label: 'Event Reports' },
      { path: 'approvals', label: 'Approval Workflow' },
      { path: 'all-tickets', label: 'All Tickets' },
    ],
  },
  recruiter: {
    base: '/recruiter',
    label: 'Recruiter',
    items: [
      { path: 'dashboard', label: 'Dashboard' },
      { path: 'leads', label: 'Leads' },
      { path: 'candidates', label: 'Candidates' },
      { path: 'tickets', label: 'Tickets' },
    ],
  },
  developers: {
    base: '/dev-panel',
    label: 'Developers',
    items: [
      { path: 'bugs', label: 'Testing / Bugs' },
      { path: 'tickets', label: 'All Tickets' },
      { path: 'unassigned', label: 'Unassigned' },
      { path: 'daily-report', label: 'Daily Report' },
    ],
  },
}

// CSS injected into the (same-origin) iframe so the embedded panel shows only
// its page content: no second sidebar, no second topbar, no floating chat
// button. Specific selectors are needed because some panels pin their topbar
// with position:fixed and push .main over with a left margin.
export const EMBED_CSS = `
  .sidebar, .sidebar-overlay, aside, .topbar,
  .chat-fab, .chat-fab-host, .notices-bar, .hamburger { display: none !important; }
  .app { display: block !important; height: auto !important; min-height: 100vh !important; overflow: visible !important; }
  .main, .main.main { margin-left: 0 !important; padding-top: 0 !important; width: 100% !important; max-width: 100% !important; overflow: visible !important; }
  html, body { overflow-y: auto !important; }
`

// Writes EMBED_CSS into the iframe document once it has loaded. Returns true
// if it could (same origin), false otherwise.
export function injectEmbedCss(iframe) {
  try {
    const doc = iframe?.contentDocument
    if (!doc || !doc.head) return false
    if (doc.getElementById('sa-embed-css')) return true
    const style = doc.createElement('style')
    style.id = 'sa-embed-css'
    style.textContent = EMBED_CSS
    doc.head.appendChild(style)
    return true
  } catch {
    return false
  }
}

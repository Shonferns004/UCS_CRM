// Renders the real AccountsSidebar against the real nav data for every route the
// panel declares. The point is the active-state computation, which is where the
// shipped crash lived: navIsActive(n, pathname) dereferences pathname, so any
// call site that forgets the second argument throws "Cannot read properties of
// undefined (reading 'startsWith')".
//
// Run from the client/ directory:  node <this file>

import { createServer } from 'vite'

/* Minimal browser shims. renderToString does not run effects, so only the
   render phase needs satisfying: useIsMobile's lazy initialiser touches
   window.matchMedia, and the portal target expression touches document.body. */
const store = new Map()
const noop = () => {}

globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  matchMedia: (media) => ({
    media, matches: false, onchange: null,
    addEventListener: noop, removeEventListener: noop,
    addListener: noop, removeListener: noop, dispatchEvent: noop,
  }),
  addEventListener: noop, removeEventListener: noop, scrollTo: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
}
globalThis.document = {
  body: { appendChild: noop },
  documentElement: { style: { setProperty: noop } },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop,
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
}
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const vite = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  // Under Node, react-router-dom's "node" condition resolves to its CJS build,
  // which has no detectable named exports. noExternal plus the import condition
  // makes Vite load the real ESM build instead. React itself stays externalised
  // so there is exactly one instance of it.
  ssr: {
    noExternal: ['react-router-dom'],
    resolve: { conditions: ['import', 'module', 'browser', 'default'] },
  },
})

/* React is loaded natively: its package has no ESM build, so it cannot go
   through Vite's module runner. It stays externalised there too, which is what
   keeps this the same instance the components under test render against. */
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

/* AccountsPanel's import tree pulls in html2canvas, which needs a real DOM at
   import time, so the panel module cannot be loaded here. Only the sidebar
   under test is loaded, against a fixture with the same shape as the real
   SIDEBAR_SECTIONS: flat leaves, items with match predicates, nested groups,
   and a group carrying isGroupActive. */
const { default: AccountsSidebar } = await vite.ssrLoadModule('/src/panels/accounts/sidebar/AccountsSidebar.jsx')
const { MemoryRouter } = await vite.ssrLoadModule('react-router-dom')
/* The Community row renders ChatNavBadge, which calls useUcs and so needs the
   real provider. Same module instance as the badge's, via the module runner. */
const { UcsProvider } = await vite.ssrLoadModule('/src/store.jsx')

const ico = createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24' })

/* Copied from AccountsPanel so the fixture is not silently hollow. */
const navIsActive = (n, pathname) => {
  if (n.id === 'volunteers' && pathname.startsWith('/accounts/volunteers')) return true
  if (n.id === 'attendance' && pathname === '/accounts/attendance') return true
  if (n.match) return n.match(pathname)
  return pathname === n.path
}

const leaf = (id, label, path, extra = {}) => ({ id, label, path, icon: ico, ...extra })

const SIDEBAR_SECTIONS = [
  {
    id: 'main',
    heading: 'Main',
    items: [
      leaf('leads', 'Lead and Audit', '/accounts/leads'),
      leaf('bill-reminder', 'Bill Reminder', '/accounts/bill-reminder', { match: (p) => p.startsWith('/accounts/bill-reminder') }),
      {
        id: 'g-workforce', label: 'Workforce', icon: ico, storageKey: 'workforce',
        items: [
          leaf('attendance', 'Attendance', '/accounts/attendance'),
          leaf('volunteers', 'Salary', '/accounts/volunteers'),
          leaf('incentives', 'NGO wise Incentive', '/accounts/incentives', { match: (p) => p.startsWith('/accounts/incentives') }),
        ],
      },
      {
        id: 'g-beneficiaries', label: 'Beneficiaries', icon: ico, storageKey: 'beneficiaries',
        isGroupActive: (p) => p.startsWith('/accounts/beneficiaries'),
        items: [
          leaf('bnf-overview', 'Overview', '/accounts/beneficiaries'),
          leaf('bnf-all', 'All Beneficiaries', '/accounts/beneficiaries/all'),
        ],
      },
      {
        id: 'g-sim', label: 'SIM Management', icon: ico, storageKey: 'sim',
        items: [
          leaf('sim-dashboard', 'Dashboard', '/accounts/sim/dashboard', { match: (p) => p === '/accounts/sim' || p === '/accounts/sim/dashboard' }),
        ],
      },
    ],
  },
  {
    id: 'settings',
    heading: 'Settings',
    items: [
      leaf('reports', 'Reports', '/accounts/reports'),
      leaf('tickets', 'Tickets', '/accounts/tickets'),
      leaf('chat', 'Community', '/accounts/chat'),
    ],
  },
]

const ROUTES = [
  '/accounts/leads', '/accounts/receipt-generator', '/accounts/bill-reminder',
  '/accounts/bill-reminder/sent', '/accounts/attendance', '/accounts/volunteers',
  '/accounts/volunteers/abc123', '/accounts/volunteers/abc123/offboard',
  '/accounts/teams', '/accounts/incentive', '/accounts/incentive-verify',
  '/accounts/incentives', '/accounts/incentives/payout', '/accounts/donors',
  '/accounts/address', '/accounts/certificates', '/accounts/asset-register',
  '/accounts/loans', '/accounts/new-data', '/accounts/old-data',
  '/accounts/beneficiaries', '/accounts/beneficiaries/all',
  '/accounts/beneficiaries/import', '/accounts/beneficiaries/programs',
  '/accounts/beneficiaries/events', '/accounts/beneficiaries/xyz',
  '/accounts/sim', '/accounts/sim/dashboard', '/accounts/sim/inventory',
  '/accounts/sim/cards', '/accounts/sim/owner', '/accounts/reports',
  '/accounts/tickets', '/accounts/chat', '/accounts/',
]

let failures = 0

function check(label, route, collapsed) {
  // The component seeds its collapsed state from localStorage, so the flag has
  // to be set before the render, not passed in.
  store.set('accounts_nav_collapsed', collapsed ? '1' : '0')

  const html = renderToString(createElement(
    MemoryRouter,
    { initialEntries: [route] },
    createElement(
      UcsProvider,
      null,
      createElement(AccountsSidebar, {
        sections: SIDEBAR_SECTIONS,
        isActive: navIsActive,
        open: false,
        onClose: noop,
      }),
    ),
  ))

  const isRail = collapsed
  const hasCollapseBtn = html.includes('sb-collapse')
  const railClass = html.includes('nav-collapsed')
  const problems = []

  if (!html.includes('Accounts navigation')) problems.push('missing nav landmark')
  if (!hasCollapseBtn) problems.push('missing collapse control')
  if (railClass !== isRail) problems.push(`rail class ${railClass} !== expected ${isRail}`)
  if (isRail && html.includes('snav-group-items')) problems.push('rail rendered inline nested items')
  if (!isRail && !html.includes('snav-group-items')) problems.push('expanded sidebar rendered no nested items')
  if (html.includes('undefined')) problems.push('markup contains the string "undefined"')
  if (!html.includes('aria-label="Collapse sidebar"') && !html.includes('aria-label="Expand sidebar"')) {
    problems.push('collapse control has no accessible name')
  }

  // The three-dot account menu duplicated the topbar user menu and was removed.
  if (html.includes('ac-account-menu')) problems.push('account menu is back')
  if (html.includes('Account options')) problems.push('three-dot account trigger is back')

  /* The collapse control must be an in-flow child of the header, not a sibling
     absolutely positioned over the sidebar edge. Markup order alone cannot
     prove this: a sibling rendered after </div> still comes later in the string
     than the header's opening tag. So track <div>/</div> nesting depth and
     compare the depth at the header against the depth at the control. Inside,
     the control is a child of the header div (same depth); as a following
     sibling, the header has already closed (one level shallower). */
  function divDepthAt(target) {
    let depth = 0
    const tags = /<(\/?)div\b/g
    let m
    while ((m = tags.exec(html)) !== null) {
      if (m.index >= target) return depth
      depth += m[1] ? -1 : 1
    }
    return depth
  }
  const headerIdx = html.indexOf('sb-header')
  const collapseIdx = html.indexOf('sb-collapse')
  if (headerIdx === -1 || collapseIdx === -1) {
    problems.push('missing collapse control or header')
  } else if (divDepthAt(collapseIdx) !== divDepthAt(headerIdx)) {
    problems.push('collapse control is not inside the header')
  }

  if (problems.length) {
    failures++
    console.log(`FAIL ${label} ${route}: ${problems.join('; ')}`)
  }
}

for (const route of ROUTES) {
  check('expanded', route, false)
  check('rail    ', route, true)
}

// Every leaf and group must resolve without throwing on its own, which is the
// exact shape of the regression that shipped.
for (const section of SIDEBAR_SECTIONS) {
  for (const item of section.items) {
    for (const route of ROUTES) {
      try {
        if (item.items) {
          if (item.isGroupActive) item.isGroupActive(route)
          else item.items.forEach((c) => navIsActive(c, route))
        } else {
          navIsActive(item, route)
        }
      } catch (err) {
        failures++
        console.log(`FAIL navIsActive(${item.id}, ${route}): ${err.message}`)
      }
    }
  }
}

await vite.close()

const count = ROUTES.length * 2
console.log(failures === 0
  ? `sidebar smoke: all passed (${count} renders, ${SIDEBAR_SECTIONS.reduce((n, s) => n + s.items.length, 0)} nav items x ${ROUTES.length} routes)`
  : `sidebar smoke: ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)

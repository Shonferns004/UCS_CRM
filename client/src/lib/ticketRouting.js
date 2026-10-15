// `label`   → the "→ Routed to: …" hint under the Category dropdown.
// `dest`    → the team name used in the confirmation toast, so it reads
//             "Ticket raised to Social Media Team" rather than a generic success
//             message. Kept separate from `label` because event_head's hint is
//             "All Tickets" (used by the gated dashboard) while the team that
//             actually receives the ticket is the UFS Event Manager.
export const TICKET_ROUTES = {
  suspense:       { system: 'regular',   department: 'accounts',   dest: 'Accounts' },
  payment_issue:  { system: 'regular',   department: 'accounts',   dest: 'Accounts' },
  receipt_issue:  { system: 'regular',   department: 'accounts',   dest: 'Accounts' },
  technical:      { system: 'regular',   department: 'event_head', dest: 'UFS Event Manager' },
  social_media:   { system: 'regular',   department: 'social',     dest: 'Social Media Team' },
  socialmedia_team:   { system: 'regular',   department: 'social',     dest: 'Social Media Team' },
  hr_issue:       { system: 'regular',   department: 'hr',         dest: 'HR' },
  super_admin:    { system: 'regular',   department: 'super_admin', dest: 'Super Admin' },
  other:          { system: 'developer', department: 'developers', dest: 'Developers' },
}

const ROUTE_LABELS = {
  accounts:   'Accounts',
  event_head: 'All Tickets',
  hr:         'HR',
  social:     'Social Media Team',
  developers: 'Developers',
  socialmedia_team: 'Social media team',
  super_admin: 'To Super Admin',
  all:         'All Panels',
}

const CATEGORY_LABELS = {
  suspense:      'Suspense',
  payment_issue: 'Payment Issue',
  receipt_issue: 'Receipt Issue',
  technical:     'Technical',
  social_media:  'Social Media Team',
  socialmedia_team: 'Social media team',
  // Legacy label: tickets raised before the Digital Team category was replaced
  // still carry category 'digital_team', so keep rendering them by name.
  digital_team:  'Digital Team',
  hr_issue:      'HR Related',
  super_admin:   'Super Admin',
  other:         'Other',
}

export function routeFor(category) {
  return TICKET_ROUTES[category] || TICKET_ROUTES.other
}

export function routeLabel(category) {
  const r = routeFor(category)
  return r.label || ROUTE_LABELS[r.department] || 'Developers'
}

export function routeDest(category) {
  return routeFor(category).dest || routeLabel(category)
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category
}
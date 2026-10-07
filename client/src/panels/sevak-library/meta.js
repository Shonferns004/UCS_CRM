export const STATUS_META = {
  SUBMITTED: { label: 'Payment pending', cls: 'st-submitted', dot: '#f59e0b', soft: '#fef3c7', text: '#92400e' },
  PAYMENT_SUBMITTED: { label: 'Awaiting verification', cls: 'st-payment', dot: '#3b82f6', soft: '#dbeafe', text: '#1d4ed8' },
  VERIFIED: { label: 'Verified', cls: 'st-verified', dot: '#06b6d4', soft: '#cffafe', text: '#0e7490' },
  APPROVED: { label: 'Approved', cls: 'st-approved', dot: '#22c55e', soft: '#dcfce7', text: '#15803d' },
  REJECTED: { label: 'Rejected', cls: 'st-rejected', dot: '#ef4444', soft: '#fee2e2', text: '#b91c1c' }
}

export const STATUS_ORDER = ['SUBMITTED', 'PAYMENT_SUBMITTED', 'VERIFIED', 'APPROVED', 'REJECTED']

export const PIPELINE_STAGES = ['SUBMITTED', 'PAYMENT_SUBMITTED', 'VERIFIED', 'APPROVED']

export const STATUS_COLORS = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.dot])
)

export const CHART_COLORS = ['#0ea5e9', '#22c55e', '#3b82f6', '#f59e0b', '#06b6d4', '#ef4444']

export const PLAN_COLORS = {
  Daily: '#f59e0b',
  'Half Monthly': '#3b82f6',
  Monthly: '#0ea5e9',
  Quarterly: '#06b6d4',
  'Half-Yearly': '#8b5cf6',
  Annual: '#ef4444'
}

export function statusLabel(s) {
  const m = STATUS_META[s]
  return m ? m.label : s
}

export function statusMeta(s) {
  return STATUS_META[s] || { label: s, dot: '#9aa0a6', soft: '#f1f3f4', text: '#5f6368' }
}

const DAY = 86400000

export function daysUntil(iso) {
  if (!iso) return null
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d - now) / DAY)
}

// Approved memberships whose period ends within `days` (negative = already expired).
export function isRenewalDue(row, days = 30) {
  if (row.status !== 'APPROVED') return false
  const d = daysUntil(row.end_date)
  return d !== null && d <= days
}

// Renewal-date highlight info: tone expired (<0) / soon (<=30d) / ok.
export function renewalInfo(row) {
  const d = daysUntil(row.end_date)
  if (d === null) return null
  const tone = d < 0 ? 'expired' : d <= 30 ? 'soon' : 'ok'
  return { days: d, tone, rel: d === 0 ? 'today' : `${Math.abs(d)}d` }
}

// Spec §13/§15: days-remaining cell — tone + text (never color alone).
// green >=15 · yellow 7-14 · orange 1-6 · red 0/expired
export function daysRemainingInfo(endDate) {
  const d = daysUntil(endDate)
  if (d === null) return null
  let tone
  let text
  if (d < 0) {
    tone = 'red'
    text = `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`
  } else if (d === 0) {
    tone = 'red'
    text = 'Expires today'
  } else if (d <= 6) {
    tone = 'orange'
    text = `${d} day${d === 1 ? '' : 's'}`
  } else if (d <= 14) {
    tone = 'yellow'
    text = `${d} days`
  } else {
    tone = 'green'
    text = `${d} days`
  }
  return { days: d, tone, text }
}

// Status-aware days cell: the membership only counts down once approved.
// approved → days left until end_date (spec tones above).
// pending  → days remaining until the selected start_date: "Starts in 4d" /
//            "Starts today" / "Start overdue" once the selected start passes.
// rejected → nothing (there is no membership to wait for).
export function daysRemainingForRow(row) {
  if (!row || row.status === 'REJECTED') return null
  if (row.status === 'APPROVED') return daysRemainingInfo(row.end_date)
  const d = daysUntil(row.start_date)
  if (d === null) return null
  if (d > 0) return { days: d, tone: 'blue', text: `Starts in ${d}d`, pending: true }
  if (d === 0) return { days: d, tone: 'blue', text: 'Starts today', pending: true }
  return { days: d, tone: 'orange', text: 'Start overdue', pending: true }
}

// Spec §6 membership filter buckets (based on expiry date).
export function membershipState(row) {
  const d = daysUntil(row.end_date)
  if (d === null) return null
  if (d < 0) return 'expired'
  if (d <= 14) return 'expiring'
  return 'active'
}

export function toLocalIso(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

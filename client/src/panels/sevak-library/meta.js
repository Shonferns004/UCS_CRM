export const STATUS_META = {
  SUBMITTED: { label: 'Payment pending', cls: 'st-submitted', dot: '#f59e0b' },
  PAYMENT_SUBMITTED: { label: 'Awaiting verification', cls: 'st-payment', dot: '#3b82f6' },
  VERIFIED: { label: 'Verified', cls: 'st-verified', dot: '#06b6d4' },
  APPROVED: { label: 'Approved', cls: 'st-approved', dot: '#22c55e' },
  REJECTED: { label: 'Rejected', cls: 'st-rejected', dot: '#ef4444' }
}

export const STATUS_ORDER = ['SUBMITTED', 'PAYMENT_SUBMITTED', 'VERIFIED', 'APPROVED', 'REJECTED']

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

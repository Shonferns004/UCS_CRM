import { SECTIONS } from './formConfig.js'

export function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildInitialValues() {
  const values = {}
  SECTIONS.forEach((section) => {
    ;(section.fields || []).forEach((f) => {
      if (f.autoToday) values[f.id] = todayISO()
      else if (f.type === 'checkboxes') values[f.id] = []
      else if (f.type === 'checkbox') values[f.id] = false
      else values[f.id] = ''
    })
  })
  return values
}

const PLAN_ADD = {
  Daily: { days: 1 },
  'Half Monthly': { days: 15 },
  Monthly: { months: 1 },
  Quarterly: { months: 3 },
  'Half-Yearly': { months: 6 },
  Annual: { months: 12 }
}

function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function computeEndDate(startDate, plan) {
  if (!startDate || !plan) return ''
  const rule = PLAN_ADD[plan]
  if (!rule) return ''
  const d = new Date(startDate + 'T00:00:00')
  if (rule.days) {
    d.setDate(d.getDate() + rule.days)
    return toISODate(d)
  }
  const months = rule.months
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return toISODate(d)
}

// Renewal preview — mirrors the backend renewApplication math: extend from the
// current end date when it is still in the future (remaining days kept), else
// from today. Returns { from, to, keeps } or null when dates are unknown.
export function renewalPreview(row) {
  if (!row || !row.membership_type) return null
  const today = todayISO()
  const keeps = !!row.end_date && row.end_date >= today
  const from = keeps ? row.end_date : today
  const to = computeEndDate(from, row.membership_type)
  if (!to) return null
  return { from, to, keeps }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Spec §11: never expose raw ISO — render "03 Oct 2026".
export function formatDate(iso) {
  if (!iso) return '—'
  const s = String(iso)
  let d
  if (s.includes('T')) {
    d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
  } else {
    const [y, m, day] = s.slice(0, 10).split('-').map(Number)
    if (!y || !m || !day) return '—'
    d = new Date(y, m - 1, day)
  }
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// Spec §12: "10:42 AM" companion for full timestamps.
export function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatINR(n) {
  const num = Number(n)
  if (Number.isNaN(num)) return '—'
  return `₹${num.toLocaleString('en-IN')}`
}

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

export function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatINR(n) {
  const num = Number(n)
  if (Number.isNaN(num)) return '—'
  return `Rs. ${num.toLocaleString('en-IN')}`
}

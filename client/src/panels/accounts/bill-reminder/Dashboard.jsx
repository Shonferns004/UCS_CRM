import { useMemo, useState } from 'react'
import { useRem } from './store'
import { Icon } from './components'
import { CATEGORIES, categoryLabel, categoryIcon, formatDate, daysLeft, statusPillClass } from './helpers'
import { computeEffectiveDueDate, computeCurrentMonthDate } from './notifications'
import BillChart from './BillChart'
import { AddBillModal } from './modals'
import './dashboard.css'

const CATEGORY_SECTIONS = [
  {
    cls: 'cat-finance',
    title: 'Finance & Tax',
    heading: { col: 1, span: 7, row: 3 },
    tiles: [
      { key: 'LIC_INSURANCE', label: 'LIC/Insurance', icon: 'shield', col: 1, row: 4, match: r => r.category === 'INSURANCE' && !/mediclaim/i.test(String(r.title || '')) },
      { key: 'MEDICLAIM', label: 'Mediclaim', icon: 'file', col: 2, row: 4, match: r => r.category === 'INSURANCE' && /mediclaim/i.test(String(r.title || '')) },
      { key: 'LOAN_EMI', label: 'Loan/EMI', icon: 'money', col: 3, row: 4, match: r => r.category === 'OTHER_BILL' && /loan emi/i.test(String(r.title || '')) },
      { key: 'CREDIT_CARD', label: 'Credit Card', icon: 'money', col: 4, row: 4, match: r => r.category === 'OTHER_BILL' && /credit card/i.test(String(r.title || '')) },
      { key: 'ADVANCE_TAX', label: 'Advance Tax', icon: 'file', col: 5, row: 4, match: r => r.category === 'OTHER_BILL' && String(r.title || '') === 'Advance Tax' },
      { key: 'LEGAL_FEES', label: 'Legal Fees', icon: 'file', col: 6, row: 4, match: r => r.category === 'OTHER_BILL' && String(r.title || '') === 'Accounts and Audit Fees' },
      { key: 'INCOME_TAX', label: 'Income Tax', icon: 'file', col: 7, row: 4, match: r => r.category === 'OTHER_BILL' && String(r.title || '') === 'Income Tax' },
      { key: 'VEHICLE_INSURANCE', label: 'Vehicle Insurance', icon: 'car', col: 8, row: 4, match: r => r.category === 'VEHICLE_INSURANCE' },
    ],
  },
  {
    cls: 'cat-utility',
    title: 'Utility Bills',
    heading: { col: 3, span: 4, row: 1 },
    tiles: [
      { key: 'ELECTRICITY', label: 'Electricity Bills', icon: 'zap', col: 3, row: 2, match: r => r.category === 'ELECTRICITY' },
      { key: 'BROADBAND', label: 'Broadband', icon: 'wifi', col: 4, row: 2, match: r => r.category === 'OTHER_BILL' && /internet/i.test(String(r.title || '')) },
      { key: 'GAS_PIPELINE', label: 'Gas Pipeline', icon: 'home', col: 5, row: 2, match: r => r.category === 'OTHER_BILL' && /\(Flat No\. 401\)|\(Priyank Sir\)/i.test(String(r.title || '')) },
      { key: 'EDUCATION', label: 'Education', icon: 'book', col: 6, row: 2, match: r => r.category === 'EDUCATION' },
      { key: 'WEBSITE_DOMAIN', label: 'Website Domain', icon: 'globe', col: 7, row: 2, match: r => r.category === 'WEBSITE_DOMAIN' },
    ],
  },
  {
    cls: 'cat-recharge',
    title: 'RECHARGE',
    heading: { col: 1, span: 2, row: 1 },
    tiles: [
      { key: 'MOBILE_RECHARGE', label: 'Mobile Recharge', icon: 'zap', col: 1, row: 2, match: r => /mobile/i.test(String(r.title || '')) },
      { key: 'FASTAG_RECHARGE', label: 'Fastag Recharge', icon: 'car', col: 2, row: 2, match: r => /fastag|MH13EK9999/i.test(String(r.title || '')) },
    ],
  },
  {
    cls: 'cat-postpaid',
    title: 'Post-Paid Mobile',
    heading: { col: 7, span: 2, row: 1 },
    tiles: [
      { key: 'VI_BILL', label: 'VI Bills', icon: 'wifi', col: 7, row: 2, match: r => r.category === 'VI_BILL' },
    ],
  },
  {
    cls: 'cat-property',
    title: 'Property & Tax',
    heading: { col: 7, span: 2, row: 1 },
    tiles: [
      { key: 'PROPERTY_MAINTENANCE', label: 'Property & Tax', icon: 'home', col: 7, row: 2, match: r => r.category === 'PROPERTY_MAINTENANCE' },
      { key: 'BMC_TAX', label: 'BMC Tax', icon: 'file', col: 8, row: 2, match: r => r.category === 'BMC_TAX' },
    ],
  },
  {
    cls: 'cat-rent',
    title: 'Rent & TDS',
    heading: { col: 9, span: 2, row: 1 },
    tiles: [
      { key: 'RENT', label: 'Rent', icon: 'money', col: 9, row: 2, match: r => r.category === 'RENT_TDS' && !/tds/i.test(String(r.title || '')) && (/rent/i.test(String(r.title || '')) || String(r.title || '') === 'Raj Cresent (Priyank Sir)') },
      { key: 'TDS', label: 'TDS', icon: 'file', col: 10, row: 2, match: r => r.category === 'RENT_TDS' && /tds/i.test(String(r.title || '')) },
    ],
  },
]

const CATEGORY_TILE_COLORS = {
  PROPERTY_MAINTENANCE: { bg: '#eff6ff', border: '#93c5fd', iconBg: '#dbeafe', color: '#2563eb' },
  BMC_TAX: { bg: '#f0fdf4', border: '#86efac', iconBg: '#dcfce7', color: '#16a34a' },
  RENT: { bg: '#fffbeb', border: '#fcd34d', iconBg: '#fef3c7', color: '#d97706' },
  TDS: { bg: '#f8fafc', border: '#cbd5e1', iconBg: '#e2e8f0', color: '#475569' },
  LIC_INSURANCE: { bg: '#f5f3ff', border: '#ddd6fe', iconBg: '#ede9fe', color: '#7c3aed' },
  MEDICLAIM: { bg: '#fef2f2', border: '#fca5a5', iconBg: '#fee2e2', color: '#dc2626' },
  LOAN_EMI: { bg: '#fff7ed', border: '#fdba74', iconBg: '#ffedd5', color: '#ea580c' },
  CREDIT_CARD: { bg: '#ecfeff', border: '#67e8f9', iconBg: '#cffafe', color: '#0891b2' },
  ADVANCE_TAX: { bg: '#f8fafc', border: '#e2e8f0', iconBg: '#e2e8f0', color: '#475569' },
  LEGAL_FEES: { bg: '#fefce8', border: '#fde047', iconBg: '#fef9c3', color: '#ca8a04' },
  INCOME_TAX: { bg: '#eff6ff', border: '#93c5fd', iconBg: '#dbeafe', color: '#2563eb' },
  RENT_TDS: { bg: '#fffbeb', border: '#fcd34d', iconBg: '#fef3c7', color: '#d97706' },
  INSURANCE: { bg: '#fef2f2', border: '#fca5a5', iconBg: '#fee2e2', color: '#dc2626' },
  EDUCATION: { bg: '#ecfeff', border: '#67e8f9', iconBg: '#cffafe', color: '#0891b2' },
  VI_BILL: { bg: '#eef2ff', border: '#a5b4fc', iconBg: '#e0e7ff', color: '#4f46e5' },
  WEBSITE_DOMAIN: { bg: '#fff7ed', border: '#fdba74', iconBg: '#ffedd5', color: '#ea580c' },
  VEHICLE_INSURANCE: { bg: '#fefce8', border: '#fde047', iconBg: '#fef9c3', color: '#ca8a04' },
  ELECTRICITY: { bg: '#f0fdfa', border: '#5eead4', iconBg: '#ccfbf1', color: '#0d9488' },
  OTHER_BILL: { bg: '#f8fafc', border: '#e2e8f0', iconBg: '#e2e8f0', color: '#475569' },
  MOBILE_RECHARGE: { bg: '#ecfeff', border: '#67e8f9', iconBg: '#cffafe', color: '#0891b2' },
  FASTAG_RECHARGE: { bg: '#fefce8', border: '#fde047', iconBg: '#fef9c3', color: '#ca8a04' },
  BROADBAND: { bg: '#fdf4ff', border: '#e9d5ff', iconBg: '#fae8ff', color: '#a21caf' },
  GAS_PIPELINE: { bg: '#fff7ed', border: '#fdba74', iconBg: '#ffedd5', color: '#ea580c' },
}

const TILE_STATUSES = [
  { key: 'overdue', label: 'Overdue', color: '#dc2626', soft: '#fee2e2' },
  { key: 'dueToday', label: 'Due Today', color: '#ea580c', soft: '#ffedd5' },
  { key: 'upcoming', label: 'Upcoming', color: '#2563eb', soft: '#dbeafe' },
  { key: 'paidToday', label: 'Paid', color: '#16a34a', soft: '#dcfce7' },
]

const CAT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'dueToday', label: 'Due Today' },
  { key: 'dueSoon', label: 'Due Soon' },
  { key: 'paid', label: 'Paid' },
]

function catMatchesFilter(statuses, filter) {
  if (!filter || filter === 'all') return true
  if (filter === 'overdue') return (statuses?.overdue?.n || 0) > 0
  if (filter === 'dueToday') return (statuses?.dueToday?.n || 0) > 0
  if (filter === 'dueSoon') return (statuses?.upcoming?.n || 0) > 0
  if (filter === 'paid') return (statuses?.paidToday?.n || 0) > 0
  return true
}

function parseAmountFromNotes(notes) {
  if (!notes) return 0
  const text = String(notes)
  const match = text.match(/(?:Rs\.?|₹)\s*([\d][\d,]*)/i)
  if (match) {
    const num = parseFloat(match[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) return num
  }
  const match2 = text.match(/(?:amount|amt|rent|fee|of)\D*?([\d][\d,]*)/i)
  if (match2) {
    const num = parseFloat(match2[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) return num
  }
  return 0
}

function formatCurrency(num) {
  if (!num) return '₹0'
  return '₹' + num.toLocaleString('en-IN')
}

function compactAmount(num) {
  if (!num) return ''
  if (num >= 10000000) return '₹' + parseFloat((num / 10000000).toFixed(1)) + 'Cr'
  if (num >= 100000) return '₹' + parseFloat((num / 100000).toFixed(1)) + 'L'
  if (num >= 1000) return '₹' + parseFloat((num / 1000).toFixed(1)) + 'k'
  return '₹' + Math.round(num).toLocaleString('en-IN')
}

function isSameDay(a, b) {
  const d = a ? new Date(a) : null
  if (!d) return false
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
}

function getDueStatus(r) {
  if (r.status === 'Completed' || r.completed_at) return 'Paid'
  if (r.due_date_display && String(r.due_date_display).includes('Paid by Tenant')) return 'Paid'
  if (r.notes && String(r.notes).includes('Paid by Tenant')) return 'Paid'
  const effectiveDate = computeEffectiveDueDate(r)
  const dl = effectiveDate ? daysLeft(effectiveDate) : daysLeft(r.due_date)
  if (dl === null) return 'Pending'
  if (dl < 0) return 'Overdue'
  if (dl === 0) return 'Due Today'
  if (dl <= 7) return 'Due Soon'
  return 'Upcoming'
}

export default function Dashboard() {
  const { reminders, refresh } = useRem()

  const [billOpen, setBillOpen] = useState(false)

  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calDay, setCalDay] = useState(null)
  const [catModalKey, setCatModalKey] = useState(null)
  const [catFilter, setCatFilter] = useState('all')

  const active = useMemo(() => reminders.filter(r => !r.is_deleted), [reminders])

  const enriched = useMemo(() => {
    return active.map(r => {
      const dueStatus = getDueStatus(r)
      const rawAmt = Number(r.amount)
      const amount = rawAmt > 0 ? rawAmt : parseAmountFromNotes(r.notes)
      const effectiveDate = computeEffectiveDueDate(r)
      const dl = effectiveDate ? daysLeft(effectiveDate) : daysLeft(r.due_date)
      return { ...r, _dueStatus: dueStatus, _amount: amount, _daysLeft: dl, _effectiveDate: effectiveDate }
    })
  }, [active])

  const filtered = enriched

  const summary = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const todayISO = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const s = { total: 0, totalAmt: 0, paid: 0, paidAmt: 0, pending: 0, pendingAmt: 0, overdue: 0, overdueAmt: 0 }
    for (const r of filtered) {
      const md = computeCurrentMonthDate(r)
      if (!md) continue
      const d = new Date(md + 'T00:00:00')
      if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) continue
      const amt = r._amount || 0
      s.total++
      s.totalAmt += amt
      if (r._dueStatus === 'Paid') { s.paid++; s.paidAmt += amt }
      else if (md < todayISO) { s.overdue++; s.overdueAmt += amt }
      else { s.pending++; s.pendingAmt += amt }
    }
    return s
  }, [filtered])

  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1)
    const last = new Date(calYear, calMonth + 1, 0)
    const startDay = first.getDay()
    const totalDays = last.getDate()
    const cells = []
    for (let i = 0; i < startDay; i++) {
      const d = new Date(calYear, calMonth, -startDay + i + 1)
      cells.push({ day: d.getDate(), date: d, otherMonth: true })
    }
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(calYear, calMonth, d)
      cells.push({ day: d, date, otherMonth: false })
    }
    const totalCells = Math.ceil(cells.length / 7) * 7
    const remaining = totalCells - cells.length
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(calYear, calMonth + 1, i)
      cells.push({ day: i, date: d, otherMonth: true })
    }
    return cells
  }, [calMonth, calYear])

  const calEvents = useMemo(() => {
    const map = {}
    for (const r of filtered) {
      const ed = r._effectiveDate
      if (ed) {
        if (!map[ed]) map[ed] = []
        map[ed].push(r)
      }
    }
    return map
  }, [filtered])

  const calDayItems = useMemo(() => {
    if (!calDay) return []
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(calDay).padStart(2, '0')}`
    return calEvents[ds] || []
  }, [calDay, calMonth, calYear, calEvents])

  const today = new Date()
  const isToday = (day) => day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
  const calTotal = useMemo(() => calDayItems.reduce((s, r) => s + (r._amount || 0), 0), [calDayItems])

  function calStatus(date) {
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const items = calEvents[ds] || []
    if (!items.length) return null
    if (items.some(r => r._dueStatus === 'Overdue')) return 'ovd'
    if (items.some(r => r._dueStatus === 'Due Today')) return 'tdy'
    if (items.some(r => r._dueStatus === 'Due Soon' || r._dueStatus === 'Upcoming')) return 'soon'
    if (items.some(r => r._dueStatus === 'Paid')) return 'paid'
    return null
  }

  const monthlyTotal = summary.totalAmt
  const paidPct = monthlyTotal > 0 ? (summary.paidAmt / monthlyTotal) * 100 : 0
  const pendingPct = monthlyTotal > 0 ? (summary.pendingAmt / monthlyTotal) * 100 : 0
  const overduePct = monthlyTotal > 0 ? (summary.overdueAmt / monthlyTotal) * 100 : 0
  const monthlyPct = Math.round(paidPct)

  const kpiCards = [
    { key: 'total', label: 'Total Obligations', icon: 'money', num: formatCurrency(monthlyTotal), count: summary.total, barW: paidPct, barC: 'linear-gradient(90deg,#34d399,#10b981)', icoBg: 'var(--rem-blue-soft)', icoColor: 'var(--rem-blue)', tip: 'All obligations due this calendar month', ring: true },
    { key: 'paid', label: 'Paid', icon: 'check', num: formatCurrency(summary.paidAmt), count: summary.paid, barW: paidPct, barC: 'var(--rem-green)', icoBg: 'var(--rem-green-soft)', icoColor: 'var(--rem-green)', tip: 'Payments completed this month' },
    { key: 'pending', label: 'Pending', icon: 'clock', num: formatCurrency(summary.pendingAmt), count: summary.pending, barW: pendingPct, barC: 'var(--rem-amber)', icoBg: 'var(--rem-amber-soft)', icoColor: 'var(--rem-amber)', tip: 'Due but not yet paid this month' },
    { key: 'overdue', label: 'Overdue', icon: 'alert', num: formatCurrency(summary.overdueAmt), count: summary.overdue, barW: overduePct, barC: 'var(--rem-red)', icoBg: 'var(--rem-red-soft)', icoColor: 'var(--rem-red)', tip: 'Obligations passed their due date this month' },
  ]

  const catSectionItems = useMemo(() => {
    const now = new Date()
    const statusFor = rows => {
      const s = { overdue: { n: 0, amt: 0 }, dueToday: { n: 0, amt: 0 }, upcoming: { n: 0, amt: 0 }, paidToday: { n: 0, amt: 0 } }
      for (const r of rows) {
        const amt = r._amount || 0
        if (r._dueStatus === 'Overdue') { s.overdue.n++; s.overdue.amt += amt }
        else if (r._dueStatus === 'Due Today') { s.dueToday.n++; s.dueToday.amt += amt }
        else if (r._dueStatus === 'Upcoming' || r._dueStatus === 'Due Soon') { s.upcoming.n++; s.upcoming.amt += amt }
        else if (r._dueStatus === 'Paid' && isSameDay(r.paid_at || r.completed_at, now)) { s.paidToday.n++; s.paidToday.amt += amt }
      }
      return s
    }
    return CATEGORY_SECTIONS.map(section => ({
      title: section.title,
      heading: section.heading,
      tiles: section.tiles
        .map(t => {
          const cat = CATEGORIES.find(c => c.key === t.key)
          const rows = t.match ? enriched.filter(t.match) : enriched.filter(r => r.category === t.key)
          const count = rows.length
          return count > 0 ? { key: t.key, label: t.label || cat?.label, icon: t.icon || cat?.icon, count, statuses: statusFor(rows), col: t.col, row: t.row } : null
        })
        .filter(Boolean),
    }))
  }, [enriched])

  const catModalItems = useMemo(() => {
    if (!catModalKey) return []
    const tile = CATEGORY_SECTIONS.flatMap(section => section.tiles).find(t => t.key === catModalKey)
    if (!tile) return []
    return enriched.filter(tile.match ? tile.match : r => r.category === catModalKey)
  }, [enriched, catModalKey])

  const catModalLabel = catModalKey ? (CATEGORY_SECTIONS.flatMap(section => section.tiles).find(t => t.key === catModalKey)?.label || CATEGORIES.find(c => c.key === catModalKey)?.label || catModalKey) : ''

  return (
    <div className="dash-container">
      <div className="dash-header">
        <h2>PAYMENT CONTROL CENTER</h2>
        <p>Track payments, forecast upcoming expenses and review obligations at a glance.</p>
      </div>

      {/* KPI cards */}
      <div className="dash-kpis">
        {kpiCards.map(k => (
          <div key={k.key} className={`kpi-card kpi-${k.key}`} title={k.tip}>
            <div className="kpi-top">
              <div className="kpi-ico" style={{ background: k.icoBg, color: k.icoColor }}><Icon name={k.icon} size={18} /></div>
              {k.ring ? (
                <div className="kpi-ring" style={{ '--pct': `${paidPct}%` }} title={`${monthlyPct}% of monthly obligations paid`}>
                  <div className="kpi-ring-inner"><span>{monthlyPct}%</span></div>
                </div>
              ) : null}
            </div>
            <div className="kpi-label">{k.label}</div>
            <div className={`kpi-num ${k.key === 'overdue' ? 'kpi-num-danger' : ''}`}>{k.num}</div>
            <div className="kpi-sub">
              <span>this month</span>
              {k.count > 0 && <span className="kpi-count">{k.count} item{k.count !== 1 ? 's' : ''}</span>}
            </div>
            <div className="kpi-bar"><i style={{ width: `${Math.min(100, Math.max(0, k.barW))}%`, background: k.barC }} /></div>
          </div>
        ))}
      </div>

      {/* Upcoming expenses forecast — full width */}
      <div className="dash-block">
        <BillChart reminders={enriched} />
      </div>

      {/* Calendar — full width */}
      <div className="card">
        <div className="card-head">
          <h3><Icon name="calendar" size={16} /> Calendar</h3>
          <span className="spacer" />
          <button className="cal-today" onClick={() => { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()); setCalDay(null) }}>Today</button>
        </div>
        <div className="dash-cal">
          <div className="cal-head">
            <button className="cal-nav" aria-label="Previous month" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}>◀</button>
            <div className="cal-title">{new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
            <button className="cal-nav" aria-label="Next month" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}>▶</button>
          </div>
          <div className="cal-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="cal-dow">{d}</div>
            ))}
            {calDays.map((cell, i) => {
              const st = cell.otherMonth ? null : calStatus(cell.date)
              return (
                <div
                  key={i}
                  className={`cal-day ${cell.otherMonth ? 'other-month' : ''} ${isToday(cell.day) && !cell.otherMonth ? 'today' : ''} ${st ? `filled cal-${st}` : ''}`}
                  onClick={() => { if (!cell.otherMonth) setCalDay(calDay === cell.day ? null : cell.day) }}
                  title={st ? { ovd: 'Overdue', tdy: 'Due today', soon: 'Due soon / upcoming', paid: 'Paid' }[st] : undefined}
                >
                  {st ? <i className="cal-fill" /> : null}
                  <span>{cell.day}</span>
                </div>
              )
            })}
          </div>
          <div className="cal-legend">
            <span><i className="cal-swatch ovd" />Overdue</span>
            <span><i className="cal-swatch tdy" />Due today</span>
            <span><i className="cal-swatch soon" />Due soon</span>
            <span><i className="cal-swatch paid" />Paid</span>
          </div>
        </div>
        {calDay && calDayItems.length > 0 && (
          <div className="cal-detail">
            <h4>{calMonth + 1}/{calDay}/{calYear} · {calDayItems.length} item{calDayItems.length !== 1 ? 's' : ''}</h4>
            {calDayItems.map(r => (
              <div key={r.id} className="cal-detail-item">
                <Icon name={categoryIcon(r.category)} size={14} />
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || '—'}</span>
                <span style={{ color: 'var(--rem-ink-soft)', whiteSpace: 'nowrap' }}>{r.owner || '—'}</span>
                {r._amount > 0 && <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCurrency(r._amount)}</span>}
                <span className={`pill ${statusPillClass(r._dueStatus === 'Paid' ? 'Completed' : r._dueStatus)}`} style={{ fontSize: 10 }}>{r._dueStatus}</span>
              </div>
            ))}
            <div className="cal-detail-total">Total Due: {formatCurrency(calTotal)}</div>
          </div>
        )}
      </div>

      {/* Category drill-down */}
      <div className="dash-filters">
        <span className="dash-filters-label"><Icon name="filter" size={14} /> Filter</span>
        {CAT_FILTERS.map(f => (
          <button key={f.key} className={`pill-f ${catFilter === f.key ? 'active' : ''}`} onClick={() => setCatFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="cat-sections">
        {catSectionItems.map(section => (
          <div key={section.title} className={`card cat-sec ${section.cls || ''}`}>
            <div className="card-head">
              <h3>{section.title}</h3>
              <span className="spacer" />
              <span className="count-chip">{section.tiles.length}</span>
            </div>
            <div className="cat-grid">
              {section.tiles.map(c => {
                const colors = CATEGORY_TILE_COLORS[c.key] || { bg: '#f8fafc', border: '#e2e8f0', iconBg: '#e2e8f0', color: '#475569' }
                const dim = !catMatchesFilter(c.statuses, catFilter)
                return (
                  <div
                    key={c.key}
                    className={`cat-tile ${dim ? 'dim' : ''}`}
                    title={`${c.label} (${c.count})`}
                    onClick={() => setCatModalKey(c.key)}
                  >
                    <div className="dash-cat-tile-status">
                      {TILE_STATUSES.filter(s => c.statuses?.[s.key]?.n > 0).slice(0, 4).map(s => (
                        <span key={s.key} className="tile-st" style={{ color: s.color, background: s.soft }} title={`${s.label}: ${c.statuses[s.key].n} · ${formatCurrency(c.statuses[s.key].amt)}`}>
                          {s.label} {c.statuses[s.key].n}{c.statuses[s.key].amt > 0 ? ` · ${compactAmount(c.statuses[s.key].amt)}` : ''}
                        </span>
                      ))}
                    </div>
                    <div className="cat-ico" style={{ background: colors.iconBg, color: colors.color }}>
                      <Icon name={c.icon} size={18} />
                    </div>
                    <div className="cat-label">{c.label}</div>
                    <div className="cat-count" style={{ color: colors.color }}>{c.count}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {catModalKey && (
        <div className="cat-modal-overlay" onClick={() => setCatModalKey(null)}>
          <div className="cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cat-modal-head">
              <h3>{catModalLabel}</h3>
              <span className="cat-modal-count">{catModalItems.length} item{catModalItems.length !== 1 ? 's' : ''}</span>
              <button className="cat-modal-close" onClick={() => setCatModalKey(null)}>&times;</button>
            </div>
            <div className="cat-modal-body">
              {catModalItems.length === 0 ? (
                <div className="dash-empty"><div className="big">No items</div></div>
              ) : catModalItems.map(r => (
                <div key={r.id} className="cat-modal-item">
                  <div className="cat-modal-item-icon" style={{ background: r._dueStatus === 'Paid' ? '#dcfce7' : r._dueStatus === 'Overdue' ? '#fee2e2' : '#f1f5f9', color: r._dueStatus === 'Paid' ? '#16a34a' : r._dueStatus === 'Overdue' ? '#dc2626' : '#64748b' }}>
                    <Icon name={categoryIcon(r.category)} size={14} />
                  </div>
                  <div className="cat-modal-item-body">
                    <div className="cat-modal-item-title">{r.title || '—'}</div>
                    <div className="cat-modal-item-meta">{r.owner || '—'}{r._amount > 0 ? ` · ${formatCurrency(r._amount)}` : ''}</div>
                    {r._effectiveDate && <div className="cat-modal-item-meta" style={{ fontSize: 10 }}>Next due: {formatDate(r._effectiveDate)}{r._daysLeft !== null ? ` (${r._daysLeft < 0 ? 'overdue' : r._daysLeft === 0 ? 'today' : r._daysLeft + 'd'})` : ''}</div>}
                  </div>
                  <span className={`pill ${statusPillClass(r._dueStatus === 'Paid' ? 'Completed' : r._dueStatus)}`} style={{ fontSize: 10 }}>{r._dueStatus}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AddBillModal
        open={billOpen}
        onClose={() => setBillOpen(false)}
        onSaved={() => { refresh() }}
      />
    </div>
  )
}
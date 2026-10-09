import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard, getAccountsLeads, getRecruiterLeads, getWorkers, getAttendance, getUsers, getNgoAdminTargets, setNgoAdminTarget, getLeaves, getAllTickets, getEvents, getSuperAdminAlerts, getReceiptStats } from '../api/endpoints'
import { api } from '../api/auth'
import { useRealtime } from '../../../hooks/useRealtime'
import { deptLabel } from '../../../lib/labels'

/* ============ PALETTE — mint theme, colour only where it carries meaning ============ */
const MINT = '#8CCDA4'
const MINT_DEEP = '#2A6B45'
const MINT_DARK = '#1E4D3B'
const MINT_LIGHT = '#EAF7EE'
const BLUSH = '#F7B2AD'
const RED = '#C0473C'
const AMBER = '#D9962B'
const AMBER_LIGHT = '#F6C979'
const INK = '#1F332B'
const MUTED = '#64748b'

const PROJECT_LABELS = { mann: 'Mann Care Foundation', aflf: 'Ashray For Life Foundation', bsct: 'Being Sevak Charitable Trust' }
const NGO_PALETTE = [MINT_DEEP, RED, '#4C7C8C', AMBER, '#3F8760', '#7A5C8C', MINT_DARK, '#B07D4F']
const SEVERITY = {
  critical: { color: '#DC2626', icon: 'error' },
  warning: { color: '#D97706', icon: 'warning' },
  info: { color: '#2563EB', icon: 'info' },
}
const PERIODS = [
  { key: '7d', label: '7 Days' }, { key: '30d', label: '30 Days' }, { key: '90d', label: '90 Days' },
  { key: '1y', label: '1 Year' }, { key: 'all', label: 'All Time' },
]
const PERFORMER_PERIODS = [
  { key: 'today', label: 'Today' }, { key: '7d', label: 'Weekly' }, { key: '1y', label: 'Yearly' }, { key: 'all', label: 'All Time' },
]

const ngoColorCache = {}
function ngoColor(name = '') {
  const n = name.toLowerCase()
  if (n.startsWith('man')) return '#e91e9a'
  if (n.startsWith('aflf')) return '#3b82f6'
  if (n.startsWith('bsct')) return '#38bdf8'
  if (!ngoColorCache[name]) ngoColorCache[name] = NGO_PALETTE[Object.keys(ngoColorCache).length % NGO_PALETTE.length]
  return ngoColorCache[name]
}
const isMainNgo = (name = '') => ['man', 'aflf', 'bsct'].some(p => name.toLowerCase().startsWith(p))

/* ============ HELPERS ============ */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const money = (n) => Number(n) >= 100000 ? `₹${(Number(n) / 100000).toFixed(1)}L` : inr(n)
const asList = (d) => { const l = d?.data || d || []; return Array.isArray(l) ? l : [] }
const lc = (v) => (v || '').toLowerCase()
const todayStr = () => new Date().toISOString().slice(0, 10)
const PIPELINE_STATES = ['hold', 'followed_up', 'call_back', 'scheduled']

/* ============ CSV EXPORT ============ */
function exportToExcel(data, period) {
  const { ngos = {}, workers = {}, attendance = {}, froAssignments = [] } = data
  const status = attendance.by_status || {}
  const src = attendance.today?.present !== undefined ? attendance.today : attendance.by_worker || {}
  const tot = (src.present || 0) + (src.late || 0) + (src.absent || 0)
  const attPct = tot > 0 ? Math.min(100, Math.round(((src.present || 0) + (src.late || 0)) / tot * 100)) : 0
  const rows = [
    ['DASHBOARD REPORT'],
    ['Generated', new Date().toLocaleString('en-IN')],
    ['Period', PERIODS.find(p => p.key === period)?.label || period],
    [],
    ['KEY METRICS'],
    ['Total NGOs', ngos.total || 0],
    ['Total Volunteers', workers.total || 0],
    ['Active Volunteers', workers.active || 0],
    ['Attendance % (today)', attPct + '%'],
    [],
    ['ATTENDANCE STATUS'],
    ['Present', status.present || 0], ['Late', status.late || 0], ['Absent', status.absent || 0],
    [],
    ['VOLUNTEERS BY DEPARTMENT'], ['Department', 'Volunteers'],
    ...Object.entries(workers.by_department || {}),
    [],
  ]
  if (froAssignments.length) {
    rows.push(['NGO WISE FRO ASSIGNMENTS'], ['FRO Name', 'Assigned NGOs'])
    froAssignments.forEach(f => rows.push([f.name, (f.ngos || []).join(' | ')]))
  } else if ((ngos.per_ngo || []).length) {
    rows.push(['NGO SUMMARY'], ['NGO', 'Volunteers'])
    ngos.per_ngo.forEach(n => rows.push([n.name, n.workers || 0]))
  }
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `dashboard-report-${period}-${todayStr()}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ============ SMALL SHARED COMPONENTS ============ */
function SectionCard({ icon, title, right, children, className = '', style }) {
  return (
    <section className={`nd-card ${className}`} style={style}>
      <header className="nd-sec-head">
        {icon && <span className="material-symbols-outlined nd-sec-icon">{icon}</span>}
        <h3 className="nd-section-title">{title}</h3>
        {right && <div className="nd-sec-right">{right}</div>}
      </header>
      {children}
    </section>
  )
}

function Modal({ title, icon, color = MINT_DEEP, badge, wide, onClose, children, footer }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="nd-modal-overlay" onClick={onClose}>
      <div className={`nd-modal${wide ? ' nd-modal-wide' : ''}`} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="nd-modal-head" style={{ borderColor: `${color}30` }}>
          {icon && <span className="material-symbols-outlined" style={{ fontSize: 20, color }}>{icon}</span>}
          {badge !== undefined && <span className="nd-modal-badge" style={{ background: `${color}18`, color }}>{badge}</span>}
          <h3 className="nd-modal-title">{title}</h3>
          <button className="nd-modal-close" aria-label="Close" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="nd-modal-body">{children}</div>
        {footer && <div className="nd-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="nd-modal-search">
      <span className="material-symbols-outlined nd-modal-search-icon">search</span>
      <input className="nd-modal-search-input" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} autoFocus />
      {value && <button className="nd-modal-search-clear" aria-label="Clear" onClick={() => onChange('')}><span className="material-symbols-outlined">close</span></button>}
    </div>
  )
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="nd-seg" role="tablist">
      {options.map(o => (
        <button key={o.key} role="tab" aria-selected={value === o.key} className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}>
          {o.label}{o.badge > 0 && <span className="nd-seg-badge">{o.badge}</span>}
        </button>
      ))}
    </div>
  )
}

function DonutChart({ segments, size, centerValue, centerLabel, animated, onSegmentClick }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (total === 0) return null
  let offset = 0
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#EEF4EF" strokeWidth="3" />
        {segments.map(seg => {
          const dash = ((seg.value / total) * 100).toFixed(1)
          const el = (
            <circle key={seg.label} cx="18" cy="18" r="15.915" fill="transparent" stroke={seg.color}
              strokeDasharray={animated ? `${dash} ${(100 - dash).toFixed(1)}` : '0 100'}
              strokeDashoffset={-offset} strokeLinecap="round" strokeWidth="4.5"
              style={{ transition: 'stroke-dasharray 1s ease', cursor: onSegmentClick ? 'pointer' : 'default' }}
              onClick={() => onSegmentClick?.(seg.label)} />
          )
          offset += animated ? parseFloat(dash) : 0
          return el
        })}
      </svg>
      <div className="nd-donut-center">
        <span style={{ fontSize: 24, fontWeight: 800, color: INK }}>{Number(centerValue).toLocaleString()}</span>
        {centerLabel && <span style={{ fontSize: 11, color: MUTED }}>{centerLabel}</span>}
      </div>
    </div>
  )
}

function PipelineFlow({ stages }) {
  const max = Math.max(...stages.map(s => s.value), 1)
  return (
    <div className="nd-pipeline">
      {stages.map(s => (
        <div key={s.label} className="nd-pipe-stage">
          <div style={{ height: 8, borderRadius: 4, width: `${Math.max(30, (s.value / max) * 100)}%`, background: s.color, margin: '0 auto 6px' }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>{s.value.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{s.label}</div>
          {s.sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function RankList({ title, items, valueKey, format = v => v, colors }) {
  const max = Math.max(...items.map(x => x[valueKey]), 1)
  return (
    <div>
      <div className="nd-sub-title">{title}</div>
      {items.map((x, i) => {
        const c = colors[i] || '#94a3b8'
        return (
          <div key={x.id || i} className="nd-rank">
            <span className="nd-rank-no" style={{ background: `${c}18`, color: c }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nd-rank-top">
                <span className="nd-rank-name">{x.name}</span>
                <span style={{ fontWeight: 800, color: c }}>{format(x[valueKey])}</span>
              </div>
              <div className="nd-track"><div style={{ width: `${(x[valueKey] / max) * 100}%`, background: c }} /></div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ============ NAME LIST MODAL (attendance etc.) ============ */
function NameListModal({ title, color, names, onClose }) {
  const [q, setQ] = useState('')
  const nameOf = n => (typeof n === 'string' ? n : n.name || '')
  const filtered = q.trim() ? names.filter(n => lc(nameOf(n)).includes(lc(q.trim()))) : names
  return (
    <Modal title={title} color={color} badge={`${filtered.length}/${names.length}`} onClose={onClose}>
      <SearchBox value={q} onChange={setQ} placeholder="Search by name..." />
      {filtered.length === 0 ? <p className="nd-muted">{q ? 'No matching names.' : 'No records for this period.'}</p> :
        filtered.map((n, i) => {
          const p = typeof n === 'string' ? { name: n } : n
          return (
            <div key={i} className="nd-modal-row">
              <span className="nd-avatar" style={{ background: `${color}18`, color }}>{p.name?.charAt(0).toUpperCase() || '?'}</span>
              <div style={{ minWidth: 0 }}>
                <span className="nd-modal-name">{p.name}</span>
                {(p.dept || p.department) && <span className="nd-modal-dept">{deptLabel(p.dept || p.department)}</span>}
              </div>
              {p.time && <span className="nd-modal-time">{p.time}</span>}
            </div>
          )
        })}
    </Modal>
  )
}

/* ============ ONE TABLE MODAL for action-center items, accounts and recruiter lists ============ */
const ACC_STATUS = (s) => () => getAccountsLeads(s)
const LIST_CONFIGS = {
  pendingLeaves: { title: 'Pending Leave Requests', icon: 'event_busy', color: AMBER, load: getLeaves, keep: l => lc(l.status) === 'pending', cols: ['worker_name', 'from_date', 'to_date', 'reason'] },
  hrVerifiedTickets: { title: 'Tickets Ready to Approve', icon: 'verified', color: MINT_DEEP, load: getAllTickets, keep: t => lc(t.status) === 'hr_verified', cols: ['worker_name', 'date', 'correct_status'] },
  pendingTickets: { title: 'Pending Attendance Tickets', icon: 'confirmation_number', color: AMBER, load: getAllTickets, keep: t => lc(t.status) === 'pending', cols: ['worker_name', 'date', 'correct_status'] },
  pendingAccountsLeads: { title: 'Unverified Donor Leads', icon: 'receipt_long', color: AMBER, load: getAccountsLeads, keep: l => lc(l.accounts_status) === 'pending', cols: ['donor_name', 'donor_mobile', 'amount'] },
  submittedEvents: { title: 'Events Awaiting Approval', icon: 'event_upcoming', color: AMBER, load: getEvents, keep: e => lc(e.status) === 'submitted', cols: ['title', 'event_date', 'event_time'] },
  recruiterPipeline: { title: 'Recruiter Pipeline Leads', icon: 'person_search', color: MINT_DEEP, load: getRecruiterLeads, keep: l => PIPELINE_STATES.includes(lc(l.status)), cols: ['name', 'phone', 'status'] },
  acc_pending: { title: 'Accounts — Pending', icon: 'receipt_long', color: AMBER, load: ACC_STATUS('pending'), cols: ['donor_name', 'donor_mobile', 'amount', 'created_at'] },
  acc_verified: { title: 'Accounts — Verified', icon: 'receipt_long', color: MINT_DEEP, load: ACC_STATUS('verified'), cols: ['donor_name', 'donor_mobile', 'amount', 'created_at'] },
  acc_rejected: { title: 'Accounts — Rejected', icon: 'receipt_long', color: RED, load: ACC_STATUS('rejected'), cols: ['donor_name', 'donor_mobile', 'amount', 'created_at'] },
  acc_verified_today: { title: 'Accounts — Verified Today', icon: 'receipt_long', color: MINT_DEEP, load: ACC_STATUS('verified'), keep: r => r.verified_at?.slice(0, 10) === todayStr(), cols: ['donor_name', 'donor_mobile', 'amount', 'created_at'] },
}
const colTitle = c => c.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
const cell = (r, c) => {
  const v = r[c]
  if (c.includes('amount')) return inr(v)
  if (c.includes('date') || c === 'created_at') return (v || '-').toString().slice(0, 10)
  return v || '-'
}

function ListModal({ type, onClose }) {
  const cfg = LIST_CONFIGS[type]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    setLoading(true)
    cfg.load()
      .then(d => setItems(cfg.keep ? asList(d).filter(cfg.keep) : asList(d)))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [type]) // eslint-disable-line

  const rows = q.trim() ? items.filter(r => JSON.stringify(r).toLowerCase().includes(lc(q.trim()))) : items
  return (
    <Modal title={cfg.title} icon={cfg.icon} color={cfg.color} badge={items.length} wide onClose={onClose}
      footer={<span>{rows.length} item{rows.length !== 1 ? 's' : ''}</span>}>
      <SearchBox value={q} onChange={setQ} placeholder="Search..." />
      {loading ? <p className="nd-muted">Loading...</p> : err ? <p className="nd-muted" style={{ color: RED }}>{err}</p> :
        rows.length === 0 ? <p className="nd-muted">{q ? 'No matching items.' : 'Nothing here right now.'}</p> : (
          <div className="nd-table-wrap">
            <table className="nd-table">
              <thead><tr><th>#</th>{cfg.cols.map(c => <th key={c}>{colTitle(c)}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id || r.log_id || i}><td>{i + 1}</td>{cfg.cols.map(c => <td key={c}>{cell(r, c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Modal>
  )
}

/* ============ PANEL SUMMARY MODAL ============ */
const PANEL_META = {
  accounts: { title: 'Accounts — Lead Verification', icon: 'receipt_long' },
  fro: { title: 'FRO — Field Operations', icon: 'groups' },
  hr: { title: 'HR — Volunteer Management', icon: 'badge' },
  'event-head': { title: 'Events', icon: 'event' },
  recruiter: { title: 'Recruiter — Lead Pipeline', icon: 'person_search' },
}

function PanelSummaryModal({ panel, onClose, dashboardData }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0)
    const sameDay = (d) => d && new Date(d).toDateString() === new Date().toDateString()
    const fetchers = {
      accounts: () => getAccountsLeads().then(d => {
        const list = asList(d)
        const by = (f) => { const a = list.filter(f); return { count: a.length, amount: sum(a, l => l.amount) } }
        return { cards: [
          { label: 'Pending', ...by(l => l.accounts_status === 'pending'), sub: 'total' },
          { label: 'Verified', ...by(l => l.accounts_status === 'verified'), sub: 'total' },
          { label: 'Verified today', ...by(l => l.accounts_status === 'verified' && sameDay(l.verified_at)), sub: 'collected' },
          { label: 'Total amount', count: list.length, amount: sum(list, l => l.amount), sub: 'leads', amountAsValue: true },
        ] }
      }),
      fro: () => api('/fro/status', { _prefix: 'ucs' }).then(list => {
        const a = Array.isArray(list) ? list : []
        const active = a.filter(f => f.worker?.is_active).length
        return { cards: [
          { label: 'Total FROs', value: a.length, sub: 'Registered volunteers' },
          { label: 'Active', value: active, sub: `${a.length - active} inactive` },
          { label: 'Punched in', value: a.filter(f => f.worker?.is_punched_in).length, sub: 'Today' },
          { label: "Today's collection", value: inr(sum(a, f => f.performance?.today_collection)), sub: `Data used: ${sum(a, f => f.performance?.data_used)}` },
        ] }
      }),
      hr: () => Promise.all([getWorkers(), getAttendance()]).then(([w, a]) => {
        const workers = asList(w), att = asList(a).filter(x => sameDay(x.date))
        const byId = Object.fromEntries(workers.map(x => [x.id, x]))
        const depts = {}
        const slot = n => (depts[n] ||= { total: 0, present: 0, absent: 0, late: 0 })
        workers.forEach(x => slot(x.department || 'Unassigned').total++)
        att.forEach(x => {
          const s = slot(byId[x.worker_id]?.department || 'Unassigned')
          if (x.status in s) s[x.status]++
        })
        const present = att.filter(x => x.status === 'present' || x.punched_in).length
        return {
          cards: [
            { label: 'Volunteers', value: workers.length, sub: 'All time' },
            { label: 'Active', value: workers.filter(x => x.is_active).length, sub: 'Currently active' },
            { label: 'Attendance', value: `${att.length ? Math.round((present / att.length) * 100) : 0}%`, sub: `${present} of ${att.length} today` },
          ],
          depts: Object.entries(depts).sort(([x], [y]) => x.localeCompare(y)).map(([name, c]) => ({ name, ...c })),
        }
      }),
      'event-head': () => {
        const ev = dashboardData?.upcoming_events || []
        const next = ev.find(e => new Date(e.event_date) >= new Date())
        return Promise.resolve({ cards: [
          { label: 'Upcoming events', value: ev.length, sub: 'Scheduled' },
          ...(next ? [{ label: 'Next event', value: next.title, sub: new Date(next.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + (next.event_time ? ` at ${next.event_time.slice(0, 5)}` : '') }] : []),
        ] })
      },
      recruiter: () => getRecruiterLeads().then(d => {
        const list = asList(d)
        const sel = list.filter(l => l.status === 'selected' || l.status === 'verified').length
        const rej = list.filter(l => l.status === 'rejected').length
        return { cards: [
          { label: 'Total leads', value: list.length, sub: 'All time' },
          { label: 'New today', value: list.filter(l => sameDay(l.created_at)).length, sub: 'Added today' },
          { label: 'Conversion', value: `${sel + rej ? ((sel / (sel + rej)) * 100).toFixed(1) : '0.0'}%`, sub: 'Selected vs rejected' },
        ] }
      }),
    }
    setLoading(true)
    fetchers[panel]().then(setData).catch(e => { console.error('API error:', e.message); setData({ cards: [] }) }).finally(() => setLoading(false))
  }, [panel, dashboardData])

  const meta = PANEL_META[panel]
  return (
    <Modal title={meta.title} icon={meta.icon} color={MINT_DEEP} onClose={onClose}>
      {loading ? <p className="nd-muted">Loading...</p> : (
        <>
          <div className="ps-grid">
            {data.cards.map(c => (
              <div key={c.label} className="ps-card">
                <span className="ps-label">{c.label}</span>
                <span className="ps-value">{c.value ?? (c.amountAsValue ? inr(c.amount) : c.count)}</span>
                <span className="ps-sub">{c.value === undefined && !c.amountAsValue ? `${inr(c.amount)} ${c.sub}` : c.amountAsValue ? `Across ${c.count} ${c.sub}` : c.sub}</span>
              </div>
            ))}
          </div>
          {data.depts?.length > 0 && (
            <div className="nd-table-wrap" style={{ marginTop: 14 }}>
              <table className="nd-table">
                <thead><tr><th>Department</th><th>Total</th><th>Present</th><th>Absent</th><th>Late</th></tr></thead>
                <tbody>
                  {data.depts.map(d => (
                    <tr key={d.name}><td>{deptLabel(d.name)}</td><td>{d.total}</td><td>{d.present}</td><td>{d.absent}</td><td>{d.late}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

/* ============ NGO STATION MODAL ============ */
const DISPOSITION_LABELS = {
  pending: 'Pending', contacted: 'Contacted', follow_up: 'Follow Up', scheduled: 'Scheduled', busy: 'Busy', ringing: 'Ringing',
  call_waiting: 'Call Waiting', unreachable: 'Unreachable', switched_off: 'Switched Off', out_of_coverage: 'Out of Coverage',
  wrong_number: 'Wrong Number', invalid_number: 'Invalid', rejected: 'Rejected', temporary_network_issue: 'Temporary Network Issue',
  voicemail: 'Voicemail', lead_done: 'Lead Done', visit_donate: 'Visit & Donate', will_donate_online: 'Will Donate Online',
  promise_to_pay: 'Promise to Pay', payment_pending: 'Payment Pending', already_donated: 'Already Donated', email_sent: 'Email Sent',
  whatsapp_sent: 'WhatsApp Sent', csr_inquiry: 'CSR Inquiry', wants_80g_details: 'Wants 80G Details', wants_trust_documents: 'Wants Trust Documents',
  not_interested: 'Not Interested', not_interested_now: 'Not Interested Now', dnd: 'DND', wrong_person: 'Wrong Person',
  call_disconnected: 'Call Disconnected', language_barrier: 'Language Barrier', transferred_senior: 'Transferred to Senior',
  query_complaint: 'Query/Complaint', receipt_request: 'Receipt Request', donation_collected: 'Donation Collected',
}
const DISPOSITION_GROUPS = [
  { label: 'Converted', color: '#16a34a', bg: '#f0fdf4', statuses: ['donation_collected', 'promise_to_pay', 'lead_done', 'visit_donate', 'will_donate_online', 'payment_pending', 'already_donated'] },
  { label: 'In Progress', color: '#d97706', bg: '#fffbeb', statuses: ['pending', 'contacted', 'follow_up', 'scheduled', 'email_sent', 'whatsapp_sent', 'csr_inquiry', 'wants_80g_details', 'wants_trust_documents'] },
  { label: 'Negative', color: '#dc2626', bg: '#fef2f2', statuses: ['not_interested', 'not_interested_now', 'dnd', 'wrong_person', 'call_disconnected', 'rejected', 'busy', 'ringing', 'call_waiting', 'unreachable', 'switched_off', 'out_of_coverage', 'wrong_number', 'invalid_number', 'temporary_network_issue', 'voicemail', 'language_barrier'] },
  { label: 'Other', color: '#5B6B4E', bg: '#f0f2ee', statuses: ['transferred_senior', 'query_complaint', 'receipt_request'] },
]
const groupOf = s => DISPOSITION_GROUPS.find(g => g.statuses.includes(s)) || DISPOSITION_GROUPS[3]

function NgoStationModal({ ngoName, ngoId, onClose }) {
  const [donors, setDonors] = useState([])
  const [stats, setStats] = useState(null)
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 30

  useEffect(() => {
    setLoading(true)
    api('/ngo-admin/dashboard/station-stats').then(async res => {
      const all = res?.stations || {}
      const matched = Object.keys(all).filter(k => k === ngoName || k.startsWith(ngoName + '-')).sort()
      setStations(matched)
      const agg = {}
      matched.forEach(st => Object.entries(all[st] || {}).forEach(([s, c]) => { agg[s] = (agg[s] || 0) + c }))
      setStats(agg)
      // Pass ngo_id: a station name can be shared between NGOs.
      const results = await Promise.all(matched.map(st => {
        const params = new URLSearchParams({ station: st })
        if (ngoId) params.set('ngo_id', ngoId)
        return api(`/ngo-admin/donors-by-station?${params}`).catch(() => [])
      }))
      setDonors(results.flatMap(r => (Array.isArray(r) ? r : [])))
    }).catch(e => console.error('API error:', e.message)).finally(() => setLoading(false))
  }, [ngoName, ngoId])

  const statuses = Object.entries(stats || {}).filter(([, v]) => v > 0)
  const total = statuses.reduce((t, [, v]) => t + v, 0)
  const groups = DISPOSITION_GROUPS.map(g => ({ ...g, total: g.statuses.reduce((t, s) => t + (stats?.[s] || 0), 0) })).filter(g => g.total > 0)
  const byStatus = statusFilter ? donors.filter(d => d.status === statusFilter) : donors
  const filtered = search ? byStatus.filter(d => [d.donor_name, d.donor_mobile, d.fro_name].some(v => lc(v).includes(lc(search)))) : byStatus
  const pages = Math.ceil(filtered.length / PER_PAGE)
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <Modal title={ngoName} icon="corporate_fare" color={AMBER} wide onClose={onClose}
      badge={`${donors.length} donors · ${stations.length} station${stations.length !== 1 ? 's' : ''}`}>
      {loading ? <p className="nd-muted">Loading...</p> : stations.length === 0 ? <p className="nd-muted">No station data found for {ngoName}.</p> : (
        <>
          <div className="nd-stack-bar">{groups.map(g => <div key={g.label} style={{ width: `${(g.total / total) * 100}%`, background: g.color }} />)}</div>
          <div className="nd-chips">
            {groups.map(g => <span key={g.label} style={{ color: g.color, background: g.bg }}>{g.label}: {g.total}</span>)}
          </div>
          <div className="nd-chips">
            {statuses.map(([s, c]) => {
              const g = groupOf(s), on = statusFilter === s
              return (
                <button key={s} className="nd-chip-btn" aria-pressed={on}
                  style={{ borderColor: on ? g.color : 'transparent', background: on ? g.bg : '#f6faf7', color: on ? g.color : MUTED }}
                  onClick={() => { setStatusFilter(on ? '' : s); setPage(1) }}>
                  {DISPOSITION_LABELS[s] || s} <b style={{ color: g.color }}>{c}</b>
                </button>
              )
            })}
          </div>
          <SearchBox value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search donor name, phone, FRO..." />
          <div className="nd-table-wrap" style={{ maxHeight: '35vh' }}>
            <table className="nd-table">
              <thead><tr><th>#</th><th>Donor</th><th>Phone</th><th>FRO</th><th>Status</th></tr></thead>
              <tbody>
                {visible.length === 0 ? <tr><td colSpan={5} className="nd-muted" style={{ textAlign: 'center' }}>{!statusFilter && !search ? 'Pick a disposition above to view donors.' : 'No donors match.'}</td></tr> :
                  visible.map((d, i) => {
                    const g = groupOf(d.status)
                    return (
                      <tr key={d.id || i}>
                        <td>{i + 1 + (page - 1) * PER_PAGE}</td>
                        <td><b>{d.donor_name || '—'}</b></td>
                        <td>{d.donor_mobile || '—'}</td>
                        <td>{d.fro_name || 'Unassigned'}</td>
                        <td><span className="nd-pill" style={{ color: g.color, background: g.bg }}>{DISPOSITION_LABELS[d.status] || d.status}</span></td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="nd-pager">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>{page}/{pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

/* ============ FRO PERFORMANCE — TODAY ============ */
const num = (v) => Number(v || 0)

function statusOf(f) {
  if (f.status === 'on_call') return { label: 'On call', color: MINT_DEEP, rank: 0 }
  if (f.status === 'online') return { label: 'Online', color: MINT, rank: 1 }
  if (f.worker?.is_punched_in) return { label: 'Punched in', color: AMBER, rank: 2 }
  return { label: 'Offline', color: '#CBD5E1', rank: 3 }
}

const SORTS = [
  { key: 'today_collection', label: 'Collection' },
  { key: 'today_calls', label: 'Calls' },
  { key: 'data_used', label: 'Data used' },
]

function FroPerformanceToday({ froLiveData = [] }) {
  const [sortKey, setSortKey] = useState('today_collection')
  const [ngo, setNgo] = useState('all')
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)

  const rows = useMemo(() => froLiveData.map(f => ({
    id: f.worker?.id || f.worker?.login_id || f.worker?.name,
    name: f.worker?.name || f.worker?.login_id || 'Unknown',
    loginId: f.worker?.login_id,
    ngo: f.worker?.ngo_name || '—',
    collection: num(f.performance?.today_collection),
    calls: num(f.performance?.today_calls),
    data: num(f.performance?.data_used),
    st: statusOf(f),
  })), [froLiveData])

  const ngos = useMemo(() => [...new Set(rows.map(r => r.ngo))].sort(), [rows])

  const totals = useMemo(() => ({
    collection: rows.reduce((s, r) => s + r.collection, 0),
    calls: rows.reduce((s, r) => s + r.calls, 0),
    live: rows.filter(r => r.st.rank <= 1).length,
    punched: rows.filter(r => r.st.rank <= 2).length,
  }), [rows])

  const valueOf = (r) => (sortKey === 'today_collection' ? r.collection : sortKey === 'today_calls' ? r.calls : r.data)

  const sorted = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows
      .filter(r => (ngo === 'all' || r.ngo === ngo) && (!term || `${r.name} ${r.loginId || ''}`.toLowerCase().includes(term)))
      .sort((a, b) => valueOf(b) - valueOf(a) || a.name.localeCompare(b.name))
  }, [rows, ngo, q, sortKey]) // eslint-disable-line

  const visible = showAll ? sorted : sorted.slice(0, 10)
  const max = Math.max(...sorted.map(valueOf), 1)
  const fmtValue = (r) => (sortKey === 'today_collection' ? inr(r.collection) : valueOf(r).toLocaleString('en-IN'))

  const summary = [
    { label: 'Collection today', value: inr(totals.collection), color: MINT_DEEP },
    { label: 'Calls today', value: totals.calls.toLocaleString('en-IN') },
    { label: 'Live now', value: totals.live, sub: `of ${rows.length} FROs` },
    { label: 'Punched in', value: totals.punched, sub: `${rows.length - totals.punched} not in yet` },
  ]

  return (
    <section className="fp-wrap">
      <style>{FRO_CSS}</style>

      <header className="fp-head">
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: MINT_DEEP }}>leaderboard</span>
        <h3>FRO performance — today</h3>
        <span className="fp-live"><i />Live</span>
      </header>

      <div className="fp-summary">
        {summary.map(s => (
          <div key={s.label}>
            <small>{s.label}</small>
            <b style={s.color ? { color: s.color } : undefined}>{s.value}</b>
            {s.sub && <span>{s.sub}</span>}
          </div>
        ))}
      </div>

      <div className="fp-tools">
        <div className="fp-search">
          <span className="material-symbols-outlined">search</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search FRO..." aria-label="Search FRO" />
        </div>
        <select value={ngo} onChange={e => setNgo(e.target.value)} aria-label="Filter by NGO">
          <option value="all">All NGOs</option>
          {ngos.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="fp-seg" role="tablist">
          {SORTS.map(s => (
            <button key={s.key} role="tab" aria-selected={sortKey === s.key} className={sortKey === s.key ? 'on' : ''} onClick={() => setSortKey(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="fp-empty">No FROs match your filters.</p>
      ) : (
        <ol className="fp-list">
          {visible.map((r, i) => (
            <li key={r.id || i} className={`fp-row${i < 3 && valueOf(r) > 0 ? ' top' : ''}`}>
              <span className="fp-rank">{i + 1}</span>
              <div className="fp-who">
                <span className="fp-name">{r.name}</span>
                <span className="fp-meta">
                  <i style={{ background: r.st.color }} />{r.st.label}
                  <em style={{ color: ngoColor(r.ngo), background: `${ngoColor(r.ngo)}14` }}>{r.ngo}</em>
                </span>
              </div>
              <div className="fp-bar">
                <div className="fp-track"><div style={{ width: `${(valueOf(r) / max) * 100}%` }} /></div>
              </div>
              <div className="fp-nums">
                <b>{fmtValue(r)}</b>
                <span>{sortKey === 'today_collection' ? `${r.calls} calls` : inr(r.collection)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {sorted.length > 10 && (
        <button className="fp-more" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Show top 10' : `Show all ${sorted.length}`}
        </button>
      )}
    </section>
  )
}


/* ================================================================ */
/*                            DASHBOARD                             */
/* ================================================================ */
export default function Dashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('all')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [animated, setAnimated] = useState(false)
  const [nameModal, setNameModal] = useState(null)
  const [panelModal, setPanelModal] = useState(null)
  const [listModal, setListModal] = useState(null)
  const [ngoStationModal, setNgoStationModal] = useState(null)
  const [alertModal, setAlertModal] = useState(null)
  const [attnTab, setAttnTab] = useState('actions')
  const [allUserList, setAllUserList] = useState([])
  const [froLiveData, setFroLiveData] = useState([])
  const [adminTargets, setAdminTargets] = useState([])
  const [targetsLoading, setTargetsLoading] = useState(false)
  const [targetModalAdmin, setTargetModalAdmin] = useState(null)
  const [editTargetValue, setEditTargetValue] = useState('')
  const [savingTarget, setSavingTarget] = useState(false)
  const [performerPeriod, setPerformerPeriod] = useState('all')
  const [performers, setPerformers] = useState({ fros: [], recruiters: [] })
  const [actionCenter, setActionCenter] = useState({ pendingLeaves: 0, hrVerifiedTickets: 0, pendingTickets: 0, pendingAccountsLeads: 0, submittedEvents: 0, recruiterPipeline: 0 })
  const [alertsData, setAlertsData] = useState({ alerts: [], summary: { critical: 0, warning: 0, info: 0 } })
  const [receiptStats, setReceiptStats] = useState([])
  const [ready, setReady] = useState(false) // secondary requests wait for the main dashboard call

  /* ---------- one-time loads ---------- */
  useEffect(() => { if (!ready) return; getUsers().then(d => setAllUserList(asList(d))).catch(e => console.error('API error:', e.message)) }, [ready])
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 150); return () => clearTimeout(t) }, [])
  useEffect(() => { if (!ready) return; getReceiptStats().then(d => setReceiptStats(Array.isArray(d?.statsByProject) ? d.statsByProject : [])).catch(() => {}) }, [ready])
  useEffect(() => {
    if (!ready) return
    setTargetsLoading(true)
    getNgoAdminTargets().then(d => setAdminTargets(Array.isArray(d) ? d : [])).catch(e => console.error('API error:', e.message)).finally(() => setTargetsLoading(false))
  }, [ready])

  /* ---------- live data (refreshed via realtime) ---------- */
  const fetchDashboard = useCallback(() => getDashboard(period).then(d => { setData(d); setErr('') }).catch(e => setErr(e.message)), [period])
  useEffect(() => { setLoading(true); fetchDashboard().finally(() => { setLoading(false); setReady(true) }) }, [fetchDashboard])

  const fetchFroLive = useCallback(() => {
    api('/fro/status', { _prefix: 'ucs' }).then(d => setFroLiveData(Array.isArray(d) ? d : [])).catch(e => console.error('API error:', e.message))
  }, [])
  useEffect(() => { if (ready) fetchFroLive() }, [ready, fetchFroLive])

  useEffect(() => {
    if (!ready) return
    getDashboard(performerPeriod).then(d => setPerformers({ fros: d?.topFros || [], recruiters: d?.topRecruiters || [] })).catch(e => console.error('API error:', e.message))
  }, [ready, performerPeriod])

  const fetchActionCenter = useCallback(() => {
    Promise.allSettled([getLeaves(), getAllTickets(), getAccountsLeads(), getEvents(), getRecruiterLeads()]).then(res => {
      const [leaves, tickets, acc, events, rec] = res.map(r => (r.status === 'fulfilled' ? asList(r.value) : []))
      const n = (list, f) => list.filter(f).length
      setActionCenter({
        pendingLeaves: n(leaves, LIST_CONFIGS.pendingLeaves.keep),
        hrVerifiedTickets: n(tickets, LIST_CONFIGS.hrVerifiedTickets.keep),
        pendingTickets: n(tickets, LIST_CONFIGS.pendingTickets.keep),
        pendingAccountsLeads: n(acc, LIST_CONFIGS.pendingAccountsLeads.keep),
        submittedEvents: n(events, LIST_CONFIGS.submittedEvents.keep),
        recruiterPipeline: n(rec, LIST_CONFIGS.recruiterPipeline.keep),
      })
    })
  }, [])
  useEffect(() => { if (ready) fetchActionCenter() }, [ready, fetchActionCenter])

  const fetchAlerts = useCallback(() => {
    getSuperAdminAlerts().then(d => setAlertsData(d || { alerts: [], summary: { critical: 0, warning: 0, info: 0 } })).catch(e => console.error('API error:', e.message))
  }, [])
  useEffect(() => { if (ready) fetchAlerts() }, [ready, fetchAlerts])

  /* ---------- realtime (debounced) ---------- */
  const timers = useRef({})
  const debounce = useCallback((key, fn, ms = 1200) => {
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(fn, ms)
  }, [])
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  const refreshAggregates = useCallback(() => debounce('agg', () => { fetchDashboard(); fetchActionCenter(); fetchAlerts() }), [debounce, fetchDashboard, fetchActionCenter, fetchAlerts])
  const refreshFro = useCallback(() => debounce('fro', () => { fetchFroLive(); fetchDashboard() }), [debounce, fetchFroLive, fetchDashboard])
  const rt = (fn) => ({ event: '*', onInsert: fn, onUpdate: fn, onDelete: fn })
  ;['leads', 'workers', 'attendance', 'events', 'leaves', 'attendance_corrections'].forEach(t => useRealtime(t, rt(refreshAggregates))) // eslint-disable-line react-hooks/rules-of-hooks
  useRealtime('fro_live_status', rt(refreshFro))

  /* ---------- early states ---------- */
  if (err) return <div className="sa-err-card">Error: {err}</div>
  if (!data) return (
    <div className="dash-page" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div className="sk" style={{ width: 200, height: 20, marginBottom: 8 }} />
      <div className="sk" style={{ width: 280, height: 12, marginBottom: 24 }} />
      <div className="metrics-grid">{[1, 2, 3, 4].map(i => <div key={i} className="clay-card"><div className="sk" style={{ height: 80 }} /></div>)}</div>
    </div>
  )

  /* ---------- derived data ---------- */
  const {
    ngos: ngosD = {}, workers: workersD = {}, attendance: attD = {}, salary_payable: salary = 0,
    accounts: accD = {}, monthly_revenue: monthlyRevenue = [], recent_activities: activities = [],
    upcoming_events: events = [], froAssignments = [],
  } = data
  const ngoUserCounts = ngosD.per_ngo || []
  const acc = {
    pending: accD.pending?.count ?? 0, pendingAmount: accD.pending?.amount ?? 0,
    verified: accD.verified?.count ?? 0, verifiedAmount: accD.verified?.amount ?? 0,
    rejected: accD.rejected?.count ?? 0, rejectedAmount: accD.rejected?.amount ?? 0,
    today: accD.verified_today?.count ?? 0, todayAmount: accD.verified_today?.amount ?? 0,
  }

  const hasToday = attD.today?.present !== undefined
  const attSrc = hasToday ? attD.today : attD.by_worker || {}
  const attDetails = hasToday ? attD.today_details || {} : attD.details || {}
  // Percent from the same counts the card shows (backend `percent` is period-wide and can exceed 100).
  const attTotal = (attSrc.present ?? 0) + (attSrc.late ?? 0) + (attSrc.absent ?? 0)
  const attPercent = attTotal > 0 ? Math.min(100, Math.round((((attSrc.present ?? 0) + (attSrc.late ?? 0)) / attTotal) * 100)) : 0
  const attSegments = [
    { label: 'Present', value: attSrc.present ?? 0, color: MINT, text: MINT_DEEP },
    { label: 'Late', value: attSrc.late ?? 0, color: AMBER_LIGHT, text: '#9C6F14' },
    { label: 'Absent', value: attSrc.absent ?? 0, color: BLUSH, text: RED },
  ]
  const openAttendance = (label) => {
    const seg = attSegments.find(s => s.label === label)
    setNameModal({ title: `${label} Volunteers`, color: seg.text, names: attDetails[label.toLowerCase()] || [] })
  }

  const greeting = (h => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'))(new Date().getHours())
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const roleCount = (...roles) => allUserList.filter(u => roles.includes(u.role)).length

  const kpis = [
    { label: 'Total donation', value: money(acc.verifiedAmount), sub: `${acc.verified} verified leads`, icon: 'payments', onClick: () => setListModal('acc_verified') },
    { label: 'Verified today', value: acc.today, sub: inr(acc.todayAmount), icon: 'task_alt', onClick: () => setListModal('acc_verified_today') },
    { label: 'Pending verification', value: acc.pending, sub: inr(acc.pendingAmount), icon: 'hourglass_top', tone: acc.pending > 0 ? AMBER : null, onClick: () => setListModal('acc_pending') },
    { label: 'Attendance', value: `${attPercent}%`, sub: `${attSrc.present ?? 0} present · ${attSrc.absent ?? 0} absent`, icon: 'how_to_reg', tone: attPercent < 60 ? RED : null, onClick: () => openAttendance('Present') },
    { label: 'Active volunteers', value: workersD.active ?? 0, sub: `of ${workersD.total ?? 0} total`, icon: 'groups', onClick: () => setPanelModal('hr') },
  ]

  const actionCards = [
    { label: 'Pending leaves', key: 'pendingLeaves', icon: 'event_busy' },
    { label: 'Tickets to approve', key: 'hrVerifiedTickets', icon: 'verified' },
    { label: 'Pending tickets', key: 'pendingTickets', icon: 'confirmation_number' },
    { label: 'Unverified leads', key: 'pendingAccountsLeads', icon: 'receipt_long' },
    { label: 'Events to approve', key: 'submittedEvents', icon: 'event_upcoming' },
    { label: 'Recruiter pipeline', key: 'recruiterPipeline', icon: 'person_search' },
  ]
  const actionTotal = Object.values(actionCenter).reduce((s, v) => s + v, 0)

  const panels = [
    { key: 'accounts', label: 'Accounts', icon: 'receipt_long', sub: `${roleCount('accounts')} volunteers` },
    { key: 'fro', label: 'FRO', icon: 'groups', sub: `${roleCount('fro') || froLiveData.length} volunteers` },
    { key: 'hr', label: 'HR', icon: 'badge', sub: `${roleCount('hr', 'hoadmin')} volunteers` },
    { key: 'event-head', label: 'Events', icon: 'event', sub: `${events.length} upcoming` },
    { key: 'recruiter', label: 'Recruiter', icon: 'person_search', sub: `${roleCount('recruiter')} volunteers` },
  ]

  const revMax = Math.max(...monthlyRevenue.map(m => m.amount), 1)
  const revPts = monthlyRevenue.map((m, i) => `${(i / (monthlyRevenue.length - 1 || 1)) * 100},${95 - (m.amount / revMax) * 85}`)
  const revTotal = monthlyRevenue.reduce((s, m) => s + m.amount, 0)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const ACTIVITY_ICONS = {
    verified: ['check_circle', MINT_DEEP], rejected: ['cancel', RED], lead_created: ['person_add', '#4C7C8C'],
    worker_joined: ['how_to_reg', MINT_DEEP], notification: ['notifications', AMBER],
  }
  const timeAgo = (t) => {
    const m = Math.floor((Date.now() - new Date(t)) / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    if (m < 1440) return `${Math.floor(m / 60)}h ago`
    return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const saveTarget = async () => {
    setSavingTarget(true)
    try {
      const v = Number(editTargetValue) || 0
      await setNgoAdminTarget(targetModalAdmin.id, v)
      setAdminTargets(prev => prev.map(t => (t.id === targetModalAdmin.id ? { ...t, daily_target: v } : t)))
      setTargetModalAdmin(null)
    } catch (e) { alert(e.message) } finally { setSavingTarget(false) }
  }

  /* ================= RENDER ================= */
  return (
    <div className="dash-page" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <style>{CSS}</style>

      {/* ---------- Header ---------- */}
      <div className="dash-header">
        <div>
          <span className="nd-greeting"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>{greeting} · {dateStr}</span>
          <h2 className="dash-header-title" style={{ marginTop: 8 }}>Dashboard Overview</h2>
          <p className="dash-header-sub">Operational insights across all NGOs and departments.</p>
        </div>
        <div className="dash-header-actions">
          <div className="dash-period-bar">
            {PERIODS.map(p => (
              <button key={p.key} className={`dash-period-btn${period === p.key ? ' active' : ''}`} disabled={loading} onClick={() => setPeriod(p.key)}>
                {loading && period === p.key ? '\u25c9 ' : ''}{p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" style={{ background: MINT_DARK, borderColor: MINT_DARK }} onClick={() => exportToExcel(data, period)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'text-bottom', marginRight: 4 }}>download</span>Export report
          </button>
        </div>
      </div>

      {/* ---------- Needs attention ---------- */}
      <SectionCard icon="notifications_active" title="Needs attention" className="nd-mb"
        right={<><span className="nd-live"><i />Live</span>
          <Segmented value={attnTab} onChange={setAttnTab} options={[
            { key: 'actions', label: 'Pending actions', badge: actionTotal },
            { key: 'alerts', label: 'Risk & alerts', badge: alertsData.alerts.length },
          ]} /></>}>
        {attnTab === 'actions' ? (
          <div className="nd-auto-grid" style={{ '--min': '190px' }}>
            {actionCards.map(c => {
              const n = actionCenter[c.key]
              return (
                <button key={c.key} className={`nd-action${n > 0 ? ' has' : ''}`} onClick={() => setListModal(c.key)}>
                  <span className="material-symbols-outlined">{c.icon}</span>
                  <span className="nd-action-txt"><small>{c.label}</small><b>{n}</b></span>
                </button>
              )
            })}
          </div>
        ) : alertsData.alerts.length === 0 ? <p className="nd-muted">No active alerts. Everything looks fine.</p> : (
          <div className="nd-alert-list">
            {alertsData.alerts.map((a, i) => {
              const s = SEVERITY[a.severity] || SEVERITY.info
              return (
                <button key={a.id || i} className="nd-alert-item" style={{ borderLeftColor: s.color }} onClick={() => setAlertModal(a)}>
                  <span className="material-symbols-outlined" style={{ color: s.color }}>{s.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="nd-alert-title">{a.title}</span>
                    <span className="nd-alert-desc">{a.description}</span>
                    {a.actionLabel && <span className="nd-alert-action">{a.actionLabel}</span>}
                  </span>
                  <b style={{ color: s.color, fontSize: 20 }}>{a.count}</b>
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* ---------- KPI strip ---------- */}
      <div className="nd-auto-grid nd-mb" style={{ '--min': '200px' }}>
        {kpis.map(k => (
          <button key={k.label} className="nd-card nd-kpi" onClick={k.onClick}>
            <span className="nd-kpi-label"><span className="material-symbols-outlined">{k.icon}</span>{k.label}</span>
            <span className="nd-kpi-value" style={k.tone ? { color: k.tone } : undefined}>{k.value}</span>
            <span className="nd-kpi-sub">{k.sub}</span>
          </button>
        ))}
      </div>

      {/* ---------- Department shortcuts ---------- */}
      <div className="nd-auto-grid nd-mb" style={{ '--min': '170px' }}>
        {panels.map(p => (
          <button key={p.key} className="nd-panel-link" onClick={() => setPanelModal(p.key)}>
            <span className="material-symbols-outlined">{p.icon}</span>
            <span><b>{p.label}</b><small>{p.sub}</small></span>
          </button>
        ))}
      </div>

      {/* ---------- NGO cards ---------- */}
      {ngoUserCounts.some(n => isMainNgo(n.name)) && (
        <div className="nd-auto-grid nd-mb" style={{ '--min': '280px' }}>
          {['bsct', 'aflf', 'man'].map(prefix => {
            const n = ngoUserCounts.find(x => lc(x.name).startsWith(prefix))
            if (!n) return null
            const nc = ngoColor(n.name)
            const fros = froLiveData.filter(f => f.worker?.ngo_name === n.name)
            const sum = (k) => fros.reduce((s, f) => s + Number(f.performance?.[k] || 0), 0)
            const live = fros.filter(f => f.status === 'on_call' || f.status === 'online').length
            const assigned = froAssignments.filter(f => (f.ngos || []).includes(n.name)).length
            return (
              <div key={n.name} className="nd-card" style={{ borderLeft: `4px solid ${nc}` }}>
                <div className="nd-ngo-head">
                  <b style={{ color: nc }}>{n.name}</b>
                  <span>{n.workers || n.count || 0} volunteers · <span style={{ color: MINT_DEEP }}>{live} live</span></span>
                </div>
                <div className="nd-stat-grid">
                  <div><small>Today's collection</small><b style={{ color: MINT_DEEP }}>{inr(sum('today_collection'))}</b></div>
                  <div><small>Today's calls</small><b>{sum('today_calls')}</b></div>
                  <div><small>Today's data used</small><b>{sum('data_used')}</b></div>
                  <div><small>Total FROs</small><b>{assigned}</b></div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ---------- Attendance + NGO overview ---------- */}
      <div className="nd-auto-grid nd-mb" style={{ '--min': '340px' }}>
        <SectionCard icon="how_to_reg" title="Attendance today" right={<span className="nd-sec-note">{attPercent}% attendance</span>}>
          <div className="nd-att">
            {attSegments.some(s => s.value > 0)
              ? <DonutChart segments={attSegments.filter(s => s.value > 0)} size={130} animated={animated}
                  centerValue={attSegments.reduce((s, x) => s + x.value, 0)} centerLabel="Check-ins" onSegmentClick={openAttendance} />
              : <p className="nd-muted">No check-ins yet today.</p>}
            <div className="nd-att-list">
              {attSegments.map(s => (
                <button key={s.label} className="nd-att-pill" style={{ borderColor: s.color }} onClick={() => openAttendance(s.label)}>
                  <i style={{ background: s.color }} />{s.label}<b style={{ color: s.text }}>{s.value}</b>
                </button>
              ))}
            </div>
          </div>
          {attPercent < 60 && (
            <div className="nd-warn">
              <span className="material-symbols-outlined">warning</span>
              <span>Attendance is low ({attPercent}%){attSrc.absent > 0 ? ` — ${attSrc.absent} absent` : ''}</span>
              <button onClick={() => openAttendance('Absent')}>View absentees</button>
            </div>
          )}
        </SectionCard>

        <SectionCard icon="corporate_fare" title="Admin — NGO overview" right={<span className="nd-sec-note">{ngoUserCounts.length} NGOs</span>}>
          {ngoUserCounts.length === 0 ? <p className="nd-muted">No NGO data available</p> : (() => {
            const total = ngoUserCounts.reduce((s, n) => s + (n.workers || n.count || 0), 0)
            return (
              <div className="nd-att">
                <DonutChart size={130} animated={animated} centerValue={total} centerLabel="Total" onSegmentClick={setNgoStationModal}
                  segments={ngoUserCounts.map((n, i) => ({ label: n.name, value: n.workers || n.count || 1, color: isMainNgo(n.name) ? ngoColor(n.name) : NGO_PALETTE[i % NGO_PALETTE.length] }))} />
                <div className="nd-att-list">
                  {ngoUserCounts.slice(0, 8).map((n, i) => {
                    const v = n.workers || n.count || 0
                    const c = isMainNgo(n.name) ? ngoColor(n.name) : NGO_PALETTE[i % NGO_PALETTE.length]
                    return (
                      <button key={n.name} className="nd-ngo-row" onClick={() => setNgoStationModal(n.name)}>
                        <i style={{ background: c }} /><span>{n.name}</span>
                        <div className="nd-track" style={{ width: 60 }}><div style={{ width: `${Math.round((v / (total || 1)) * 100)}%`, background: c }} /></div>
                        <b>{v}</b>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </SectionCard>
      </div>

      {/* ---------- FRO performance ---------- */}
      {froLiveData.length > 0 && <FroPerformanceToday froLiveData={froLiveData} />}

      {/* ---------- Accounts pipeline ---------- */}
      <SectionCard icon="receipt_long" title="Accounts — lead verification" className="nd-mb">
        <PipelineFlow stages={[
          { label: 'Pending', value: acc.pending, sub: inr(acc.pendingAmount), color: AMBER_LIGHT },
          { label: 'Verified', value: acc.verified, sub: inr(acc.verifiedAmount), color: MINT },
          { label: 'Rejected', value: acc.rejected, sub: inr(acc.rejectedAmount), color: BLUSH },
          { label: 'Verified today', value: acc.today, sub: inr(acc.todayAmount), color: MINT_DEEP },
        ]} />
        <div className="nd-auto-grid" style={{ '--min': '160px', marginTop: 10 }}>
          {[['Pending', acc.pending, acc.pendingAmount, 'acc_pending', AMBER_LIGHT], ['Verified', acc.verified, acc.verifiedAmount, 'acc_verified', MINT],
            ['Rejected', acc.rejected, acc.rejectedAmount, 'acc_rejected', BLUSH], ['Verified today', acc.today, acc.todayAmount, 'acc_verified_today', MINT_DEEP]].map(([l, n, amt, key, c]) => (
            <button key={key} className="nd-mini" style={{ borderLeftColor: c }} onClick={() => setListModal(key)}>
              <small>{l}</small><b>{n}</b><span>{inr(amt)}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ---------- Receipts ---------- */}
      {receiptStats.length > 0 && (
        <SectionCard icon="receipt_long" title="Receipt overview" className="nd-mb">
          <div className="nd-auto-grid" style={{ '--min': '220px' }}>
            {receiptStats.map(g => (
              <div key={g.project_id || 'unknown'} className="nd-receipt">
                <div className="nd-receipt-name">{PROJECT_LABELS[g.project_id] || g.project_id || 'Unknown'}</div>
                <div><b>{(g.count || 0).toLocaleString('en-IN')}</b><small>Total receipts</small></div>
                <div><b>{(g.donors || 0).toLocaleString('en-IN')}</b><small>Total donors</small></div>
                <div><b style={{ color: MINT_DEEP }}>{inr(g.total_amount)}</b><small>Total amount</small></div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ---------- Monthly revenue / performers / activity ---------- */}
      <div className="nd-auto-grid nd-mb" style={{ '--min': '320px' }}>
        <SectionCard icon="monitoring" title="Monthly revenue">
          {monthlyRevenue.length === 0 ? <p className="nd-muted">No revenue data yet</p> : (
            <>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="nd-line">
                <path d={`M${revPts.join(' L')} L100,95 L0,95 Z`} fill={MINT} fillOpacity=".25" />
                <path d={`M${revPts.join(' L')}`} fill="none" stroke={MINT_DEEP} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="nd-line-labels">
                {monthlyRevenue.map((m, i) => (
                  <span key={m.month}>{i % 2 === 0 || i === monthlyRevenue.length - 1 ? `${MONTHS[parseInt(m.month.split('-')[1]) - 1]} '${m.month.slice(2, 4)}` : ''}</span>
                ))}
              </div>
              <div className="nd-line-foot"><span>Total: {inr(revTotal)}</span><span>Avg: {inr(Math.round(revTotal / monthlyRevenue.length))}</span></div>
            </>
          )}
        </SectionCard>

        <SectionCard icon="emoji_events" title="Top performers">
          <Segmented value={performerPeriod} onChange={setPerformerPeriod} options={PERFORMER_PERIODS} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {performers.fros.length === 0 && performers.recruiters.length === 0 && <p className="nd-muted">No performer data yet</p>}
            {performers.fros.length > 0 && <RankList title="Top FROs by collection" items={performers.fros} valueKey="totalCollection" format={inr} colors={[AMBER, MINT_DEEP, '#4C7C8C', '#7A5C8C', MUTED]} />}
            {performers.recruiters.length > 0 && <RankList title="Top recruiters by leads" items={performers.recruiters} valueKey="leadCount" colors={[MINT_DEEP, '#4C7C8C', AMBER, '#7A5C8C', MUTED]} />}
          </div>
        </SectionCard>

        <SectionCard icon="history" title="Recent activity" right={activities.length > 0 && <span className="nd-sec-note">{activities.length}</span>}>
          {activities.length === 0 ? <p className="nd-muted">No recent activity</p> : (
            <div className="nd-scroll" style={{ maxHeight: 280 }}>
              {activities.map((a, i) => {
                const [icon, color] = ACTIVITY_ICONS[a.type] || ['circle', '#94a3b8']
                return (
                  <div key={i} className="nd-act">
                    <span className="nd-act-icon" style={{ color, background: `${color}18` }}><span className="material-symbols-outlined">{icon}</span></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="nd-act-msg">{a.message}</span>
                      <div className="nd-act-meta"><span>{a.detail}</span><span>{a.time ? timeAgo(a.time) : ''}</span></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ---------- Admin daily targets ---------- */}
      <SectionCard icon="track_changes" title="Admin daily targets" className="nd-mb" right={<span className="nd-sec-note">{targetsLoading ? 'Loading...' : `${adminTargets.length} admins`}</span>}>
        {targetsLoading ? <p className="nd-muted">Loading...</p> : adminTargets.length === 0 ? <p className="nd-muted">No admin data available</p> : (
          <div className="nd-table-wrap" style={{ maxHeight: 'none' }}>
            <table className="nd-table">
              <thead><tr><th>Admin</th><th>Today's collection</th><th>Daily target</th><th>Progress</th><th /></tr></thead>
              <tbody>
                {adminTargets.map(t => {
                  const pct = t.daily_target > 0 ? Math.min(100, Math.round((t.today_collection / t.daily_target) * 100)) : 0
                  return (
                    <tr key={t.id}>
                      <td><b>{t.name}</b> <small className="nd-faint">{t.login_id}</small></td>
                      <td style={{ color: MINT_DEEP, fontWeight: 700 }}>{inr(t.today_collection)}</td>
                      <td>{t.daily_target > 0 ? inr(t.daily_target) : <span className="nd-faint">Not set</span>}</td>
                      <td>{t.daily_target > 0
                        ? <div className="nd-progress"><div className="nd-track" style={{ width: 70 }}><div style={{ width: `${pct}%`, background: pct >= 100 ? MINT_DEEP : pct >= 50 ? AMBER : RED }} /></div>{pct}%</div>
                        : '—'}</td>
                      <td><button className="nd-btn-sm" onClick={() => { setTargetModalAdmin(t); setEditTargetValue(String(t.daily_target || '')) }}>{t.daily_target > 0 ? 'Edit' : 'Set'}</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ---------- Events ---------- */}
      <SectionCard icon="event" title="Upcoming events" className="nd-mb" right={events.length > 0 && <span className="nd-sec-note">{events.length}</span>}>
        {events.length === 0 ? <p className="nd-muted">No upcoming events</p> : (
          <div className="nd-scroll" style={{ maxHeight: 240 }}>
            {events.map((ev, i) => {
              const d = new Date(ev.event_date)
              return (
                <div key={ev.id || i} className="nd-event">
                  <div className="nd-event-date"><small>{d.toLocaleString('en-IN', { month: 'short' })}</small><b>{d.getDate()}</b></div>
                  <div style={{ minWidth: 0 }}>
                    <h4>{ev.title}</h4>
                    <p>{[ev.location, ev.event_time?.slice(0, 5)].filter(Boolean).join(' • ')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button className="nd-add-btn" onClick={() => navigate('/sa/events')}>+ Add new event</button>
      </SectionCard>

      {/* ---------- Salary ---------- */}
      {salary > 0 && (
        <div className="nd-card nd-mb nd-salary">
          <span className="material-symbols-outlined">payments</span>
          <div>
            <small>Total salary payable</small>
            <b>{inr(salary)}</b>
          </div>
          <span className="nd-sec-note">Monthly{workersD.total > 0 ? ` · avg ${inr(Math.round(salary / workersD.total))}/volunteer` : ''}</span>
        </div>
      )}

      {/* ================= MODALS ================= */}
      {nameModal && <NameListModal {...nameModal} onClose={() => setNameModal(null)} />}
      {listModal && <ListModal type={listModal} onClose={() => setListModal(null)} />}
      {panelModal && <PanelSummaryModal panel={panelModal} dashboardData={data} onClose={() => setPanelModal(null)} />}
      {ngoStationModal && (
        <NgoStationModal ngoName={ngoStationModal} ngoId={ngoUserCounts.find(n => n?.name === ngoStationModal)?.id || ''} onClose={() => setNgoStationModal(null)} />
      )}

      {alertModal && (() => {
        const s = SEVERITY[alertModal.severity] || SEVERITY.info
        return (
          <Modal title={alertModal.title} icon={s.icon} color={s.color} badge={alertModal.severity.toUpperCase()} onClose={() => setAlertModal(null)}>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px' }}>{alertModal.description}</p>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px' }}>Category: <b style={{ color: INK }}>{alertModal.category}</b> · Count: <b style={{ color: s.color }}>{alertModal.count}</b></p>
            {alertModal.details?.map((item, i) => (
              <div key={i} className="nd-modal-row">
                <span className="nd-avatar" style={{ background: `${s.color}18`, color: s.color }}>{item.name?.charAt(0) || '?'}</span>
                <div style={{ minWidth: 0 }}>
                  <span className="nd-modal-name">{item.name}</span>
                  {item.value && <span className="nd-modal-dept">{deptLabel(item.value)}</span>}
                </div>
              </div>
            ))}
          </Modal>
        )
      })()}

      {targetModalAdmin && (
        <Modal title={`Set daily target — ${targetModalAdmin.name}`} icon="track_changes" onClose={() => setTargetModalAdmin(null)}
          footer={<>
            <button className="nd-btn-sm" onClick={() => setTargetModalAdmin(null)}>Cancel</button>
            <button className="nd-btn-sm primary" disabled={savingTarget} onClick={saveTarget}>{savingTarget ? 'Saving...' : 'Save target'}</button>
          </>}>
          <label className="nd-label" htmlFor="nd-target">Daily target amount (₹)</label>
          <input id="nd-target" className="nd-input" type="number" min="0" placeholder="e.g. 100000" value={editTargetValue} onChange={e => setEditTargetValue(e.target.value)} autoFocus />
          <p className="nd-muted">Today's collection: {inr(targetModalAdmin.today_collection)} across {targetModalAdmin.ngo_count || 0} NGOs</p>
        </Modal>
      )}
    </div>
  )
}

/* ================= STYLES (scoped with nd-) ================= */
const CSS = `
.nd-mb { margin-bottom: 20px; }
.nd-card { background:#fff; border:1px solid #DFEDE4; border-radius:16px; padding:18px 20px; box-shadow:0 1px 2px rgba(30,77,59,.04), 0 8px 24px -12px rgba(30,77,59,.08); font-family:inherit; text-align:left; }
.nd-auto-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(var(--min,280px),100%), 1fr)); gap:14px; }
.nd-sec-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.nd-sec-icon { font-size:18px; color:${MINT_DEEP}; }
.nd-section-title { margin:0; font-size:14px; font-weight:700; color:${MINT_DARK}; }
.nd-sec-right { margin-left:auto; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.nd-sec-note { font-size:12px; color:#94a3b8; font-weight:600; }
.nd-muted { color:#94a3b8; font-size:13px; margin:8px 0 0; }
.nd-faint { color:#94a3b8; }
.nd-greeting { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:99px; background:${MINT_LIGHT}; color:${MINT_DEEP}; font-size:12px; font-weight:700; }
.nd-live { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:${MINT_DEEP}; }
.nd-live i { width:7px; height:7px; border-radius:50%; background:${MINT_DEEP}; animation:ndPulse 2s ease-in-out infinite; }
@keyframes ndPulse { 50% { opacity:.4; } }
@media (prefers-reduced-motion: reduce) { .nd-live i { animation:none; } }
button:focus-visible { outline:2px solid ${MINT_DARK}; outline-offset:2px; }

.nd-seg { display:inline-flex; gap:3px; background:#F1F5F2; border-radius:10px; padding:3px; }
.nd-seg button { border:none; background:transparent; border-radius:8px; padding:5px 12px; font:inherit; font-size:12px; font-weight:700; color:#94a3b8; cursor:pointer; display:flex; align-items:center; gap:6px; }
.nd-seg button.on { background:#fff; color:${MINT_DARK}; box-shadow:0 1px 4px rgba(0,0,0,.08); }
.nd-seg-badge { background:${RED}; color:#fff; border-radius:99px; padding:0 6px; font-size:11px; line-height:16px; }

.nd-action { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid #E2E8F0; background:#F8FAFC; cursor:pointer; font-family:inherit; text-align:left; color:#94a3b8; }
.nd-action.has { background:#FFFBEB; border-color:${AMBER}40; color:${AMBER}; }
.nd-action-txt { display:flex; flex-direction:column; min-width:0; }
.nd-action small { font-size:12px; font-weight:600; color:${MUTED}; }
.nd-action b { font-size:20px; line-height:1.1; font-variant-numeric:tabular-nums; }
.nd-action:hover { box-shadow:0 4px 12px rgba(30,77,59,.1); }

.nd-alert-list { display:flex; flex-direction:column; gap:8px; max-height:340px; overflow-y:auto; }
.nd-alert-item { display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border-radius:12px; border:none; border-left:3px solid; background:#FAFBFA; cursor:pointer; font-family:inherit; text-align:left; width:100%; }
.nd-alert-item:hover { background:${MINT_LIGHT}; }
.nd-alert-title { display:block; font-size:13px; font-weight:700; color:${INK}; }
.nd-alert-desc { display:block; font-size:12px; color:${MUTED}; margin-top:2px; }
.nd-alert-action { display:block; font-size:12px; font-weight:700; color:${MINT_DEEP}; margin-top:4px; }

.nd-kpi { display:flex; flex-direction:column; gap:4px; cursor:pointer; }
.nd-kpi:hover { box-shadow:0 6px 18px rgba(30,77,59,.12); }
.nd-kpi-label { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:${MUTED}; }
.nd-kpi-label .material-symbols-outlined { font-size:16px; color:${MINT_DEEP}; }
.nd-kpi-value { font-size:26px; font-weight:800; color:${INK}; line-height:1.1; }
.nd-kpi-sub { font-size:12px; color:#94a3b8; }

.nd-panel-link { display:flex; align-items:center; gap:10px; padding:12px 14px; background:#fff; border:1px solid #DCEEE2; border-left:4px solid ${MINT}; border-radius:12px; cursor:pointer; font-family:inherit; text-align:left; color:${INK}; }
.nd-panel-link:hover { background:${MINT_LIGHT}; }
.nd-panel-link .material-symbols-outlined { font-size:18px; width:32px; height:32px; border-radius:8px; background:${MINT_LIGHT}; color:${MINT_DEEP}; display:flex; align-items:center; justify-content:center; }
.nd-panel-link b { display:block; font-size:14px; color:${MINT_DARK}; }
.nd-panel-link small { font-size:12px; color:#5F7269; }

.nd-ngo-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; font-size:14px; }
.nd-ngo-head span { margin-left:auto; font-size:12px; color:#94a3b8; font-weight:600; }
.nd-stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.nd-stat-grid div { padding:8px 10px; border-radius:8px; background:#F6FAF7; }
.nd-stat-grid small { display:block; font-size:11px; font-weight:600; color:#94a3b8; }
.nd-stat-grid b { font-size:18px; color:${INK}; }

.nd-att { display:flex; align-items:center; gap:20px; flex-wrap:wrap; justify-content:center; }
.nd-att-list { flex:1; min-width:170px; display:flex; flex-direction:column; gap:6px; }
.nd-donut-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.nd-att-pill, .nd-ngo-row { display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px; border-radius:12px; border:1px solid; background:transparent; cursor:pointer; font:inherit; font-size:13px; font-weight:600; color:${INK}; text-align:left; }
.nd-att-pill i, .nd-ngo-row i { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.nd-att-pill b { margin-left:auto; }
.nd-ngo-row { border-color:transparent; padding:5px 8px; }
.nd-ngo-row span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nd-ngo-row:hover, .nd-att-pill:hover { background:${MINT_LIGHT}; }
.nd-warn { display:flex; align-items:center; gap:10px; margin-top:14px; padding:8px 12px; border-radius:12px; background:rgba(247,178,173,.2); border:1px solid #F2C0BA; font-size:13px; color:${INK}; flex-wrap:wrap; }
.nd-warn .material-symbols-outlined { color:${RED}; font-size:18px; }
.nd-warn button { margin-left:auto; border:none; background:${RED}; color:#fff; border-radius:10px; padding:6px 14px; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }

.nd-track { height:6px; background:#F1F5F2; border-radius:99px; overflow:hidden; }
.nd-track div { height:100%; border-radius:99px; transition:width .6s ease; }
.nd-pipeline { display:flex; gap:8px; padding:6px 0; }
.nd-pipe-stage { flex:1; min-width:0; text-align:center; }
.nd-mini { display:flex; flex-direction:column; gap:2px; padding:12px 14px; border:1px solid #DCEEE2; border-left:3px solid; border-radius:12px; background:#fff; cursor:pointer; font-family:inherit; text-align:left; }
.nd-mini:hover { background:${MINT_LIGHT}; }
.nd-mini small { font-size:12px; font-weight:600; color:#94a3b8; }
.nd-mini b { font-size:24px; color:${INK}; }
.nd-mini span { font-size:12px; color:${MUTED}; font-weight:600; }

.nd-receipt { background:#F9FAFB; border:1px solid #E5E7EB; border-radius:12px; padding:14px; text-align:center; display:flex; flex-direction:column; gap:10px; }
.nd-receipt-name { font-size:13px; font-weight:700; color:#111827; }
.nd-receipt b { display:block; font-size:20px; color:${INK}; }
.nd-receipt small { font-size:11px; color:#6b7280; font-weight:600; }

.nd-line { width:100%; height:150px; }
.nd-line-labels { display:flex; }
.nd-line-labels span { flex:1; text-align:center; font-size:11px; color:#94a3b8; white-space:nowrap; }
.nd-line-foot { display:flex; justify-content:space-between; margin-top:10px; padding-top:8px; border-top:1px solid #DEE9E1; font-size:12px; font-weight:600; color:${MUTED}; }

.nd-sub-title { font-size:12px; font-weight:700; color:${MINT_DARK}; margin-bottom:8px; }
.nd-rank { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.nd-rank-no { width:20px; height:20px; border-radius:50%; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.nd-rank-top { display:flex; justify-content:space-between; gap:8px; font-size:12px; margin-bottom:4px; }
.nd-rank-name { font-weight:700; color:${INK}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.nd-scroll { overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding-right:4px; scrollbar-width:thin; }
.nd-act { display:flex; gap:10px; align-items:flex-start; }
.nd-act-icon { width:28px; height:28px; border-radius:8px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.nd-act-icon .material-symbols-outlined { font-size:16px; }
.nd-act-msg { display:block; font-size:13px; font-weight:600; color:${INK}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nd-act-meta { display:flex; justify-content:space-between; font-size:11px; color:#94a3b8; }
.nd-event { display:flex; gap:12px; align-items:center; padding:10px 12px; border-radius:12px; border:1px solid #DCEEE2; }
.nd-event-date { width:46px; height:50px; border-radius:12px; flex-shrink:0; background:${MINT_LIGHT}; color:${MINT_DEEP}; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.nd-event-date b { font-size:18px; line-height:1; }
.nd-event h4 { margin:0; font-size:13px; font-weight:700; color:${INK}; }
.nd-event p { margin:3px 0 0; font-size:12px; color:#94a3b8; }
.nd-add-btn { width:100%; margin-top:14px; padding:10px 0; border:1.5px dashed ${MINT_DEEP}; background:${MINT_LIGHT}; color:${MINT_DEEP}; border-radius:12px; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.nd-salary { display:flex; align-items:center; gap:12px; border-left:4px solid ${MINT_DEEP}; flex-wrap:wrap; }
.nd-salary .material-symbols-outlined { color:${MINT_DEEP}; }
.nd-salary small { display:block; font-size:12px; font-weight:600; color:#94a3b8; }
.nd-salary b { font-size:22px; color:${MINT_DEEP}; }
.nd-salary .nd-sec-note { margin-left:auto; }

.nd-table-wrap { overflow:auto; max-height:55vh; }
.nd-table { width:100%; border-collapse:collapse; font-size:13px; }
.nd-table th { position:sticky; top:0; background:#fff; text-align:left; padding:9px 10px; font-size:12px; font-weight:700; color:#94a3b8; border-bottom:1px solid #EAF3EC; white-space:nowrap; }
.nd-table td { padding:9px 10px; border-bottom:1px solid #F0F7F2; vertical-align:middle; }
.nd-table tbody tr:hover { background:${MINT_LIGHT}; }
.nd-progress { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:${MUTED}; }
.nd-btn-sm { padding:6px 12px; border:1px solid #DCEEE2; border-radius:8px; background:#fff; color:${MINT_DARK}; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.nd-btn-sm.primary { background:${MINT_DEEP}; color:#fff; border-color:${MINT_DEEP}; }
.nd-btn-sm:disabled { opacity:.5; }
.nd-label { display:block; font-size:13px; font-weight:600; margin-bottom:6px; }
.nd-input { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; font:inherit; font-size:14px; box-sizing:border-box; }

.nd-modal-overlay { position:fixed; inset:0; z-index:1000; background:rgba(31,51,43,.45); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:20px; }
.nd-modal { background:#fff; border-radius:20px; width:100%; max-width:480px; max-height:80vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 60px -12px rgba(31,51,43,.35); animation:ndPop .25s ease; }
.nd-modal-wide { max-width:800px; }
@keyframes ndPop { from { opacity:0; transform:scale(.96) translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .nd-modal { animation:none; } }
.nd-modal-head { display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid; }
.nd-modal-badge { font-size:13px; font-weight:800; padding:5px 11px; border-radius:10px; }
.nd-modal-title { margin:0; flex:1; font-size:15px; font-weight:700; color:${INK}; }
.nd-modal-close { border:none; background:${MINT_LIGHT}; border-radius:10px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:${MUTED}; }
.nd-modal-body { overflow-y:auto; padding:14px 18px 18px; }
.nd-modal-foot { display:flex; justify-content:flex-end; gap:8px; padding:10px 18px; border-top:1px solid #EAF3EC; font-size:12px; color:#94a3b8; }
.nd-modal-row { display:flex; align-items:center; gap:12px; padding:10px 6px; border-bottom:1px solid #F0F7F2; }
.nd-avatar { width:34px; height:34px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; }
.nd-modal-name { display:block; font-size:14px; font-weight:600; color:${INK}; }
.nd-modal-dept { display:block; font-size:12px; color:#94a3b8; }
.nd-modal-time { margin-left:auto; font-size:12px; color:${MUTED}; font-weight:600; }
.nd-modal-search { display:flex; align-items:center; gap:8px; padding:8px 12px; margin-bottom:10px; border:1px solid #DCEEE2; border-radius:12px; background:#F6FAF7; }
.nd-modal-search:focus-within { border-color:${MINT}; background:#fff; }
.nd-modal-search-icon { font-size:18px; color:#94a3b8; }
.nd-modal-search-input { flex:1; border:none; background:transparent; font:inherit; font-size:13px; color:${INK}; outline:none; }
.nd-modal-search-clear { border:none; background:transparent; cursor:pointer; color:#94a3b8; display:flex; }

.nd-stack-bar { height:8px; border-radius:4px; background:#e5e7eb; display:flex; overflow:hidden; margin-bottom:8px; }
.nd-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.nd-chips > span { font-size:12px; font-weight:600; padding:2px 10px; border-radius:10px; }
.nd-chip-btn { padding:3px 10px; border-radius:20px; border:1px solid; cursor:pointer; font:inherit; font-size:12px; font-weight:500; }
.nd-pill { font-size:12px; font-weight:600; padding:2px 8px; border-radius:10px; }
.nd-pager { display:flex; justify-content:center; align-items:center; gap:8px; margin-top:8px; font-size:12px; color:${MUTED}; }
.nd-pager button { border:1px solid #DCEEE2; background:#fff; border-radius:6px; padding:3px 10px; cursor:pointer; font:inherit; font-size:12px; }

.ps-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; }
.ps-card { background:#F6FAF7; border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:2px; border:1px solid #DCEEE2; border-top:3px solid ${MINT}; }
.ps-label { font-size:12px; font-weight:700; color:#94a3b8; }
.ps-value { font-size:24px; font-weight:800; color:${INK}; line-height:1.2; }
.ps-sub { font-size:12px; color:${MUTED}; font-weight:600; }
@media (max-width: 640px) { .nd-pipeline { flex-wrap:wrap; } .nd-pipe-stage { flex:1 1 40%; } .nd-card { padding:16px; } }
`

const FRO_CSS = `
.fp-wrap { background:#fff; border:1px solid #DFEDE4; border-radius:16px; padding:18px 20px; margin-bottom:20px; box-shadow:0 1px 2px rgba(30,77,59,.04), 0 8px 24px -12px rgba(30,77,59,.08); }
.fp-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
.fp-head h3 { margin:0; font-size:14px; font-weight:700; color:${MINT_DARK}; }
.fp-live { margin-left:auto; display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:${MINT_DEEP}; }
.fp-live i { width:7px; height:7px; border-radius:50%; background:${MINT_DEEP}; animation:fpPulse 2s ease-in-out infinite; }
@keyframes fpPulse { 50% { opacity:.4; } }
@media (prefers-reduced-motion: reduce) { .fp-live i { animation:none; } }

.fp-summary { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-bottom:16px; }
.fp-summary > div { background:#F6FAF7; border-radius:12px; padding:10px 14px; display:flex; flex-direction:column; }
.fp-summary small { font-size:12px; font-weight:600; color:#94a3b8; }
.fp-summary b { font-size:22px; font-weight:800; color:${INK}; line-height:1.2; }
.fp-summary span { font-size:12px; color:${MUTED}; }

.fp-tools { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
.fp-search { flex:1; min-width:160px; display:flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #DCEEE2; border-radius:10px; background:#F6FAF7; }
.fp-search:focus-within { border-color:${MINT}; background:#fff; }
.fp-search .material-symbols-outlined { font-size:18px; color:#94a3b8; }
.fp-search input { flex:1; border:none; background:transparent; outline:none; font:inherit; font-size:13px; color:${INK}; }
.fp-tools select { padding:7px 10px; border:1px solid #DCEEE2; border-radius:10px; background:#fff; font:inherit; font-size:13px; color:${INK}; }
.fp-seg { display:inline-flex; gap:3px; background:#F1F5F2; border-radius:10px; padding:3px; }
.fp-seg button { border:none; background:transparent; border-radius:8px; padding:5px 12px; font:inherit; font-size:12px; font-weight:700; color:#94a3b8; cursor:pointer; }
.fp-seg button.on { background:#fff; color:${MINT_DARK}; box-shadow:0 1px 4px rgba(0,0,0,.08); }
.fp-wrap button:focus-visible, .fp-wrap select:focus-visible { outline:2px solid ${MINT_DARK}; outline-offset:2px; }

.fp-list { list-style:none; margin:0; padding:0; }
.fp-row { display:grid; grid-template-columns:28px minmax(140px, 1.2fr) 1.4fr minmax(90px, auto); align-items:center; gap:14px; padding:10px 8px; border-bottom:1px solid #F0F7F2; }
.fp-row:last-child { border-bottom:none; }
.fp-row:hover { background:${MINT_LIGHT}; border-radius:10px; }
.fp-rank { width:26px; height:26px; border-radius:50%; background:#F1F5F2; color:${MUTED}; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; }
.fp-row.top .fp-rank { background:${MINT_DEEP}; color:#fff; }
.fp-who { min-width:0; display:flex; flex-direction:column; gap:3px; }
.fp-name { font-size:14px; font-weight:700; color:${INK}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fp-meta { display:flex; align-items:center; gap:6px; font-size:12px; color:${MUTED}; flex-wrap:wrap; }
.fp-meta i { width:8px; height:8px; border-radius:50%; }
.fp-meta em { font-style:normal; font-weight:700; padding:1px 8px; border-radius:99px; font-size:11px; }
.fp-track { height:8px; background:#F1F5F2; border-radius:99px; overflow:hidden; }
.fp-track div { height:100%; background:${MINT}; border-radius:99px; transition:width .6s ease; }
.fp-row.top .fp-track div { background:${MINT_DEEP}; }
.fp-nums { text-align:right; display:flex; flex-direction:column; }
.fp-nums b { font-size:15px; font-weight:800; color:${INK}; font-variant-numeric:tabular-nums; }
.fp-nums span { font-size:12px; color:#94a3b8; }
.fp-empty { color:#94a3b8; font-size:13px; margin:8px 0 0; }
.fp-more { width:100%; margin-top:10px; padding:9px 0; border:1.5px dashed ${MINT_DEEP}; background:${MINT_LIGHT}; color:${MINT_DEEP}; border-radius:12px; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }

@media (max-width: 640px) {
  .fp-wrap { padding:16px; }
  .fp-row { grid-template-columns:28px 1fr auto; row-gap:6px; }
  .fp-bar { grid-column:2 / 4; grid-row:2; }
}
`
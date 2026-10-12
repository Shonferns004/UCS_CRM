import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/auth'
import { getAllTickets, getLeaves, getWorkers } from '../api/endpoints'
import { belongsToLead, isRejectedStatus, isPendingFollowUpStatus } from '../../../utils/leads'

// Daily HR & Recruitment report for the HOD (Super Admin).

const IST_MS = 5.5 * 60 * 60 * 1000
const dayOf = (ts) => {
  if (!ts) return null
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : new Date(t + IST_MS).toISOString().slice(0, 10)
}
const today = () => dayOf(Date.now())
const arr = (v) => (Array.isArray(v) ? v : (v && (v.reports || v.data || v.rows)) || [])
const num = (v) => { const n = parseInt(String(v ?? ''), 10); return Number.isNaN(n) ? 0 : n }

const isStillEmployed = (r) => {
  if (!r || r.is_active === false) return false
  const s = r.employment_status
  return s == null || s === '' ? true : String(s).toLowerCase() === 'active'
}

// leads.notes is a JSON array; tagged entries look like { __meta, type, value }.
const leadMeta = (raw) => {
  const meta = { role: '', stages: [] }
  let entries = raw
  try { entries = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return meta }
  if (!Array.isArray(entries)) return meta
  for (const e of entries) {
    if (!e || e.__meta !== true) continue
    if (e.type === 'job_role' && e.value && !meta.role) meta.role = String(e.value)
    if (e.type === 'stage' && e.value) meta.stages.push(String(e.value))
  }
  return meta
}

const tally = (list) => {
  const t = { leads: list.length, scheduled: 0, selected: 0, rejected: 0, offers: 0, followups: 0 }
  for (const l of list) {
    const m = leadMeta(l.notes)
    if (l.status === 'scheduled' || m.stages.includes('Interview Scheduled')) t.scheduled++
    if (l.status === 'selected') t.selected++
    if (isRejectedStatus(l.status)) t.rejected++
    if (m.stages.includes('Offer Released')) t.offers++
    if (isPendingFollowUpStatus(l.status)) t.followups++
  }
  return t
}

function Kpi({ label, value, tone }) {
  const color = tone === 'bad' ? '#b91c1c' : tone === 'warn' ? '#b45309' : tone === 'good' ? '#166534' : undefined
  return (
    <div className="sa-stat-card">
      <div className="sa-stat-label">{label}</div>
      <div className="sa-stat-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  )
}

function Section({ title, sub, children }) {
  return (
    <div className="sa-card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        {sub && <div className="sa-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

const grid = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }

export default function HrRecruitmentReport() {
  const [date, setDate] = useState(today)
  const [summary, setSummary] = useState(null)
  const [reports, setReports] = useState([])
  const [leads, setLeads] = useState([])
  const [recruiters, setRecruiters] = useState([])
  const [tickets, setTickets] = useState([])
  const [leaves, setLeaves] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState([])

  // Data that does not depend on the day: loaded once.
  useEffect(() => {
    const miss = []
    const take = (name, set, fn) => fn().then(set).catch(() => miss.push(name))
    Promise.all([
      take('leads', (d) => setLeads(arr(d)), () => api('/leads')),
      take('recruiters', (d) => setRecruiters(arr(d).filter(isStillEmployed)), () => api('/recruiters')),
      take('tickets', (d) => setTickets(arr(d)), getAllTickets),
      take('leaves', (d) => setLeaves(arr(d)), getLeaves),
      take('employees', (d) => setWorkers(arr(d)), () => getWorkers()),
    ]).then(() => setFailed(miss))
  }, [])

  // Day-specific data: reloaded when the date changes.
  useEffect(() => {
    let off = false
    setLoading(true)
    Promise.allSettled([
      api(`/hr-reports/attendance-summary?date=${encodeURIComponent(date)}`),
      api(`/hr-reports?date=${encodeURIComponent(date)}`),
    ]).then(([s, r]) => {
      if (off) return
      setSummary(s.status === 'fulfilled' ? s.value : null)
      setReports(r.status === 'fulfilled' ? arr(r.value) : [])
      setLoading(false)
    })
    return () => { off = true }
  }, [date])

  const workerName = useMemo(() => {
    const m = {}
    workers.forEach(w => { m[w.id] = w.name })
    return m
  }, [workers])

  // What HR typed that day (absences, terminations, per-recruiter figures).
  const typed = useMemo(() => {
    const join = (key) => [...new Set(reports.map(r => String(r?.[key] || '').trim()).filter(Boolean))].join(' | ')
    const manual = {}
    for (const r of reports) {
      for (const [id, entry] of Object.entries(r?.mis_manual || {})) {
        if (!manual[id]) manual[id] = {}
        for (const [k, v] of Object.entries(entry || {})) {
          if (manual[id][k] === undefined || manual[id][k] === '') manual[id][k] = v
        }
      }
    }
    return { wopi: join('absent_wopi'), wpi: join('absent_wpi'), terminations: join('terminations'), manual }
  }, [reports])

  const dayLeads = useMemo(
    () => leads.filter(l => dayOf(l.created_at) === date || dayOf(l.updated_at) === date),
    [leads, date],
  )

  const rows = useMemo(() => recruiters.map(r => {
    const mine = dayLeads.filter(l => belongsToLead(l, r))
    const m = typed.manual[r.id] || {}
    return { id: r.id, name: r.name, ...tally(mine), calls: num(m.calls_made), attended: num(m.interviews_attended), joining: num(m.joining_confirmed) }
  }).filter(r => r.leads > 0 || r.calls > 0 || r.attended > 0 || r.joining > 0)
    .sort((a, b) => b.leads - a.leads), [recruiters, dayLeads, typed])

  const total = useMemo(() => rows.reduce((t, r) => {
    for (const k of ['leads', 'scheduled', 'selected', 'rejected', 'offers', 'followups', 'calls', 'attended', 'joining']) t[k] += r[k]
    return t
  }, { leads: 0, scheduled: 0, selected: 0, rejected: 0, offers: 0, followups: 0, calls: 0, attended: 0, joining: 0 }), [rows])

  // Vacancy-wise: the job role tagged on each lead.
  const vacancies = useMemo(() => {
    const by = new Map()
    for (const l of dayLeads) {
      const role = leadMeta(l.notes).role || 'Not specified'
      if (!by.has(role)) by.set(role, [])
      by.get(role).push(l)
    }
    return [...by.entries()].map(([role, list]) => ({ role, ...tally(list) })).sort((a, b) => b.leads - a.leads)
  }, [dayLeads])

  // HR issues + what needs the HOD.
  const joined = useMemo(() => workers.filter(w => String(w.date_of_joining || '').slice(0, 10) === date), [workers, date])
  const received = tickets.filter(t => dayOf(t.created_at) === date).length
  const resolved = tickets.filter(t => (t.status === 'approved' || t.status === 'rejected') && dayOf(t.reviewed_at || t.updated_at) === date).length
  const openTickets = tickets.filter(t => t.status === 'pending' || t.status === 'hr_verified').length
  const awaitingHod = tickets.filter(t => t.status === 'hr_verified').length
  const pendingLeaves = leaves.filter(l => l.status === 'pending')
  const noIntimation = typed.wopi

  const show = (v) => (loading ? '—' : v ?? 0)

  return (
    <div className="sa-page">
      <style>{`@media print { .sa-sidebar, .topbar, .sa-no-print { display:none !important } .sa-page { padding:0 !important } }`}</style>

      <div className="sa-page-header">
        <div>
          <h3>Daily HR &amp; Recruitment Report</h3>
          <span className="sa-muted">For HOD &middot; {date}{date === today() ? ' (Today)' : ''}</span>
        </div>
        <div className="sa-no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} />
          <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {failed.length > 0 && <div className="sa-err-card">Could not load: {failed.join(', ')}. Those figures may be incomplete.</div>}

      <Section title="C. HOD attention required" sub="Things waiting on you or needing a decision">
        <div style={grid}>
          <Kpi label="Tickets awaiting approval" value={awaitingHod} tone={awaitingHod ? 'warn' : undefined} />
          <Kpi label="Leave requests pending" value={pendingLeaves.length} tone={pendingLeaves.length ? 'warn' : undefined} />
          <Kpi label="Candidate follow-ups" value={total.followups} tone={total.followups ? 'warn' : undefined} />
          <Kpi label="Absent, no intimation" value={noIntimation ? noIntimation.split(/[,|\n]/).filter(s => s.trim()).length : 0} tone={noIntimation ? 'bad' : undefined} />
        </div>
        {pendingLeaves.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="sa-muted" style={{ fontSize: 12, marginBottom: 4 }}>Pending leaves (first 5)</div>
            <table className="sa-table">
              <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Reason</th></tr></thead>
              <tbody>
                {pendingLeaves.slice(0, 5).map(l => (
                  <tr key={l.id}>
                    <td>{workerName[l.worker_id] || `ID ${l.worker_id}`}</td>
                    <td>{l.start_date ? new Date(l.start_date).toLocaleDateString() : '—'}</td>
                    <td>{l.end_date ? new Date(l.end_date).toLocaleDateString() : '—'}</td>
                    <td className="sa-muted">{l.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {noIntimation && <div style={{ marginTop: 10, fontSize: 13 }}><b>Absent without intimation:</b> {noIntimation}</div>}
      </Section>

      <Section title="A. HR daily report" sub="Attendance and employee issues">
        <div style={grid}>
          <Kpi label="Total staff" value={show(summary?.total_staff)} />
          <Kpi label="Present" value={show(summary?.present)} tone="good" />
          <Kpi label="Half day" value={show(summary?.half_day)} />
          <Kpi label="On leave" value={show(summary?.on_leave)} />
          <Kpi label="Absent" value={show(summary?.absent)} tone={summary?.absent ? 'bad' : undefined} />
          <Kpi label="New joining" value={joined.length} tone={joined.length ? 'good' : undefined} />
        </div>
        {joined.length > 0 && <div style={{ marginTop: 10, fontSize: 13 }}><b>Joined:</b> {joined.map(w => w.name).join(', ')}</div>}
        {typed.wpi && <div style={{ marginTop: 6, fontSize: 13 }}><b>Absent with intimation:</b> {typed.wpi}</div>}
        {typed.terminations && <div style={{ marginTop: 6, fontSize: 13 }}><b>Resignation / termination:</b> {typed.terminations}</div>}

        <div className="sa-muted" style={{ fontSize: 12, margin: '16px 0 8px' }}>Employee issues (attendance-correction tickets)</div>
        <div style={grid}>
          <Kpi label="Received today" value={received} />
          <Kpi label="Resolved today" value={resolved} tone="good" />
          <Kpi label="Open (pending)" value={openTickets} tone={openTickets ? 'warn' : undefined} />
        </div>
      </Section>

      <Section title="B. Recruitment daily report" sub="Leads created or touched on this date, by recruiter. Calls, interviews attended and joining are typed by HR in HR > Reports.">
        <div style={grid}>
          <Kpi label="Candidates sourced" value={total.leads} />
          <Kpi label="Interviews scheduled" value={total.scheduled} />
          <Kpi label="Interviews attended" value={total.attended} />
          <Kpi label="Selected" value={total.selected} tone="good" />
          <Kpi label="Offers released" value={total.offers} />
          <Kpi label="Joining confirmed" value={total.joining} tone="good" />
          <Kpi label="Rejected" value={total.rejected} />
          <Kpi label="Calls made" value={total.calls} />
        </div>

        <div className="sa-muted" style={{ fontSize: 12, margin: '16px 0 8px' }}>Recruiter-wise</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="sa-table">
            <thead><tr><th>Recruiter</th><th>Leads</th><th>Int. sched.</th><th>Attended</th><th>Selected</th><th>Offers</th><th>Joining</th><th>Rejected</th><th>Follow-ups</th><th>Calls</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.name}</td><td>{r.leads}</td><td>{r.scheduled}</td><td>{r.attended}</td><td>{r.selected}</td>
                  <td>{r.offers}</td><td>{r.joining}</td><td>{r.rejected}</td><td>{r.followups}</td><td>{r.calls}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="sa-muted sa-center">No recruitment activity on this date</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>Total</td><td>{total.leads}</td><td>{total.scheduled}</td><td>{total.attended}</td><td>{total.selected}</td>
                  <td>{total.offers}</td><td>{total.joining}</td><td>{total.rejected}</td><td>{total.followups}</td><td>{total.calls}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="sa-muted" style={{ fontSize: 12, margin: '16px 0 8px' }}>Position-wise status</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="sa-table">
            <thead><tr><th>Position</th><th>Leads</th><th>Interview sched.</th><th>Selected</th><th>Offers</th><th>Rejected</th><th>Follow-ups</th></tr></thead>
            <tbody>
              {vacancies.map(v => (
                <tr key={v.role}>
                  <td>{v.role}</td><td>{v.leads}</td><td>{v.scheduled}</td><td>{v.selected}</td><td>{v.offers}</td><td>{v.rejected}</td><td>{v.followups}</td>
                </tr>
              ))}
              {vacancies.length === 0 && <tr><td colSpan={7} className="sa-muted sa-center">No leads on this date</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
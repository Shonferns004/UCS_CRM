import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePicker, Dropdown, Avatar } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import {
  fetchAllDailyReports,
  fetchDailyReportSummary,
  fetchDepartmentRoster,
  saveDailyReportRemark,
} from '../../../api/dailyReports'
import { fetchTaskAssignments } from '../../../api/taskAssignments'
import DailyReportDashboard from './DailyReportDashboard'
import RecruitmentDashboard from './RecruitmentDashboard'
import DeveloperDashboard from './DeveloperDashboard'
import SocialDashboard from './SocialDashboard'
import ReportView from '../../../components/DailyReport/ReportView'
import { Block, Empty } from '../components/drShared'
import './dailyReportsPremium.css'


const IST_MS = 5.5 * 60 * 60 * 1000
const dayOf = (ts) => {
  if (!ts) return null
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : new Date(t + IST_MS).toISOString().slice(0, 10)
}
const today = () => dayOf(Date.now())

const shiftDay = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

const prettyDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const PANEL_LABELS = { dev: 'Developer', hr: 'HR', recruiter: 'Recruiter', social: 'Social Media' }
const PANEL_TONES = { dev: '#6366f1', hr: '#0ea5e9', recruiter: '#f59e0b', social: '#ec4899' }
const PANELS = ['dev', 'hr', 'recruiter', 'social']

const timeOf = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

const Svg = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const IcoLeft = () => <Svg><path d="m15 18-6-6 6-6" /></Svg>
const IcoRight = () => <Svg><path d="m9 18 6-6-6-6" /></Svg>
const IcoDown = () => <Svg><path d="m6 9 6 6 6-6" /></Svg>
const IcoPrint = () => <Svg><path d="M6 9V3h12v6" /><rect x="6" y="14" width="12" height="7" rx="1" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /></Svg>
const IcoCheck = () => <Svg size={20}><path d="M20 6 9 17l-5-5" /></Svg>
const IcoClock = () => <Svg size={20}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
const IcoPulse = () => <Svg size={20}><path d="M3 12h4l3-8 4 16 3-8h4" /></Svg>

export default function DailyReportsOverview() {
  const [date, setDate] = useState(today())
  const [dept, setDept] = useState('dev') // Developer tab opens first
  const [employeeId, setEmployeeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState([])
  const [reports, setReports] = useState([])
  const [roster, setRoster] = useState([])
  const [openId, setOpenId] = useState(null)
  const [remarkDraft, setRemarkDraft] = useState('')
  const [savingRemark, setSavingRemark] = useState(false)
  const [assignedByName, setAssignedByName] = useState({})

  const load = useCallback(async (d, panel, empId) => {
    setLoading(true)
    try {
      const [sumRes, allRes] = await Promise.all([
        fetchDailyReportSummary(d).catch(() => ({ departments: [] })),
        fetchAllDailyReports(d, panel || undefined, empId || undefined).catch(() => ({ reports: [] })),
      ])
      setDepartments(Array.isArray(sumRes?.departments) ? sumRes.departments : [])
      setReports(Array.isArray(allRes?.reports) ? allRes.reports : [])
    } catch (err) {
      toast(err.message || 'Could not load the reports', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(date, dept, employeeId) }, [date, dept, employeeId, load])

  // Employee filter options come from the department's roster.
  useEffect(() => {
    let alive = true
    fetchDepartmentRoster(dept)
      .then((r) => { if (alive) setRoster(Array.isArray(r?.employees) ? r.employees : []) })
      .catch(() => { if (alive) setRoster([]) })
    return () => { alive = false }
  }, [dept])

  // Manager-assigned social tasks, grouped by assignee, so each member's
  // expanded report can show them inside its "My Tasks" section.
  useEffect(() => {
    let alive = true
    fetchTaskAssignments()
      .then((res) => {
        if (!alive) return
        const map = {}
        for (const a of (res?.assignments || [])) {
          const name = String(a.assignee_name || '').trim()
          if (!name) continue
          if (!map[name]) map[name] = []
          map[name].push(a)
        }
        setAssignedByName(map)
      })
      .catch(() => { if (alive) setAssignedByName({}) })
    return () => { alive = false }
  }, [])

  const pickDate = (next) => {
    const value = typeof next === 'string' ? next : (next?.target?.value ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    if (value > today()) { toast('Cannot view a future date.', 'error'); return }
    setDate(value)
    setOpenId(null)
  }

  const pickDept = (panel) => {
    setDept(panel)
    setEmployeeId('')
    setOpenId(null)
  }

  const pickEmployee = (e) => {
    setEmployeeId(e?.target?.value ?? '')
    setOpenId(null)
  }

  const employeeOptions = useMemo(
    () => [{ value: '', label: 'All employees' }, ...roster.map((emp) => ({ value: emp.id, label: emp.name }))],
    [roster],
  )

  const byPanel = useMemo(() => reports.reduce((acc, r) => {
    (acc[r.panel] ||= []).push(r)
    return acc
  }, {}), [reports])

  const summaryMap = useMemo(() => departments.reduce((acc, d) => {
    acc[d.panel] = d
    return acc
  }, {}), [departments])

  const openReport = reports.find((r) => String(r.id) === String(openId)) || null
  const assignedAll = useMemo(() => Object.values(assignedByName).flat(), [assignedByName])

  const openDetail = (report) => {
    setOpenId(report.id)
    setRemarkDraft(report.remark || '')
  }

  const saveRemark = async () => {
    if (!openReport || savingRemark) return
    setSavingRemark(true)
    try {
      const res = await saveDailyReportRemark(openReport.id, remarkDraft)
      const updated = res?.report || { ...openReport, remark: remarkDraft || null }
      setReports((prev) => prev.map((r) => (String(r.id) === String(openReport.id) ? { ...r, remark: updated.remark } : r)))
      setDepartments((prev) => prev.map((d) => ({
        ...d,
        submitted: d.submitted.map((s) => (String(s.id) === String(openReport.id) ? { ...s, remark: updated.remark } : s)),
      })))
      toast('Remark saved', 'success')
    } catch (err) {
      toast(err.message || 'Could not save the remark', 'error')
    } finally {
      setSavingRemark(false)
    }
  }

  const summary = summaryMap[dept]
  const totals = {
    submitted: summary?.submitted?.length || 0,
    pending: summary?.pending?.length || 0,
  }
  const staff = totals.submitted + totals.pending
  const completion = staff > 0 ? Math.round((totals.submitted / staff) * 100) : 0

  const panelReports = byPanel[dept] || []
  const pending = (summary?.pending || []).filter((p) => !employeeId || String(p.id) === String(employeeId))
  const isToday = date === today()

  return (
    <div className="drx">
      <header className="drx-head">
        <div>
          <h2 className="drx-title">Daily Reports</h2>
          <p className="drx-sub">
            {prettyDate(date)}
            {isToday && <span className="drx-live">Today</span>}
          </p>
        </div>

        <div className="drx-toolbar no-print">
          <div className="drx-step">
            <button type="button" className="drx-icon-btn" aria-label="Previous day" title="Previous day" onClick={() => pickDate(shiftDay(date, -1))}><IcoLeft /></button>
            <DatePicker value={date} onChange={pickDate} max={today()} />
            <button type="button" className="drx-icon-btn" aria-label="Next day" title="Next day" disabled={isToday} onClick={() => pickDate(shiftDay(date, 1))}><IcoRight /></button>
          </div>
          <span className="drx-divider" />
          <Dropdown value={employeeId} onChange={pickEmployee} options={employeeOptions} searchable />
          <button type="button" className="drx-btn" onClick={() => pickDate(today())} disabled={isToday}>Today</button>
          <button type="button" className="drx-btn primary" onClick={() => window.print()}><IcoPrint />Print</button>
        </div>
      </header>

      <div className="drx-tabs no-print" role="tablist" aria-label="Departments">
        {PANELS.map((panel) => {
          const s = summaryMap[panel]
          const sub = s?.submitted?.length ?? 0
          const total = sub + (s?.pending?.length ?? 0)
          return (
            <button
              key={panel}
              type="button"
              role="tab"
              aria-selected={dept === panel}
              className={`drx-tab${dept === panel ? ' active' : ''}`}
              style={{ '--tone': PANEL_TONES[panel] }}
              onClick={() => pickDept(panel)}
            >
              <span className="drx-tab-dot" />
              {PANEL_LABELS[panel]}
              <span className="drx-tab-count" title={`${sub} of ${total} submitted`}>{total ? `${sub}/${total}` : sub}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <>
          <div className="drx-summary">
            {[0, 1, 2].map((i) => <div key={i} className="drx-skel" style={{ height: 76 }} />)}
          </div>
          <div className="drx-skel" style={{ height: 190, marginBottom: 16 }} />
          <div className="drx-skel" style={{ height: 150 }} />
        </>
      ) : (
        <>
          <div className="drx-summary">
            <div className="drx-stat" style={{ '--c': '#16a34a' }}>
              <span className="drx-stat-ico"><IcoCheck /></span>
              <div className="drx-stat-body">
                <div className="drx-stat-num">{totals.submitted}</div>
                <div className="drx-stat-label">Submitted</div>
              </div>
            </div>
            <div className="drx-stat" style={{ '--c': '#d97706' }}>
              <span className="drx-stat-ico"><IcoClock /></span>
              <div className="drx-stat-body">
                <div className="drx-stat-num">{totals.pending}</div>
                <div className="drx-stat-label">Pending</div>
              </div>
            </div>
            <div className="drx-stat" style={{ '--c': '#2563eb' }}>
              <span className="drx-stat-ico"><IcoPulse /></span>
              <div className="drx-stat-body">
                <div className="drx-stat-num">{completion}%</div>
                <div className="drx-stat-label">Completion</div>
                <div className="drx-progress" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${completion}%` }} />
                </div>
              </div>
            </div>
          </div>

          {dept === 'dev' && <DeveloperDashboard date={date} devReports={byPanel['dev'] || []} />}
          {dept === 'hr' && <DailyReportDashboard date={date} hrReports={byPanel['hr'] || []} />}
          {dept === 'recruiter' && <RecruitmentDashboard date={date} recReports={byPanel['recruiter'] || []} />}
          {dept === 'social' && <SocialDashboard date={date} socialReports={byPanel['social'] || []} assignedTasks={assignedAll} />}

          <Block title={`${PANEL_LABELS[dept]} — Submitted Reports`} aside={`${panelReports.length} filled · ${pending.length} pending`}>
            {panelReports.length === 0 ? (
              <Empty big>No report submitted.</Empty>
            ) : (
              <div className="drx-reports">
                {panelReports.map((r) => {
                  const open = String(r.id) === String(openId)
                  const time = timeOf(r.updated_at)
                  const dirty = remarkDraft !== (openReport?.remark || '')
                  return (
                    <article key={r.id} className={`drx-report${open ? ' open' : ''}`}>
                      <button
                        type="button"
                        className="drx-report-head"
                        aria-expanded={open}
                        onClick={() => (open ? setOpenId(null) : openDetail(r))}
                      >
                        <Avatar name={r.reporter_name} size={38} />
                        <span className="drx-report-who">
                          <span className="drx-report-name">{r.reporter_name}</span>
                          <span className="drx-report-meta">
                            {PANEL_LABELS[r.department] || r.department || PANEL_LABELS[r.panel] || 'Report'}
                            {time && ` · Updated ${time}`}
                          </span>
                        </span>
                        {r.remark && <span className="drx-flag">Remark added</span>}
                        <span className="drx-chev"><IcoDown /></span>
                      </button>

                      {!open && r.remark && (
                        <div className="drx-remark-preview"><b>HOD remark</b>{r.remark}</div>
                      )}

                      {open && (
                        <div className="drx-report-body">
                          <ReportView
                            panel={r.panel}
                            data={r.data || {}}
                            assignedTasks={r.panel === 'social' ? (assignedByName[String(r.reporter_name || '').trim()] || []) : []}
                          />

                          <div className="drx-remark-box no-print">
                            <label className="drx-label" htmlFor={`remark-${r.id}`}>
                              HOD Remark{r.remark_by ? ` · ${r.remark_by}` : ''}
                            </label>
                            <textarea
                              id={`remark-${r.id}`}
                              className="drx-textarea"
                              value={remarkDraft}
                              onChange={(e) => setRemarkDraft(e.target.value)}
                              rows={3}
                              placeholder="Add a remark for this report…"
                            />
                            <div className="drx-remark-actions">
                              <span className="drx-hint">{dirty ? 'Unsaved changes' : (r.remark ? 'Saved' : '')}</span>
                              <button type="button" className="drx-btn primary" onClick={saveRemark} disabled={savingRemark || !dirty}>
                                {savingRemark ? 'Saving…' : 'Save remark'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}

            {pending.length > 0 && (
              <div style={{ marginTop: panelReports.length ? 20 : 16 }}>
                <div className="drx-label">Yet to submit</div>
                <div className="drx-chips">
                  {pending.map((p) => (
                    <span key={p.id} className="drx-chip"><Avatar name={p.name} size={22} />{p.name}</span>
                  ))}
                </div>
              </div>
            )}
          </Block>
        </>
      )}
    </div>
  )
}

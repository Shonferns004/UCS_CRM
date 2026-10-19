import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePicker, Dropdown, Avatar } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import { fetchTaskAssignments } from '../../../api/taskAssignments'
import DailyReportDashboard from './DailyReportDashboard'
import RecruitmentDashboard from './RecruitmentDashboard'
import DeveloperDashboard from './DeveloperDashboard'
import DeveloperMonthly from './DeveloperMonthly'
import SocialDashboard from './SocialDashboard'
import ReportView from '../../../components/DailyReport/ReportView'
import {
  fetchAllDailyReports,
  fetchBugActivity,
  fetchDailyReportSummary,
  fetchDepartmentRoster,
  fetchMonthlyDailyReports,
  saveDailyReportRemark,
} from '../../../api/dailyReports'
import { monthRange } from '../components/bugWorkAgg'
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

const currentMonth = () => today().slice(0, 7)

const monthLabel = (m) => {
  const d = new Date(`${m}-01T00:00:00`)
  return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

const shiftMonth = (m, n) => {
  const t = new Date(`${m}-01T00:00:00Z`)
  t.setUTCMonth(t.getUTCMonth() + n)
  return t.toISOString().slice(0, 7)
}

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
  const [month, setMonth] = useState(currentMonth())
  const [view, setView] = useState('daily') // 'daily' | 'monthly' (Developer tab)
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
  const [bugActivity, setBugActivity] = useState([])

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

  // Monthly mode swaps the day's rows for the whole month's — the day summary
  // (submitted / pending / completion) stays day-scoped and is not refetched.
  const loadMonthly = useCallback(async (mo, panel, empId) => {
    setLoading(true)
    try {
      const res = await fetchMonthlyDailyReports(mo, panel || undefined, empId || undefined)
      setReports(Array.isArray(res?.reports) ? res.reports : [])
    } catch (err) {
      toast(err.message || 'Could not load the monthly report', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  // One effect drives both modes: the day picker feeds the daily load, the
  // month picker the monthly one, and both share the department + employee
  // filters. Switching tabs back to daily re-runs the day load, so stale month
  // rows are never left on screen.
  useEffect(() => {
    if (view === 'monthly') loadMonthly(month, dept, employeeId)
    else load(date, dept, employeeId)
  }, [view, date, month, dept, employeeId, load, loadMonthly])

  // Bug-tracker events (reported / fixed / verified) for the same period as the
  // reports. Filing a bug IS work — QA time spent finding and logging issues
  // used to read as "did nothing" because it never touched the prose sections,
  // so the tracker feeds the developer report directly. Developer tab only: the
  // other departments have nothing to credit from the bug tracker.
  useEffect(() => {
    let alive = true
    if (dept !== 'dev') { setBugActivity([]); return () => { alive = false } }
    const { from, to } = view === 'monthly' ? monthRange(month) : { from: date, to: date }
    fetchBugActivity(from, to)
      .then((res) => { if (alive) setBugActivity(Array.isArray(res?.activity) ? res.activity : []) })
      .catch(() => { if (alive) setBugActivity([]) })
    return () => { alive = false }
  }, [dept, view, date, month])

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
    // Monthly is a Developer-tab view; landing on any other tab returns to the
    // day view so nobody reads a month of rows under a date heading.
    if (panel !== 'dev') setView('daily')
  }

  const pickMonth = (next) => {
    const value = typeof next === 'string' ? next : (next?.target?.value ?? '')
    if (!/^\d{4}-\d{2}$/.test(value)) return
    if (value > currentMonth()) { toast('Cannot view a future month.', 'error'); return }
    setMonth(value)
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

  // Bug events narrowed to the picked developer. The activity feed is keyed by
  // the person who reported / fixed / verified the bug; when one developer is
  // selected their events follow them, so the drill-down still reads as one
  // person's day.
  const devBugActivity = useMemo(() => {
    if (dept !== 'dev' || !employeeId) return bugActivity
    const emp = roster.find((e) => String(e.id) === String(employeeId))
    const wanted = String(emp?.name || '').trim().toLowerCase()
    return bugActivity.filter((ev) =>
      String(ev.person_id || '') === String(employeeId) ||
      (wanted && String(ev.person_name || '').trim().toLowerCase() === wanted))
  }, [bugActivity, dept, employeeId, roster])

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
          <h2 className="drx-title">{view === 'monthly' ? 'Monthly Developer Report' : 'Daily Reports'}</h2>
          <p className="drx-sub">
            {view === 'monthly' ? monthLabel(month) : prettyDate(date)}
            {view === 'daily' && isToday && <span className="drx-live">Today</span>}
            {view === 'monthly' && month === currentMonth() && <span className="drx-live">This month</span>}
          </p>
        </div>

        <div className="drx-toolbar no-print">
          {dept === 'dev' && (
            <div className="drx-seg" role="group" aria-label="Report period">
              <button
                type="button"
                className={`drx-seg-btn${view === 'daily' ? ' on' : ''}`}
                aria-pressed={view === 'daily'}
                onClick={() => setView('daily')}
              >
                Daily
              </button>
              <button
                type="button"
                className={`drx-seg-btn${view === 'monthly' ? ' on' : ''}`}
                aria-pressed={view === 'monthly'}
                title="Whole month of Developer reports"
                onClick={() => setView('monthly')}
              >
                Monthly
              </button>
            </div>
          )}
          {dept === 'dev' && <span className="drx-divider" />}

          {view === 'monthly' ? (
            <div className="drx-step">
              <button type="button" className="drx-icon-btn" aria-label="Previous month" title="Previous month" onClick={() => pickMonth(shiftMonth(month, -1))}><IcoLeft /></button>
              <span className="drx-month-label">{monthLabel(month)}</span>
              <button type="button" className="drx-icon-btn" aria-label="Next month" title="Next month" disabled={month >= currentMonth()} onClick={() => pickMonth(shiftMonth(month, 1))}><IcoRight /></button>
            </div>
          ) : (
            <div className="drx-step">
              <button type="button" className="drx-icon-btn" aria-label="Previous day" title="Previous day" onClick={() => pickDate(shiftDay(date, -1))}><IcoLeft /></button>
              <DatePicker value={date} onChange={pickDate} max={today()} />
              <button type="button" className="drx-icon-btn" aria-label="Next day" title="Next day" disabled={isToday} onClick={() => pickDate(shiftDay(date, 1))}><IcoRight /></button>
            </div>
          )}
          <span className="drx-divider" />
          <Dropdown value={employeeId} onChange={pickEmployee} options={employeeOptions} searchable />
          {view === 'monthly'
            ? <button type="button" className="drx-btn" onClick={() => pickMonth(currentMonth())} disabled={month === currentMonth()}>This month</button>
            : <button type="button" className="drx-btn" onClick={() => pickDate(today())} disabled={isToday}>Today</button>}
          <button type="button" className="drx-btn primary" onClick={() => window.print()}><IcoPrint />Print</button>
        </div>
      </header>

      <div className="drx-tabs no-print" role="tablist" aria-label="Departments">
        {PANELS.map((panel) => {
          const s = summaryMap[panel]
          // Monthly mode is Developer-only, so its count reads the month's rows
          // (reporters who filed / roster) instead of today's summary; every
          // other tab still shows the day's submitted/total. Picking another tab
          // drops the view back to Daily (see pickDept).
          const monthView = view === 'monthly' && panel === 'dev'
          const sub = monthView ? new Set(reports.map((r) => String(r.reporter_id || r.reporter_name))).size : (s?.submitted?.length ?? 0)
          const total = monthView ? roster.length : sub + (s?.pending?.length ?? 0)
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
              <span className="drx-tab-count" title={monthView ? `${sub} of ${total} developers filed this month` : `${sub} of ${total} submitted`}>{total ? `${sub}/${total}` : sub}</span>
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
      ) : dept === 'dev' && view === 'monthly' ? (
        // Month view: DeveloperMonthly owns its own overview cards, so the day's
        // Submitted / Pending / Completion trio does not apply.
        <DeveloperMonthly
          month={month}
          reports={reports}
          roster={employeeId ? roster.filter((e) => String(e.id) === String(employeeId)) : roster}
          bugActivity={devBugActivity}
          onUpdated={(id, patch) => setReports((prev) => prev.map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r)))}
        />
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

          {dept === 'dev' && <DeveloperDashboard date={date} devReports={byPanel['dev'] || []} bugActivity={devBugActivity} />}
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

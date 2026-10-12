import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePicker, Dropdown } from '../../../components/ui'
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


const IST_MS = 5.5 * 60 * 60 * 1000
const dayOf = (ts) => {
  if (!ts) return null
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : new Date(t + IST_MS).toISOString().slice(0, 10)
}
const today = () => dayOf(Date.now())

const PANEL_LABELS = { dev: 'Developer', hr: 'HR', recruiter: 'Recruiter', social: 'Social Media' }
const PANELS = ['dev', 'hr', 'recruiter', 'social']

const timeOf = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

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

  const visiblePanels = [dept]
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

  const totals = visiblePanels.reduce((acc, panel) => {
    const s = summaryMap[panel]
    acc.submitted += s?.submitted?.length || 0
    acc.pending += s?.pending?.length || 0
    return acc
  }, { submitted: 0, pending: 0 })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Daily Reports</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="sa-muted" style={{ fontSize: 12 }}>Date</span>
          <DatePicker value={date} onChange={pickDate} max={today()} />
          <Dropdown value={employeeId} onChange={pickEmployee} options={employeeOptions} searchable />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => pickDate(today())}>Today</button>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="sa-tabs" role="tablist" aria-label="Departments" style={{ flexWrap: 'wrap' }}>
        {PANELS.map((panel) => (
          <button
            key={panel}
            type="button"
            role="tab"
            aria-selected={dept === panel}
            className={`sa-tab${dept === panel ? ' active' : ''}`}
            onClick={() => pickDept(panel)}
          >
            {PANEL_LABELS[panel]} ({(summaryMap[panel]?.submitted?.length) ?? 0})
          </button>
        ))}
      </div>

      <div className="sa-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        {totals.submitted} submitted · {totals.pending} pending
      </div>

      {loading && <div className="sa-muted">Loading…</div>}

      {!loading && dept === 'dev' && (
        <DeveloperDashboard date={date} devReports={byPanel['dev'] || []} />
      )}

      {!loading && dept === 'hr' && (
        <DailyReportDashboard date={date} hrReports={byPanel['hr'] || []} />
      )}

      {!loading && dept === 'recruiter' && (
        <RecruitmentDashboard date={date} recReports={byPanel['recruiter'] || []} />
      )}

      {!loading && dept === 'social' && (
        <SocialDashboard date={date} socialReports={byPanel['social'] || []} assignedTasks={assignedAll} />
      )}

      {!loading && visiblePanels.map((panel) => {
        const panelReports = byPanel[panel] || []
        const summary = summaryMap[panel]
        const pending = (summary?.pending || []).filter((p) => !employeeId || String(p.id) === String(employeeId))
        return (
          <div className="sa-card" key={panel} style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>{PANEL_LABELS[panel] || panel}</h4>
              <span className="sa-muted" style={{ fontSize: 12 }}>{panelReports.length} filled · {pending.length} pending</span>
            </div>

            {panelReports.length === 0 && <div className="sa-muted" style={{ fontSize: 13 }}>No report submitted.</div>}
            {panelReports.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="sa-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Filled by</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[...new Set(panelReports.map((r) => r.reporter_name).filter(Boolean))].map((name) => (
                    <span key={name} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>{name}</span>
                  ))}
                </div>
              </div>
            )}
            {panelReports.map((r) => {
              const open = String(r.id) === String(openId)
              return (
                <div key={r.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 10, marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => (open ? setOpenId(null) : openDetail(r))}>
                    <span>{r.reporter_name}{r.department && <span className="sa-muted" style={{ fontWeight: 400, fontSize: 11 }}> · {PANEL_LABELS[r.department] || r.department}</span>}</span>
                    <span className="sa-muted" style={{ fontWeight: 400, fontSize: 12 }}>{timeOf(r.updated_at)} {open ? '▲' : '▼'}</span>
                  </div>
                  {open && (
                    <div style={{ marginTop: 8, padding: 12, background: 'var(--surface-2, #f8fafc)', borderRadius: 8 }}>
                      <ReportView
                        panel={r.panel}
                        data={r.data || {}}
                        assignedTasks={r.panel === 'social' ? (assignedByName[String(r.reporter_name || '').trim()] || []) : []}
                      />

                      <div style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text-muted, #6b7280)', marginBottom: 4 }}>
                          HOD Remark{r.remark_by ? ` · ${r.remark_by}` : ''}
                        </label>
                        <textarea
                          value={remarkDraft}
                          onChange={(e) => setRemarkDraft(e.target.value)}
                          rows={3}
                          placeholder="Add a remark for this report…"
                          style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                        />
                        <div style={{ marginTop: 8 }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={saveRemark} disabled={savingRemark}>
                            {savingRemark ? 'Saving…' : 'Save remark'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!open && r.remark && (
                    <div className="sa-muted" style={{ fontSize: 12, marginTop: 4 }}>Remark: {r.remark}</div>
                  )}
                </div>
              )
            })}

            {pending.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px dashed var(--border, #e5e7eb)', paddingTop: 10 }}>
                <div className="sa-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Pending</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pending.map((p) => (
                    <span key={p.id} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#92400e' }}>{p.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
import { useEffect, useState } from 'react'
import { fetchAttendanceSummary } from '../../../api/dailyReports'
import { toast } from '../../../components/Toast'

// Super-Admin dashboard tab inside Daily Reports. Four blocks:
//   1. Attendance Summary   — live counts from /hr-reports/attendance-summary,
//      with Work From Home / New Joining / Resignation·Termination taken from the
//      HR reporter's typed notes (those have no automated source).
//   2. Employee Management  — typed by HR in the daily report.
//   3. HR Activities Completed — the reporter's bullet list.
//   4. Pending HR Tasks     — Task · Reason for pending · Expected completion.
// Blocks 2–4 read daily_reports panel="hr"; every value lives in report.data,
// so an older report stored as plain text still renders.

const pickField = (hrReports, section, field) =>
  hrReports.map((r) => r.data?.[section]?.[field]).find((v) => v != null && String(v).trim() !== '') ?? ''

const asList = (value) => {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return String(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

// Pending tasks tolerate both the new rows [{task,reason,expected}] and legacy
// plain text, so historical reports keep showing in the table.
const pendingRows = (hrReports) => {
  const out = []
  for (const r of hrReports) {
    const raw = r.data?.hr_activities?.hr_pending
    if (Array.isArray(raw)) {
      for (const it of raw) {
        if (it && typeof it === 'object' && String(it.task ?? '').trim()) {
          out.push({ task: String(it.task ?? ''), reason: String(it.reason ?? ''), expected: String(it.expected ?? '') })
        }
      }
    } else if (raw != null && String(raw).trim()) {
      out.push({ task: String(raw).trim(), reason: '', expected: '' })
    }
  }
  return out
}

const activities = (hrReports) =>
  hrReports.flatMap((r) => asList(r.data?.hr_activities?.hr_activities))

function Kpi({ label, value, accent }) {
  return (
    <div className="dr-kpi" style={{ borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <div className="dr-kpi-value" style={{ fontSize: 20 }}>{value}</div>
      <div className="dr-kpi-label">{label}</div>
    </div>
  )
}

function Block({ title, children, muted }) {
  return (
    <div className="sa-card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="sa-card-title" style={{ marginBottom: 12 }}>{title}</div>
      {muted ? <div className="sa-muted" style={{ fontSize: 13 }}>{muted}</div> : children}
    </div>
  )
}

export default function DailyReportDashboard({ date, hrReports = [] }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let alive = true
    setSummary(null)
    fetchAttendanceSummary(date)
      .then((s) => { if (alive) setSummary(s || null) })
      .catch((err) => { if (alive && !err?.cancelled) toast(err.message || 'Could not load attendance summary', 'error') })
    return () => { alive = false }
  }, [date])

  const newJoinings = pickField(hrReports, 'hr_people', 'new_joinings') || (summary?.new_joinings != null ? summary.new_joinings : '—')
  const wfh = pickField(hrReports, 'hr_people', 'wfh') || '—'
  const exits = pickField(hrReports, 'hr_people', 'exits') || '—'

  const emp = {
    issues_received: pickField(hrReports, 'hr_employee_mgmt', 'issues_received') || '—',
    issues_resolved: pickField(hrReports, 'hr_employee_mgmt', 'issues_resolved') || '—',
    issues_pending: pickField(hrReports, 'hr_employee_mgmt', 'issues_pending') || '—',
    disciplinary_actions: pickField(hrReports, 'hr_employee_mgmt', 'disciplinary_actions') || '—',
    documents: pickField(hrReports, 'hr_employee_mgmt', 'documents') || '—',
  }

  const actLines = activities(hrReports)
  const pending = pendingRows(hrReports)
  const reporters = [...new Set(hrReports.map((r) => r.reporter_name).filter(Boolean))]

  return (
    <div>
      <div className="sa-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        {reporters.length > 0 ? `HR report by: ${reporters.join(', ')}` : 'No HR report submitted on this date — live attendance only.'}
      </div>

      <Block
        title="1. Attendance Summary"
        muted={!summary ? 'Loading attendance…' : null}
      >
        {summary && (
          <div className="dr-kpis">
            <Kpi label="Total Employees" value={summary.total_staff ?? '—'} accent="#5B6B4E" />
            <Kpi label="Present" value={summary.present ?? '—'} accent="#22c55e" />
            <Kpi label="Absent" value={summary.absent ?? '—'} accent="#ef4444" />
            <Kpi label="Half-Day" value={summary.half_day ?? '—'} accent="#f59e0b" />
            <Kpi label="Late Coming" value={summary.late_coming ?? '—'} accent="#f97316" />
            <Kpi label="Work From Home" value={wfh} />
            <Kpi label="New Joining" value={newJoinings} />
            <Kpi label="Resignation / Termination" value={exits} />
          </div>
        )}
      </Block>

      <Block title="2. Employee Management">
        <div className="dr-kpis">
          <Kpi label="Employee Issues Received" value={emp.issues_received} />
          <Kpi label="Issues Resolved" value={emp.issues_resolved} accent="#22c55e" />
          <Kpi label="Issues Pending" value={emp.issues_pending} accent="#ef4444" />
          <Kpi label="Disciplinary Actions Taken" value={emp.disciplinary_actions} />
          <Kpi label="Documents Collected / Pending" value={emp.documents} />
        </div>
      </Block>

      <Block title="3. HR Activities Completed">
        {actLines.length === 0 ? (
          <div className="sa-muted" style={{ fontSize: 13 }}>No activities reported.</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.9 }} className="sa-table-plain">
            {actLines.map((line, i) => <li key={i} style={{ whiteSpace: 'pre-wrap' }}>{line}</li>)}
          </ol>
        )}
      </Block>

      <Block title="4. Pending HR Tasks">
        {pending.length === 0 ? (
          <div className="sa-muted" style={{ fontSize: 13 }}>No pending tasks reported.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Reason for Pending</th>
                  <th>Expected Completion</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{p.task}</td>
                    <td>{p.reason || '—'}</td>
                    <td>{p.expected || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>
    </div>
  )
}
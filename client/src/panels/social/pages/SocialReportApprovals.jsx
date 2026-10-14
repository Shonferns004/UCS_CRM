import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePicker, Avatar } from '../../../components/ui'
import { toast } from '../../../components/Toast'
import ReportView from '../../../components/DailyReport/ReportView'
import { fetchDailyReports, saveDailyReportReview } from '../../../api/dailyReports'
import { fetchTaskAssignments } from '../../../api/taskAssignments'
import './socialReportApprovals.css'


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
const shortDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const timeOf = (ts) => {
  if (!ts) return ''
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? '' : new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// Older rows predate the review column, so a missing status means "not reviewed".
const statusOf = (r) => (r?.review_status === 'accepted' || r?.review_status === 'rejected' ? r.review_status : 'pending')

const STATUS_META = {
  pending: { label: 'Pending', className: 'sra-status pending' },
  accepted: { label: 'Accepted', className: 'sra-status accepted' },
  rejected: { label: 'Rejected', className: 'sra-status rejected' },
}

const FILTERS = ['all', 'pending', 'accepted', 'rejected']
const FILTER_LABELS = { all: 'All', pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected' }


export default function SocialReportApprovals() {
  const [date, setDate] = useState(today())
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [openId, setOpenId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [recentPending, setRecentPending] = useState([])
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  // Manager-assigned tasks grouped by assignee name, so each report card can
  // show the member's assigned tasks inside its "My Tasks" section when opened —
  // matching what the member sees on their own board.
  const [assignedByName, setAssignedByName] = useState({})

  // `silent` refreshes keep the queue current (a member who resubmits becomes a
  // fresh pending card) without tearing down the row the head has open.
  const load = useCallback(async (d, { silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetchDailyReports('social', d)
      const rows = Array.isArray(res?.reports) ? res.reports : []
      setReports(rows.sort((a, b) => String(a.reporter_name || '').localeCompare(String(b.reporter_name || ''))))
      if (!silent) setOpenId(null)
    } catch (err) {
      if (silent) return
      toast(err.message || 'Could not load the reports', 'error')
      setReports([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])

  // Poll the current day so a resubmitted report surfaces as a new pending card
  // without the head having to reload the page.
  useEffect(() => {
    if (date !== today()) return undefined
    const id = setInterval(() => { load(date, { silent: true }) }, 45000)
    return () => clearInterval(id)
  }, [date, load])

  // Pending reports on the last few days, so the head never misses a report that
  // landed on a different date than the one currently open (a member who saved
  // the day before, or saved "for today" late in the evening).
  const checkRecent = useCallback(() => {
    const days = [today(), shiftDay(today(), -1), shiftDay(today(), -2), shiftDay(today(), -3)]
    Promise.all(days.map(async (d) => {
      try {
        const res = await fetchDailyReports('social', d)
        const pending = (Array.isArray(res?.reports) ? res.reports : []).filter((r) => statusOf(r) === 'pending').length
        return { date: d, pending }
      } catch {
        return { date: d, pending: 0 }
      }
    })).then((all) => setRecentPending(all))
  }, [])

  useEffect(() => { checkRecent() }, [checkRecent, reports])

  // Manager-assigned tasks keyed by `${member}::${date}`, so a report card shows
  // only the tasks that belong to ITS day: a task planned for that date, or one
  // finished on it (a programme done early/late carries the day it was done in
  // completed_date). Refreshed whenever the queue refreshes so a task a member has
  // just completed is visible the moment their card appears.
  useEffect(() => {
    let alive = true
    fetchTaskAssignments()
      .then((res) => {
        if (!alive) return
        const map = {}
        const add = (key, task) => {
          if (!key) return
          if (!map[key]) map[key] = []
          if (!map[key].some((t) => String(t.id) === String(task.id))) map[key].push(task)
        }
        for (const a of (res?.assignments || [])) {
          const name = String(a.assignee_name || '').trim()
          if (!name) continue
          const planned = String(a.task_date || '').slice(0, 10)
          const done = String(a.completed_date || '').slice(0, 10)
          add(`${name}::${planned}`, a)
          if (done) add(`${name}::${done}`, a)
        }
        setAssignedByName(map)
      })
      .catch(() => { if (alive) setAssignedByName({}) })
    return () => { alive = false }
  }, [reports])

  const overdue = useMemo(
    () => recentPending.filter((d) => d.pending > 0 && d.date !== date).sort((a, b) => b.date.localeCompare(a.date)),
    [recentPending, date],
  )

  const pickDate = (next) => {
    const value = typeof next === 'string' ? next : (next?.target?.value ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    if (value > today()) { toast('Cannot review a future date.', 'error'); return }
    setDate(value)
  }

  const review = async (report, status, note = '') => {
    if (busyId) return
    setBusyId(report.id)
    try {
      const res = await saveDailyReportReview(report.id, status, note)
      const updated = res?.report || {}
      setReports((prev) => prev.map((r) => (
        String(r.id) === String(report.id)
          ? {
            ...r,
            review_status: updated.review_status || status,
            reviewed_by: updated.reviewed_by,
            reviewed_at: updated.reviewed_at,
            review_note: updated.review_note ?? null,
          }
          : r
      )))
      toast(status === 'accepted' ? 'Report accepted' : 'Report rejected', 'success')
    } catch (err) {
      toast(err.message || 'Could not update the review', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openReject = (report) => {
    if (busyId) return
    setRejectTarget(report)
    setRejectNote(report.review_note || '')
  }

  const closeReject = () => {
    if (busyId) return
    setRejectTarget(null)
    setRejectNote('')
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    const target = rejectTarget
    const note = rejectNote
    setRejectTarget(null)
    setRejectNote('')
    await review(target, 'rejected', note.trim())
  }

  const counts = useMemo(() => {
    const out = { all: reports.length, pending: 0, accepted: 0, rejected: 0 }
    for (const r of reports) out[statusOf(r)] += 1
    return out
  }, [reports])

  const visible = useMemo(
    () => (filter === 'all' ? reports : reports.filter((r) => statusOf(r) === filter)),
    [reports, filter],
  )

  const isToday = date === today()

  return (
    <div className="sra-root">
      <div className="sra-head">
        <div>
          <h2 className="sra-title">Report Approvals</h2>
          <p className="sra-sub">
            {prettyDate(date)}
            {isToday && <span className="sra-live">Today</span>}
          </p>
        </div>

        <div className="sra-toolbar">
          <div className="sra-step">
            <button type="button" className="sra-btn" onClick={() => pickDate(shiftDay(date, -1))}>&larr;</button>
            <DatePicker value={date} onChange={pickDate} max={today()} />
            <button type="button" className="sra-btn" onClick={() => pickDate(shiftDay(date, 1))} disabled={isToday}>&rarr;</button>
          </div>
          <button type="button" className="sra-btn" onClick={() => pickDate(today())} disabled={isToday}>Today</button>
        </div>
      </div>

      <div className="sra-stats">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`sra-stat${filter === f ? ' on' : ''}`}
            onClick={() => setFilter(f)}
          >
            <span className="sra-stat-num">{counts[f]}</span>
            <span className="sra-stat-label">{FILTER_LABELS[f]}</span>
          </button>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="sra-alert">
          <span className="sra-alert-text">
            {overdue.reduce((n, d) => n + d.pending, 0)} report{overdue.reduce((n, d) => n + d.pending, 0) > 1 ? 's' : ''} pending on another date:
          </span>
          {overdue.map((d) => (
            <button key={d.date} type="button" className="sra-alert-btn" onClick={() => setDate(d.date)}>
              {shortDate(d.date)} · {d.pending}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="sra-muted">Loading reports…</div>
      ) : visible.length === 0 ? (
        <div className="sra-empty card">
          {filter === 'all' ? 'No social media report submitted on this date.' : `No ${FILTER_LABELS[filter].toLowerCase()} reports for this date.`}
        </div>
      ) : (
        <div className="sra-list">
          {visible.map((r) => {
            const open = String(r.id) === String(openId)
            const status = statusOf(r)
            const meta = STATUS_META[status]
            const busy = String(r.id) === String(busyId)
            return (
              <article key={r.id} className={`card sra-report${open ? ' open' : ''}`}>
                <button type="button" className="sra-report-head" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}>
                  <Avatar name={r.reporter_name} size={38} />
                  <span className="sra-report-who">
                    <span className="sra-report-name">{r.reporter_name}</span>
                    <span className="sra-report-meta">
                      Submitted{timeOf(r.updated_at) ? ` · ${timeOf(r.updated_at)}` : ''}
                      {r.reviewed_by && status !== 'pending' ? ` · Reviewed by ${r.reviewed_by}` : ''}
                    </span>
                  </span>
                  <span className={meta.className}>{meta.label}</span>
                  <span className="sra-chev" aria-hidden="true">{open ? '−' : '+'}</span>
                </button>

                {open && (
                  <div className="sra-report-body">
                    <ReportView
                      panel="social"
                      data={r.data || {}}
                      assignedTasks={assignedByName[`${String(r.reporter_name || '').trim()}::${date}`] || []}
                    />
                  </div>
                )}

                {status === 'rejected' && r.review_note && (
                  <div className="sra-note">
                    <span className="sra-note-label">Query / Suggestion</span>
                    <span className="sra-note-text">{r.review_note}</span>
                  </div>
                )}

                {status === 'pending' && (
                  <div className="sra-review-bar">
                    <button
                      type="button"
                      className="sra-btn sra-accept"
                      disabled={busy}
                      onClick={() => review(r, 'accepted')}
                    >
                      &#10003; Accept
                    </button>
                    <button
                      type="button"
                      className="sra-btn sra-reject"
                      disabled={busy}
                      onClick={() => openReject(r)}
                    >
                      &#10007; Reject
                    </button>
                    {busy && <span className="sra-saving">Saving…</span>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {rejectTarget && (
        <div className="sra-modal-overlay" role="dialog" aria-modal="true" aria-label="Reject report" onClick={closeReject}>
          <div className="sra-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sra-modal-title">Reject report</h3>
            <p className="sra-modal-sub">
              {rejectTarget.reporter_name || 'This member'}&rsquo;s report will be rejected and a
              pending task will be raised on their board.
            </p>
            <label className="sra-modal-label" htmlFor="sra-reject-note">
              Query / Suggestion <span className="sra-modal-optional">(optional)</span>
            </label>
            <textarea
              id="sra-reject-note"
              className="sra-modal-input"
              rows={4}
              maxLength={4000}
              placeholder="What should the member fix or clarify?"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              autoFocus
            />
            <div className="sra-modal-actions">
              <button type="button" className="sra-btn" onClick={closeReject}>Cancel</button>
              <button type="button" className="sra-btn sra-reject-solid" onClick={confirmReject}>
                Reject &amp; raise task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
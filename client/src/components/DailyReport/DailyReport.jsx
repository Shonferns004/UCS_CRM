import { useState, useEffect, useCallback, useRef } from 'react'
import { DatePicker } from '../ui'
import { toast as globalToast } from '../Toast'
import { updateTaskAssignment } from '../../api/taskAssignments'
import { fetchMyDailyReport, fetchDailyReports, saveDailyReport } from '../../api/dailyReports'

// Shared daily-report screen used by the Developer and Social Media reports
// (and ready for any panel that adds a config). The page is config-driven:
//
//   sections     manual, hand-typed fields grouped by section, persisted in
//                daily_reports.data as { "<sectionId>": { "<fieldId>": text } }
//   loadSummary  optional async (date) => { cards: [{ label, value, sub }] }
//                for the countable half — derived live from the panel's own
//                endpoints, never stored, so it can never go stale.
//
// One reporter owns their own row per (panel, date); a second reporter filling
// the same day gets their own row rather than overwriting the first.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// The IST calendar day of a timestamp, as 'YYYY-MM-DD'. Mirrors istDateOf() in
// panels/hr/components/Reports.jsx: bucketing by UTC would roll the day over at
// 05:30 IST and disagree with the backend's Asia/Kolkata-pinned sessions.
const istDateOf = (ts) => {
  if (!ts) return null
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10)
}

const todayIst = () => istDateOf(Date.now())
const shiftDay = (iso, n) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

// A date as "Mon, 6 Oct 2026" for the team-schedule headings. Anything that is
// not a strict ISO day is passed through untouched so a weird row still reads.
const fmtDay = (iso) => {
  const text = String(iso ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || '—'
  return new Date(`${text}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const emptyData = (sections) => {
  const out = {}
  for (const s of sections) {
    out[s.id] = {}
    for (const f of s.fields) out[s.id][f.id] = f.type === 'checklist' || f.type === 'rows' ? [] : ''
  }
  return out
}

// A checklist is stored as [{ text, done }]. Tolerate legacy shapes (plain
// strings) so an older row still opens without throwing.
// A task list is stored as [{ text, status, done }] where status is one of
// 'pending' | 'wip' | 'done'. `done` is kept (always status === 'done') so rows
// written before WIP existed keep working.
const TASK_STATUSES = ['pending', 'wip', 'done']
const toTask = (text, status) => ({ text, status, done: status === 'done' })
const normalizeChecklist = (raw) => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (item && typeof item === 'object') {
        const status = TASK_STATUSES.includes(item.status) ? item.status : (item.done ? 'done' : 'pending')
        return toTask(String(item.text ?? ''), status)
      }
      return toTask(String(item ?? ''), 'pending')
    })
    .filter((it) => it.text.trim() !== '')
}

// A pending-task table is stored as [{ task, reason, expected }]. Tolerate a
// legacy plain string (the old single field) by turning it into one task row.
// A `columns` config widens it to a fully generic table: every column becomes a
// stored key (position/required/…, candidate/date/recruiter), and missing keys
// hydrate as an empty string so an older row still opens without throwing.
const defaultRowColumns = [
  { key: 'task', label: 'Task' },
  { key: 'reason', label: 'Reason for pending' },
  { key: 'expected', label: 'Expected completion' },
]
const rowColumns = (f) => (Array.isArray(f?.columns) && f.columns.length > 0 ? f.columns : defaultRowColumns)
const normalizeRows = (raw, columns) => {
  const cols = columns.map((c) => c.key)
  const empty = () => Object.fromEntries(cols.map((k) => [k, '']))
  const onlyFirstCol = (item) =>
    Object.fromEntries(cols.map((k, i) => [k, i === 0 ? String(item ?? '') : '']))
  if (typeof raw === 'string') return raw.trim() ? [onlyFirstCol(raw.trim())] : []
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (item && typeof item === 'object') {
        const out = empty()
        for (const k of cols) out[k] = String(item[k] ?? '')
        return out
      }
      return onlyFirstCol(item)
    })
    .filter((it) => cols.some((k) => it[k].trim() !== ''))
}

const hydrate = (sections, saved) => {
  const base = emptyData(sections)
  if (saved && typeof saved === 'object') {
    for (const s of sections) {
      const sd = saved[s.id]
      if (!sd || typeof sd !== 'object') continue
      for (const f of s.fields) {
        if (sd[f.id] == null) continue
        base[s.id][f.id] = f.type === 'checklist' || f.type === 'rows'
          ? (f.type === 'rows' ? normalizeRows(sd[f.id], rowColumns(f)) : normalizeChecklist(sd[f.id]))
          : String(sd[f.id])
      }
    }
  }
  return base
}

// Interactive checklist: type a task + Add (or Enter) to append it as pending;
// ticking a task moves it into the Done group; × removes it.
// Task board: type a task + Add (or Enter), then move it between Pending, WIP
// and Done with the buttons on its card; × removes it.
const TASK_COLUMNS = [
  { id: 'pending', label: 'Pending' },
  { id: 'wip', label: 'WIP' },
  { id: 'done', label: 'Done' },
]

function ChecklistField({ value, onChange, placeholder, assignedTasks = [], onAssignedStatus, updatingId }) {
  const items = Array.isArray(value) ? value : []
  const [draft, setDraft] = useState('')
  const [draftStatus, setDraftStatus] = useState('pending')
  const add = () => {
    const text = draft.trim()
    if (!text) return
    onChange([...items, toTask(text, draftStatus)])
    setDraft('')
  }
  const setStatusAt = (idx, status) => onChange(items.map((it, i) => (i === idx ? toTask(it.text, status) : it)))
  const removeAt = (idx) => onChange(items.filter((_, i) => i !== idx))
  const indexed = items.map((it, i) => ({ it, i }))
  // Tasks a manager assigned to this reporter, shown as cards in the same board
  // as the reporter's own tasks. They are not part of `data`, so changing their
  // status goes through onAssignedStatus rather than onChange.
  const assigned = assignedTasks.map((t) => ({
    ...t,
    status: TASK_STATUSES.includes(t.status) ? t.status : 'pending',
    day: istDateOf(t.task_date),
  }))
  const empty = items.length === 0 && assigned.length === 0
  return (
    <div className="dr-check">
      <div className="dr-check-add">
        <input
          className="dr-input"
          value={draft}
          placeholder={placeholder || 'Add a task…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <select className="dr-input dr-check-status-pick" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} aria-label="Status of the new task">
          {TASK_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
      {empty && <div className="dr-muted">No tasks yet — add one above.</div>}
      {!empty && (
        <div className="dr-board">
          {TASK_COLUMNS.map((col) => {
            const colItems = indexed.filter(({ it }) => it.status === col.id)
            const colAssigned = assigned.filter((t) => t.status === col.id)
            return (
              <div key={col.id} className={`dr-col dr-col-${col.id}`}>
                <div className="dr-col-head">
                  <span>{col.label}</span>
                  <span className="dr-col-count">{colItems.length + colAssigned.length}</span>
                </div>
                {colItems.length === 0 && colAssigned.length === 0 && <div className="dr-col-empty">No tasks</div>}
                {colItems.map(({ it, i }) => (
                  <div key={i} className={`dr-task dr-task-${it.status}`}>
                    <div className="dr-task-top">
                      <span className="dr-task-text">{it.text}</span>
                      <button type="button" className="dr-check-del" onClick={() => removeAt(i)} title="Remove" aria-label="Remove task">×</button>
                    </div>
                    <div className="dr-task-actions" role="group" aria-label="Move task">
                      {TASK_COLUMNS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`dr-task-btn dr-task-btn-${c.id}${it.status === c.id ? ' on' : ''}`}
                          aria-pressed={it.status === c.id}
                          onClick={() => it.status !== c.id && setStatusAt(i, c.id)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {colAssigned.map((t) => (
                  <div key={`assigned-${t.id}`} className={`dr-task dr-task-${col.id} dr-task-assigned`}>
                    <div className="dr-task-text">{t.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
                      Assigned{t.assigned_by_name ? ` · ${t.assigned_by_name}` : ''}{t.day ? ` · ${fmtDay(t.day)}` : ''}
                    </div>
                    <div className="dr-task-actions" role="group" aria-label="Update assigned task">
                      {TASK_COLUMNS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`dr-task-btn dr-task-btn-${c.id}${t.status === c.id ? ' on' : ''}`}
                          aria-pressed={t.status === c.id}
                          disabled={updatingId === t.id}
                          onClick={() => t.status !== c.id && onAssignedStatus && onAssignedStatus(t.id, c.id)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Generic row table: one input per configured column (Task / Reason / Expected
// for HR pending tasks, Position / Required / Interviewed / … for recruitment),
// with × to drop a row and an Add row beneath. Stored as an array of objects
// whose keys are the column keys.
function RowsField({ value, columns, onChange, placeholder }) {
  const rows = Array.isArray(value) ? value : []
  const [draft, setDraft] = useState(() => Object.fromEntries(columns.map((c) => [c.key, ''])))
  const setAt = (idx, patch) => onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const add = () => {
    if (!draft[columns[0].key]?.trim()) return
    onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, draft[c.key].trim()]))])
    setDraft(Object.fromEntries(columns.map((c) => [c.key, ''])))
  }
  const removeAt = (idx) => onChange(rows.filter((_, i) => i !== idx))
  return (
    <div className="dr-rows">
      <div className="dr-rows-head" aria-hidden="true">
        {columns.map((c) => <span key={c.key}>{c.label}</span>)}
        <span />
      </div>
      {rows.length === 0 && <div className="dr-muted">No rows yet — add one below.</div>}
      {rows.map((r, i) => (
        <div className="dr-rows-row" key={i}>
          {columns.map((c) => (
            <input
              key={c.key}
              className="dr-input"
              value={r[c.key] ?? ''}
              placeholder={c.label}
              onChange={(e) => setAt(i, { [c.key]: e.target.value })}
            />
          ))}
          <button type="button" className="dr-check-del" onClick={() => removeAt(i)} title="Remove row" aria-label="Remove row">×</button>
        </div>
      ))}
      <div className="dr-rows-row dr-rows-add">
        {columns.map((c, i) => (
          <input
            key={c.key}
            className="dr-input"
            value={draft[c.key]}
            placeholder={i === 0 && placeholder ? placeholder : c.label}
            onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          />
        ))}
        <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!draft[columns[0].key]?.trim()}>Add</button>
      </div>
    </div>
  )
}

export default function DailyReport({
  panel,
  title,
  subtitle,
  sections = [],
  summaryTitle = 'Today at a glance',
  loadSummary,
  loadAssignedTasks,
  loadTeamTasks,
  notify,
  lockToToday = false,
}) {
  // The dev panel mounts its own ToastProvider, not the global ToastContainer,
  // so callers can hand in their local toast; HR (and others) use the global one.
  const toast = notify || globalToast
  const [date, setDate] = useState(todayIst())
  const [data, setData] = useState(() => emptyData(sections))
  const [summary, setSummary] = useState(null)
  const [assigned, setAssigned] = useState([])
  const [teamTasks, setTeamTasks] = useState([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reporterName, setReporterName] = useState('')
  const [reporters, setReporters] = useState([])
  const [remark, setRemark] = useState(null)
  const [remarkBy, setRemarkBy] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(emptyData(sections)))
  const snapshotRef = useRef(savedSnapshot)

  const dirty = JSON.stringify(data) !== savedSnapshot

  const setAssignedStatus = async (id, status) => {
    if (updatingId) return
    setUpdatingId(id)
    try {
      await updateTaskAssignment(id, status)
      setAssigned((list) => list.map((t) => (String(t.id) === String(id) ? { ...t, status } : t)))
    } catch (err) {
      toast(err.message || 'Could not update the task status', 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  const load = useCallback(async (d) => {
    setLoading(true)
    try {
      const res = await fetchMyDailyReport(panel, d)
      const next = hydrate(sections, res?.report?.data || {})
      setData(next)
      const snap = JSON.stringify(next)
      setSavedSnapshot(snap)
      snapshotRef.current = snap
      setReporterName(res?.reporter_name || '')
      setRemark(res?.report?.remark || null)
      setRemarkBy(res?.report?.remark_by || null)
      setLastSavedAt(res?.report?.updated_at || null)
    } catch (err) {
      toast(err.message || 'Could not load the report', 'error')
    } finally {
      setLoading(false)
    }
    // Who has filled this panel today — a nudge when someone is missing.
    try {
      const all = await fetchDailyReports(panel, d)
      setReporters((all?.reports || []).map((r) => r.reporter_name).filter(Boolean))
    } catch {
      setReporters([])
    }
    if (loadSummary) {
      setSummaryLoading(true)
      try {
        setSummary(await loadSummary(d))
      } catch {
        setSummary(null)
      } finally {
        setSummaryLoading(false)
      }
    }
    // Tasks a manager assigned to this reporter — merged into the reporter's own
    // task board (see the checklist section) and never written into `data`.
    if (loadAssignedTasks) {
      try {
        setAssigned((await loadAssignedTasks(d)) || [])
      } catch {
        setAssigned([])
      }
    }
    // The whole team's assignments (optionally filtered by the caller), shown
    // date-wise below the report so the panel sees who is doing what, when.
    if (loadTeamTasks) {
      setTeamLoading(true)
      try {
        setTeamTasks((await loadTeamTasks(d)) || [])
      } catch {
        setTeamTasks([])
      } finally {
        setTeamLoading(false)
      }
    }
    // sections / loadSummary are module-level constants in every caller, so
    // [panel, date] is the only thing that actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, date])

  useEffect(() => { load(date) }, [date, load])

  // A tab left open across midnight kept the previous day's date, so a report
  // finished the next morning was filed onto the old day and the head reviewing
  // "today" never saw it. When the IST day rolls over, follow it — unless the
  // reporter deliberately navigated to another date.
  const todayRef = useRef(todayIst())
  useEffect(() => {
    const id = setInterval(() => {
      const now = todayIst()
      if (now !== todayRef.current) {
        const prev = todayRef.current
        todayRef.current = now
        setDate((d) => (d === prev ? now : d))
      }
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const pickDate = (next) => {
    const value = typeof next === 'string' ? next : (next?.target?.value ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    if (value > todayIst()) { toast('A daily report cannot be for a future date.', 'error'); return }
    setDate(value)
  }

  const setField = (sectionId, fieldId, value) => {
    setData((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], [fieldId]: value } }))
  }

  const save = async () => {
    if (saving || !dirty) return
    setSaving(true)
    try {
      await saveDailyReport(panel, date, data)
      const snap = JSON.stringify(data)
      setSavedSnapshot(snap)
      snapshotRef.current = snap
      setLastSavedAt(new Date().toISOString())
      toast('Report saved', 'success')
    } catch (err) {
      toast(err.message || 'Could not save the report', 'error')
    } finally {
      setSaving(false)
    }
  }

  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : 'Not saved yet'

  // The team's assignments bucketed by their task date, dates ascending and the
  // members inside a day A→Z, so the schedule always reads the same way.
  const teamGroups = (() => {
    const map = new Map()
    for (const t of teamTasks) {
      const day = istDateOf(t.task_date) || '—'
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(t)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, list]) => [
        day,
        list.slice().sort((a, b) => String(a.assignee_name || '').localeCompare(String(b.assignee_name || ''))),
      ])
  })()

  return (
    <div className="dr-root">
      <div className="dr-print-only dr-masthead">
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12 }}>Date: {date}</div>
      </div>

      <div className="dr-head no-print">
        <div>
          <h2 className="dr-title">{title}</h2>
          {subtitle && <p className="dr-sub">{subtitle}</p>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="card dr-toolbar no-print">
        <div className="dr-toolbar-row">
          <span className="dr-toolbar-label">Report date</span>
          {lockToToday ? (
            <span className="dr-toolbar-today">
              {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : (
            <>
              <DatePicker value={date} onChange={pickDate} max={todayIst()} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => pickDate(todayIst())}>Today</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => pickDate(shiftDay(todayIst(), -1))}>Yesterday</button>
            </>
          )}
        </div>
        <div className="dr-toolbar-row dr-toolbar-right">
          <span className={`dr-status${dirty ? ' dirty' : ''}`}>
            {dirty ? 'Unsaved changes' : `Saved · ${savedLabel}`}
          </span>
          <button type="button" className="btn btn-outline" onClick={() => window.print()} disabled={loading}>Print</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save report'}
          </button>
        </div>
      </div>

      {reporters.length > 0 && (
        <div className="dr-reporters no-print">
          <span className="dr-toolbar-label">Filled today:</span>
          {reporters.map((r, i) => <span key={`${r}-${i}`} className="dr-chip">{r}</span>)}
        </div>
      )}

      {remark && (
        <div className="dr-remark">
          <div className="dr-remark-label">HOD remark{remarkBy ? ` · ${remarkBy}` : ''}</div>
          <div className="dr-remark-text">{remark}</div>
        </div>
      )}

      {/* Derived summary (never stored) */}
      {loadSummary && (
        <div className="dr-block">
          <div className="dr-print-only print-section-title">{summaryTitle}</div>
          <h3 className="dr-section-title no-print">{summaryTitle}</h3>
          {summaryLoading && <div className="dr-muted">Loading summary…</div>}
          {!summaryLoading && summary?.cards?.length > 0 && (
            <div className="dr-kpis">
              {summary.cards.map((c, i) => (
                <div key={`${c.label}-${i}`} className="dr-kpi">
                  <div className="dr-kpi-value">{c.value ?? '—'}</div>
                  <div className="dr-kpi-label">{c.label}</div>
                  {c.sub && <div className="dr-kpi-sub">{c.sub}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual sections */}
      {sections.map((s) => (
        <div className="dr-block" key={s.id}>
          <div className="dr-print-only print-section-title">{s.label}</div>
          <h3 className="dr-section-title no-print">
            {s.label}
            {s.description && <span className="dr-section-desc">{s.description}</span>}
          </h3>
          <div className="dr-grid">
            {s.fields.map((f) => {
              const value = data[s.id]?.[f.id] ?? ''
              if (f.type === 'rows') {
                const rows = Array.isArray(value) ? value : []
                const columns = rowColumns(f)
                return (
                  <div key={f.id} className="dr-field full">
                    <span className="dr-field-label">
                      {f.label}
                      {f.description && <span className="dr-section-desc"> · {f.description}</span>}
                    </span>
                    <div className="no-print">
                      <RowsField value={rows} columns={columns} onChange={(v) => setField(s.id, f.id, v)} placeholder={f.placeholder} />
                    </div>
                    <div className="dr-print-only">
                      {rows.length === 0 ? (
                        <div>—</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {columns.map((c) => (
                                <th key={c.key} style={{ border: '1px solid #000', padding: 4, fontSize: 11, textAlign: 'left' }}>{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((it, i) => (
                              <tr key={i}>
                                {columns.map((c) => (
                                  <td key={c.key} style={{ border: '1px solid #000', padding: 4, fontSize: 11 }}>{it[c.key] ?? ''}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )
              }
              if (f.type === 'checklist') {
                const items = Array.isArray(value) ? value : []
                return (
                  <div key={f.id} className="dr-field full">
                    <span className="dr-field-label">{f.label}</span>
                    <div className="no-print">
                      <ChecklistField
                        value={items}
                        onChange={(v) => setField(s.id, f.id, v)}
                        placeholder={f.placeholder}
                        assignedTasks={f.mergeAssigned ? assigned : []}
                        onAssignedStatus={setAssignedStatus}
                        updatingId={updatingId}
                      />
                    </div>
                    <div className="dr-print-only">
                      {items.length === 0 ? (
                        <div>—</div>
                      ) : (
                        <ul>
                          {items.map((it, i) => <li key={i}>{it.done ? '✓ ' : '○ '}{it.text}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              }
              const full = f.type === 'textarea' || f.type === 'lines' || f.full
              return (
                <label key={f.id} className={`dr-field${full ? ' full' : ''}`}>
                  <span className="dr-field-label">{f.label}</span>
                  {f.type === 'textarea' || f.type === 'lines' ? (
                    <textarea
                      className="dr-input dr-textarea"
                      rows={f.rows || 3}
                      value={value}
                      placeholder={f.type === 'lines' ? 'One per line' : f.placeholder}
                      onChange={(e) => setField(s.id, f.id, e.target.value)}
                    />
                  ) : (
                    <input
                      className="dr-input"
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={value}
                      placeholder={f.placeholder}
                      onChange={(e) => setField(s.id, f.id, e.target.value)}
                    />
                  )}
                </label>
              )
            })}
          </div>
        </div>
      ))}

      {loadTeamTasks && (
        <div className="dr-block">
          <h3 className="dr-section-title">Team Tasks — by date</h3>
          {teamLoading && <div className="dr-muted">Loading team tasks…</div>}
          {!teamLoading && teamGroups.length === 0 && (
            <div className="dr-muted">No tasks assigned to the team this month.</div>
          )}
          {!teamLoading && teamGroups.map(([day, list]) => (
            <div key={day} className="dr-team-day">
              <div className="dr-team-date">{fmtDay(day)}</div>
              <div className="dr-team-grid">
                {list.map((t) => {
                  const st = TASK_STATUSES.includes(t.status) ? t.status : 'pending'
                  return (
                    <div key={t.id} className={`dr-task dr-task-${st}`}>
                      <div className="dr-task-text">{t.title}</div>
                      <div className="dr-team-meta">
                        {t.assignee_name || '—'}{t.content_type ? ` · ${t.content_type}` : ''}
                        {t.assigned_by_name ? ` · by ${t.assigned_by_name}` : ''}
                      </div>
                      <span className={`dr-team-status dr-team-status-${st}`}>{st}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dr-print-only dr-sign">
        <div>Reported by: {reporterName || '____________________'}</div>
        <div>Verified by: ____________________</div>
      </div>
    </div>
  )
}
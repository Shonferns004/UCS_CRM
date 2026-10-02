import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Select, SearchInput, Badge, StatusPill, Empty } from '../components/ui.jsx'
import {
  fetchWorkspaceNgos,
  fetchSectors,
  fetchActivities,
  fetchCalendarEvents,
  createActivity,
  createEvent,
  suggestActivityPrograms,
  fetchPlannerSuggestions,
  setPlannerSuggestionSelected,
} from '../store.jsx'

/* ── Month helpers (local, so this page shares nothing with the Calendar) ── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const pad2 = (n) => String(n).padStart(2, '0')

/** Never toISOString() here — IST midnight is the previous day in UTC. */
const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const currentMonthYmd = () => {
  const n = new Date()
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}`
}

const monthLabel = (ymd) => {
  const [y, m] = String(ymd).split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/** [firstOfMonth, firstOfNextMonth) — the backend's end bound is exclusive. */
const monthBounds = (ymd) => {
  const [y, m] = String(ymd).split('-').map(Number)
  return [`${ymd}-01`, toYmd(new Date(y, m, 1))]
}

/** Every selectable day of the month: the user picks the date, not the AI. */
const daysInMonth = (ymd) => {
  const [y, m] = String(ymd).split('-').map(Number)
  const total = new Date(y, m, 0).getDate()
  return Array.from({ length: total }, (_, i) => `${ymd}-${pad2(i + 1)}`)
}

const shortDate = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number)
  if (!y || !m || !d) return String(ymd || '')
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`
}

/* ── Report helpers (date-wise monthly planner download) ─────────────────── */

// The report is date-wise, so it must NOT go through toISOString(): in IST,
// midnight of the 1st is the previous evening in UTC and every date would slip
// back a day.
const reportDate = (d) => `${pad2(d.getDate())}-${MONTHS[d.getMonth()].slice(0, 3)}-${String(d.getFullYear()).slice(2)}`

/** "Completed" reads as Done in the report; the rest keep their own label. */
const doneLabel = (status) => {
  const s = String(status || '').trim()
  if (!s) return ''
  if (s.toLowerCase() === 'completed') return 'Done'
  return s
}

const REPORT_SOCIAL_COLS = ['Post/Static', 'Reel /Thumbnail', 'Carousel Post', 'Post/YouTube', 'Images Send']

/* ── Shared pieces ──────────────────────────────────────────────────────── */

const LABEL = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--eh-ink-soft)' }

/* Self-contained scrollbar styling for the modal bodies.
   Deliberately NOT .eh-scroll: that rule lives in calendar.css, which belongs to
   the Calendar page. Depending on it here would make this page's scrollbars
   break silently if that stylesheet is ever moved. */
const SCROLLBAR_CSS = `
.ap-scroll { scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: #b9bcd0 #eef0f7; }
.ap-scroll::-webkit-scrollbar { width: 11px; height: 11px; }
.ap-scroll::-webkit-scrollbar-track { background: #eef0f7; border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
.ap-scroll::-webkit-scrollbar-thumb { background: #b9bcd0; border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
.ap-scroll::-webkit-scrollbar-thumb:hover { background: #9498b0; background-clip: padding-box; }
`

function ModalShell({ title, subtitle, onClose, children, footer, width = 640 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,35,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}
    >
      <div style={{ width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--eh-line)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--eh-ink)' }}>{title}</h3>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button className="eh-btn eh-btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {/* minHeight:0 is load-bearing — without it the body never scrolls. */}
        <div className="ap-scroll" style={{ padding: 18, overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: '13px 18px', borderTop: '1px solid var(--eh-line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={LABEL}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--eh-ink-faint)' }}>{hint}</span>}
    </label>
  )
}

/* ── Step 3 · Add Activity (NGO-wise) ────────────────────────────────────── */

function AddActivityModal({ ngo, sectors, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!ngo) return setError('Choose an NGO first.')
    if (!name.trim()) return setError('Activity name is required.')
    if (!sectorId) return setError('Choose a sector for the activity.')
    setBusy(true); setError('')
    try {
      const created = await createActivity({
        name: name.trim(),
        sector_id: Number(sectorId),
        ngo_id: ngo.id,
        description: description.trim() || null,
      })
      onSaved(created)
    } catch (e) {
      setError(e?.message || 'Could not save the activity.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title="Add Activity"
      subtitle={ngo ? `New activity for ${ngo.name}` : 'New activity'}
      onClose={onClose}
      footer={
        <>
          <button className="eh-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="eh-btn eh-btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save Activity'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!ngo && (
          <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--eh-warn-soft, #fff8e1)', color: 'var(--eh-ink)', fontSize: 13 }}>
            Pick an NGO in step 1 before adding an activity.
          </div>
        )}

        <Field label="NGO">
          <input className="eh-select" value={ngo ? ngo.name : ''} disabled placeholder="From step 1" readOnly />
        </Field>

        <Field label="Sector" hint="Every activity must belong to exactly one sector.">
          <Select value={sectorId} onChange={setSectorId}>
            <option value="">Select a sector…</option>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>

        <Field label="Activity name" hint="E.g. Computer Literacy Training">
          <input
            className="eh-select"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What does this NGO do under this sector?"
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            className="eh-select"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short note about the beneficiaries and the aim."
          />
        </Field>

        {error && (
          <div style={{ padding: '10px 13px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13 }}>{error}</div>
        )}
      </div>
    </ModalShell>
  )
}

/* ── AI programme suggestions for one activity ──────────────────────────── */

function SuggestModal({ activity, ngo, month, onClose, onPlan }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(() => new Set())
  // Ticks live server-side; this is only the optimistic mirror of them.
  const [selected, setSelected] = useState(() => new Set())

  const monthNum = Number(String(month).split('-')[1])
  const yearNum = Number(String(month).split('-')[0])

  /* Reopening the modal restores what the user ticked last time, so selecting
     ideas is not lost by closing the modal or reloading the page. */
  useEffect(() => {
    let alive = true
    fetchPlannerSuggestions({ ngo_id: ngo?.id, activity_id: activity?.id, month: monthNum, year: yearNum })
      .then((list) => {
        if (!alive) return
        setSelected(new Set((list || []).filter((s) => s?.is_selected).map((s) => Number(s.id))))
      })
      .catch(() => { /* keep whatever is on screen */ })
    return () => { alive = false }
  }, [activity?.id, ngo?.id, monthNum, yearNum])

  const toggleSelected = async (s) => {
    if (!s?.id) return
    const id = Number(s.id)
    const next = !selected.has(id)
    setSelected((prev) => {
      const c = new Set(prev)
      if (next) c.add(id); else c.delete(id)
      return c
    })
    try {
      await setPlannerSuggestionSelected(id, next)
    } catch (e) {
      // Roll back so the tick never lies about what the server has stored.
      setSelected((prev) => {
        const c = new Set(prev)
        if (next) c.delete(id); else c.add(id)
        return c
      })
    }
  }

  const run = useCallback(async () => {
    setLoading(true)
    try {
      const res = await suggestActivityPrograms({ activityId: activity.id, ngoId: ngo?.id, month })
      setData(res)
      setDismissed(new Set())
      // Newly returned rows carry their own is_selected, so ticks that were
      // already saved survive regenerating the batch.
      setSelected(new Set((res?.suggestions || []).filter((s) => s?.is_selected).map((s) => Number(s.id))))
    } catch (e) {
      setData({ suggestions: [], observances: [], ai: { available: false, reason: e?.message || 'Could not reach the server.' } })
    } finally {
      setLoading(false)
    }
  }, [activity?.id, ngo?.id, month])

  const ai = data?.ai
  // Keep the server-side index alongside each card so dismissing one does not
  // shift the others' identity.
  const cards = (data?.suggestions || [])
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !dismissed.has(i))

  const observances = data?.observances || []

  return (
    <ModalShell
      title="Programme Suggestions"
      subtitle={`${activity.name} · ${monthLabel(month)}${ngo ? ` · ${ngo.name}` : ''}`}
      onClose={onClose}
      width={760}
      footer={<button className="eh-btn" onClick={onClose}>Close</button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button className="eh-btn eh-btn-primary" onClick={run} disabled={loading}>
            {loading ? 'Asking AI… (this can take 10–60s)' : data ? 'Suggest again' : 'Suggest programmes'}
          </button>
          {activity.sector_name && <Badge tone="secondary">{activity.sector_name}</Badge>}
          {ai?.model && <Badge tone="muted">{ai.model}</Badge>}
        </div>

        {/* Real festival dates for the month, straight from the reference
            calendar. The model reads these as themes and can never emit a date. */}
        {observances.length > 0 && (
          <div style={{ border: '1px solid var(--eh-line)', borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ ...LABEL, marginBottom: 7 }}>Observances in {monthLabel(month)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {observances.slice(0, 14).map((o, k) => (
                <span key={`${o.date}-${o.name}-${k}`} style={{ fontSize: 11, fontWeight: 600, background: 'var(--eh-tint-1)', borderRadius: 6, padding: '3px 7px', color: 'var(--eh-ink)' }}>
                  {shortDate(o.date)} · {o.name}
                </span>
              ))}
              {observances.length > 14 && (
                <span style={{ fontSize: 11, color: 'var(--eh-ink-faint)' }}>+{observances.length - 14} more</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--eh-ink-faint)', marginTop: 7 }}>
              ✓ Verified dates · from the reference calendar, not AI
            </div>
          </div>
        )}

        {loading && (
          <div style={{ fontSize: 13, color: 'var(--eh-ink-soft)' }}>
            Reading {activity.name} and the month&apos;s festivals, then asking the model for programme ideas…
          </div>
        )}

        {!loading && ai && !ai.available && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--eh-warn-soft, #fff8e1)', color: 'var(--eh-ink)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <b>AI suggestions are unavailable.</b>
            <span style={{ color: 'var(--eh-ink-soft)' }}>{ai.reason}</span>
            <span style={{ color: 'var(--eh-ink-soft)' }}>
              You can still plan this activity by hand — use “Add programme” on its row.
            </span>
          </div>
        )}

        {!loading && ai?.available && cards.length === 0 && (
          <Empty icon="✦">
            {ai.truncated
              ? 'The model ran out of room before returning a usable idea. Try again.'
              : 'No suggestions came back for this activity. Try again, or plan it by hand.'}
          </Empty>
        )}

        {!loading && ai?.available && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--eh-ink-faint)' }}>
            <span>✦ Suggested programmes — AI ideas, you pick what to plan</span>
            {ai.truncated && <Badge tone="warn">Response was cut short — these may not be all the ideas</Badge>}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cards.map(({ s, i }) => (
            <div key={`${i}-${s.title}`} style={{ border: '1px solid var(--eh-line)', borderLeft: '3px solid var(--eh-secondary)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--eh-ink)' }}>{s.title}</span>
                {s.format && <Badge tone="primary">{s.format}</Badge>}
                {s.priority && <Badge tone={s.priority === 'Urgent' || s.priority === 'High' ? 'warn' : 'muted'}>{s.priority}</Badge>}
              </div>
              {(s.audience || s.duration) && (
                <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)' }}>
                  {[s.audience ? `Target group: ${s.audience}` : '', s.duration ? `Duration: ${s.duration}` : ''].filter(Boolean).join(' · ')}
                </div>
              )}
              {s.objective && (
                <div style={{ fontSize: 12.5, color: 'var(--eh-ink)' }}>
                  <b style={{ fontWeight: 700 }}>Objective: </b>{s.objective}
                </div>
              )}
              {s.rationale && (
                <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)' }}>
                  <b style={{ fontWeight: 700 }}>Why: </b>{s.rationale}
                </div>
              )}
              {s.materials?.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--eh-ink-soft)' }}>
                  <b style={{ fontWeight: 700 }}>Materials: </b>{s.materials.join(', ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="eh-btn eh-btn-primary eh-btn-sm" onClick={() => onPlan(s)}>Add as programme</button>
                <button
                  className="eh-btn eh-btn-sm"
                  onClick={() => setDismissed((prev) => new Set(prev).add(i))}
                >
                  Dismiss
                </button>
                {/* Ticking feeds the downloadable monthly report. Saved as a
                    programme instead? That option is right beside it. */}
                <label
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
                    fontSize: 12, fontWeight: 600, cursor: s?.id ? 'pointer' : 'not-allowed',
                    color: selected.has(Number(s?.id)) ? 'var(--eh-success)' : 'var(--eh-ink-soft)',
                  }}
                  title={s?.id ? 'Include this suggestion in the downloaded monthly report' : 'Save this batch first, then you can include it in the report'}
                >
                  <input
                    type="checkbox"
                    checked={s?.id ? selected.has(Number(s.id)) : false}
                    disabled={!s?.id}
                    onChange={() => toggleSelected(s)}
                    style={{ width: 15, height: 15, cursor: s?.id ? 'pointer' : 'not-allowed', accentColor: 'var(--eh-primary)' }}
                  />
                  Include in report
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  )
}

/* ── Turn a suggestion (or a blank slate) into a real programme ──────────── */

function PlanModal({ entry, ngo, month, onClose, onSaved }) {
  const { activity, suggestion } = entry
  const days = useMemo(() => daysInMonth(month), [month])

  const [name, setName] = useState(suggestion?.title || activity?.name || '')
  const [date, setDate] = useState(days[0] || '')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('13:00')
  const [venue, setVenue] = useState('')
  const [status, setStatus] = useState('Draft')
  const [priority, setPriority] = useState(suggestion?.priority || 'Medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const description = [
    `Planned for ${monthLabel(month)}.`,
    activity ? `Activity: ${activity.name}.` : '',
    suggestion?.audience ? `Target group: ${suggestion.audience}.` : '',
    suggestion?.duration ? `Duration: ${suggestion.duration}.` : '',
    suggestion?.objective || '',
    suggestion?.rationale || '',
    suggestion?.materials?.length ? `Materials: ${suggestion.materials.join(', ')}.` : '',
    suggestion ? 'Suggested by AI — review before submitting.' : '',
  ].filter(Boolean).join('\n')

  const submit = async () => {
    if (!name.trim()) return setError('Programme name is required.')
    if (!date) return setError('Choose a date.')
    if (startTime && endTime && endTime < startTime) return setError('End time must be after start time.')
    setBusy(true); setError('')
    try {
      await createEvent({
        name: name.trim(),
        ngo_id: ngo?.id ?? activity?.ngo_id ?? null,
        sector_id: activity?.sector_id ?? null,
        activity_ids: activity?.id ? [activity.id] : [],
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        venue: venue.trim() || null,
        description: description || null,
        status,
        priority,
        category: suggestion?.format || null,
      })
      onSaved()
    } catch (e) {
      setError(e?.message || 'Could not create the programme.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title={suggestion ? 'Plan Programme' : 'Add Programme'}
      subtitle={`${monthLabel(month)}${ngo ? ` · ${ngo.name}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button className="eh-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="eh-btn eh-btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : status === 'Draft' ? 'Save Draft' : 'Create Programme'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Programme name">
          <input className="eh-select" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Date" hint="You pick the day — the AI only suggests the programme.">
            <Select value={date} onChange={setDate}>
              {days.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
            </Select>
          </Field>
          <Field label="Venue">
            <input className="eh-select" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Start time">
            <input className="eh-select" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="End time">
            <input className="eh-select" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={setStatus}>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={setPriority}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </Select>
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={LABEL}>Activity</span>
          <Badge tone="secondary">{activity?.name || '—'}</Badge>
          {activity?.sector_name && <span style={{ fontSize: 11, color: 'var(--eh-ink-faint)' }}>{activity.sector_name}</span>}
        </div>

        {suggestion && (
          <div style={{ border: '1px dashed var(--eh-line)', borderRadius: 12, padding: '11px 13px', fontSize: 12, color: 'var(--eh-ink-soft)', whiteSpace: 'pre-wrap' }}>
            {description}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 13px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13 }}>{error}</div>
        )}
      </div>
    </ModalShell>
  )
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function ActivityPlanner() {
  const navigate = useNavigate()

  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [ngoId, setNgoId] = useState('')
  const [month, setMonth] = useState(currentMonthYmd)
  const [sectorFilter, setSectorFilter] = useState('')
  const [search, setSearch] = useState('')

  const [activities, setActivities] = useState([])
  const [loadingActs, setLoadingActs] = useState(false)
  const [actsError, setActsError] = useState('')

  const [monthEvents, setMonthEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  const [toast, setToast] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [suggestFor, setSuggestFor] = useState(null)
  // Bumped after a programme is saved so the report reloads its ticks.
  const [suggestionsRev, setSuggestionsRev] = useState(0)
  // { activity, suggestion } — an object, not a bare suggestion, so "Add
  // programme" with no suggestion is still a distinct, openable state.
  const [planEntry, setPlanEntry] = useState(null)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear()
    return Array.from({ length: 7 }, (_, i) => now - 3 + i)
  }, [])

  /* Keep the "YYYY-MM" string in step with the Month / Year selects. */
  const setMonthPart = (part, value) => {
    const [y, m] = month.split('-')
    const next = part === 'year' ? `${value}-${m}` : `${y}-${pad2(Number(value) + 1)}`
    setMonth(next)
    setYear(Number(next.split('-')[0]))
  }

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2800) }

  const ngo = useMemo(() => ngos.find((n) => String(n.id) === String(ngoId)) || null, [ngos, ngoId])

  useEffect(() => {
    fetchWorkspaceNgos().then((l) => setNgos(Array.isArray(l) ? l : [])).catch(() => setNgos([]))
    fetchSectors().then((l) => setSectors(Array.isArray(l) ? l : [])).catch(() => setSectors([]))
  }, [])

  // Preselect when there is only one NGO, so a single-NGO Event Head lands on a
  // usable page instead of an empty step 1.
  useEffect(() => {
    if (!ngoId && ngos.length === 1) setNgoId(String(ngos[0].id))
  }, [ngos, ngoId])

  const loadActivities = useCallback(() => {
    if (!ngoId) { setActivities([]); setActsError(''); return }
    setLoadingActs(true); setActsError('')
    fetchActivities({ ngo_id: ngoId })
      .then((l) => setActivities(Array.isArray(l) ? l : []))
      .catch((e) => { setActivities([]); setActsError(e?.message || 'Could not load activities.') })
      .finally(() => setLoadingActs(false))
  }, [ngoId])

  const loadMonthEvents = useCallback(() => {
    if (!ngoId) { setMonthEvents([]); return }
    const [start, end] = monthBounds(month)
    setLoadingEvents(true)
    fetchCalendarEvents({ start, end, ngoId })
      .then((l) => setMonthEvents(Array.isArray(l) ? l : []))
      .catch(() => setMonthEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [ngoId, month])

  useEffect(() => { loadActivities() }, [loadActivities])
  useEffect(() => { loadMonthEvents() }, [loadMonthEvents])

  /* Bucket the month's events by activity id so each row can show what it
     already has. The calendar feed returns an activities[] array per event,
     which is all the matching this needs — no per-activity request. */
  const plannedByActivity = useMemo(() => {
    const map = new Map()
    for (const ev of monthEvents) {
      const p = ev.extendedProps || {}
      const title = String(ev.title || '').split(' · ')[0]
      for (const a of (p.activities || [])) {
        const key = String(a.id)
        if (!map.has(key)) map.set(key, [])
        map.get(key).push({ id: ev.id, title, date: String(p.date || '').slice(0, 10), status: p.status })
      }
    }
    return map
  }, [monthEvents])

  const rows = useMemo(() => {
    let list = activities
    if (sectorFilter) list = list.filter((a) => String(a.sector_id) === String(sectorFilter))
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((a) => [a.name, a.sector_name, a.description].filter(Boolean).join(' ').toLowerCase().includes(q))
    return list
  }, [activities, sectorFilter, search])

  const bySector = useMemo(() => {
    const groups = []
    for (const a of rows) {
      const key = a.sector_name || 'Uncategorised'
      const last = groups[groups.length - 1]
      if (!last || last.key !== key) groups.push({ key, rows: [a] })
      else last.rows.push(a)
    }
    return groups
  }, [rows])

  const isPlanned = (a) => (plannedByActivity.get(String(a.id)) || []).length > 0
  const plannedCount = rows.filter(isPlanned).length
  const unplannedCount = rows.filter((a) => !isPlanned(a)).length

  /* ── Selected AI suggestions for this NGO + month. Fetched for the report
        only, so the download reflects every tick the user made across all
        activities, not just the ones on screen. */
  const [selectedSuggestions, setSelectedSuggestions] = useState([])
  const reportRef = useRef(null)
  const [downloading, setDownloading] = useState('')

  const loadSelectedSuggestions = useCallback(() => {
    if (!ngoId) { setSelectedSuggestions([]); return Promise.resolve() }
    const [y, m] = month.split('-').map(Number)
    return fetchPlannerSuggestions({ ngo_id: ngoId, month: m, year: y, selected_only: true })
      .then((l) => setSelectedSuggestions(Array.isArray(l) ? l : []))
      .catch(() => setSelectedSuggestions([]))
  }, [ngoId, month])

  useEffect(() => { loadSelectedSuggestions() }, [loadSelectedSuggestions, suggestionsRev])

  /* One row per calendar day. Events already planned that day fill the row;
     days with nothing stay blank so the sheet reads like a calendar month. */
  const reportRows = useMemo(() => {
    const days = daysInMonth(month)
    const byDay = new Map(days.map((d) => [d, []]))
    for (const ev of monthEvents) {
      const p = ev.extendedProps || {}
      const d = String(p.date || '').slice(0, 10)
      if (!byDay.has(d)) continue
      byDay.get(d).push({ title: String(ev.title || '').split(' · ')[0], status: p.status })
    }
    return days.map((d) => {
      const hit = byDay.get(d) || []
      const [y, m, dd] = d.split('-').map(Number)
      return {
        date: `${pad2(dd)}-${MONTHS[m - 1].slice(0, 3)}-${String(y).slice(2)}`,
        weekday: new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'long' }),
        event: hit.map((h) => h.title).join('\n'),
        done: hit.map((h) => doneLabel(h.status)).filter(Boolean).join('\n'),
        social: ['', '', '', '', ''],
      }
    })
  }, [month, monthEvents])

  const reportMeta = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const label = `${MONTHS[m - 1]} ${y}`
    const code = String(ngo?.code || ngo?.id || 'ngo').replace(/[^A-Za-z0-9_-]/g, '')
    return {
      label,
      code,
      base: `monthly-planner-${code}-${MONTHS[m - 1]}-${y}`,
      ngoName: ngo?.name || '',
    }
  }, [month, ngo])

  const downloadExcel = async () => {
    if (!reportMeta.base) return
    setDownloading('excel')
    try {
      const XLSX = await import('xlsx-js-style')
      const headers = ['Date', 'Event', 'Event Done', ...REPORT_SOCIAL_COLS]

      const head = [
        ['Monthly Planner Report'],
        ['NGO', reportMeta.ngoName],
        ['Month', reportMeta.label],
        ['Generated', new Date().toLocaleString('en-IN')],
        [],
        headers,
      ]
      const body = reportRows.map((r) => [r.date, r.event, r.done, ...r.social])

      const footer = []
      if (selectedSuggestions.length) {
        footer.push([])
        footer.push(['AI Suggestions — To Be Scheduled'])
        footer.push(['Date', 'Event', 'Event Done', ...REPORT_SOCIAL_COLS])
        for (const s of selectedSuggestions) {
          footer.push([
            'TBD',
            [s.title, s.objective ? `Objective: ${s.objective}` : '', s.materials?.length ? `Materials: ${s.materials.join(', ')}` : ''].filter(Boolean).join('\n'),
            'Suggested',
            '', '', '', '', '',
          ])
        }
      } else {
        footer.push([])
        footer.push(['No AI suggestions were selected for this month.'])
      }

      const aoa = [...head, ...body, ...footer]
      const ws = XLSX.utils.aoa_to_sheet(aoa)

      // Style every header row: row 6 (index 5) plus the suggestion header.
      const headerRows = [5]
      const sugHeaderIdx = aoa.findIndex((r) => r && r[0] === 'AI Suggestions — To Be Scheduled')
      if (sugHeaderIdx >= 0) headerRows.push(sugHeaderIdx + 1)
      const thin = { style: 'thin', color: { rgb: 'D5D9E4' } }
      for (const r of headerRows) {
        for (let c = 0; c < headers.length; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          if (!ws[addr]) continue
          ws[addr].s = {
            font: { bold: true, sz: 11, color: { rgb: '1F2430' } },
            fill: { fgColor: { rgb: 'E8ECF6' } },
            border: { top: thin, bottom: thin, left: thin, right: thin },
            alignment: { vertical: 'center', wrapText: true },
          };
        }
      }
      // Title row.
      const t = ws['A1']
      if (t) t.s = { font: { bold: true, sz: 14, color: { rgb: '1F2430' } } }

      ws['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 13 }]
      ws['!rows'] = []
      ws['!rows'][0] = { hpt: 22 }
      for (const r of headerRows) ws['!rows'][r] = { hpt: 20 }
      for (let r = 6; r < aoa.length; r++) if (!ws['!rows'][r]) ws['!rows'][r] = {};

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Planner')
      XLSX.writeFile(wb, `${reportMeta.base}.xlsx`)
    } catch (e) {
      console.error('downloadExcel error:', e)
      setToast('Could not build the Excel report.')
    } finally {
      setDownloading('')
    }
  }

  const downloadPdf = async () => {
    const el = reportRef.current
    if (!el) return
    setDownloading('pdf')
    try {
      const { default: html2canvas } = await import('html2canvas')
      const { default: jsPDF } = await import('jspdf')
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = 210, pageH = 297, margin = 6
      const contentW = pageW - margin * 2
      const contentH = pageH - margin * 2
      const pxPerMm = canvas.width / contentW
      const pageHeightPx = contentH * pxPerMm
      let heightLeft = canvas.height
      let position = 0
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, 0)
      heightLeft -= pageHeightPx
      while (heightLeft > 0) {
        position = heightLeft - pageHeightPx
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', margin, position * -1 + margin, contentW, 0)
        heightLeft -= pageHeightPx
      }
      pdf.save(`${reportMeta.base}.pdf`)
    } catch (e) {
      console.error('downloadPdf error:', e)
      setToast('Could not build the PDF report.')
    } finally {
      setDownloading('')
    }
  }

  const onActivityAdded = (created) => {
    setAddOpen(false)
    loadActivities()
    showToast(`Activity “${created?.name}” added.`)
    // Straight into suggestions, which is the point of adding one from here.
    if (created?.id) {
      setSuggestFor({
        ...created,
        sector_name: sectors.find((s) => String(s.id) === String(created.sector_id))?.name || null,
      })
    }
  }

  const afterPlanned = () => {
    setPlanEntry(null)
    loadMonthEvents()
    setSuggestionsRev((v) => v + 1)
    showToast('Programme added to this month.')
  }

  const monthName = monthLabel(month).split(' ')[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{SCROLLBAR_CSS}</style>
      <PageHeader
        title="Monthly Planner"
        subtitle={`Plan activities NGO-wise, month-wise · ${monthLabel(month)}`}
        actions={
          <button className="eh-btn eh-btn-primary" onClick={() => setAddOpen(true)}>+ Add Activity</button>
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        {[
          { n: 1, label: 'Choose NGO', done: Boolean(ngo) },
          { n: 2, label: 'Choose Month', done: Boolean(month) },
          { n: 3, label: 'Activities', done: rows.length > 0 },
        ].map((s) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: s.done ? 'var(--eh-primary)' : 'var(--eh-ink-faint)' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: s.done ? 'var(--eh-primary)' : 'var(--eh-tint-1)', color: s.done ? '#fff' : 'var(--eh-ink-soft)', fontSize: 11 }}>
              {s.n}
            </span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <Field label="1 · NGO">
            <Select value={ngoId} onChange={(v) => { setNgoId(v); setSectorFilter(''); setSearch('') }} style={{ minWidth: 190 }}>
              <option value="">All NGOs</option>
              {ngos.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </Select>
          </Field>

          <Field label="2 · Month">
            <div style={{ display: 'flex', gap: 8 }}>
              <Select value={Number(month.split('-')[1]) - 1} onChange={(v) => setMonthPart('month', v)} style={{ minWidth: 120 }}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </Select>
              <Select value={year} onChange={(v) => setMonthPart('year', v)} style={{ minWidth: 90 }}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
          </Field>

          <Field label="Sector">
            <Select value={sectorFilter} onChange={setSectorFilter} style={{ minWidth: 190 }}>
              <option value="">All sectors</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>

          <SearchInput value={search} onChange={setSearch} placeholder="Search activities…" style={{ flex: '1 1 180px', minWidth: 160 }} />

          {ngo && (
            <button className="eh-btn" onClick={() => navigate('/event-head/monthly-planner')} title="Open the Calendar view">
              View in Calendar
            </button>
          )}

          {ngo && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--eh-ink-faint)' }}>
                {selectedSuggestions.length} suggestion{selectedSuggestions.length === 1 ? '' : 's'} selected
              </span>
              <button className="eh-btn" onClick={downloadExcel} disabled={downloading === 'excel'} title="Date-wise monthly report as Excel">
                {downloading === 'excel' ? 'Building…' : 'Download Excel'}
              </button>
              <button className="eh-btn" onClick={downloadPdf} disabled={downloading === 'pdf'} title="Date-wise monthly report as PDF">
                {downloading === 'pdf' ? 'Building…' : 'Download PDF'}
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ padding: '11px 16px', borderRadius: 12, background: 'var(--eh-success-soft)', color: 'var(--eh-success)', fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {ngo && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Activities', value: rows.length, color: 'var(--eh-ink)' },
            { label: `Planned in ${monthName}`, value: plannedCount, color: 'var(--eh-success)' },
            { label: 'Not planned yet', value: unplannedCount, color: unplannedCount ? '#9a8200' : 'var(--eh-ink-faint)' },
          ].map((c) => (
            <div key={c.label} className="card" style={{ marginBottom: 0, flex: '1 1 150px' }}>
              <div className="card-pad" style={{ padding: '13px 15px' }}>
                <div style={LABEL}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-pad" style={{ padding: '13px 15px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={LABEL}>3 · Activities</span>
          {ngo && <span style={{ fontSize: 12, color: 'var(--eh-ink-faint)' }}>{ngo.name} · {monthLabel(month)}</span>}
          {loadingActs && <span style={{ fontSize: 12, color: 'var(--eh-ink-faint)' }}>Loading activities…</span>}
          {loadingEvents && <span style={{ fontSize: 12, color: 'var(--eh-ink-faint)' }}>Loading month…</span>}
        </div>

        {!ngo && <Empty icon="◎">Choose an NGO in step 1 to see its activities.</Empty>}

        {ngo && actsError && (
          <div style={{ margin: '0 15px 15px', padding: '11px 14px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13 }}>{actsError}</div>
        )}

        {ngo && !actsError && rows.length === 0 && !loadingActs && (
          <Empty icon="＋">
            No activities for {ngo.name} yet. Use <b>+ Add Activity</b> to add one, then ask AI for programme suggestions.
          </Empty>
        )}

        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th style={{ width: '30%' }}>Planned in {monthName}</th>
                  <th style={{ width: 200 }}>Programmes</th>
                </tr>
              </thead>
              <tbody>
                {bySector.map((g) => (
                  <Fragment key={g.key}>
                    <tr>
                      <td colSpan={3} style={{ padding: '9px 14px', background: 'var(--eh-tint-1)', borderBottom: '1px solid var(--eh-line)', fontSize: 12, fontWeight: 700, color: 'var(--eh-ink-soft)' }}>
                        {g.key} · {g.rows.length}
                      </td>
                    </tr>
                    {g.rows.map((a) => {
                      const planned = plannedByActivity.get(String(a.id)) || []
                      return (
                        <tr key={a.id}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--eh-ink)' }}>{a.name}</span>
                              {a.description && (
                                <span style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)' }}>
                                  {String(a.description).slice(0, 90)}{String(a.description).length > 90 ? '…' : ''}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {planned.length === 0 ? (
                              <Badge tone="muted">Not planned</Badge>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {planned.map((p) => (
                                  <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12, color: 'var(--eh-ink)' }}>
                                      <b style={{ fontWeight: 700 }}>{shortDate(p.date)}</b> · {p.title}
                                    </span>
                                    <StatusPill status={p.status} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button className="eh-btn eh-btn-primary eh-btn-sm" onClick={() => setSuggestFor(a)}>
                                ✦ Suggest programmes
                              </button>
                              <button className="eh-btn eh-btn-sm" onClick={() => setPlanEntry({ activity: a, suggestion: null })}>
                                Add programme
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Off-screen node the PDF export captures. Kept in the normal flow (not
          display:none) because html2canvas renders nothing for hidden nodes. */}
      <div
        ref={reportRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-10000px', top: 0, width: 900, background: '#fff', padding: 24, fontFamily: 'inherit' }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1F2430' }}>Monthly Planner Report</div>
        <div style={{ fontSize: 12, color: '#4A5061', marginTop: 4 }}>NGO: {reportMeta.ngoName}</div>
        <div style={{ fontSize: 12, color: '#4A5061' }}>Month: {reportMeta.label}</div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Generated: {new Date().toLocaleString('en-IN')}</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 11 }}>
          <thead>
            <tr>
              {['Date', 'Event', 'Event Done', ...REPORT_SOCIAL_COLS].map((h) => (
                <th key={h} style={{ border: '1px solid #D5D9E4', background: '#E8ECF6', padding: '5px 6px', textAlign: 'left', fontWeight: 700, color: '#1F2430' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportRows.map((r, i) => (
              <tr key={r.date} style={{ background: i % 2 ? '#F7F8FC' : '#fff' }}>
                <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.date}</td>
                <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', whiteSpace: 'pre-wrap' }}>{r.event}</td>
                <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', whiteSpace: 'pre-wrap' }}>{r.done}</td>
                {r.social.map((s, k) => <td key={k} style={{ border: '1px solid #D5D9E4', padding: '5px 6px' }} />)}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 13, fontWeight: 800, color: '#1F2430', marginTop: 16 }}>
          AI Suggestions — To Be Scheduled
        </div>
        {selectedSuggestions.length === 0 ? (
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6 }}>
            No AI suggestions were selected for this month.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 11 }}>
            <thead>
              <tr>
                {['Date', 'Event', 'Event Done', ...REPORT_SOCIAL_COLS].map((h) => (
                  <th key={h} style={{ border: '1px solid #D5D9E4', background: '#E8ECF6', padding: '5px 6px', textAlign: 'left', fontWeight: 700, color: '#1F2430' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedSuggestions.map((s) => (
                <tr key={s.id}>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', fontWeight: 600 }}>TBD</td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', whiteSpace: 'pre-wrap' }}>
                    <b>{s.title}</b>
                    {s.objective ? `\nObjective: ${s.objective}` : ''}
                    {s.materials?.length ? `\nMaterials: ${s.materials.join(', ')}` : ''}
                  </td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px' }}>Suggested</td>
                  {[0, 1, 2, 3, 4].map((k) => <td key={k} style={{ border: '1px solid #D5D9E4', padding: '5px 6px' }} />)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <AddActivityModal ngo={ngo} sectors={sectors} onClose={() => setAddOpen(false)} onSaved={onActivityAdded} />
      )}

      {suggestFor && (
        <SuggestModal
          activity={suggestFor}
          ngo={ngo}
          month={month}
          onClose={() => { setSuggestFor(null); loadSelectedSuggestions() }}
          onPlan={(s) => { setSuggestFor(null); setPlanEntry({ activity: suggestFor, suggestion: s }) }}
        />
      )}

      {planEntry && (
        <PlanModal
          entry={planEntry}
          ngo={ngo}
          month={month}
          onClose={() => setPlanEntry(null)}
          onSaved={afterPlanned}
        />
      )}
    </div>
  )
}
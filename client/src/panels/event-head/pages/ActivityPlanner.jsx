import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Select, SearchInput, Badge, StatusPill, Empty } from '../components/ui.jsx'
import {
  fetchWorkspaceNgos,
  fetchSectors,
  fetchActivities,
  fetchCalendarEvents,
  createActivity,
  createEvent,
  deleteActivity,
  updateActivity,
  suggestActivityPrograms,
  fetchPlannerSuggestions,
  setPlannerSuggestionSelected,
  generateNgoMonthlyReport,
  fetchImportantDays,
  suggestFestivalPrograms,
  getFestivalSuggestions,
  setFestivalSuggestionSelected,
  mergeProgrammeRows,
  blankRepeatedDates,
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

/* The team calls these NGOs by their codes (BSCT, AFLF, MANN), so codes win over
   the long registered names wherever a short label is needed. */
const ngoShortLabel = (n) =>
  String(n?.code || '').trim() || String(n?.name || '').trim() || 'NGO'

/* Who each NGO serves. These three NGOs work for one distinct group each, so
   the group defaults to a property of the NGO rather than something every
   activity has to be tagged with individually — which is what left the
   Beneficiary filter empty and untaggable. Keyed by the code the team already
   uses. */
const NGO_BENEFICIARY = {
  bsct: 'Visually Impaired',
  aflf: 'Underprivileged Families',
  mann: 'Women',
}

/* The closed vocabulary, in a stable order for the Add Activity dropdown. Kept
   as a list rather than read off the object above so the three NGOs always show
   the same three groups in the same order. */
const BENEFICIARY_GROUPS = Object.values(NGO_BENEFICIARY)

/* The saved spelling of a group, or '' when the value is not one of the three.
   Trimmed and case-insensitive so " women " and "Women" are the same group, and
   strict about membership so a stray value typed before this feature existed
   cannot put a fourth, unknown group into the table and the filter. */
const canonicalBeneficiary = (value) => {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return ''
  return BENEFICIARY_GROUPS.find((g) => g.toLowerCase() === v) || ''
}

/* The NGO an activity belongs to, resolved even when the page is on "All NGOs"
   and the row itself carries no NGO. */
const activityNgo = (a, ngos, ngo) => {
  if (ngo) return ngo
  return ngos.find((x) => String(x.id) === String(a.ngo_id)) || null
}

/* The group an activity serves. The group's own choice first, then the NGO's
   fixed group — which is what every activity created before the dropdown existed
   falls back to, so old rows stay correct and never drop out of the filter.
   Every read goes through this, so the table, the filter, the search and the
   suggestion scoping can never disagree. */
const activityBeneficiary = (a, ngos, ngo) =>
  canonicalBeneficiary(a?.beneficiary_group)
  || NGO_BENEFICIARY[ngoCodeKey(activityNgo(a, ngos, ngo))] || ''

/* How many programmes each NGO is expected to run in a month. This is the one
   place the quota lives: change a number here and every card, the header total
   and the remaining count follow. Keyed by the same short code as the
   beneficiary map above, because that is how the team identifies an NGO.
   An NGO with no entry falls back to the smallest common quota rather than
   showing a target of 0, which would read as "already complete". */
const NGO_MONTHLY_TARGET = { bsct: 25, mann: 15, aflf: 20 }
const DEFAULT_MONTHLY_TARGET = 15

const ngoCodeKey = (n) => String(n?.code || '').trim().toLowerCase()

const monthlyTargetFor = (n) => NGO_MONTHLY_TARGET[ngoCodeKey(n)] ?? DEFAULT_MONTHLY_TARGET

const capFirst = (s = '') => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

/* Card order follows the target table, so BSCT's bigger quota is read first and
   the cards do not reshuffle between NGOs or months. Anything not in the table
   (a new NGO, or one with no code) goes last, by name. */
const targetOrderFor = (n) => {
  const i = Object.keys(NGO_MONTHLY_TARGET).indexOf(ngoCodeKey(n))
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/* ── Report helpers (date-wise monthly planner download) ─────────────────── */

/* The report is date-wise, so it must NOT go through toISOString(): in IST,
   midnight of the 1st is the previous evening in UTC and every date would slip
   back a day. Takes the 'YYYY-MM-DD' string the API returns, so no Date object
   is built from it at all. */
const reportDate = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number)
  if (!y || !m || !d) return String(ymd || '')
  return `${pad2(d)}-${MONTHS[m - 1].slice(0, 3)}-${y}`
}

/* ── Report layout ─────────────────────────────────────────────────────────
   The file answers one question: "what did I decide for this month?". So it is
   built from the user's selections, not from the calendar:
     · one row per programme they planned, with the AI suggestion they chose for
       that programme;
     · a quota line per NGO (target / done / remaining);
     · a closing block for selections they have not scheduled yet.
   The on-screen preview, the Excel sheet and the PDF are all rendered from the
   single buildMonthlyReport() result below, so the three can never disagree. */
const REPORT_HEADERS = ['Date', 'Day', 'Activity', 'Programme', 'Status', 'AI Suggested Programme']

/* The monthly-planner grid download. Each downloadable unit is one selected AI
   festival programme, so the columns answer "what is this date's festival, who
   serves it, and what programme did I pick for them?". Sector and Activity were
   dropped because the grid itself does not carry them — the export matches the
   on-screen columns. */
const FESTIVAL_REPORT_HEADERS = ['Date', 'Day', 'Festival/Important Day', 'NGO', 'Beneficiary', 'AI Suggested Programme', 'Status']

/* Marks an activity the user ticked for this download. A tick rather than a word
   so the eye can find the chosen ones down a column, and it survives being copied
   into a spreadsheet cell. */
const REPORT_TICK = '✓'

/* Joined as \n so Excel and the PDF each show one programme per line instead of
   clipping the longest title. */
const reportSuggestionCell = (s) => {
  if (!s) return '—'
  const extra = [s.priority ? `Priority: ${s.priority}` : '', s.objective ? `Objective: ${s.objective}` : '']
    .filter(Boolean)
    .join('\n')
  return extra ? `${s.title}\n${extra}` : s.title
}

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

/* AI programme urgency, mapped to a badge tone: the loudest for Urgent and
   Critical, amber for High, then quiet blue and grey. */
const PRIORITY_TONE = { Urgent: 'danger', Critical: 'danger', High: 'warn', Medium: 'primary', Low: 'muted' }

/* Scoped styling for the Monthly Planner festival grid (`.eh-fest-grid`). Kept
   local to ActivityPlanner.jsx so the four-source calendar's other pages in
   event-head are untouched. Rules only restyle/space the table — the row data,
   heading, export and behaviour logic are not involved. */
const FEST_GRID_CSS = `
.eh-fest-grid { width: 100%; min-width: 900px; table-layout: fixed; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid #E3E6F2; }
.eh-fest-grid thead th { position: sticky; top: 0; z-index: 5; padding: 10px 14px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; text-align: left; color: var(--eh-ink-soft, #6f6c86); background: #f3f2fb; border-bottom: 2px solid #d9d5f0; border-right: 1px solid #E3E6F2; white-space: nowrap; }
.eh-fest-grid thead th:last-child { border-right: none; }
.eh-fest-grid td { padding: 11px 14px; font-size: 13px; line-height: 1.3; color: var(--eh-ink, #1f2430); border-right: 1px solid #E3E6F2; vertical-align: middle; }
.eh-fest-grid td:last-child { border-right: none; }
.eh-fest-grid td.dd { font-weight: 700; font-size: 12.5px; white-space: nowrap; }
.eh-fest-grid td.plain { color: var(--eh-ink-faint, #a09db4); font-size: 12.5px; }
.eh-fest-grid .ff-name { display: block; font-weight: 700; font-size: 14px; color: var(--eh-ink, #1f2430); }
.eh-fest-grid .ff-type { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11px; font-weight: 600; color: var(--eh-ink-soft, #6f6c86); }
.eh-fest-grid .ff-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--eh-primary, #6c5ce7); }
.eh-fest-grid .ng-pill { display: inline-flex; padding: 3px 10px; border-radius: 999px; background: var(--eh-tint-1, #f0eefb); border: 1px solid var(--eh-line-strong, #ddd9f0); font-size: 11.5px; font-weight: 700; color: var(--eh-ink, #1f2430); white-space: nowrap; }
.eh-fest-grid td.bn { font-size: 13px; }
.eh-fest-grid .ai-title { display: block; font-weight: 600; font-size: 13.5px; color: var(--eh-ink, #1f2430); }
.eh-fest-grid .ai-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.eh-fest-grid td.ai.nowrap { white-space: nowrap; }
.eh-fest-grid td.sel { text-align: center; }
.eh-fest-grid td.sel input { width: 16px; height: 16px; margin: 0; vertical-align: middle; accent-color: var(--eh-primary, #6c5ce7); cursor: pointer; }
.eh-fest-grid td.sel input:disabled { cursor: wait; }
.eh-fest-grid td.dd, .eh-fest-grid td.ff, .eh-fest-grid td.ng, .eh-fest-grid td.bn { border-bottom: none; }
.eh-fest-grid td.divider { border-top: 2px solid #d9d5f0; }
.eh-fest-grid tbody tr:first-child td.divider { border-top: none; }
.eh-fest-grid td.subline { border-bottom: 1px solid #E3E6F2; }
.eh-fest-grid tr.sel-row:hover td.ai, .eh-fest-grid tr.sel-row:hover td.sel { background: #faf9ff; }
.eh-fest-grid tr.sel-row.sel td.ai, .eh-fest-grid tr.sel-row.sel td.sel { background: var(--eh-tint-1, #f0eefb); }
.eh-fest-grid tr.sel-row.sel td.ai { box-shadow: inset 3px 0 0 var(--eh-primary, #6c5ce7); }
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

/* The beneficiary an activity serves, shown on its row.

   The group's own choice when it has one, otherwise the group fixed for its NGO
   (see activityBeneficiary). That is what makes the Beneficiary filter usable —
   every activity resolves to exactly one of the three groups, so the filter
   always has real options and nothing is ever left blank. */
function BeneficiaryCell({ group }) {
  if (!group) return <span style={{ fontSize: 11.5, color: 'var(--eh-ink-faint)' }}>—</span>
  return <Badge tone="secondary">{group}</Badge>
}

/* ── Step 3 · Add Activity (NGO-wise) ────────────────────────────────────── */

function AddActivityModal({ ngo, sectors, month, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [description, setDescription] = useState('')
  // Which of the three groups this activity serves. Defaults to the one the NGO
  // works for, but is a real choice: an activity can serve a different group from
  // the rest of its NGO, and every read (table, filter, search, AI prompt) then
  // follows this value instead of the NGO's.
  const [beneficiaryGroup, setBeneficiaryGroup] = useState('')
  // The group box itself is hidden until this is ticked, so an activity that
  // serves nobody in particular shows no beneficiary at all.
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const chosenGroup = canonicalBeneficiary(beneficiaryGroup)
  // Whether this activity belongs in the monthly download. On by default here
  // because someone adding an activity has already decided it matters; the tick on
  // the activity row is where it gets changed. It is still a real choice, so it is
  // shown rather than assumed.
  const [inReport, setInReport] = useState(true)
  // Optional. Empty means "just register the activity"; a day means "and run its
  // first programme on that date".
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Only days of the month on screen, so the programme it creates always lands
  // in this month's counts and download rather than somewhere invisible.
  const days = useMemo(() => daysInMonth(month), [month])

  const ngoDefault = NGO_BENEFICIARY[ngoCodeKey(ngo)] || ''

  /* No pre-selection, on purpose. An empty box is the honest state: the form does
     not claim the activity serves anybody until it is told, and the prompt takes
     the same view — no group chosen means no beneficiary line at all. Changing NGO
     only has to drop a choice that is no longer available, never invent one. */
  useEffect(() => {
    setBeneficiaryGroup((prev) => (canonicalBeneficiary(prev) ? prev : ''))
  }, [ngoDefault])

  /* Clearing the group hides its own box, so "no beneficiary" and "a beneficiary
     is being chosen" can never both be on screen. */
  useEffect(() => {
    if (!chosenGroup) setShowGroupPicker(false)
  }, [chosenGroup])

  const submit = async () => {
    if (!ngo) return setError('Choose an NGO first.')
    if (!name.trim()) return setError('Activity name is required.')
    if (!sectorId) return setError('Choose a sector for the activity.')
    setBusy(true); setError('')

    const activityName = name.trim()
    const desc = description.trim() || null

    let created
    try {
const payload = {
        name: activityName,
        sector_id: Number(sectorId),
        ngo_id: ngo.id,
        description: desc,
        // The group this activity serves. The backend drops the field when
        // migration 168 has not been applied, so this can never block the save.
        beneficiary_group: chosenGroup || null,
        // Same guard for migration 169: an unapplied migration drops the field
        // rather than failing the save, and the tick on the row shows the truth.
        in_report: inReport,
      }
      created = await createActivity(payload)
    } catch (e) {
      setBusy(false)
      return setError(e?.message || 'Could not save the activity.')
    }

    if (!date) {
      setBusy(false)
      return onSaved({ activity: created, programme: null })
    }

    // The programme is a second record, created only after the activity exists.
    // activity_ids is what links the two, and it is also what lets the monthly
    // report show this event's AI suggestions.
    try {
      const programme = await createEvent({
        name: activityName,
        ngo_id: ngo.id,
        sector_id: Number(sectorId),
        activity_ids: created?.id ? [created.id] : [],
        date,
        status: 'Draft',
        description: desc,
      })
      setBusy(false)
      onSaved({ activity: created, programme, date })
    } catch (e) {
      // Never imply the whole thing failed: the activity is already saved.
      setBusy(false)
      onSaved({
        activity: created,
        programme: null,
        programmeError: `saved the activity, but could not schedule its programme on ${shortDate(date)} — ${e?.message || 'please try again'}`,
      })
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
            {busy ? 'Saving…' : date ? 'Save & Schedule' : 'Save Activity'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!ngo && (
          <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--eh-warn-soft, #fff8e1)', color: 'var(--eh-ink)', fontSize: 13 }}>
            Pick a single NGO above before adding an activity.
          </div>
        )}

        <Field label="NGO">
          <input className="eh-select" value={ngo ? ngo.name : ''} disabled placeholder="Selected above" readOnly />
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

        {/* Shown only once a group is chosen, or the form would be making a claim the
            user never made. Nothing is written until then, and the AI is given no
            beneficiary to aim at. */}
        {chosenGroup && (
          <Field
            label="Beneficiary group"
            hint={`AI programme suggestions will be aimed at ${chosenGroup}.`}
          >
            <Select
              value={chosenGroup}
              onChange={(e) => setBeneficiaryGroup(e.target.value)}
            >
              {BENEFICIARY_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>
        )}

        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
            color: 'var(--eh-ink-soft)', cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showGroupPicker}
            onChange={(e) => { setShowGroupPicker(e.target.checked); if (!e.target.checked) setBeneficiaryGroup('') }}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--eh-primary)' }}
          />
          This activity serves a specific beneficiary group
        </label>

        <Field
          label="First programme date (optional)"
          hint={`Any day of ${monthLabel(month)}. Leave empty to just register the activity.`}
        >
          <Select value={date} onChange={setDate}>
            <option value="">Do not schedule yet</option>
            {days.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
          </Select>
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

        {/* The same tick the activity row carries, asked at the moment the decision
            is easiest. */}
        <label
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 13px',
            border: `1px solid ${inReport ? 'var(--eh-primary)' : 'var(--eh-line)'}`,
            borderRadius: 12, background: inReport ? 'var(--eh-primary-soft)' : 'transparent',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={inReport}
            onChange={(e) => setInReport(e.target.checked)}
            style={{ width: 16, height: 16, marginTop: 1, cursor: 'pointer', accentColor: 'var(--eh-primary)' }}
          />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--eh-ink)' }}>
              Include in the monthly download
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)' }}>
              Only ticked activities are listed in the downloaded file. Leave this on if this is part of
              what {ngo?.name || 'the NGO'} reports every month.
            </span>
          </span>
        </label>

        {error && (
          <div style={{ padding: '10px 13px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13 }}>{error}</div>
        )}
      </div>
    </ModalShell>
  )
}

/* ── AI programme suggestions for one activity ──────────────────────────── */

/* Renders inline under the activity row that asked for it — no modal, so the
   activity list stays visible while ideas are read, ticked or discarded. */
function SuggestionPanel({ activity, ngo, month, onClose, onPlan, refreshRev = 0, onSelectionChange }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(() => new Set())
  // Ticks live server-side; this is only the optimistic mirror of them.
  const [selected, setSelected] = useState(() => new Set())

  const monthNum = Number(String(month).split('-')[1])
  const yearNum = Number(String(month).split('-')[0])

  /* Reopening the panel restores what the user ticked last time, so selecting
     ideas is not lost by closing the panel or reloading the page.
     refreshRev is bumped after a suggestion is converted into a programme,
     which ticks it server-side — the mirror has to re-read or the box would
     show unticked while the report already contains it. */
  useEffect(() => {
    let alive = true
    fetchPlannerSuggestions({ ngo_id: ngo?.id, activity_id: activity?.id, month: monthNum, year: yearNum })
      .then((list) => {
        if (!alive) return
        setSelected(new Set((list || []).filter((s) => s?.is_selected).map((s) => Number(s.id))))
      })
      .catch(() => { /* keep whatever is on screen */ })
    return () => { alive = false }
  }, [activity?.id, ngo?.id, monthNum, yearNum, refreshRev])

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
      /* Tell the page. The report's AI column reads the page's own selected
         list, not this panel's mirror, so without this a tick made here is
         invisible to the download until the month or NGO changes. */
      onSelectionChange?.()
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
      // The batch may have changed which ideas exist, so the page re-reads its
      // own selected list rather than reporting a stale one.
      onSelectionChange?.()
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
    <div style={{ border: '1px solid var(--eh-line)', borderRadius: 12, padding: '12px 14px', background: 'var(--eh-tint-1)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--eh-ink)' }}>
          Programme suggestions · {activity.name}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--eh-ink-faint)' }}>
          {monthLabel(month)}{ngo ? ` · ${ngoShortLabel(ngo)}` : ''}
        </span>
        <button className="eh-btn eh-btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
      </div>
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
                <button className="eh-btn eh-btn-primary eh-btn-sm" onClick={() => onPlan(s)} title="Save this as a real programme in the month. It stays ticked, so the download lists it under that event.">
                  Add as programme
                </button>
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
    </div>
  )
}

/* ── Turn a suggestion (or a blank slate) into a real programme ──────────── */

/* One programme on one date. */
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
      const event = await createEvent({
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
      /* Record which programme this idea became, in the same write as the tick.
         Without the link the report can only guess from the shared activity and
         prints the idea against the wrong programme. */
      if (suggestion?.id && event?.id) {
        try {
          await setPlannerSuggestionSelected(Number(suggestion.id), true, Number(event.id))
        } catch {
          // The programme is saved either way; only the report's AI column is
          // less precise, which must not fail the save.
        }
      }
      onSaved({ suggestion, programmes: [event], lastDate: date })
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
  const [beneficiaryFilter, setBeneficiaryFilter] = useState('')
  const [search, setSearch] = useState('')

  const [activities, setActivities] = useState([])
  const [loadingActs, setLoadingActs] = useState(false)
  const [actsError, setActsError] = useState('')

  const [monthEvents, setMonthEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  const [toast, setToast] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [suggestFor, setSuggestFor] = useState(null)
  // The activity just added from this page. Rows are grouped by sector and
  // sorted by name, so without this a new activity lands wherever the alphabet
  // puts it and the user cannot see what they just created.
  const [justAddedId, setJustAddedId] = useState(null)
  // Day of the programme just scheduled, so the calendar link can open on it.
  const [lastScheduled, setLastScheduled] = useState('')
  // { activity, planned } — the row whose Delete was clicked. `planned` is the
  // month's events on that activity, so the confirmation can name what goes.
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
// True while a tick is being written, so the boxes cannot be double-toggled into
// two contradictory saves.
  const [tickBusy, setTickBusy] = useState(false)
  // Bumped after a suggestion is converted into a programme, so the open panel
  // re-reads its ticks from the server instead of showing a stale box.
  const [suggestRev, setSuggestRev] = useState(0)
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
  // usable page instead of the cross-NGO overview.
  useEffect(() => {
    if (!ngoId && ngos.length === 1) setNgoId(String(ngos[0].id))
  }, [ngos, ngoId])

  /* "All NGOs" is a real choice, not an empty state: with no ngoId both
     endpoints drop the filter and return every row, which is what the
     cross-NGO totals, the overview and the all-NGO report are built from. */
  const loadActivities = useCallback(() => {
    setLoadingActs(true); setActsError('')
    fetchActivities(ngoId ? { ngo_id: ngoId } : {})
      .then((l) => setActivities(Array.isArray(l) ? l : []))
      .catch((e) => { setActivities([]); setActsError(e?.message || 'Could not load activities.') })
      .finally(() => setLoadingActs(false))
  }, [ngoId])

  const loadMonthEvents = useCallback(() => {
    const [start, end] = monthBounds(month)
    setLoadingEvents(true)
    fetchCalendarEvents({ start, end, ngoId })
      .then((l) => setMonthEvents(Array.isArray(l) ? l : []))
      .catch(() => setMonthEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [ngoId, month])

  /* Per-NGO event counts for the chosen month. The existing monthly report
     endpoint already groups the month NGO-wise, so no new API is needed — and
     calling it without ngo_id returns every NGO at once for the overview. */
  const [ngoStats, setNgoStats] = useState({})
  const [loadingCounts, setLoadingCounts] = useState(false)

  const loadNgoStats = useCallback(() => {
    const [y, m] = month.split('-').map(Number)
    setLoadingCounts(true)
    generateNgoMonthlyReport({ month: m, year: y })
      .then((r) => {
        const map = {}
        for (const n of (r?.ngos || [])) map[String(n.ngo_id)] = n
        setNgoStats(map)
      })
      .catch(() => setNgoStats({}))
      .finally(() => setLoadingCounts(false))
  }, [month])

  useEffect(() => { loadActivities() }, [loadActivities])
  useEffect(() => { loadMonthEvents() }, [loadMonthEvents])
  useEffect(() => { loadNgoStats() }, [loadNgoStats])

  /* ── Festival view of the month ──────────────────────────────────────────
     The grid shows every date of the chosen month, matched against the
     country's important days (Calendarific when the key is configured,
     otherwise the curated + fixed international lists). Its job is to match a
     festival/day to a beneficiary NGO and pick programmes for it — so unlike
     the rows above, this grid is date-wise, not activity-wise. */

  const [importantDays, setImportantDays] = useState([])
  const [festivalError, setFestivalError] = useState('')
  const [festivalSuggestions, setFestivalSuggestions] = useState([])
  // `key` = "date::festival". Held as an object so a re-run can be told apart
  // from the day that started it, while the grid disables only that row.
  const [festGenerating, setFestGenerating] = useState(null)
  const [festBusy, setFestBusy] = useState(false)

  const loadImportantDays = useCallback(() => {
    const [y, m] = month.split('-').map(Number)
    fetchImportantDays({ year: y, month: m, scope: 'all' })
      .then((d) => {
        const list = Array.isArray(d?.days) ? d.days : Array.isArray(d?.observances) ? d.observances : []
        setImportantDays(list)
        if (d && d.ok === false) setFestivalError(d.error || '')
      })
      .catch(() => { setImportantDays([]); setFestivalError('Could not load the festival calendar.') })
  }, [month])

  // Days are a property of the month alone, so they reload on month change but
  // not on NGO change. Errors are cleared at the top, so a stale "could not
  // load" never lingers once a month loads fine.
  useEffect(() => { setFestivalError(''); loadImportantDays() }, [loadImportantDays])

  /* The suggestions already stored for this month + NGO. Without an NGO the
     server returns every NGO's programmes separately (labelled row by row), so
     BSCT, MANN and AFLF data is never mixed into one generation call. */
  const loadFestivalSuggestions = useCallback(() => {
    const [y, m] = month.split('-').map(Number)
    getFestivalSuggestions({ month: m, year: y, ngo_id: ngoId || undefined })
      .then((l) => setFestivalSuggestions(Array.isArray(l) ? l : []))
      .catch(() => setFestivalSuggestions([]))
  }, [month, ngoId])

  useEffect(() => { loadFestivalSuggestions() }, [loadFestivalSuggestions])

  /* Every selectable day of the month, a festival-less date included. */
  const festivalDates = useMemo(() => daysInMonth(month), [month])

  /* Important days bucketed by date, so one day can list several festivals.
     Sorted by name so a given date always reads the same. */
  const observancesByDate = useMemo(() => {
    const map = {}
    for (const o of importantDays) {
      const d = String(o?.date || '').slice(0, 10)
      if (!d) continue
      if (!map[d]) map[d] = []
      map[d].push(o)
    }
    for (const d in map) map[d].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    return map
  }, [importantDays])

  /* Suggestions grouped by the date::festival pair that created them, so each
     festival shows its own generated list with no cross-NGO mixing. */
  const festivalSuggestionsByKey = useMemo(() => {
    const map = {}
    for (const s of festivalSuggestions) {
      const key = `${String(s.observance_date || '').slice(0, 10)}::${String(s.festival || '')}`
      if (key === '::') continue
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return map
  }, [festivalSuggestions])

  /* Feeds the count in the grid header and the download bar. */
  const selectedFestivalCount = useMemo(
    () => festivalSuggestions.filter((s) => Boolean(s.is_selected)).length,
    [festivalSuggestions]
  )

  /* The NGO column prints the single NGO in scope; on "All NGOs" it prints the
     scope label and each suggestion row prints its own stored NGO, so a reader
     always knows whose programme they are looking at. */
  const festivalNgoLabel = useMemo(() => (ngo ? ngoShortLabel(ngo) : '—'), [ngo])

  /* Fixed per NGO by the server at generation time; this is only the value the
     grid shows before any suggestions exist. */
  const festivalBeneficiary = useMemo(() => (ngo ? (NGO_BENEFICIARY[ngoCodeKey(ngo)] || '—') : '—'), [ngo])

  /* Generates a day's programmes for one NGO. The server decides the activity
     and the beneficiary; the page only sends the day, festival name and NGO
     (sector is carried across to steer the suggestions). Selections are saved
     per suggestion, so re-running a day never resets a tick. */
  const suggestFestival = async (date, festivalName) => {
    const key = `${date}::${festivalName}`
    setFestivalError('')
    if (!ngoId) {
      setFestivalError('Pick a single NGO to generate festival programmes for it.')
      return
    }
    if (festGenerating?.key === key) return
    setFestGenerating({ key })
    try {
      const res = await suggestFestivalPrograms({
        month, date, festival: festivalName, ngo_id: ngoId, sector_id: sectorFilter || null,
      })
      const added = Array.isArray(res?.suggestions) ? res.suggestions : []
      if (added.length) {
        const [y, m] = month.split('-').map(Number)
        const fresh = await getFestivalSuggestions({ month: m, year: y, ngo_id: ngoId }).catch(() => [])
        setFestivalSuggestions(Array.isArray(fresh) ? fresh : [])
        showToast(`${added.length} programme${added.length === 1 ? '' : 's'} suggested for ${shortDate(date)} · ${festivalName}.`)
      } else if (res?.ai && res.ai.available === false) {
        setFestivalError(res.ai.reason || 'AI suggestions are not available on this server yet.')
      } else {
        setFestivalError('No programmes could be generated for this day.')
      }
    } catch (e) {
      setFestivalError(e?.message || 'Could not generate festival programmes.')
    } finally {
      setFestGenerating((cur) => (cur?.key === key ? null : cur))
    }
  }

  /* Tick of a single programme. The box flips optimistically, then the server's
     own answer wins; a failed save restores the box and says so. */
  const toggleFestivalSuggestion = async (s, checked) => {
    const before = Boolean(s.is_selected)
    setFestivalSuggestions((list) => list.map((x) => (x.id === s.id ? { ...x, is_selected: checked } : x)))
    try {
      const saved = await setFestivalSuggestionSelected(s.id, checked)
      if (saved) {
        setFestivalSuggestions((list) => list.map((x) => (x.id === s.id ? { ...x, is_selected: Boolean(saved.is_selected ?? checked) } : x)))
      }
    } catch (e) {
      setFestivalSuggestions((list) => list.map((x) => (x.id === s.id ? { ...x, is_selected: before } : x)))
      showToast(e?.message || 'Could not save the selection.')
    }
  }

  /* Select-all / clear over the grid's visible month + NGO set, followed by a
     re-read so the count and every box agree with what is stored. */
  const setFestivalSelectionAll = async (checked) => {
    const targets = festivalSuggestions.filter((s) => Boolean(s.is_selected) !== checked)
    if (!targets.length) return
    setFestBusy(true); setFestivalError('')
    try {
      await Promise.all(targets.map((s) => setFestivalSuggestionSelected(s.id, checked).catch(() => null)))
      const [y, m] = month.split('-').map(Number)
      const fresh = await getFestivalSuggestions({ month: m, year: y, ngo_id: ngoId || undefined }).catch(() => [])
      setFestivalSuggestions(Array.isArray(fresh) ? fresh : [])
    } catch (e) {
      setFestivalError(e?.message || 'Could not update the selection.')
    } finally {
      setFestBusy(false)
    }
  }

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
    if (beneficiaryFilter) {
      const want = beneficiaryFilter.trim().toLowerCase()
      list = list.filter((a) => activityBeneficiary(a, ngos, ngo).toLowerCase() === want)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((a) => [a.name, a.sector_name, activityBeneficiary(a, ngos, ngo), a.description].filter(Boolean).join(' ').toLowerCase().includes(q))
    }
    return list
  }, [activities, ngos, ngo, sectorFilter, beneficiaryFilter, search])

  /* The groups the activities in scope actually serve, plus the group fixed for
     each NGO in scope so a group is always offered before anything carries it.
     Derived from the rows rather than only from the NGOs, because an activity
     can now be tagged with a group other than its NGO's. */
  const beneficiaryOptions = useMemo(() => {
    const set = new Set()
    for (const n of (ngo ? [ngo] : ngos)) {
      const def = NGO_BENEFICIARY[ngoCodeKey(n)]
      if (def) set.add(def)
    }
    for (const a of activities) {
      const g = activityBeneficiary(a, ngos, ngo)
      if (g) set.add(g)
    }
    // Kept in the fixed vocabulary's order rather than alphabetically, so the
    // list does not reshuffle as activities are added.
    return BENEFICIARY_GROUPS.filter((g) => set.has(g))
  }, [ngos, ngo, activities])

  /* A filter still pointing at a group the current NGO does not use would show an
     empty list with no way back, because that option no longer exists. */
  useEffect(() => {
    if (beneficiaryFilter && !beneficiaryOptions.includes(beneficiaryFilter)) setBeneficiaryFilter('')
  }, [beneficiaryFilter, beneficiaryOptions])

  /* Grouped through a Map rather than by comparing against the previous row:
     activities arrive in created_at order, so one sector used to be split into
     two headers. Sectors and the activities inside them are both sorted, so the
     same month always reads in the same order. */
  const bySector = useMemo(() => {
    const map = new Map()
    for (const a of rows) {
      const key = a.sector_name || 'Uncategorised'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    // Sector, then name — but the activity just added leads its own sector, and
    // that sector leads the list, so a new row is the first thing on screen.
    return [...map.entries()]
      .sort((x, y) => {
        const xNew = x[1].some((a) => String(a.id) === String(justAddedId)) ? 0 : 1
        const yNew = y[1].some((a) => String(a.id) === String(justAddedId)) ? 0 : 1
        if (xNew !== yNew) return xNew - yNew
        return x[0].localeCompare(y[0])
      })
      .map(([key, list]) => ({
        key,
        rows: [...list].sort((x, y) => {
          if (String(x.id) === String(justAddedId)) return -1
          if (String(y.id) === String(justAddedId)) return 1
          return String(x.name || '').localeCompare(String(y.name || ''))
        }),
      }))
  }, [rows, justAddedId])

  /* One chip per NGO carrying that NGO's event count for the chosen month. */
  const ngoOverview = useMemo(() => {
    const list = ngos.map((n) => {
      const s = ngoStats[String(n.id)] || {}
      return {
        ngo: n,
        label: ngoShortLabel(n),
        events: Number(s.events_count) || 0,
        done: Number(s.completed) || 0,
      }
    })
    return list.sort((a, b) => a.label.localeCompare(b.label))
  }, [ngos, ngoStats])

/* Progress against each NGO's monthly quota.
     Deliberately separate from ngoOverview above: there "done" means an event
     whose status is Completed, which is what the report header prints. Here
     "done" means a programme has been planned, which is what fills the quota —
     two different numbers, so they are not allowed to share a field.

     Built from the workspace NGO list, not from the monthly report's rows: that
     endpoint only returns an NGO that already has an event in the month, so an
     NGO with nothing planned yet would have no card at all instead of a
     readable 0 of 15.

     The cards follow the NGO dropdown rather than always listing everybody:
     picking BSCT shows BSCT's quota alone, "All NGOs" shows all three. The
     ngos table also holds rows that are not one of the three planning NGOs
     (a placeholder with no code), and on "All NGOs" those are dropped — a
     "0 of 15" card for a row that is not really an NGO is noise. Picked
     explicitly it still gets a card, because then it is the user's choice and
     an empty panel would be worse. */
  const ngoTargets = useMemo(() => ngos
    .filter((n) => ngo ? String(n.id) === String(ngo.id) : !!NGO_MONTHLY_TARGET[ngoCodeKey(n)])
    .map((n) => {
      const planned = Number(ngoStats[String(n.id)]?.events_count) || 0
      const target = monthlyTargetFor(n)
      return {
        ngo: n,
        label: ngoShortLabel(n),
        target,
        planned,
        remaining: Math.max(0, target - planned),
        over: Math.max(0, planned - target),
        pct: target > 0 ? Math.min(100, Math.round((planned / target) * 100)) : 0,
      }
    })
    .sort((a, b) => targetOrderFor(a.ngo) - targetOrderFor(b.ngo)
      || a.label.localeCompare(b.label)), [ngos, ngoStats, ngo])

  /* The header line: the quotas in view added up, next to what has been
     planned. Summed from ngoTargets so the headline can never drift from the
     cards below it, and named after the scope so it reads the same way as the
     cards do. */
  const targetTotals = useMemo(() => ngoTargets.reduce(
    (t, r) => ({ target: t.target + r.target, planned: t.planned + r.planned }),
    { target: 0, planned: 0 },
  ), [ngoTargets])

  /* Counts for whatever is in scope: the selected NGO, or every NGO on
     "All NGOs". Activities come from the activity feed, events from the
     report feed — the two answer different questions, so both are shown. */
  const scopeStats = useMemo(() => {
    const list = ngo
      ? ngoOverview.filter((r) => String(r.ngo.id) === String(ngo.id))
      : ngoOverview
    const events = list.reduce((s, r) => s + r.events, 0)
    const done = list.reduce((s, r) => s + r.done, 0)
    return { events, done, remaining: Math.max(0, events - done) }
  }, [ngo, ngoOverview])

  /* What the report's header states about the month. Taken from the same place
     as the cards, so the file and the screen can never disagree. These are the
     status-based counts (how many are Completed) and stay separate from the
     quota figures in the cards and the report header, where "Done" means
     programmes added. */
  const reportCounts = useMemo(() => ({
    events: scopeStats.events,
    completed: scopeStats.done,
    remaining: scopeStats.remaining,
  }), [scopeStats])

  /* ── Selected AI suggestions for this NGO + month. Fetched for the report
        only, so the download reflects every tick the user made across all
        activities, not just the ones on screen. */
  const [selectedSuggestions, setSelectedSuggestions] = useState([])
  // The off-screen node the PDF export captures. Kept in the normal flow (not
  // display:none) because html2canvas renders nothing for hidden nodes.
  const reportRef = useRef(null)
  const [downloading, setDownloading] = useState('')

/* No early return for "All NGOs": the report is downloadable from that scope
     too, and its AI column has to be filled from every NGO's ticked ideas. An
     empty ngo_id is dropped from the query, which is exactly the "all" case. */
  const loadSelectedSuggestions = useCallback(() => {
    const [y, m] = month.split('-').map(Number)
    return fetchPlannerSuggestions({ ngo_id: ngoId, month: m, year: y, selected_only: true })
      .then((l) => setSelectedSuggestions(Array.isArray(l) ? l : []))
      .catch(() => setSelectedSuggestions([]))
  }, [ngoId, month])

  useEffect(() => { loadSelectedSuggestions() }, [loadSelectedSuggestions])

  /* The ticked ideas that belong to the beneficiary in the filter.
     "All beneficiaries" is the unfiltered list, so the report still covers every
     decision the user has made. Picking a group narrows both the day rows and
     the "to be scheduled" list to that group, so the filter and the AI column
     can never describe different sets. */
  const scopedSuggestions = useMemo(() => {
    if (!beneficiaryFilter) return selectedSuggestions
    const want = beneficiaryFilter.trim().toLowerCase()
    const byId = new Map(activities.map((a) => [String(a.id), a]))
    return selectedSuggestions.filter((s) => {
      const a = byId.get(String(s?.activity_id))
      if (!a) return false
      return activityBeneficiary(a, ngos, ngo).toLowerCase() === want
    })
  }, [selectedSuggestions, activities, ngos, ngo, beneficiaryFilter])

  /* Suggestions indexed three ways, because a programme is linked to an idea in
     three different ways depending on how it was made:
       byEvent  — the idea recorded which programme it became (suggested_event_id)
       byTitle  — the programme was named after the idea, which is what happens to
                  the extra dates when one idea is planned on several days
       byActivity— neither of the above, so the idea belongs to that activity's
                  programmes but cannot be pinned to one of them
     The first two are exact; only the third is a guess, and it is the last
     resort. Guessing by activity alone is what made one idea appear on every
     programme of the activity. */
  /* Whether every activity on screen is already ticked. Drives the one bulk button
     in the section header, and is computed from the visible rows rather than from
     the NGO-wide total, so an active filter cannot make the button describe the
     wrong action. */
  const allShownTicked = rows.length > 0 && rows.every((a) => a.in_report === true)

  /* The activities the user has ticked for the download. This is the only rule
     that decides what the file contains - screen filters (sector, search,
     beneficiary) are for finding rows, not for editing the file. */
  const tickedActivityIds = useMemo(
    () => new Set(activities.filter((a) => a.in_report).map((a) => Number(a.id))),
    [activities]
  )

  const suggestionIndex = useMemo(() => {
    const byEvent = new Map()
    const byTitle = new Map()
    const byActivity = new Map()
    const norm = (v) => String(v ?? '').trim().toLowerCase()
    for (const s of scopedSuggestions) {
      const evId = Number(s?.suggested_event_id)
      if (Number.isFinite(evId) && evId > 0) {
        if (!byEvent.has(evId)) byEvent.set(evId, s)
      }
      const title = norm(s?.title)
      if (title) {
        const key = `${Number(s?.activity_id) || 0}::${title}`
        if (!byTitle.has(key)) byTitle.set(key, s)
      }
      const actId = Number(s?.activity_id)
      if (Number.isFinite(actId) && actId > 0) {
        if (!byActivity.has(actId)) byActivity.set(actId, [])
        byActivity.get(actId).push(s)
      }
    }
    return { byEvent, byTitle, byActivity, norm }
  }, [scopedSuggestions])

  /* One entry per programme the user planned, grouped by NGO. This is the single
     source the preview, the Excel sheet and the PDF all render. */
  const report = useMemo(() => {
    const nameByActivity = new Map(activities.map((a) => [Number(a.id), a]))
    const ngoById = new Map(ngos.map((n) => [String(n.id), n]))
    const { byEvent, byTitle, byActivity, norm } = suggestionIndex

    const rows = []
    for (const ev of monthEvents) {
      const p = ev.extendedProps || {}
      const date = String(p.date || '').slice(0, 10)
      if (!date) continue
      const acts = (Array.isArray(p.activities) ? p.activities : []).filter((a) => a?.name)
      const evId = Number(ev?.id)
      const title = String(ev?.title || '').split(' · ')[0].trim()

      let suggestion = Number.isFinite(evId) ? byEvent.get(evId) : null
      // No recorded link: an idea planned on several dates shares its name with
      // every one of them, so the name identifies it exactly.
      if (!suggestion) {
        for (const a of acts) {
          const hit = byTitle.get(`${Number(a.id) || 0}::${norm(title)}`)
          if (hit) { suggestion = hit; break }
        }
      }
      rows.push({
        eventId: evId,
        date,
        dateLabel: reportDate(date),
        weekday: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
        ngoId: p.ngoId ?? p.ngo_id ?? ev?.ngo_id ?? null,
        ngoLabel: ngoShortLabel(ngoById.get(String(p.ngoId ?? p.ngo_id ?? ev?.ngo_id ?? '')) || null),
        activityIds: acts.map((a) => Number(a.id)).filter((n) => Number.isFinite(n)),
        // A programme can belong to several activities, and flattening them into
        // one string is what made the file unreadable. Each is marked instead:
        // ticked ones are what the user chose, the rest are named so nothing
        // disappears silently.
        activity: acts.length
          ? acts.map((a) => (tickedActivityIds.has(Number(a.id))
            ? `${REPORT_TICK} ${a.name}`
            : `${a.name} (not selected)`)).join('\n')
          : '—',
        // Only a programme with at least one ticked activity is in the download.
        included: acts.some((a) => tickedActivityIds.has(Number(a.id))),
        programme: title || '—',
        status: String(ev?.status || p.status || '—'),
        suggestion: suggestion
          ? {
              id: suggestion.id,
              title: suggestion.title,
              priority: suggestion.priority || '',
              objective: suggestion.objective || '',
              materials: suggestion.materials || [],
            }
          : null,
      })
    }
    rows.sort((a, b) => (a.date === b.date ? a.programme.localeCompare(b.programme) : a.date.localeCompare(b.date)))

/* An idea with no programme of its own is still a decision the user made, so
    it is listed rather than dropped — but only when it genuinely has no
    programme. Anything sitting on a row above is already accounted for.

    An idea belonging to an unticked activity is not in the download: the file
    answers "the activities I chose", and an idea for an activity that was not
    chosen is not part of it. They are counted, so the omission is visible. */
const placedSuggestionIds = new Set(rows.map((r) => Number(r.suggestion?.id)).filter(Boolean))
const pendingAll = scopedSuggestions
      .filter((s) => !placedSuggestionIds.has(Number(s?.id)))
      .map((s) => ({
        id: s.id,
        title: s.title,
        priority: s.priority || '',
        objective: s.objective || '',
        materials: s.materials || [],
        activity: nameByActivity.get(Number(s?.activity_id))?.name || '—',
        activityId: Number(s?.activity_id),
        ngoLabel: ngoShortLabel(nameByActivity.get(Number(s?.activity_id))
          ? ngoById.get(String(nameByActivity.get(Number(s?.activity_id)).ngo_id))
          : null),
      }))
    const pending = pendingAll.filter((s) => tickedActivityIds.has(s.activityId))
    const suggestionsLeftOut = pendingAll.length - pending.length

    /* One block per NGO, taken from the NGOs actually in scope rather than from the
       quota cards. The cards deliberately hide NGOs with no quota entry, but a
       hidden card must not remove that NGO's programmes from the file — and
       reading the cards' own shape (which nests the NGO under `ngo`) is what
       previously matched every block against `undefined` and produced a report
       with no rows and no dates at all. */
    const scopeNgos = ngo ? [ngo] : ngos
    const inScope = (a) => !ngo || String(a?.ngo_id ?? '') === String(ngo.id)

    /* The named list the file leads with: which activities were ticked, and how
       much each one contributed this month. Without this the reader has to infer
       the selection from the rows, which is the guesswork being removed. */
    const selectedActivities = activities
      .filter((a) => a.in_report && inScope(a))
      .map((a) => ({
        id: Number(a.id),
        name: a.name,
        ngoLabel: ngoShortLabel(ngoById.get(String(a.ngo_id)) || null),
        programmes: rows.filter((r) => r.included && r.activityIds.includes(Number(a.id))).length,
      }))
      .sort((x, y) => (x.ngoLabel === y.ngoLabel ? x.name.localeCompare(y.name) : x.ngoLabel.localeCompare(y.ngoLabel)))

    const blocks = scopeNgos.map((n) => {
      const allRows = rows.filter((r) => String(r.ngoId) === String(n.id))
      const target = monthlyTargetFor(n)
      const done = allRows.length
      return {
        key: String(n.id),
        label: ngoShortLabel(n),
        name: n.name,
        target,
        // Quota counts programmes added, which is the rule it has always been, so
        // it must not move because a tick changed. What the file lists is counted
        // separately, or the two numbers look like they contradict each other.
        done,
        inReport: allRows.filter((r) => r.included).length,
        remaining: Math.max(0, target - done),
        over: Math.max(0, done - target),
        rows: allRows.filter((r) => r.included),
      }
    })

    /* Anything whose NGO is not in the loaded list (deleted NGO, or a row the
       workspace query did not return) still belongs in the file, collected into
       one trailing block instead of silently vanishing. */
    const claimed = new Set(blocks.map((b) => b.key))
    const orphans = rows.filter((r) => !claimed.has(String(r.ngoId)))
    if (orphans.length) {
      blocks.push({
        key: 'other',
        label: 'Other',
        name: 'Programmes whose NGO is not in the list',
        target: orphans.length,
        done: orphans.length,
        inReport: orphans.filter((r) => r.included).length,
        remaining: 0,
        over: 0,
        rows: orphans.filter((r) => r.included),
      })
    }

    const activitiesInScope = activities.filter(inScope)

    return {
      blocks,
      pending,
      selectedActivities,
      suggestionsLeftOut,
      /* Stated up front so the file can open by saying what it is, rather than the
         reader having to work it out from an empty table. */
      nothingSelected: selectedActivities.length === 0,
      activitiesInScope: activitiesInScope.length,
      totals: {
        target: blocks.reduce((s, b) => s + b.target, 0),
        done: blocks.reduce((s, b) => s + b.done, 0),
        remaining: blocks.reduce((s, b) => s + b.remaining, 0),
        over: blocks.reduce((s, b) => s + b.over, 0),
        inReport: blocks.reduce((s, b) => s + b.inReport, 0),
      },
    }
  }, [monthEvents, activities, ngos, ngo, suggestionIndex, scopedSuggestions, tickedActivityIds])

  const reportRows = report.blocks.flatMap((b) => b.rows)
  const unlinkedSuggestions = report.pending

  const reportMeta = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const label = `${MONTHS[m - 1]} ${y}`
    const code = String(ngo?.code || ngo?.id || 'all-ngos').replace(/[^A-Za-z0-9_-]/g, '')
    return {
      label,
      code,
      base: `monthly-planner-${code}-${MONTHS[m - 1]}-${y}`,
      ngoName: ngo?.name || 'All NGOs',
    }
  }, [month, ngo])

  /* The off-screen preview the PDF captures, and the row cache both downloads
     render from. Set together by prepareFestivalExport so the Excel file, the
     PDF and the counter describe the same selection. */
  const [festivalRows, setFestivalRows] = useState([])
  const [festivalRowsNgo, setFestivalRowsNgo] = useState('')
  const [festivalRowsLabel, setFestivalRowsLabel] = useState('')
  const [festivalRowsStamp, setFestivalRowsStamp] = useState('')

  /* The download is the user's selected programmes, freshly read so it always
     matches the server even if the UI has not reloaded since a tick. Sorted by
     date then festival, then passed through the shared mergeProgrammeRows
     normaliser — the final dedupe (unique key date + festival + NGO +
     beneficiary) so several selected AI programmes for the same festival export
     as ONE row with the programme titles comma-joined, never duplicate
     date/festival rows. The export row shape (title/status) is unchanged. */
  const buildFestivalExportRows = useCallback(async () => {
    const [y, m] = month.split('-').map(Number)
    const sel = await getFestivalSuggestions({ month: m, year: y, ngo_id: ngoId || undefined, selected_only: true })
      .catch(() => [])
    if (!Array.isArray(sel)) return []
    const ngoById = new Map(ngos.map((n) => [String(n.id), n]))
    const rows = sel
      .slice()
      .sort((a, b) => {
        if (a.observance_date !== b.observance_date) {
          return String(a.observance_date) < String(b.observance_date) ? -1 : 1
        }
        return String(a.festival || '').localeCompare(String(b.festival || ''))
      })
      .map((s) => {
        const n = ngoById.get(String(s.ngo_id))
        const observed = String(s.observance_date || '')
        return {
          date: observed,
          dateLabel: shortDate(observed),
          weekday: observed ? new Date(`${observed}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }) : '—',
          festival: s.festival || '—',
          ngoLabel: ngoShortLabel(n),
          beneficiary: s.beneficiary || '—',
          programme: s.title || '—',
          status: s.suggested_event_id ? 'Scheduled' : 'Draft',
        }
      })
    /* Rule 8: final validation/deduplication before Excel/PDF generation.
       mergeProgrammeRows collapses multiple programmes for the same festival onto
       its ONE row; blankRepeatedDates then shows each date once — the Date/Day
       cells fill only on the first row of that date, so a date with several
       festivals never repeats across its own rows in the export. */
    const merged = mergeProgrammeRows(rows, ['date', 'festival', 'ngoLabel', 'beneficiary'])
      .map((r) => ({ ...r, title: r.programme }))
    return blankRepeatedDates(merged, 'dateLabel', 'weekday')
  }, [month, ngos, ngoId])

  /* Loads the cut-down rows once, mirrors them into state (which the off-screen
     preview renders and the PDF captures), and waits two frames so the freshly
     committed DOM is what html2canvas sees. Returns the rows for Excel. */
  const prepareFestivalExport = async () => {
    const rows = await buildFestivalExportRows()
    setFestivalRows(rows)
    setFestivalRowsNgo(reportMeta.ngoName)
    setFestivalRowsLabel(reportMeta.label)
    setFestivalRowsStamp(new Date().toLocaleString('en-IN'))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return rows
  }

  const downloadExcel = async () => {
    if (!reportMeta.base) return
    setDownloading('excel')
    try {
      const XLSX = await import('xlsx-js-style')
      const headers = FESTIVAL_REPORT_HEADERS
      const thin = { style: 'thin', color: { rgb: 'D5D9E4' } }
      const headerStyle = {
        font: { bold: true, sz: 11, color: { rgb: '1F2430' } },
        fill: { fgColor: { rgb: 'E8ECF6' } },
        border: { top: thin, bottom: thin, left: thin, right: thin },
        alignment: { vertical: 'center', wrapText: true },
      }
      const bodyStyle = { font: { sz: 11, color: { rgb: '1F2430' } }, alignment: { vertical: 'top', wrapText: true } }

      /* One row per selected programme, freshly read, sorted by date then
         festival — the file and the "N programmes selected" counter can never
         disagree because both are counts over the same selected set. */
      const rows = await prepareFestivalExport()

      const aoa = [
        ['Monthly Planner — Festival Programmes'],
        ['NGO', festivalRowsNgo],
        ['Month', festivalRowsLabel],
        ['Generated', festivalRowsStamp],
        ['Selected programmes', `${rows.length}`],
        [],
        headers,
      ]
      for (const r of rows) {
        aoa.push([r.dateLabel, r.weekday, r.festival, r.ngoLabel, r.beneficiary, r.title, r.status])
      }
      if (!rows.length) {
        aoa.push([`No programmes selected. Tick an AI suggestion's box in the Activities grid, then download again — only selected programmes are listed.`])
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa)

      const titleCell = ws['A1']
      if (titleCell) titleCell.s = { font: { bold: true, sz: 14, color: { rgb: '1F2430' } } }
      // Header row sits at 6 (0-based), directly under the metadata block.
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 6, c })
        if (ws[addr]) ws[addr].s = headerStyle
      }
      for (let r = 7; r < aoa.length; r++) {
        for (let c = 0; c < headers.length; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          if (ws[addr]) ws[addr].s = bodyStyle
        }
      }

      ws['!cols'] = [{ wch: 11 }, { wch: 9 }, { wch: 26 }, { wch: 9 }, { wch: 20 }, { wch: 60 }, { wch: 10 }]
      ws['!rows'] = []
      ws['!rows'][0] = { hpt: 22 }
      for (let r = 7; r < aoa.length; r++) ws['!rows'][r] = { hpt: 64 }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Festival Programmes')
      XLSX.writeFile(wb, `${reportMeta.base}.xlsx`)
    } catch (e) {
      console.error('downloadExcel error:', e)
      setToast('Could not build the Excel report.')
    } finally {
      setDownloading('')
    }
  }

  /* The PDF is a capture of the off-screen festival preview below, so the file
     and the screen are the same document by construction. */
  const downloadPdf = async () => {
    const el = reportRef.current
    if (!el) return
    setDownloading('pdf')
    try {
      const rows = await prepareFestivalExport()
      if (!rows.length) {
        setToast('Nothing to export — tick some programmes first.')
        setDownloading('')
        return
      }
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

  /* The modal reports what it managed to save: an activity on its own, an
     activity plus its first programme, or an activity whose programme failed. */
  const onActivityAdded = ({ activity, programme, programmeError, date } = {}) => {
    setAddOpen(false)
    loadActivities()
    if (programme) {
      // A new event changes this month's counts and the report, so reload both.
      loadMonthEvents()
      loadNgoStats()
      showToast(`Activity “${activity?.name}” added and its programme scheduled on ${shortDate(date)} — it is on the calendar for ${monthLabel(month)}.`)
    } else {
      showToast(programmeError
        ? `Activity “${activity?.name}” ${programmeError}`
        : `Activity “${activity?.name}” added.`)
    }
    /* Straight into suggestions, which is the point of adding one from here —
       whether or not a first programme date was given. Opening the panel used to
       be skipped whenever a date was picked, so the most complete path through
       the form was the one that ended with no suggestions. */
    /* Remember the day the new programme landed on, so "View in Calendar" can
       jump straight to it instead of opening on whatever month it feels like.
       Taken from the form's own date rather than the response, which need not
       carry it, and dropped unless it belongs to the month on screen: the link
       always pairs one month with one date, and a date from another month would
       silently override the month. */
    const landed = String(date || programme?.date || '').slice(0, 10)
    setLastScheduled(landed.startsWith(`${month}-`) ? landed : '')
    if (ngo && activity?.id) {
      setJustAddedId(activity.id)
      setSuggestFor({
        ...activity,
        // The panel reads the activity row, and sector_name is only attached by
        // the activities feed — the create response does not carry it.
        sector_name: activity.sector_name
          || sectors.find((s) => String(s.id) === String(activity.sector_id))?.name
          || null,
      })
    }
    /* The row leads the list only while it is the new one. A later reload (a
       sector change, a search) drops it back into alphabetical order. */
    if (activity?.id) setTimeout(() => setJustAddedId((cur) => (String(cur) === String(activity.id) ? null : cur)), 12000)
  }

  /* The tick that decides what the download contains. Applied to the page first so
   the report and the preview move with the click, then saved; if the save fails
   the row goes back to what the server actually holds, because a tick that looks
   done but was not stored is worse than no tick. */
  const setActivityInReport = async (list, next) => {
    const targets = Array.isArray(list) ? list : [list]
    const ids = new Set(targets.map((a) => String(a?.id)).filter(Boolean))
    if (!ids.size) return
    const before = activities.filter((a) => ids.has(String(a.id)))
    setActivities((cur) => cur.map((a) => (ids.has(String(a.id)) ? { ...a, in_report: next } : a)))
    setTickBusy(true)
    try {
      const results = await Promise.allSettled(
        targets.map((a) => updateActivity(a.id, { in_report: next }))
      )
      const failed = results.filter((r) => r.status === 'rejected')
      // The server's own answer wins for every row that came back, so a row the
      // database refused cannot drift from what the next reload will show.
      const saved = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)
      if (saved.length) {
        const byId = new Map(saved.map((a) => [String(a.id), a]))
        setActivities((cur) => cur.map((a) => (byId.has(String(a.id)) ? { ...a, ...byId.get(String(a.id)) } : a)))
      }
      if (failed.length) {
        setActivities((cur) => cur.map((a) => (ids.has(String(a.id))
          ? { ...a, in_report: before.find((b) => String(b.id) === String(a.id))?.in_report === true }
          : a)))
        showToast(failed[0].reason?.message || 'Could not save the download selection.')
      } else {
        const what = next ? 'Included in the download' : 'Removed from the download'
        showToast(targets.length === 1 ? `${before[0]?.name || 'Activity'}: ${what.toLowerCase()}.` : `${targets.length} activities: ${what.toLowerCase()}.`)
      }
    } catch (e) {
      setActivities((cur) => cur.map((a) => (ids.has(String(a.id))
        ? { ...a, in_report: before.find((b) => String(b.id) === String(a.id))?.in_report === true }
        : a)))
      showToast(e?.message || 'Could not save the download selection.')
    } finally {
      setTickBusy(false)
    }
  }

  /* `suggestion` is set when the programme came from an AI idea rather than from
     the row's own "Add programme" button. */
  const afterPlanned = ({ suggestion, programmes = [], failed = [], lastDate } = {}) => {
    setPlanEntry(null)
    loadMonthEvents()
    loadNgoStats()
    setSuggestRev((v) => v + 1)
    // The report reads the page's own selected list, so it has to be re-read
    // after any change to what is ticked or linked.
    loadSelectedSuggestions()
    // Remember where the new programmes landed, so "View in Calendar" opens on
    // that day instead of wherever the calendar was left.
    const landed = String(lastDate || '').slice(0, 10)
    if (landed.startsWith(`${month}-`)) setLastScheduled(landed)

    const n = programmes.length
    const parts = []
    if (n > 0) parts.push(n === 1 ? '1 programme added' : `${n} programmes added`)
    if (suggestion) parts.push('kept in the report')
    if (failed.length) parts.push(`${failed.length} could not be saved`)
    if (parts.length) showToast(`${parts.join(' · ')}.`)
  }

  const monthName = monthLabel(month).split(' ')[0]

  /* Deletes the activity and reloads everything its absence changes: the
     activity list, this month's events (they lose the link), the counts and the
     ticked suggestions. `planned` is only what is on screen for this month —
     the server may unlink events in other months too, which is why the
     confirmation says "programmes" and not "programmes this month". */
  const confirmDelete = async () => {
    if (!deleteTarget?.activity?.id) return
    setDeleteBusy(true); setDeleteError('')
    const name = deleteTarget.activity.name
    try {
      await deleteActivity(deleteTarget.activity.id)
      setDeleteTarget(null)
      if (String(suggestFor?.id) === String(deleteTarget.activity.id)) setSuggestFor(null)
      setJustAddedId((cur) => (String(cur) === String(deleteTarget.activity.id) ? null : cur))
      loadActivities()
      loadMonthEvents()
      loadNgoStats()
      loadSelectedSuggestions()
      showToast(`Activity “${name}” deleted.`)
    } catch (e) {
      setDeleteError(e?.message || 'Could not delete the activity.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{SCROLLBAR_CSS}</style>
      <PageHeader
        title="Monthly Planner"
        subtitle={`Plan activities NGO-wise, month-wise · ${monthLabel(month)}`}
        actions={
          <button
            className="eh-btn eh-btn-primary"
            onClick={() => setAddOpen(true)}
            disabled={!ngo}
            title={ngo ? `Add an activity to ${ngo.name}` : 'Pick a single NGO to add an activity to it'}
          >
            + Add Activity
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <Field label="NGO">
            {/* Names only. A count here would sit above the cards that already
                report the numbers for the NGO in scope, and go stale the moment
                a month loads. */}
            <Select value={ngoId} onChange={(v) => { setNgoId(v); setSectorFilter(''); setBeneficiaryFilter(''); setSearch('') }} style={{ minWidth: 210 }}>
              <option value="">All NGOs</option>
              {ngos.map((n) => (
                <option key={n.id} value={n.id}>{ngoShortLabel(n)}</option>
              ))}
            </Select>
          </Field>

          <Field label="Month">
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

          <Field label="Beneficiary">
            <Select value={beneficiaryFilter} onChange={setBeneficiaryFilter} style={{ minWidth: 190 }}>
              {/* One option per beneficiary group in scope, so this is never empty. */}
              <option value="">All beneficiaries</option>
              {beneficiaryOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>

          <SearchInput value={search} onChange={setSearch} placeholder="Search activities…" style={{ flex: '1 1 180px', minWidth: 160 }} />

          {/* Carries the month across, so the calendar opens on the month being planned
              here instead of jumping to one that has events. After scheduling a
              programme it opens on that exact day. */}
          <button
            className="eh-btn"
            onClick={() => navigate(`/event-head/monthly-planner?month=${month}${lastScheduled ? `&date=${lastScheduled}` : ''}`)}
            title={`Open the Calendar view on ${monthLabel(month)}`}
          >
            View in Calendar
          </button>
        </div>
      </div>

      {/* Slim bar: what the download will contain, and the buttons themselves.
          There used to be a row of NGO chips here too, but that put a second
          set of event counts on screen — next to the NGO dropdown and the
          cards — and the three could disagree while a month was still loading.
          Counts now live in one place only: the cards, for the NGO in scope. */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div
          className="card-pad"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span style={{ fontSize: 11, color: 'var(--eh-ink-faint)' }}>
            {reportMeta.ngoName} · {monthLabel(month)} · {selectedFestivalCount} programme{selectedFestivalCount === 1 ? '' : 's'} selected for download
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="eh-btn"
              onClick={downloadExcel}
              disabled={downloading === 'excel'}
              title={`Selected festival programmes for ${reportMeta.ngoName}, ${monthLabel(month)} — as Excel`}
            >
              {downloading === 'excel' ? 'Building…' : 'Download Excel'}
            </button>
            <button
              className="eh-btn"
              onClick={downloadPdf}
              disabled={downloading === 'pdf'}
              title={`Selected festival programmes for ${reportMeta.ngoName}, ${monthLabel(month)} — as PDF`}
            >
              {downloading === 'pdf' ? 'Building…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ padding: '11px 16px', borderRadius: 12, background: 'var(--eh-success-soft)', color: 'var(--eh-success)', fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {/* How each NGO is tracking against its monthly quota. One card per NGO,
          always all of them: an NGO with nothing planned this month must still
          show a readable "0 of 15" instead of disappearing, because "no card"
          reads as "nothing to do" rather than "not started".
          The Activities card stays beside it — activities are what can be
          planned, the quota is what has been planned, and the two answer
          different questions. */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div
          className="card-pad"
          style={{ padding: '13px 15px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={LABEL}>Monthly target</span>
            <span style={{ fontSize: 12, color: 'var(--eh-ink-faint)' }}>{monthLabel(month)}</span>
          </div>
          {/* Totals summed from the cards below, so the headline can never
              disagree with the rows it summarises. Names the same scope the
              cards are showing: the picked NGO, or all three. */}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--eh-ink-soft)' }}>
            {loadingCounts
              ? 'Loading counts…'
              : `${ngo ? ngoShortLabel(ngo) : 'All NGOs'} — ${targetTotals.planned} of ${targetTotals.target} done · ${Math.max(0, targetTotals.target - targetTotals.planned)} remaining`}
          </span>
        </div>

        <div className="card-pad" style={{ paddingTop: 0, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {/* Activities are what can be planned; the quota cards below are what
              has been planned. No NGO label here: the quota card beside it and
              the Activities section header already name the NGO in scope, and
              repeating it three times on one screen is what made this hard to
              read. */}
          <div
            className="card"
            style={{ marginBottom: 0, flex: '1 1 150px', minWidth: 150 }}
            title="activities that can be planned this month"
          >
            <div className="card-pad" style={{ padding: '13px 15px' }}>
              <div style={LABEL}>Activities</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--eh-ink)' }}>{activities.length}</div>
            </div>
          </div>

          {ngoTargets.map((r) => {
            const over = r.over > 0
            const met = !over && r.remaining === 0
            // Green once the quota is met, amber while still short, amber-strong
            // when the month has overshot it.
            const bar = over ? '#b45309' : met ? 'var(--eh-success)' : 'var(--eh-primary)'
            return (
              <div
                key={String(r.ngo.id)}
                className="card"
                style={{ marginBottom: 0, flex: '1 1 220px', minWidth: 200 }}
                title={`${r.ngo.name} — ${r.planned} of ${r.target} programmes planned for ${monthLabel(month)}`}
              >
                <div className="card-pad" style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: 'var(--eh-primary)' }}>
                    {r.label}
                  </div>

                  {/* The headline: how many of the quota are planned. */}
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--eh-ink)', lineHeight: 1.1 }}>
                    {loadingCounts ? '…' : r.planned}
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--eh-ink-faint)' }}> of {r.target}</span>
                  </div>

                  {/* Bar plus its own caption, so the fill is never read on its
                      own. Hidden while loading rather than drawn empty, which
                      would look like a real 0 before the counts arrive. */}
                  {!loadingCounts && (
                    <>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--eh-surface-2, #eef0f7)', overflow: 'hidden' }}>
                        <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: 999, background: bar, transition: 'width .25s' }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: over ? '#9a8200' : 'var(--eh-ink-faint)' }}>
                        {over ? `over target by ${r.over}` : met ? 'target met' : `${r.pct}% of target planned`}
                      </div>
                    </>
                  )}

                  {/* The three numbers spelled out, in the words the plan uses. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                    {[
                      { label: 'Target', value: r.target, color: 'var(--eh-ink-soft)' },
                      { label: 'Done', value: r.planned, color: 'var(--eh-success)' },
                      { label: 'Remaining', value: r.remaining, color: r.remaining ? '#9a8200' : 'var(--eh-success)' },
                    ].map((s) => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--eh-ink-soft)' }}>{s.label}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: s.color }}>
                          {loadingCounts ? '…' : s.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-pad" style={{ padding: '13px 15px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={LABEL}>Activities</span>
          <span style={{ fontSize: 12, color: 'var(--eh-ink-faint)' }}>{reportMeta.ngoName} · {monthLabel(month)}</span>
          {/* The tick decides what the download contains, so the count is stated
              here rather than left to be discovered in the file. */}
          {selectedFestivalCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--eh-success)', fontWeight: 700 }}>
              {selectedFestivalCount} programme{selectedFestivalCount === 1 ? '' : 's'} selected for download
            </span>
          )}
          {festivalSuggestions.length > 0 && (
            <>
              <button
                className="eh-btn eh-btn-sm"
                style={{ marginLeft: 'auto' }}
                disabled={festBusy}
                title="Tick every festival programme shown for the download"
                onClick={() => setFestivalSelectionAll(true)}
              >
                Select all
              </button>
              <button
                className="eh-btn eh-btn-sm"
                disabled={festBusy}
                title="Clear every download tick shown"
                onClick={() => setFestivalSelectionAll(false)}
              >
                Clear selection
              </button>
            </>
          )}
        </div>

        {festivalError && (
          <div style={{ margin: '0 15px 15px', padding: '11px 14px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)', fontSize: 13 }}>{festivalError}</div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <style>{FEST_GRID_CSS}</style>
          <table className="eh-fest-grid">
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '31%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Festival / Day</th>
                <th>NGO</th>
                <th>Beneficiary</th>
                <th>AI Suggestion</th>
                <th>Select</th>
              </tr>
            </thead>
            <tbody>
              {festivalDates.map((date) => {
                const obs = observancesByDate[date] || []
                if (!obs.length) {
                  return (
                    <tr key={date}>
                      <td className="dd divider">{shortDate(date)}</td>
                      <td className="plain divider" colSpan={5}>No important day</td>
                    </tr>
                  )
                }
                // Each festival is one block: the date, festival name, NGO and
                // beneficiary are written once and span the block, while every
                // programme keeps its own compact row in AI SUGGESTION + SELECT.
                // Sub-dividers cut only those two columns between ideas, so the
                // suggestions stay visually tied to their festival without any
                // giant blank cells. Full dividers separate festival blocks.
                const blockRows = (o) => {
                  const key = `${date}::${o.name}`
                  return Math.max(1, (festivalSuggestionsByKey[key] || []).length)
                }
                const totalRows = obs.reduce((acc, o) => acc + blockRows(o), 0)
                const festivalCell = (o) => (
                  <>
                    <span className="ff-name">{o.name}</span>
                    {o.type && <span className="ff-type"><span className="ff-dot" />{capFirst(o.type)}</span>}
                  </>
                )
                return obs.map((o, oi) => {
                  const key = `${date}::${o.name}`
                  const sugg = festivalSuggestionsByKey[key] || []
                  const generating = festGenerating?.key === key
                  const trs = []
                  if (sugg.length === 0) {
                    // No programmes yet — one slim action row with the generate
                    // button where the first idea title would sit.
                    trs.push(
                      <tr key={`${key}-g`}>
                        {oi === 0 && <td className="dd divider" rowSpan={totalRows}>{shortDate(date)}</td>}
                        <td className="ff divider">{festivalCell(o)}</td>
                        <td className="ng divider"><span className="ng-pill">{festivalNgoLabel}</span></td>
                        <td className="bn divider">{festivalBeneficiary}</td>
                        <td className="ai divider nowrap">
                          <button
                            className="eh-btn eh-btn-sm"
                            disabled={!ngoId || festGenerating !== null}
                            title={!ngoId
                              ? 'Pick a single NGO to generate festival programmes for it'
                              : festGenerating
                                ? 'A festival programme set is already generating'
                                : `Generate AI programme ideas for ${o.name}`}
                            onClick={() => suggestFestival(date, o.name)}
                          >
                            {generating ? 'Generating…' : '✦ Suggest programmes'}
                          </button>
                        </td>
                        <td className="sel divider" />
                      </tr>
                    )
                    return trs
                  }
                  sugg.forEach((s, si) => {
                    const firstRow = si === 0
                    const notLast = si < sugg.length - 1
                    const cells = []
                    if (firstRow) {
                      if (oi === 0) cells.push(<td key="d" className="dd divider" rowSpan={totalRows}>{shortDate(date)}</td>)
                      cells.push(
                        <td key="f" className="ff divider" rowSpan={sugg.length}>{festivalCell(o)}</td>,
                        <td key="n" className="ng divider" rowSpan={sugg.length}><span className="ng-pill">{festivalNgoLabel}</span></td>,
                        <td key="b" className="bn divider" rowSpan={sugg.length}>{festivalBeneficiary}</td>,
                      )
                    }
                    const aiCls = `ai${firstRow ? ' divider' : ''}${notLast ? ' subline' : ''}`
                    const selCls = `sel${firstRow ? ' divider' : ''}${notLast ? ' subline' : ''}`
                    cells.push(
                      <td key="a" className={aiCls}>
                        <span className="ai-title">{s.title || '—'}</span>
                        {(s.format || s.priority) && (
                          <span className="ai-badges">
                            {s.format && <Badge tone="primary">{s.format}</Badge>}
                            {s.priority && <Badge tone={PRIORITY_TONE[s.priority] || 'muted'}>{s.priority}</Badge>}
                          </span>
                        )}
                      </td>,
                      <td key="c" className={selCls}>
                        <input
                          type="checkbox"
                          checked={Boolean(s.is_selected)}
                          disabled={festBusy}
                          title={s.is_selected ? `${s.title} is in the download. Untick to leave it out.` : `${s.title} is not in the download. Tick to include it.`}
                          onChange={(e) => toggleFestivalSuggestion(s, e.target.checked)}
                        />
                      </td>,
                    )
                    trs.push(
                      <tr key={String(s.id)} className={`sel-row${s.is_selected ? ' sel' : ''}`}>
                        {cells}
                      </tr>
                    )
                  })
                  return trs
                })
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Off-screen preview. The Excel sheet, this node and the PDF all read the
        same festivalRows state (set by prepareFestivalExport before either
        download starts), so the screen can never promise something the file
        does not deliver — and the PDF is captured from here. */}
      <div
        ref={reportRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-10000px', top: 0, width: 1100, background: '#fff', padding: 24, fontFamily: 'inherit' }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1F2430' }}>Monthly Planner — Festival Programmes</div>
        <div style={{ fontSize: 12, color: '#4A5061', marginTop: 4 }}>NGO: {festivalRowsNgo}</div>
        <div style={{ fontSize: 12, color: '#4A5061' }}>Month: {festivalRowsLabel}</div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Generated: {festivalRowsStamp}</div>

        {/* Names the selection before any row is shown, so the reader can tell
            what the file is from without inferring it. */}
        <div style={{ fontSize: 12, fontWeight: 800, color: '#1F2430', marginTop: 14 }}>
          SELECTED PROGRAMMES — {festivalRows.length}
        </div>

        {festivalRows.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 11 }}>
            <thead>
              <tr>
                {FESTIVAL_REPORT_HEADERS.map((h) => (
                  <th key={h} style={{ border: '1px solid #D5D9E4', background: '#E8ECF6', padding: '5px 6px', textAlign: 'left', fontWeight: 700, color: '#1F2430' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {festivalRows.map((r, i) => (
                <tr key={`${r.dateLabel}-${r.festival}-${i}`} style={{ background: i % 2 ? '#F7F8FC' : '#fff' }}>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.dateLabel}</td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px' }}>{r.weekday}</td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', whiteSpace: 'pre-wrap' }}>{r.festival}</td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px' }}>{r.ngoLabel}</td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px' }}>{r.beneficiary}</td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px', whiteSpace: 'pre-wrap', fontWeight: 600 }}>{r.title}</td>
                  <td style={{ border: '1px solid #D5D9E4', padding: '5px 6px' }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 11, color: '#8A5A00', background: '#FFF7E6', border: '1px solid #F0D9A8', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
            No programmes selected. Tick an AI suggestion’s box in the Activities grid, then
            download again — only selected programmes are listed.
          </div>
        )}
      </div>

      {addOpen && (
        <AddActivityModal
          ngo={ngo}
          sectors={sectors}
          month={month}
          onClose={() => setAddOpen(false)}
          onSaved={onActivityAdded}
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

      {deleteTarget && (
        <ModalShell
          title="Delete activity"
          subtitle={deleteTarget.activity.name}
          width={520}
          onClose={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError('') } }}
          footer={
            <>
              <button className="eh-btn" onClick={() => { setDeleteTarget(null); setDeleteError('') }} disabled={deleteBusy}>Cancel</button>
              <button
                className="eh-btn eh-btn-primary"
                style={{ background: 'var(--eh-danger)', borderColor: 'var(--eh-danger)' }}
                onClick={confirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--eh-ink)' }}>
            <p style={{ margin: 0 }}>
              This permanently deletes <b>{deleteTarget.activity.name}</b>. This cannot be undone.
            </p>
            {/* Say what goes with it, so the count is a decision and not a surprise. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span>
                <b>{(deleteTarget.planned || []).length}</b> programme{(deleteTarget.planned || []).length === 1 ? '' : 's'} planned in {monthLabel(month)} will stay on the calendar, but will no longer be linked to this activity.
              </span>
              <span>The activity’s AI suggestions will be deleted with it.</span>
            </div>
            {deleteError && (
              <div style={{ padding: '10px 13px', borderRadius: 12, background: 'var(--eh-danger-soft)', color: 'var(--eh-danger)' }}>{deleteError}</div>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  )
}

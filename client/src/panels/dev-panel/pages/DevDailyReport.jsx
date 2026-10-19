import { useState } from 'react'
import DailyReport from '../../../components/DailyReport/DailyReport'
import { developerSections } from '../../../components/DailyReport/configs'
import { getMyUnifiedTickets } from '../api/tickets'
import { fetchBugActivity } from '../../../api/dailyReports'
import { toast } from '../components/Toast'
import DevMonthly from './DevMonthly'

// Developer daily report. The ticket counts are derived live from the same
// endpoint the rest of the dev panel uses; only the prose fields are stored.
//
// Two modes share this page:
//   Daily   — the shared DailyReport editor (today, or the day handed back by
//             Monthly's "Edit this day").
//   Monthly — your filed reports for the month, day chips + totals, read-only.
// Monthly is the read surface; any edit jumps back to Daily on that date, which
// is why DailyReport is remounted with a key when the date changes (its date
// state is internal).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const istDateOf = (ts) => {
  if (!ts) return null
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10)
}
const todayIst = () => istDateOf(Date.now())
const currentMonth = () => todayIst().slice(0, 7)

// Same rule as MyTickets: a ticket is active until it is resolved or closed.
const isDone = (t) => t.status === 'resolved' || t.status === 'closed'
const isActive = (t) => !isDone(t)

const loadSummary = async (date) => {
  const [data, bugRes] = await Promise.all([
    getMyUnifiedTickets(),
    // My own bug-tracker actions for the day. The feed is scoped server-side
    // to the signed-in user, so this is only ever my work.
    fetchBugActivity(date, date).catch(() => null),
  ])
  const tickets = Array.isArray(data) ? data : []

  const createdToday = tickets.filter((t) => istDateOf(t.created_at) === date).length
  const resolvedToday = tickets.filter(
    (t) => isDone(t) && istDateOf(t.resolved_at || t.closed_at) === date,
  ).length
  const active = tickets.filter(isActive)
  const critical = active.filter((t) => ['critical', 'high'].includes(t.priority)).length

  const activity = Array.isArray(bugRes?.activity) ? bugRes.activity : []
  const countKind = (kind) => activity.filter((e) => e.kind === kind).length

  return {
    cards: [
      { label: 'Active tickets', value: active.length },
      { label: 'Created today', value: createdToday },
      { label: 'Resolved today', value: resolvedToday },
      { label: 'In progress', value: active.filter((t) => t.status === 'in_progress').length },
      { label: 'Critical / High pending', value: critical },
      // Bug-tracker work counts as work: a day spent filing and closing bugs
      // shows here even when no task was written into the report.
      { label: 'Bugs reported today', value: countKind('reported') },
      { label: 'Bugs fixed today', value: countKind('fixed') },
      { label: 'Bugs verified today', value: countKind('verified') },
    ],
  }
}

const SEG = { display: 'flex', gap: 3, padding: 3, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg, #f8fafc)' }
const SEG_BTN = {
  padding: '6px 14px', border: 0, borderRadius: 8, background: 'transparent', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 650, color: 'var(--ink-soft)', transition: 'all .15s ease',
}
const SEG_ON = { background: 'var(--card-bg, #fff)', color: '#6366f1', boxShadow: '0 1px 2px rgba(15,23,42,.10)' }

export default function DevDailyReport() {
  const [mode, setMode] = useState('daily')
  const [month, setMonth] = useState(currentMonth())
  // Day the editor opens on when Monthly hands one back; null keeps today.
  const [editDay, setEditDay] = useState(null)

  const openInDaily = (iso) => {
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) setEditDay(iso)
    setMode('daily')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={SEG} role="group" aria-label="Report period">
          <button
            type="button"
            style={{ ...SEG_BTN, ...(mode === 'daily' ? SEG_ON : {}) }}
            aria-pressed={mode === 'daily'}
            onClick={() => { setEditDay(null); setMode('daily') }}
          >
            Daily
          </button>
          <button
            type="button"
            style={{ ...SEG_BTN, ...(mode === 'monthly' ? SEG_ON : {}) }}
            aria-pressed={mode === 'monthly'}
            onClick={() => setMode('monthly')}
          >
            Monthly
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
          {mode === 'daily' ? 'Write today’s tasks, bugs and plan' : 'Read your reports, day by day'}
        </div>
      </div>

      {mode === 'monthly' ? (
        <DevMonthly month={month} onMonthChange={setMonth} onEditDay={openInDaily} />
      ) : (
        <DailyReport
          key={editDay || 'today'}
          panel="dev"
          title="Daily Developer Report"
          subtitle="Your tickets, work and plan for the day"
          sections={developerSections}
          loadSummary={loadSummary}
          summaryTitle="My ticket summary"
          notify={toast}
          initialDate={editDay || todayIst()}
        />
      )}
    </div>
  )
}

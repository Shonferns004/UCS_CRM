import DailyReport from '../../../components/DailyReport/DailyReport'
import { developerSections } from '../../../components/DailyReport/configs'
import { getMyUnifiedTickets } from '../api/tickets'
import { toast } from '../components/Toast'

// Developer daily report. The ticket counts are derived live from the same
// endpoint the rest of the dev panel uses; only the prose fields are stored.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const istDateOf = (ts) => {
  if (!ts) return null
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10)
}

// Same rule as MyTickets: a ticket is active until it is resolved or closed.
const isDone = (t) => t.status === 'resolved' || t.status === 'closed'
const isActive = (t) => !isDone(t)

const loadSummary = async (date) => {
  const data = await getMyUnifiedTickets()
  const tickets = Array.isArray(data) ? data : []

  const createdToday = tickets.filter((t) => istDateOf(t.created_at) === date).length
  const resolvedToday = tickets.filter(
    (t) => isDone(t) && istDateOf(t.resolved_at || t.closed_at) === date,
  ).length
  const active = tickets.filter(isActive)
  const critical = active.filter((t) => ['critical', 'high'].includes(t.priority)).length

  return {
    cards: [
      { label: 'Active tickets', value: active.length },
      { label: 'Created today', value: createdToday },
      { label: 'Resolved today', value: resolvedToday },
      { label: 'In progress', value: active.filter((t) => t.status === 'in_progress').length },
      { label: 'Critical / High pending', value: critical },
    ],
  }
}

export default function DevDailyReport() {
  return (
    <DailyReport
      panel="dev"
      title="Daily Developer Report"
      subtitle="Your tickets, work and plan for the day"
      sections={developerSections}
      loadSummary={loadSummary}
      summaryTitle="My ticket summary"
      notify={toast}
    />
  )
}
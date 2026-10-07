import { renewalInfo, daysUntil } from './meta.js'
import { formatDate } from './formUtils.js'

// Highlighted "Applied" date chip (application created date).
export function AppliedDate({ iso }) {
  if (!iso) return null
  return (
    <span className="date-tag date-applied" title={`Applied on ${formatDate(iso)}`}>
      <b>Applied</b> {formatDate(iso)}
    </span>
  )
}

// Membership date chip.
// approved → "Renewal" chip with urgency tone: red = expired, amber = due
//            within 30 days, green = safe.
// pending  → "Starts" chip counting down to the planned start date (the
//            renewal countdown only means something once the membership
//            actually exists).
// rejected → nothing.
export function RenewalDate({ row }) {
  if (!row || row.status === 'REJECTED') return null

  if (row.status !== 'APPROVED') {
    if (!row.start_date) return null
    const d = daysUntil(row.start_date)
    if (d === null) return null
    const suffix = d > 0 ? `· in ${d}d` : d === 0 ? '· today' : ''
    const title =
      d > 0
        ? `Membership starts: ${formatDate(row.start_date)} - in ${d} day${d === 1 ? '' : 's'}`
        : d === 0
          ? `Membership starts: ${formatDate(row.start_date)} - today`
          : `Planned start date passed: ${formatDate(row.start_date)} - awaiting approval`
    return (
      <span className={`date-tag date-starts ${d < 0 ? 'tone-past' : 'tone-next'}`} title={title}>
        <b>Starts</b> {formatDate(row.start_date)} {suffix && <i>{suffix}</i>}
      </span>
    )
  }

  const info = renewalInfo(row)
  if (!info || !row.end_date) return null

  let suffix = ''
  let title = `Renewal date: ${formatDate(row.end_date)}`
  if (info.days < 0) {
    suffix = `· ${info.rel} ago`
    title += ` - expired ${info.rel} ago`
  } else if (info.days === 0) {
    suffix = '· today'
    title += ' - expires today'
  } else if (info.tone === 'soon') {
    suffix = `· in ${info.rel}`
    title += ` - in ${info.rel}`
  } else {
    title += ` - in ${info.rel}`
  }

  return (
    <span className={`date-tag date-renewal tone-${info.tone}`} title={title}>
      <b>Renewal</b> {formatDate(row.end_date)} {suffix && <i>{suffix}</i>}
    </span>
  )
}

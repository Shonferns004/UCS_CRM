import { renewalInfo } from './meta.js'
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

// Highlighted "Renewal" date chip (membership end date) with urgency tone:
// red = expired, amber = due within 30 days, green = safe.
export function RenewalDate({ row }) {
  const info = renewalInfo(row)
  if (!info || !row.end_date) return null

  let suffix = ''
  let title = `Renewal date: ${formatDate(row.end_date)}`
  if (info.days < 0) {
    suffix = `· ${info.rel} ago`
    title += ` — expired ${info.rel} ago`
  } else if (info.days === 0) {
    suffix = '· today'
    title += ' — expires today'
  } else if (info.tone === 'soon') {
    suffix = `· in ${info.rel}`
    title += ` — in ${info.rel}`
  } else {
    title += ` — in ${info.rel}`
  }

  return (
    <span className={`date-tag date-renewal tone-${info.tone}`} title={title}>
      <b>Renewal</b> {formatDate(row.end_date)} {suffix && <i>{suffix}</i>}
    </span>
  )
}

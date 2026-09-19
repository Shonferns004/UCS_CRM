export const FRO_TIME_ZONE = 'Asia/Kolkata'

export function istDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: FRO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date))
  const values = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function istDateTimeToIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}/.test(String(time))) return null
  const parsed = new Date(`${date}T${String(time).slice(0, 5)}:00+05:30`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function formatIstTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', { timeZone: FRO_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: true })
}

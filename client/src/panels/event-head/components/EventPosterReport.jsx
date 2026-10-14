import { forwardRef } from 'react'

const ord = (n) => { const s=['th','st','nd','rd'], v=n%100; return n + (s[(v-20)%10]||s[v]||s[0]) }

const EventPosterReport = forwardRef(function EventPosterReport(
  { title, subtitle, date, description, venue, teamMembers = [], photos = [], logoUrl }, ref) {
  const d = new Date(date + 'T00:00:00')
  const dateText = `${ord(d.getDate())} ${d.toLocaleString('en', { month: 'long' })}, ${d.getFullYear()}`
  return (
    <div ref={ref} style={{ width: 794, height: 1123, background: '#0b4fa8', padding: 15, display: 'flex', flexDirection: 'column' }}>
      {/* header, date band, 6 photos, description, footer:
          template ke HTML/CSS ko yahin JSX mein copy karo
          (class → className, style strings → objects) */}
    </div>
  )
})
export default EventPosterReport
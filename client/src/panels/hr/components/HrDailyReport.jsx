import DailyReport from '../../../components/DailyReport/DailyReport'
import { hrSections, withCommon } from '../../../components/DailyReport/configs'
import { api } from '../../../api/auth'

// HR daily report. Attendance figures are derived live from the HR attendance
// endpoint; joinings, exits and the rest of the prose are stored in the shared
// daily_reports table under panel="hr".

const sections = withCommon(hrSections)

const loadSummary = async (date) => {
  const res = await api(`/hr-reports/attendance-summary?date=${encodeURIComponent(date)}`, { _prefix: 'ucs' })
  return {
    cards: [
      { label: 'Total staff', value: res?.total_staff ?? '—' },
      { label: 'Present', value: res?.present ?? '—' },
      { label: 'On leave', value: res?.on_leave ?? '—' },
      { label: 'Absent', value: res?.absent ?? '—' },
    ],
  }
}

export default function HrDailyReport() {
  return (
    <DailyReport
      panel="hr"
      title="Daily HR Report"
      subtitle="Attendance, joinings, exits and HR activities"
      sections={sections}
      loadSummary={loadSummary}
      summaryTitle="Attendance today"
    />
  )
}

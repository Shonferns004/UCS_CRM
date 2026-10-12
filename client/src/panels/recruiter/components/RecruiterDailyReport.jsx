import DailyReport from '../../../components/DailyReport/DailyReport'
import { recruiterSections, withCommon } from '../../../components/DailyReport/configs'

// Recruiter daily report. Hiring figures are typed (there is no live recruiter
// stats endpoint wired here); only the prose is stored, under panel="recruiter".

const sections = withCommon(recruiterSections)

export default function RecruiterDailyReport() {
  return (
    <DailyReport
      panel="recruiter"
      title="Daily Recruiter Report"
      subtitle="Vacancies, candidates, interviews and offers"
      sections={sections}
      summaryTitle="Today at a glance"
    />
  )
}

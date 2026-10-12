import DailyReport from '../../../components/DailyReport/DailyReport'
import { socialSections, withCommon } from '../../../components/DailyReport/configs'

// Social Media daily report. There is no platform integration in this codebase,
// so every figure here is typed by the reporter; only the prose is stored. Uses
// the shared DailyReport engine with the social section config.

const sections = withCommon(socialSections)

export default function SocialDailyReport() {
  return (
    <DailyReport
      panel="social"
      title="Daily Social Media Report"
      subtitle="Content, reach and plan for the day"
      sections={sections}
      summaryTitle="Today at a glance"
    />
  )
}

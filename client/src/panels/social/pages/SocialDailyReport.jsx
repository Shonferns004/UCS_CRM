import DailyReport from '../../../components/DailyReport/DailyReport'
import { socialSections, withCommon } from '../../../components/DailyReport/configs'
import { fetchTaskAssignments } from '../../../api/taskAssignments'

// Social Media daily report. There is no platform integration in this codebase,
// so every figure here is typed by the reporter; only the prose is stored. Uses
// the shared DailyReport engine with the social section config.
//
// `loadAssignedTasks` pulls the read-only tasks a manager assigned to this
// reporter (backend/routes/taskAssignmentRoutes.js); the reporter keeps their
// own editable list in the "My Tasks" section below it. Every assignment is
// shown with its own date rather than only the day on screen, so a member sees
// tasks planned for another day of the month too instead of an empty block.

const sections = withCommon(socialSections)

const loadAssignedTasks = () =>
  fetchTaskAssignments()
    .then((res) =>
      (res?.assigned_to_me || [])
        .slice()
        .sort((a, b) => String(a.task_date || '').localeCompare(String(b.task_date || '')))
    )
    .catch(() => [])

export default function SocialDailyReport() {
  return (
    <DailyReport
      panel="social"
      title="Daily Social Media Report"
      subtitle="Content, reach and plan for the day"
      sections={sections}
      summaryTitle="Today at a glance"
      loadAssignedTasks={loadAssignedTasks}
      lockToToday
    />
  )
}

import DailyReport from '../../../components/DailyReport/DailyReport'
import { socialSections, withCommon } from '../../../components/DailyReport/configs'
import { fetchTaskAssignments, fetchTaskMonthAssignments } from '../../../api/taskAssignments'

// Social Media daily report. There is no platform integration in this codebase,
// so every figure here is typed by the reporter; only the prose is stored. Uses
// the shared DailyReport engine with the social section config.
//
// `loadAssignedTasks` pulls the read-only tasks a manager assigned to this
// reporter (backend/routes/taskAssignmentRoutes.js); the reporter keeps their
// own editable list in the "My Tasks" section below it. Every task assigned to
// the member is shown whatever its date — a task planned for another day must
// not disappear just because the report is opened on a different date. Each
// card carries its own date, so the day is still clear.

const sections = withCommon(socialSections)

const loadAssignedTasks = () =>
  fetchTaskAssignments()
    .then((res) => (res?.assigned_to_me || []).slice())
    .catch(() => [])

// The whole Social team's assignments for the month of the day on screen, so the
// report can show a date-wise schedule of who is doing what. The backend returns
// every assignment (not just mine) to the Social team.
const loadTeamTasks = (date) =>
  fetchTaskMonthAssignments(String(date || '').slice(0, 7))
    .then((res) => res?.assignments || [])
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
      loadTeamTasks={loadTeamTasks}
    />
  )
}

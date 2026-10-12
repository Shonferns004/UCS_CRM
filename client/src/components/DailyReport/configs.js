// Field configs for the shared DailyReport engine, one block per department plus
// the four sections every report carries. DailyReport only renders `sections`
// and persists whatever the reporter typed under `data`; nothing here touches
// the network. `type` is one of the field types DailyReport knows: 'text',
// 'textarea', 'lines' or 'checklist' (an add → pending → Done task list).

export const commonSections = [
  {
    id: 'completed',
    label: 'Work Completed Today',
    fields: [
      { id: 'completed', label: 'Completed work', type: 'textarea', rows: 4, placeholder: 'What you finished today' },
    ],
  },
  {
    id: 'pending',
    label: 'Pending Work',
    description: 'Add a reason for anything still open',
    fields: [
      { id: 'pending', label: 'Pending work and why it is pending', type: 'textarea', rows: 4 },
    ],
  },
  {
    id: 'support',
    label: 'Support Required from HOD',
    fields: [
      { id: 'support', label: 'Issues needing HOD support / approval', type: 'textarea', rows: 3, placeholder: 'Leave blank if none' },
    ],
  },
  {
    id: 'nextday',
    label: 'Next Working Day Plan',
    fields: [
      { id: 'nextday', label: 'Plan for the next working day', type: 'lines', rows: 4 },
    ],
  },
]

export const developerSections = [
  {
    id: 'tasks',
    label: "Today's Tasks",
    description: 'Add a task, then tick it to move it to Done',
    fields: [
      { id: 'tasks', label: 'Tasks', type: 'checklist', placeholder: 'e.g. Fix login bug on CRM' },
    ],
  },
  {
    id: 'dev_notes',
    label: 'Bugs & Technical Blocks',
    fields: [
      { id: 'technical_issues', label: 'Bugs fixed / technical issues faced', type: 'textarea', rows: 3, placeholder: 'Leave blank if none' },
    ],
  },
  {
    id: 'support',
    label: 'Support Required from HOD',
    fields: [
      { id: 'support', label: 'Issues needing HOD support / approval', type: 'textarea', rows: 3, placeholder: 'Leave blank if none' },
    ],
  },
  {
    id: 'nextday',
    label: 'Next Working Day Plan',
    fields: [
      { id: 'nextday', label: 'Plan for the next working day', type: 'lines', rows: 4 },
    ],
  },
]

export const hrSections = [
  {
    id: 'hr_people',
    label: 'Joinings, Exits & Attendance',
    description: 'The attendance summary above is computed live',
    fields: [
      { id: 'new_joinings', label: 'New joinings', type: 'textarea', rows: 2 },
      { id: 'exits', label: 'Exits / resignations / terminations', type: 'textarea', rows: 2 },
      { id: 'wfh', label: 'Work from home (names / count)', type: 'textarea', rows: 2 },
      { id: 'attendance_notes', label: 'Attendance notes (absentees, exceptions)', type: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'hr_employee_mgmt',
    label: 'Employee Management',
    fields: [
      { id: 'issues_received', label: 'Employee issues received', type: 'number', placeholder: 'Count' },
      { id: 'issues_resolved', label: 'Issues resolved', type: 'number', placeholder: 'Count' },
      { id: 'issues_pending', label: 'Issues pending', type: 'number', placeholder: 'Count' },
      { id: 'disciplinary_actions', label: 'Disciplinary actions taken', type: 'textarea', rows: 2 },
      { id: 'documents', label: 'Documents collected / pending', type: 'textarea', rows: 2 },
    ],
  },
  {
    id: 'hr_activities',
    label: 'HR Activities',
    fields: [
      { id: 'hr_activities', label: 'HR activities done today', type: 'textarea', rows: 4, placeholder: 'One activity per line' },
      {
        id: 'hr_pending',
        label: 'Pending HR tasks',
        description: 'Task, reason it is pending, expected completion',
        type: 'rows',
        placeholder: 'Task',
      },
    ],
  },
]

export const recruiterSections = [
  {
    id: 'rec_performance',
    label: 'Recruitment Performance',
    fields: [
      { id: 'total_vacancies', label: 'Total Vacancies', type: 'number' },
      { id: 'new_candidates_sourced', label: 'New Candidates Sourced', type: 'number' },
      { id: 'candidates_contacted', label: 'Candidates Contacted', type: 'number' },
      { id: 'calls_connected', label: 'Calls Connected', type: 'number' },
      { id: 'interviews_scheduled', label: 'Interviews Scheduled', type: 'number' },
      { id: 'interviews_attended', label: 'Interviews Attended', type: 'number' },
      { id: 'candidates_selected', label: 'Candidates Selected', type: 'number' },
      { id: 'offers_released', label: 'Offers Released', type: 'number' },
      { id: 'candidates_joined', label: 'Candidates Joined', type: 'number' },
      { id: 'candidates_rejected', label: 'Candidates Rejected', type: 'number' },
    ],
  },
  {
    id: 'rec_vacancy_status',
    label: 'Vacancy-Wise Status',
    description: 'Add one row per position',
    fields: [
      {
        id: 'vacancy_status',
        label: 'Status per position',
        type: 'rows',
        columns: [
          { key: 'position', label: 'Position' },
          { key: 'required', label: 'Required' },
          { key: 'interviewed', label: 'Interviewed' },
          { key: 'selected', label: 'Selected' },
          { key: 'joined', label: 'Joined' },
          { key: 'pending', label: 'Pending' },
        ],
      },
    ],
  },
  {
    id: 'rec_challenges',
    label: 'Recruitment Challenges',
    fields: [
      { id: 'challenges', label: 'Challenges faced today', type: 'textarea', rows: 3, placeholder: 'Leave blank if none' },
    ],
  },
  {
    id: 'rec_followup',
    label: 'Follow-Up Required',
    description: 'Candidate follow-ups still to schedule',
    fields: [
      {
        id: 'followups',
        label: 'Follow-ups',
        type: 'rows',
        columns: [
          { key: 'candidate', label: 'Candidate Name / Position' },
          { key: 'date', label: 'Follow-Up Date' },
          { key: 'recruiter', label: 'Responsible Recruiter' },
        ],
      },
    ],
  },
]

export const socialSections = [
  {
    id: 'social_content',
    label: 'Content Created',
    fields: [
      { id: 'posts_created', label: 'Posts created', type: 'text' },
      { id: 'reels_created', label: 'Reels / videos created', type: 'text' },
      { id: 'content_published', label: 'Content published today', type: 'textarea', rows: 3 },
      { id: 'platforms_managed', label: 'Platforms managed', type: 'text', placeholder: 'Instagram, Facebook, YouTube…' },
    ],
  },
  {
    id: 'social_metrics',
    label: 'Reach & Engagement',
    fields: [
      { id: 'reach', label: 'Reach / impressions', type: 'text' },
      { id: 'views', label: 'Views', type: 'text' },
      { id: 'engagement', label: 'Engagement (likes, comments, shares)', type: 'text' },
      { id: 'followers_gained', label: 'Followers gained', type: 'text' },
    ],
  },
  {
    id: 'social_pending',
    label: 'Pending Content',
    fields: [
      { id: 'pending_content', label: 'Pending content / awaiting approval', type: 'lines', rows: 4 },
    ],
  },
]

// Department sections followed by the four common sections every report shares.
export const withCommon = (roleSections) => [...roleSections, ...commonSections]

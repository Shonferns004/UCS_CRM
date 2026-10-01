const DEPT_LABELS = {
  'Admin': 'Accounts',
  'NGO Admin': 'Admin',
  'HR-Recruiter': 'Recruiter Panel',
}

export function deptLabel(v) {
  if (v == null) return v
  const key = String(v).trim()
  return DEPT_LABELS[key] ?? v
}

// Which document(s) a volunteer has handed over, stored in workers.documents_value
// (TEXT, migration 137) with the "Other" name in workers.documents_other
// (migration 160). Single source of truth: the profile card's "Documents
// Submitted" modal, the ODAR form's "Documents Needed" checkboxes and the
// volunteer-facing submitted form all render this list, so they can never offer
// different options. Mirrored in backend/src/utils/documentsValue.js and in the
// submitted form, which is a separate app.
export const DOC_OPTIONS = ['10th', '12th', 'Degree', 'Voter ID', 'Marriage Certificate', 'Other']

// The one option that stands in for something not on the list. Named so the
// custom-text branch is never a magic string repeated across files.
export const OTHER_DOC = 'Other'

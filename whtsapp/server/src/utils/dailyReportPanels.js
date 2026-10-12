// Panel rules for the daily reports.
//
// Two different questions, with two different answers:
//
//   filing panel   which panel a report is written under and read back by its
//                  reporter — the panel their login opens. 'digital' logs into
//                  the Developer panel, so those rows are stored as panel 'dev'.
//   review panel   which department tab the HOD / super-admin overview reads
//                  them under. The Duars Digital team ('digital') is reviewed
//                  under Social Media, never under Developer.
//
// The roster (who has / has not filed today) and the overview's tab bucketing
// both come from these rules, so a row and its reporter can never disagree
// about which tab they belong to.

// Which users-table roles belong to each panel. Roles are normalized first
// (people are stored as 'HR', 'HR-Recruiter', 'Social Media', ...), so the
// alias set in middleware/authMiddleware.js is the single source of truth.
export const PANEL_ROLES = {
  dev: ['developers'],
  hr: ['hr'],
  recruiter: ['recruiter'],
  social: ['social', 'digital'],
};

export const isDigitalDept = (department) =>
  String(department || '').toLowerCase().trim().includes('digital');

// One person, one panel: role *or* department being 'digital' is enough, since
// the two disagree in the data more often than they should. The role must
// arrive normalized (middleware/authMiddleware.js is the alias source of truth).
// Both the roster and the overview's row re-bucketing go through this, so a
// reporter can never be pending under one tab and submitted under another.
export const isDigitalIdentity = (normalizedRole, department) =>
  normalizedRole === 'digital' || isDigitalDept(department);

// Department staff (dev/HR/recruiter) live in the `workers` table and log in via
// their department, not a users-table role. Map a worker's department to the
// panel that *reviews* its report: same rule as the login route except
// 'digital', which is deliberately moved to social.
export const workerDeptPanel = (department) => {
  const d = String(department || '').toLowerCase().trim();
  if (d.includes('develop')) return 'dev';
  if (d.includes('digital')) return 'social';
  if (d === 'hr') return 'hr';
  if (d.includes('recruit')) return 'recruiter';
  if (d.includes('social') || d.includes('media')) return 'social';
  return null;
};

// One row, re-bucketed for the HOD overview: same id / data / remark, reviewed
// under the panel its reporter belongs to rather than the one they filed from.
// `digitalNames` is the set of reporter names of the digital team — the row
// only stores panel + reporter_name, and reporter_name is already the identity
// one reporter's day is keyed on (getReport / upsertReport).
export const withReviewedPanel = (report, digitalNames) => {
  if (!digitalNames.has(String(report.reporter_name || '').trim())) return report;
  return { ...report, panel: 'social', department: 'social' };
};

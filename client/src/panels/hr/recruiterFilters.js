// Recruiter list rules shared by the Recruiter Overview and Recruiters pages.
//
// These were duplicated as a hardcoded list of names in both files, which had to
// be edited by hand whenever somebody changed panel and had already drifted out
// of date in both directions: an active recruiter was being dropped by name
// while absconded recruiters were still being listed. Derive membership from the
// worker record instead so a panel change takes effect on its own.
export const DISPLAY_NAME = { 'Rashmi Sahu': 'Bhumika Rai' };

// Someone belongs on the recruiter leaderboard when they are still employed and
// their department is a recruiter one. HR staff without a recruiter department
// (e.g. the HR panel itself) are excluded, since the leaderboard ranks recruiters
// by conversion, not headcount.
export const isActiveRecruiter = (r) => {
  if (!r) return false;
  if (r.is_active === false) return false;
  // Only trust employment_status when the caller actually supplied it. A
  // projected row that omits the field must not be read as "not active", or a
  // single missing column silently empties the whole leaderboard.
  if (r.employment_status != null && r.employment_status !== '') {
    if (String(r.employment_status).toLowerCase() !== 'active') return false;
  }
  // A department is what identifies a recruiter; if it is missing, fall back to
  // the status fields alone rather than dropping the person.
  const dept = r.department || '';
  if (dept && !/recruit/i.test(dept)) return false;
  return true;
};

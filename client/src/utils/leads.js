// Shared lead ownership + conversion rules for the browser side.
//
// Backend/src/utils/leads.js is the same rule set; the two have to agree or an
// HR number will not reconcile with the recruiter's own panel.

// The recruiter UI writes `selected` (STAGE_TO_STATUS maps the Selected stage to
// it) while the candidates pipeline and older rows use `joined`, and an accepted
// offer lands on `offer_accepted`/`onboarding`. Counting one vocabulary pins the
// success rate at zero, so every reader counts the whole "won" set.
export const CONVERTED_STATUSES = ['selected', 'joined', 'offer_accepted', 'onboarding'];

// 'rejected' alone reads as 2 leads while 'not_interested' reads as 67; both are
// the recruiter turning a candidate down, so the two are counted together.
export const REJECTED_STATUSES = ['rejected', 'not_interested'];

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

export const isConvertedStatus = (status) => CONVERTED_STATUSES.includes(norm(status));

export const isRejectedStatus = (status) => REJECTED_STATUSES.includes(norm(status));

export const isPendingFollowUpStatus = (status) => status === 'followed_up' || status === 'call_back';

// A lead belongs to a recruiter when it is assigned to them (recruiter_id), when
// they entered it (created_by), or — for the rows that only ever kept a display
// name — when either *_by_name stamp matches. A good share of leads carry no id
// at all, so id equality alone silently drops them from every leaderboard.
export const belongsToLead = (lead, recruiter) => {
  if (!lead || !recruiter) return false;
  const rid = String(recruiter.id);
  if (lead.recruiter_id && String(lead.recruiter_id) === rid) return true;
  if (lead.created_by && String(lead.created_by) === rid) return true;
  const name = norm(recruiter.name);
  if (!name) return false;
  return [lead.created_by_name, lead.scheduled_by_name].some((n) => norm(n) === name);
};

export const countConverted = (leads) => (leads || []).filter((l) => isConvertedStatus(l.status)).length;

export const countRejected = (leads) => (leads || []).filter((l) => isRejectedStatus(l.status)).length;

// Converted / (converted + lost). Undecided leads stay out of the denominator so
// an early pipeline does not read as a failure; 0 when nothing is decided yet.
export const conversionRate = (leads) => {
  const converted = countConverted(leads);
  const decided = converted + countRejected(leads);
  return decided > 0 ? Number(((converted / decided) * 100).toFixed(1)) : 0;
};

// An IST day key for a lead timestamp, matching the backend's session timezone;
// `.slice(0, 10)` on the raw value would label the evening before as the next
// day. Re-exported here so lead views have one import for the rules they need.
export { istDayKey as istDateOf } from './istDate.js';
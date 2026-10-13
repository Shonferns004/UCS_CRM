// Unauthorized-absence detection for the grace-forfeiture rule.
//
// A full-day absence is "unauthorized" when NO approved leave covers the date.
// The trigger decides how the worker can save the month's late grace:
//
//   no_leave   — absent with no leave at all       -> auto-forfeit, NO proof chance
//   rejected   — a full-day-family leave was rejected -> proof on the app home screen
//   pending    — a full-day-family leave is still pending -> same proof flow
//
// Half-day leaves are IGNORED for trigger classification (per policy); a
// half-day leave rejected plus a full absence simply counts as no_leave.
// Approved leave of any type covering the date is always safe (authorized).
// Sundays, holidays, pre-join dates and future dates never count.
//
// Proof outcomes (once per calendar month, single grace budget):
//   approved proof   -> grace kept
//   pending proof    -> grace kept until HR reviews (innocent until decided)
//   rejected / none  -> grace forfeited (only if trigger is rejected/pending;
//                       no_leave forfeits regardless, proofs cannot exist there)

const FULL_DAY_FAMILY = new Set(['full_day', 'vacational', 'emergency', 'holiday']);

export function expandLeaveDatesForDetection(leave) {
  const dates = [];
  if (leave?.leave_date) {
    dates.push(String(leave.leave_date).slice(0, 10));
  }
  if (leave?.start_date && leave?.end_date) {
    const start = new Date(String(leave.start_date).slice(0, 10) + 'T00:00:00Z');
    const end = new Date(String(leave.end_date).slice(0, 10) + 'T00:00:00Z');
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return [...new Set(dates)];
}

// monthDays: [{ date, day, dayName }] — the caller's calendar for the month.
// records:   every attendance row for the month INCLUDING fabricated absents
//            ({ date, status }) so a missing punch shows up as 'absent'.
// leaves:    the worker's leave applications overlapping the month.
// absenceProofs: the worker's absence-proof rows for the month.
// holidaySet / beforeJoinSet / viewDay: exclusions (same ones payroll uses).
export function findUnauthorizedAbsences({ monthDays, records, leaves, absenceProofs, holidaySet, beforeJoinSet, viewDay }) {
  const recByDate = new Map((records || []).map((r) => [String(r.date).slice(0, 10), r]));

  const approvedDates = new Set();
  const rejectedFullDates = new Map(); // date -> leave id
  const pendingFullDates = new Map();
  for (const leave of leaves || []) {
    const dates = expandLeaveDatesForDetection(leave);
    for (const date of dates) {
      if (leave.status === 'approved') {
        approvedDates.add(date);
      } else if (leave.status === 'rejected' && FULL_DAY_FAMILY.has(leave.type)) {
        rejectedFullDates.set(date, leave.id);
      } else if (leave.status === 'pending' && FULL_DAY_FAMILY.has(leave.type)) {
        pendingFullDates.set(date, leave.id);
      }
    }
  }

  const proofByDate = new Map((absenceProofs || []).map((p) => [String(p.date).slice(0, 10), p]));

  const unauthorizedAbsences = [];
  for (const day of monthDays || []) {
    const date = day.date;
    if (day.dayName === 'Sun') continue;
    if (holidaySet?.has(date)) continue;
    if (beforeJoinSet?.has(date)) continue;
    if (viewDay != null && day.day > viewDay) continue;

    const rec = recByDate.get(date);
    if (rec && rec.status !== 'absent') continue; // present / late / half-day / leave row
    if (!rec) continue; // caller only fabricates real absences; trust it

    if (approvedDates.has(date)) continue; // authorized

    let trigger = 'no_leave';
    let leaveId = null;
    if (rejectedFullDates.has(date)) {
      trigger = 'rejected';
      leaveId = rejectedFullDates.get(date);
    } else if (pendingFullDates.has(date)) {
      trigger = 'pending';
      leaveId = pendingFullDates.get(date);
    }

    const proof = proofByDate.get(date) || null;
    let forfeits;
    if (trigger === 'no_leave') {
      forfeits = true; // auto-forfeit, no proof chance
    } else if (proof?.status === 'approved' || proof?.status === 'pending') {
      forfeits = false; // proof approved, or under review (kept until decided)
    } else {
      forfeits = true; // rejected proof, or nothing uploaded
    }

    unauthorizedAbsences.push({
      date,
      trigger,
      leaveId,
      proofStatus: proof?.status || null,
      proofPending: proof?.status === 'pending' || null,
      forfeits,
      // rejected/pending triggers are the only proof-eligible ones
      needsProof: (trigger === 'rejected' || trigger === 'pending') && !proof,
    });
  }

  const graceForfeited = unauthorizedAbsences.some((a) => a.forfeits);
  const firstForfeit = unauthorizedAbsences.find((a) => a.forfeits) || null;

  return {
    unauthorizedAbsences,
    graceForfeited,
    firstForfeitDate: firstForfeit?.date || null,
    firstForfeitTrigger: firstForfeit?.trigger || null,
    proofNeededDates: unauthorizedAbsences.filter((a) => a.needsProof).map((a) => a.date),
  };
}

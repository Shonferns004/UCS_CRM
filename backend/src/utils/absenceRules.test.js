import test from 'node:test';
import assert from 'node:assert';
import { findUnauthorizedAbsences, expandLeaveDatesForDetection } from './absenceRules.js';

// Build a plain October 2026 calendar (Sundays: 4, 11, 18, 25) like payroll does.
function octDays() {
  const days = [];
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    days.push({ date, day: d, dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date + 'T00:00:00Z').getUTCDay()] });
  }
  return days;
}

function evaluate({ records = [], leaves = [], proofs = [], holidays = [], beforeJoin = [], viewDay = 31 } = {}) {
  return findUnauthorizedAbsences({
    monthDays: octDays(),
    records,
    leaves,
    absenceProofs: proofs,
    holidaySet: new Set(holidays),
    beforeJoinSet: new Set(beforeJoin),
    viewDay,
  });
}

test('expandLeaveDatesForDetection covers single-day and ranges', () => {
  assert.deepEqual(expandLeaveDatesForDetection({ type: 'full_day', leave_date: '2026-10-07' }), ['2026-10-07']);
  assert.deepEqual(expandLeaveDatesForDetection({ type: 'emergency', leave_date: '2026-10-07' }), ['2026-10-07']);
  assert.deepEqual(
    expandLeaveDatesForDetection({ type: 'vacational', start_date: '2026-10-05', end_date: '2026-10-07' }),
    ['2026-10-05', '2026-10-06', '2026-10-07'],
  );
});

test('rejected leave + absent -> proof-eligible, forfeits until a proof saves it', () => {
  const leaves = [{ id: 'L1', type: 'full_day', status: 'rejected', leave_date: '2026-10-07' }];
  const base = evaluate({ records: [{ date: '2026-10-07', status: 'absent' }], leaves });
  assert.equal(base.graceForfeited, true);
  assert.equal(base.unauthorizedAbsences.length, 1);
  assert.equal(base.unauthorizedAbsences[0].trigger, 'rejected');
  assert.equal(base.unauthorizedAbsences[0].needsProof, true);

  const pendingProof = evaluate({
    records: [{ date: '2026-10-07', status: 'absent' }],
    leaves,
    proofs: [{ date: '2026-10-07', status: 'pending' }],
  });
  assert.equal(pendingProof.graceForfeited, false); // kept until HR reviews

  const approvedProof = evaluate({
    records: [{ date: '2026-10-07', status: 'absent' }],
    leaves,
    proofs: [{ date: '2026-10-07', status: 'approved' }],
  });
  assert.equal(approvedProof.graceForfeited, false);

  const rejectedProof = evaluate({
    records: [{ date: '2026-10-07', status: 'absent' }],
    leaves,
    proofs: [{ date: '2026-10-07', status: 'rejected' }],
  });
  assert.equal(rejectedProof.graceForfeited, true);
});

test('pending leave + absent -> same proof flow as rejected', () => {
  const result = evaluate({
    records: [{ date: '2026-10-08', status: 'absent' }],
    leaves: [{ id: 'L2', type: 'full_day', status: 'pending', leave_date: '2026-10-08' }],
  });
  assert.equal(result.unauthorizedAbsences[0].trigger, 'pending');
  assert.equal(result.unauthorizedAbsences[0].needsProof, true);
  assert.equal(result.graceForfeited, true);
});

test('no leave at all -> auto-forfeit, never needs proof', () => {
  const result = evaluate({ records: [{ date: '2026-10-09', status: 'absent' }] });
  assert.equal(result.unauthorizedAbsences[0].trigger, 'no_leave');
  assert.equal(result.unauthorizedAbsences[0].needsProof, false);
  assert.equal(result.graceForfeited, true);
  // A proof row there (impossible via API, but defensive) still forfeits.
  const withProof = evaluate({
    records: [{ date: '2026-10-09', status: 'absent' }],
    proofs: [{ date: '2026-10-09', status: 'approved' }],
  });
  assert.equal(withProof.graceForfeited, true);
});

test('approved leave is always safe', () => {
  const result = evaluate({
    records: [{ date: '2026-10-07', status: 'leave' }],
    leaves: [{ id: 'L3', type: 'full_day', status: 'approved', leave_date: '2026-10-07' }],
  });
  assert.equal(result.graceForfeited, false);
  assert.equal(result.unauthorizedAbsences.length, 0);
});

test('attended days, Sundays, holidays, pre-join and future days never count', () => {
  const result = evaluate({
    records: [
      { date: '2026-10-05', status: 'present' },
      { date: '2026-10-06', status: 'late' },
      { date: '2026-10-07', status: 'half-day' },
      { date: '2026-10-04', status: 'absent' }, // Sunday
      { date: '2026-10-02', status: 'absent' }, // holiday
      { date: '2026-10-12', status: 'absent' }, // pre-join
      { date: '2026-10-30', status: 'absent' }, // future (viewDay 20)
    ],
    holidays: ['2026-10-02'],
    beforeJoin: ['2026-10-12'],
    viewDay: 20,
  });
  assert.equal(result.unauthorizedAbsences.length, 0);
  assert.equal(result.graceForfeited, false);
});

test('half-day leaves are ignored for trigger classification', () => {
  // Half-day leave rejected + full absence = no full-day leave -> no_leave.
  const result = evaluate({
    records: [{ date: '2026-10-07', status: 'absent' }],
    leaves: [{ id: 'L4', type: 'half_day', status: 'rejected', leave_date: '2026-10-07' }],
  });
  assert.equal(result.unauthorizedAbsences[0].trigger, 'no_leave');
});

test('vacational multi-day: every uncovered day listed, but the 180 budget is shared', () => {
  const result = evaluate({
    records: [
      { date: '2026-10-05', status: 'absent' },
      { date: '2026-10-06', status: 'absent' },
      { date: '2026-10-07', status: 'absent' },
    ],
    leaves: [{ id: 'L5', type: 'vacational', status: 'rejected', start_date: '2026-10-05', end_date: '2026-10-07' }],
  });
  assert.equal(result.unauthorizedAbsences.length, 3);
  assert.ok(result.unauthorizedAbsences.every((a) => a.trigger === 'rejected'));
  assert.equal(result.graceForfeited, true); // once, not three times
  assert.equal(result.firstForfeitDate, '2026-10-05');
});

test('an approved proof on one of several galti dates keeps the grace', () => {
  const result = evaluate({
    records: [
      { date: '2026-10-05', status: 'absent' },
      { date: '2026-10-06', status: 'absent' },
    ],
    leaves: [
      { id: 'L6', type: 'full_day', status: 'rejected', leave_date: '2026-10-05' },
      { id: 'L7', type: 'full_day', status: 'rejected', leave_date: '2026-10-06' },
    ],
    proofs: [{ date: '2026-10-05', status: 'approved' }],
  });
  // Oct 5 saved by the proof; Oct 6 has no proof -> still forfeits ONCE.
  assert.equal(result.graceForfeited, true);
  const saved = result.unauthorizedAbsences.find((a) => a.date === '2026-10-05');
  const lost = result.unauthorizedAbsences.find((a) => a.date === '2026-10-06');
  assert.equal(saved.forfeits, false);
  assert.equal(lost.forfeits, true);
});

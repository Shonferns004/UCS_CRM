import test from 'node:test';
import assert from 'node:assert';
import { computePaidDays } from './salaryDays.js';

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function paid(args) {
  return computePaidDays({
    holidayDates: [],
    viewingToday: daysInMonth(args.year, args.month),
    lateGraceMinutes: 180,
    includeHolidayPay: false,
    compensatoryWorkdays: [],
    ...args,
  });
}

test('a worker who joined after the month scores a full zero', () => {
  const r = paid({
    year: 2026, month: 8, daysInMonth: daysInMonth(2026, 8),
    records: [], createdAt: '2026-10-01T04:00:00.000Z',
  });
  assert.equal(r.joinedAfterMonth, true);
  assert.equal(r.joinedThisMonth, false);
  assert.equal(r.available, 0);
  assert.equal(r.paidDays, 0);
  assert.equal(r.totalDueDays, 0);
  assert.equal(r.presentDays, 0);
  assert.equal(r.freeSundays, 0);
  assert.equal(r.holidayPaidDays, 0);
  assert.equal(r.sundayStats.paidSundays, 0);
  assert.equal(r.deductedCount, 0);
  assert.equal(r.absentDatesAfterJoin.length, 0);
});

test('a worker who joined on the last day of the month is still listed', () => {
  const r = paid({
    year: 2026, month: 8, daysInMonth: daysInMonth(2026, 8),
    records: [], createdAt: '2026-09-30T04:00:00.000Z',
  });
  assert.ok(!r.joinedAfterMonth);
  assert.equal(r.joinedThisMonth, true);
  assert.equal(r.joinDay, 30);
  assert.equal(r.available, 1);
});

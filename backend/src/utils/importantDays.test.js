import test from 'node:test';
import assert from 'node:assert/strict';

import { getInternationalDaysInRange } from './importantDays.js';

test('returns the October anchor days with india/international typing', () => {
  const rows = getInternationalDaysInRange('2026-10-01', '2026-11-01');
  const names = rows.map((r) => r.name);
  assert.ok(names.includes('World Food Day'), 'World Food Day (Oct 16) present');
  assert.ok(names.includes('World Mental Health Day'), 'World Mental Health Day (Oct 10) present');
  assert.ok(names.includes('United Nations Day'), 'United Nations Day (Oct 24) present');
  const wfd = rows.find((r) => r.name === 'World Food Day');
  assert.equal(wfd.date, '2026-10-16');
  assert.equal(wfd.type, 'international');
  assert.equal(wfd.scope, 'worldwide');
  assert.equal(wfd.kind, 'observance');
  assert.equal(wfd.source, 'international');
  assert.equal(wfd.precision, 'fixed');
});

test('end date is exclusive', () => {
  const rows = getInternationalDaysInRange('2026-10-16', '2026-10-17');
  assert.deepEqual(rows.map((r) => r.name), ['World Food Day']);
});

test('empty list for an invalid or backwards range', () => {
  assert.deepEqual(getInternationalDaysInRange('2026-10-01', '2026-10-01'), []);
  assert.deepEqual(getInternationalDaysInRange('bad', '2026-11-01'), []);
});

test('same month/day exists in every supported year', () => {
  for (const year of [2025, 2026, 2027]) {
    const rows = getInternationalDaysInRange(`${year}-10-01`, `${year}-11-01`);
    assert.equal(rows.find((r) => r.name === 'World Food Day')?.date, `${year}-10-16`);
  }
});

test('comprehensive fixed calendar covers key UN/global days every year', () => {
  const byDate = (year, m1, m2) => getInternationalDaysInRange(`${year}-${m1}-01`, `${year}-${m2}-01`);
  assert.equal(byDate(2026, '03', '04').find((r) => r.name === 'International Day of Happiness')?.date, '2026-03-20');
  assert.equal(byDate(2026, '03', '04').find((r) => r.name === 'World Theatre Day')?.date, '2026-03-27');
  assert.equal(byDate(2026, '05', '06').find((r) => r.name === 'World Telecommunication and Information Society Day')?.date, '2026-05-17');
  assert.equal(byDate(2026, '05', '06').find((r) => r.name === 'World Metrology Day')?.date, '2026-05-20');
  assert.equal(byDate(2026, '06', '07').find((r) => r.name === 'World Milk Day')?.date, '2026-06-01');
  assert.equal(byDate(2026, '09', '10').find((r) => r.name === 'World Heart Day')?.date, '2026-09-29');
  assert.equal(getInternationalDaysInRange('2026-12-01', '2027-01-01').find((r) => r.name === 'International Mountain Day')?.date, '2026-12-11');
  assert.ok(byDate(2026, '01', '02').every((r) => r.type === 'international'));
});

test('no duplicate date+name within the fixed list', () => {
  const rows = getInternationalDaysInRange('2026-01-01', '2027-01-01');
  const keys = rows.map((r) => `${r.date}::${r.name.toLowerCase()}`);
  assert.equal(new Set(keys).size, keys.length, 'duplicate fixed-day entries found');
});
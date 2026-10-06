import test from 'node:test';
import assert from 'node:assert/strict';

import { getObservancesInRange } from './observances.js';

const janOne = (y) => getObservancesInRange(`${y}-01-01`, `${y}-02-01`);
const junAll = (y) => getObservancesInRange(`${y}-06-01`, `${y}-07-01`);

test('correct fixed dates for the corrected curated days', () => {
  // World Blood Donor Day is 14 June (WHO), International Yoga Day 21 June (UN),
  // World Braille Day 4 January (UN), Biodiversity Day 22 May (UN).
  const jun = junAll(2026);
  assert.equal(jun.find((r) => r.name === 'World Blood Donor Day')?.date, '2026-06-14');
  assert.equal(jun.find((r) => r.name === 'International Yoga Day')?.date, '2026-06-21');
  assert.equal(janOne(2026).find((r) => r.name === 'World Braille Day')?.date, '2026-01-04');
  assert.equal(getObservancesInRange('2026-05-01', '2026-06-01').find((r) => r.name === 'International Day for Biological Diversity')?.date, '2026-05-22');
});

test('International Day of Older Persons is on 1 October', () => {
  const october = getObservancesInRange('2026-10-01', '2026-11-01');
  assert.equal(october.filter((r) => r.name === 'International Day of Older Persons').length, 1);
  assert.equal(october.find((r) => r.name === 'International Day of Older Persons')?.date, '2026-10-01');
});

test('added India national/observance days exist on their fixed dates', () => {
  const year = 2026;
  const cases = [
    ['2026-01-25', "National Voters' Day (India)"],
    ['2026-01-30', "Martyr's Day (India)"],
    ['2026-04-05', 'National Maritime Day (India)'],
    ['2026-05-11', 'National Technology Day (India)'],
    ['2026-05-21', 'National Anti-Terrorism Day (India)'],
    ['2026-07-22', 'National Flag Day (India)'],
    ['2026-08-29', 'National Sports Day (India)'],
    ['2026-12-02', 'National Pollution Control Day (India)'],
    ['2026-12-23', "National Farmers' Day (India)"],
  ];
  const rows = getObservancesInRange(`${year}-01-01`, `${year + 1}-01-01`);
  for (const [date, name] of cases) {
    const found = rows.find((r) => r.date === date && r.name === name);
    assert.ok(found, `${name} should be on ${date}`);
    assert.equal(found.scope, 'india');
    assert.equal(found.type ?? (found.scope === 'worldwide' ? 'international' : 'india'), 'india');
  }
});

test('the same fixed rules apply in every supported year', () => {
  for (const year of [2025, 2026]) {
    const jun = junAll(year);
    assert.equal(jun.find((r) => r.name === 'World Blood Donor Day')?.date, `${year}-06-14`);
    assert.equal(jun.find((r) => r.name === 'International Yoga Day')?.date, `${year}-06-21`);
  }
});
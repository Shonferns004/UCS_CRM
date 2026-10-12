// The Duars Digital team files its daily report from the Developer panel, but
// the super-admin / HOD overview has to read it under the Social Media tab and
// count it as that tab's pending-vs-submitted. A regression here silently
// files a whole department under the wrong department head, so the rules are
// pinned here rather than only living in the controller.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PANEL_ROLES, isDigitalDept, isDigitalIdentity, workerDeptPanel, withReviewedPanel } from './dailyReportPanels.js';

test("'digital' is rostered for the Social Media panel, not Developer", () => {
  assert.equal(workerDeptPanel('digital'), 'social');
  assert.equal(workerDeptPanel('Digital'), 'social');
  assert.equal(workerDeptPanel('Duars Digital'), 'social');
  assert.equal(PANEL_ROLES.social.includes('digital'), true);
  assert.equal(PANEL_ROLES.dev.includes('digital'), false);
});

test('a developer still reviews under the Developer panel', () => {
  assert.equal(workerDeptPanel('Developer'), 'dev');
  assert.equal(workerDeptPanel('developers'), 'dev');
  assert.equal(PANEL_ROLES.dev.includes('developers'), true);
});

test('the other departments are unaffected by the digital move', () => {
  assert.equal(workerDeptPanel('HR'), 'hr');
  assert.equal(workerDeptPanel('HR-Recruiter'), 'recruiter');
  assert.equal(workerDeptPanel('Social Media'), 'social');
  assert.equal(workerDeptPanel(null), null);
  assert.equal(workerDeptPanel('Front Desk'), null);
});

test('isDigitalDept matches the department spellings in use', () => {
  assert.equal(isDigitalDept('digital'), true);
  assert.equal(isDigitalDept(' Digital '), true);
  assert.equal(isDigitalDept('developer'), false);
  assert.equal(isDigitalDept(null), false);
});

test('isDigitalIdentity: role or department is enough, and they agree', () => {
  assert.equal(isDigitalIdentity('digital', null), true);
  assert.equal(isDigitalIdentity('developers', 'Digital'), true);
  assert.equal(isDigitalIdentity('digital', 'Developer'), true);
  assert.equal(isDigitalIdentity('developers', 'Developer'), false);
  assert.equal(isDigitalIdentity('hr', null), false);
});

test("a digital reporter's row is re-bucketed under Social Media", () => {
  const row = { id: 7, panel: 'dev', department: 'dev', reporter_name: 'Kinjal', data: {}, remark: 'ok' };
  const reviewed = withReviewedPanel(row, new Set(['Kinjal']));
  assert.deepEqual(reviewed, { id: 7, panel: 'social', department: 'social', reporter_name: 'Kinjal', data: {}, remark: 'ok' });
  // The row itself is never mutated — the overview still needs the same id to
  // save a remark against.
  assert.equal(row.panel, 'dev');
});

test('a non-digital row is passed through untouched', () => {
  const row = { id: 8, panel: 'dev', department: 'dev', reporter_name: 'Kinjal' };
  assert.equal(withReviewedPanel(row, new Set()), row);
});

test('a name match is exact and trimmed, so partial names never move a row', () => {
  const row = { id: 9, panel: 'dev', reporter_name: 'Kinjal Patel' };
  assert.equal(withReviewedPanel(row, new Set(['Kinjal'])), row);
  const padded = { id: 10, panel: 'dev', reporter_name: '  Kinjal  ' };
  assert.equal(withReviewedPanel(padded, new Set(['Kinjal'])).panel, 'social');
});

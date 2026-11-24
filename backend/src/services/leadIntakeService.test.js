// Placement policy for Meta leads: every valid Indian mobile goes to a station,
// an invalid / non-India number is the only hard blocker. A US number used to
// pass because materializeReplyLead only looks at the last 10 digits.
import test from 'node:test';
import assert from 'node:assert/strict';

import { isValidIndianMobile } from './leadIntakeService.js';

test('accepts Indian mobiles in the shapes the CRM stores', () => {
  assert.equal(isValidIndianMobile('+919049939782'), true);
  assert.equal(isValidIndianMobile('919049939782'), true);
  assert.equal(isValidIndianMobile('9049939782'), true);
  assert.equal(isValidIndianMobile('09049939782'), true);
  assert.equal(isValidIndianMobile('+91 90499 39782'), true);
});

test('rejects non-India and malformed numbers', () => {
  assert.equal(isValidIndianMobile('+17014676026'), false);
  assert.equal(isValidIndianMobile('17014676026'), false);
  assert.equal(isValidIndianMobile('12345'), false);
  assert.equal(isValidIndianMobile(''), false);
  assert.equal(isValidIndianMobile(null), false);
  assert.equal(isValidIndianMobile(undefined), false);
});

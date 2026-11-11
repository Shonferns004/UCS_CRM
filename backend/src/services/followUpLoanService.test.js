import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveLoanStatus,
  isLoanWindowLive,
  isFollowUpLoansEnabled,
} from './followUpLoanService.js';

// Window boundary is the security-critical part of a loan: a borrowed lead must
// stop being workable at exactly expires_at, not a tick later.

const base = {
  id: 'loan-1',
  status: 'ACTIVE',
  starts_at: '2026-11-11T10:00:00.000Z',
  expires_at: '2026-11-11T12:00:00.000Z',
};

test('loan is scheduled before starts_at', () => {
  const now = new Date('2026-11-11T09:59:59.000Z').getTime();
  assert.equal(deriveLoanStatus(base, now), 'SCHEDULED');
  assert.equal(isLoanWindowLive(base, now), false);
});

test('loan is active inside the window', () => {
  const now = new Date('2026-11-11T11:00:00.000Z').getTime();
  assert.equal(deriveLoanStatus(base, now), 'ACTIVE');
  assert.equal(isLoanWindowLive(base, now), true);
});

test('loan denies at exactly expires_at', () => {
  const now = new Date('2026-11-11T12:00:00.000Z').getTime();
  assert.equal(deriveLoanStatus(base, now), 'EXPIRED');
  assert.equal(isLoanWindowLive(base, now), false);
});

test('explicit RETURNED / REVOKED win over the window', () => {
  const now = new Date('2026-11-11T11:00:00.000Z').getTime();
  assert.equal(deriveLoanStatus({ ...base, status: 'RETURNED' }, now), 'RETURNED');
  assert.equal(deriveLoanStatus({ ...base, status: 'REVOKED' }, now), 'REVOKED');
});

test('invalid expiry is treated as expired, never open', () => {
  const now = Date.now();
  assert.equal(deriveLoanStatus({ ...base, expires_at: null }, now), 'EXPIRED');
  assert.equal(isLoanWindowLive({ ...base, expires_at: null }, now), false);
});

test('feature flag defaults on and can be switched off', () => {
  const previous = process.env.FOLLOWUP_LOANS_ENABLED;
  try {
    delete process.env.FOLLOWUP_LOANS_ENABLED;
    assert.equal(isFollowUpLoansEnabled(), true);
    process.env.FOLLOWUP_LOANS_ENABLED = 'false';
    assert.equal(isFollowUpLoansEnabled(), false);
    process.env.FOLLOWUP_LOANS_ENABLED = 'true';
    assert.equal(isFollowUpLoansEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.FOLLOWUP_LOANS_ENABLED;
    else process.env.FOLLOWUP_LOANS_ENABLED = previous;
  }
});

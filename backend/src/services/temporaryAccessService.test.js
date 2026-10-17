// Temporary Data Access — unit tests for the authorization core.
//
// What these pin, and why each failure would matter in production:
//  • window boundaries — a grant must deny at exactly expires_at (Scenario D:
//    6:00 grant, 6:01 attempt), and must not authorize before starts_at;
//  • feature flag — TEMP_DATA_ACCESS_ENABLED off must behave as "no grants
//    exist", never as "all access";
//  • pair matching — station/NGO mismatch must not widen access (Scenario F:
//    a BOD-4 grant never covers AFD-2, even for the same NGO);
//  • ownership separation — canWorkAssignment grants no ownership write;
//  • status derivation — REVOKED/CANCELLED stick; SCHEDULED/ACTIVE/EXPIRED
//    derive from the window without a sweeper job.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isTempAccessEnabled,
  isWindowLive,
  pairKey,
  canWorkAssignment,
} from './temporaryAccessService.js';
import { deriveStatus } from '../controllers/temporaryAccessController.js';

const iso = (t) => new Date(t).toISOString();

// ─── feature flag ────────────────────────────────────────────────────────────
test('feature flag is opt-in: unset env means disabled', () => {
  const prev = process.env.TEMP_DATA_ACCESS_ENABLED;
  try {
    delete process.env.TEMP_DATA_ACCESS_ENABLED;
    assert.equal(isTempAccessEnabled(), false);
    process.env.TEMP_DATA_ACCESS_ENABLED = 'false';
    assert.equal(isTempAccessEnabled(), false);
    process.env.TEMP_DATA_ACCESS_ENABLED = 'FALSE';
    assert.equal(isTempAccessEnabled(), false);
    process.env.TEMP_DATA_ACCESS_ENABLED = 'true';
    assert.equal(isTempAccessEnabled(), true);
    process.env.TEMP_DATA_ACCESS_ENABLED = '1';
    assert.equal(isTempAccessEnabled(), false, 'only literal "true" enables — no truthy surprises');
  } finally {
    if (prev === undefined) delete process.env.TEMP_DATA_ACCESS_ENABLED;
    else process.env.TEMP_DATA_ACCESS_ENABLED = prev;
  }
});

// ─── window boundaries (Scenario D) ──────────────────────────────────────────
const grantWindow = {
  starts_at: iso('2026-10-17T09:00:00+05:30'),
  expires_at: iso('2026-10-17T18:00:00+05:30'),
};

test('grant is live inside its window', () => {
  const at = new Date('2026-10-17T12:00:00+05:30').getTime();
  assert.equal(isWindowLive(grantWindow, at), true);
});

test('grant denies at exactly expires_at — not one millisecond later', () => {
  const at = new Date(grantWindow.expires_at).getTime();
  assert.equal(isWindowLive(grantWindow, at), false, 'expiry is exclusive: now < expires_at');
  assert.equal(isWindowLive(grantWindow, at - 1), true, 'one ms before expiry is still live');
});

test('grant denies before starts_at, allows at exactly starts_at', () => {
  const start = new Date(grantWindow.starts_at).getTime();
  assert.equal(isWindowLive(grantWindow, start - 1), false);
  assert.equal(isWindowLive(grantWindow, start), true, 'start is inclusive');
});

test('a grant whose expires_at precedes starts_at is never live (belt-and-braces to the CHECK)', () => {
  const broken = { starts_at: iso('2026-10-17T18:00:00+05:30'), expires_at: iso('2026-10-17T09:00:00+05:30') };
  const at = new Date('2026-10-17T12:00:00+05:30').getTime();
  assert.equal(isWindowLive(broken, at), false);
});

test('missing timestamps degrade safely: no start = epoch start, no expiry = never expires', () => {
  assert.equal(isWindowLive({}, Date.now()), true, 'absent window fields must not crash reads');
});

// ─── pair matching (Scenario F) ──────────────────────────────────────────────
test('pairKey trims station and tolerates null ngo', () => {
  assert.equal(pairKey(' BOD-4 ', 'ngo-1'), 'ngo-1|BOD-4');
  assert.equal(pairKey('BOD-4', null), '|BOD-4');
  assert.equal(pairKey(undefined, 'ngo-1'), 'ngo-1|');
});

// ─── canWorkAssignment — the sync guard used on write paths ──────────────────
const ARCHANA = 'archana-uuid';
const MAHIMA = 'mahima-uuid';
const NGO = 'ngo-bsct';
const BOD4 = { station: 'BOD-4', ngo_id: NGO };
const AFD2 = { station: 'AFD-2', ngo_id: NGO };

const liveGrant = { ...BOD4, starts_at: grantWindow.starts_at, expires_at: grantWindow.expires_at };

test('the permanent owner always works their own donor (rule 1)', () => {
  const row = { fro_worker_id: MAHIMA, ...BOD4 };
  assert.equal(canWorkAssignment(MAHIMA, row, []), true, 'owner works with zero grants');
  assert.equal(canWorkAssignment(MAHIMA, row, [liveGrant]), true);
});

test('a temp worker works only rows inside her grant (rule 2)', () => {
  const mahimasRow = { fro_worker_id: MAHIMA, ...BOD4 };
  assert.equal(canWorkAssignment(ARCHANA, mahimasRow, [liveGrant]), true);
});

test('same NGO, different station → denied (a BOD-4 grant never covers AFD-2)', () => {
  const otherStation = { fro_worker_id: MAHIMA, ...AFD2 };
  assert.equal(canWorkAssignment(ARCHANA, otherStation, [liveGrant]), false);
});

test('same station name under a different NGO → denied', () => {
  const otherNgo = { fro_worker_id: MAHIMA, station: 'BOD-4', ngo_id: 'ngo-aflf' };
  assert.equal(canWorkAssignment(ARCHANA, otherNgo, [liveGrant]), false, 'NGO is part of the key');
});

test('no grants → no access to anyone else\'s row (fail closed)', () => {
  const mahimasRow = { fro_worker_id: MAHIMA, ...BOD4 };
  assert.equal(canWorkAssignment(ARCHANA, mahimasRow, []), false);
  assert.equal(canWorkAssignment(ARCHANA, mahimasRow, null), false, 'null grants must not throw nor allow');
});

test('a row with no owner in a granted station is workable but ownership is untouched', () => {
  const unowned = { fro_worker_id: null, ...BOD4 };
  assert.equal(canWorkAssignment(ARCHANA, unowned, [liveGrant]), true);
  assert.equal(unowned.fro_worker_id, null, 'the guard never mutates the row — it only answers');
});

test('missing identity or assignment denies', () => {
  assert.equal(canWorkAssignment(null, { fro_worker_id: MAHIMA, ...BOD4 }, [liveGrant]), false);
  assert.equal(canWorkAssignment(ARCHANA, null, [liveGrant]), false);
  assert.equal(canWorkAssignment(ARCHANA, undefined, [liveGrant]), false);
});

test('an unowned row outside every grant and outside ownership → denied', () => {
  const stray = { fro_worker_id: null, ...AFD2 };
  assert.equal(canWorkAssignment(ARCHANA, stray, [liveGrant]), false);
});

// ─── status derivation (no sweeper) ──────────────────────────────────────────
test('explicit REVOKED/CANCELLED stick regardless of the window', () => {
  const now = new Date('2026-10-17T12:00:00+05:30').getTime();
  assert.equal(deriveStatus({ status: 'REVOKED', ...grantWindow }, now), 'REVOKED');
  assert.equal(deriveStatus({ status: 'CANCELLED', ...grantWindow }, now), 'CANCELLED');
});

test('SCHEDULED before start, ACTIVE inside, EXPIRED after — derived, not stored', () => {
  const before = new Date('2026-10-17T08:59:00+05:30').getTime();
  const during = new Date('2026-10-17T12:00:00+05:30').getTime();
  const after = new Date('2026-10-17T18:01:00+05:30').getTime();
  assert.equal(deriveStatus({ status: 'SCHEDULED', ...grantWindow }, before), 'SCHEDULED');
  assert.equal(deriveStatus({ status: 'SCHEDULED', ...grantWindow }, during), 'ACTIVE');
  assert.equal(deriveStatus({ status: 'ACTIVE', ...grantWindow }, after), 'EXPIRED');
});

test('EXPIRED status re-derives to ACTIVE after an extend (status is a label, window is truth)', () => {
  const after = new Date('2026-10-18T12:00:00+05:30').getTime();
  const extended = { status: 'EXPIRED', expires_at: iso('2026-10-19T18:00:00+05:30'), starts_at: grantWindow.starts_at };
  assert.equal(deriveStatus(extended, after), 'ACTIVE');
});

// ─── source-level invariants (froController integration) ─────────────────────
// The integration cannot run without a live DB, so pin the shape that matters:
// ownership must never be written from the temp path, and the temp branch must
// sit BEFORE the claim/create steps it must beat.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const froSrc = readFileSync(path.join(here, '..', 'controllers', 'froController.js'), 'utf8');
const adminSrc = readFileSync(path.join(here, '..', 'controllers', 'temporaryAccessController.js'), 'utf8');

test('findOrCreateAssignment: temp branch runs BEFORE the claim/create steps', () => {
  const tempBranch = froSrc.indexOf('2.5) TEMPORARY DATA ACCESS');
  const claimStep = froSrc.indexOf('3) Claim an unassigned lead');
  const createStep = froSrc.indexOf('Create the worker\'s own row');
  assert.ok(tempBranch > 0, 'temp branch must exist in findOrCreateAssignment');
  assert.ok(claimStep > tempBranch, 'temp branch must precede the unassigned-claim step');
  assert.ok(createStep > tempBranch, 'temp branch must precede the create step');
});

test('findOrCreateAssignment: the temp branch never writes fro_worker_id', () => {
  const start = froSrc.indexOf('2.5) TEMPORARY DATA ACCESS');
  const end = froSrc.indexOf('3) Claim an unassigned lead');
  const branch = froSrc.slice(start, end);
  assert.ok(!/update\(\{[^}]*fro_worker_id/.test(branch),
    'temporary access must never reassign fro_worker_id — ownership is immutable under a grant');
});

test('admin controller never writes fro_station_assignments (permanent ownership untouched)', () => {
  // No .from('fro_station_assignments') may ever chain .update/.insert/.delete.
  const lines = adminSrc.split(/\r?\n/);
  const viol = [];
  let inOwnerBlock = false;
  for (const [i, l] of lines.entries()) {
    if (l.includes(".from('fro_station_assignments')")) inOwnerBlock = true;
    else if (inOwnerBlock) {
      if (/\.update\(|\.insert\(|\.delete\(/.test(l)) viol.push(`line ${i + 1}: ${l.trim()}`);
      if (/\.maybeSingle\(|\.single\(|const \{|const rows0/.test(l)) inOwnerBlock = false;
    }
  }
  assert.deepEqual(viol, [], `permanent ownership must be read-only here:\n${viol.join('\n')}`);
});

test('admin routes are registered behind the admin guard', () => {
  const routesSrc = readFileSync(path.join(here, '..', 'routes', 'ngoAdminRoutes.js'), 'utf8');
  const guardIdx = routesSrc.indexOf("router.use(authenticateRole('admin', 'super_admin'))");
  const routeIdx = routesSrc.indexOf("router.post('/temporary-access'");
  assert.ok(guardIdx > 0, 'admin guard must exist');
  assert.ok(routeIdx > guardIdx, 'temporary-access routes must be registered AFTER the admin guard');
});

test('expiry is mandatory in the schema: no null expires_at', () => {
  const ddl = readFileSync(path.join(here, '..', 'migrations', '190_temporary_data_assignments.sql'), 'utf8');
  assert.match(ddl, /expires_at\s+timestamptz NOT NULL/, 'expires_at must be NOT NULL');
  assert.match(ddl, /CHECK \(expires_at > starts_at\)/, 'window sanity CHECK must exist');
  assert.doesNotMatch(ddl, /expires_at\s+timestamptz\s*,/, 'no nullable expires_at column');
});

// Temporary WhatsApp identity — unit tests for the pure decision layer.
//
// What these pin, and why each failure would matter in production:
//  • grantPairKey — the (ngo, station) normalization must match the donor-data
//    layer exactly, or the WhatsApp scope could cover a different station than
//    the data grant does (Scenario F: a BOD-4 grant never covers BFD-21);
//  • classifyProjectAccess — THE EXPIRY GUARANTEE: a project held only
//    through a grant must read 'temp-ended' the moment the grant is gone
//    (6:00 grant, 6:01 send → 403), while permanent and unrelated legacy
//    sends stay untouched;
//  • mergeAllotments — the station-donor scope (Option A) union must dedupe
//    without dropping either side's contacts/phones.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  grantPairKey,
  mergeAllotments,
  classifyProjectAccess,
} from './temporaryWhatsappScope.js';

// ─── grant pair normalization (Scenario F) ────────────────────────────────────

test('grantPairKey trims the station and separates NGOs', () => {
  assert.equal(grantPairKey(' BOD-4 ', 'ngo-1'), 'ngo-1|BOD-4');
  assert.equal(grantPairKey('BOD-4', 'ngo-1'), grantPairKey('  BOD-4', 'ngo-1'));
  assert.notEqual(grantPairKey('BFD-21', 'ngo-1'), grantPairKey('BFD-21', 'ngo-2'));
});

test('grantPairKey tolerates missing parts without collapsing to one key', () => {
  assert.equal(grantPairKey('', 'ngo-1'), 'ngo-1|');
  assert.equal(grantPairKey('BOD-4', null), '|BOD-4');
  assert.notEqual(grantPairKey(null, 'ngo-1'), grantPairKey(null, 'ngo-2'));
});

// ─── allotment union (Option A — station-donor scope) ─────────────────────────

test('mergeAllotments unions and dedupes both sides', () => {
  const a = { donorIds: [1, 2], contactIds: [10], phoneVariants: new Set(['9111', '11']) };
  const b = { donorIds: [2, 3], contactIds: [10, 11], phoneVariants: new Set(['11', '22']) };
  const m = mergeAllotments(a, b);
  assert.deepEqual([...m.donorIds].sort(), [1, 2, 3]);
  assert.deepEqual([...m.contactIds].sort(), [10, 11]);
  assert.deepEqual([...m.phoneVariants].sort(), ['11', '22', '9111']);
});

test('mergeAllotments tolerates missing sides (temp layer absent → permanent unchanged)', () => {
  const onlyPerm = mergeAllotments(
    { donorIds: [1], contactIds: [9], phoneVariants: new Set(['1']) },
    null,
  );
  assert.deepEqual(onlyPerm.donorIds, [1]);
  assert.deepEqual(onlyPerm.contactIds, [9]);

  const onlyTemp = mergeAllotments(undefined, {
    donorIds: [7],
    contactIds: [],
    phoneVariants: new Set(['91']),
  });
  assert.deepEqual(onlyTemp.donorIds, [7]);
  assert.deepEqual([...onlyTemp.phoneVariants], ['91']);
});

// ─── sending-project verdict (the expiry guarantee) ───────────────────────────

test('classifyProjectAccess: a live grant project is temporary', () => {
  assert.equal(
    classifyProjectAccess('aflf', {
      permProjects: ['bsct'],
      tempProjects: new Set(['aflf']),
      historyProjects: new Set(['aflf']),
    }),
    'temporary',
  );
});

test('classifyProjectAccess: an ended grant project is temp-ended — sends denied', () => {
  assert.equal(
    classifyProjectAccess('aflf', {
      permProjects: ['bsct'],
      tempProjects: new Set(),
      historyProjects: new Set(['aflf']),
    }),
    'temp-ended',
  );
});

test('classifyProjectAccess: permanent beats temporary (overlap is not a denial)', () => {
  assert.equal(
    classifyProjectAccess('bsct', {
      permProjects: ['bsct'],
      tempProjects: new Set(['bsct']),
      historyProjects: new Set(),
    }),
    'permanent',
  );
});

test('classifyProjectAccess: no temp history means legacy behavior, untouched', () => {
  assert.equal(
    classifyProjectAccess('mann', {
      permProjects: ['bsct'],
      tempProjects: new Set(),
      historyProjects: new Set(['aflf']),
    }),
    'legacy',
  );
});

test('classifyProjectAccess: blank project is legacy', () => {
  assert.equal(classifyProjectAccess('', { permProjects: ['bsct'] }), 'legacy');
  assert.equal(classifyProjectAccess(null, {}), 'legacy');
  assert.equal(classifyProjectAccess(undefined, { tempProjects: new Set(['aflf']) }), 'legacy');
});

test('classifyProjectAccess works with arrays as well as sets', () => {
  assert.equal(
    classifyProjectAccess('aflf', { permProjects: [], tempProjects: ['aflf'], historyProjects: [] }),
    'temporary',
  );
  assert.equal(
    classifyProjectAccess('aflf', { permProjects: [], tempProjects: [], historyProjects: ['aflf'] }),
    'temp-ended',
  );
  assert.equal(
    classifyProjectAccess('bsct', { permProjects: ['bsct'], tempProjects: [], historyProjects: [] }),
    'permanent',
  );
});

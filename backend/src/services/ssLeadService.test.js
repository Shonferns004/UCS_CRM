// Routing rules for the Leads Hub. A wrong station here sends a paid lead to a
// queue nobody opens, so the matrix is pinned by tests.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_LEAD_STATIONS,
  LEAD_STATIONS,
  SS_STATIONS,
  sourceKeyOf,
  stationFor,
} from './ssLeadService.js';

test('source keys collapse the three lead sources', () => {
  assert.equal(sourceKeyOf('WhatsApp Bulk Reply'), 'whatsapp');
  assert.equal(sourceKeyOf('Meta Lead Ad'), 'meta');
  assert.equal(sourceKeyOf('Email Lead'), 'email');
  assert.equal(sourceKeyOf(''), 'whatsapp');
  assert.equal(sourceKeyOf(null), 'whatsapp');
});

test('each NGO + source has its own station', () => {
  assert.equal(stationFor('BSCT', 'WhatsApp Bulk Reply'), 'B-WhatsApp-Leads');
  assert.equal(stationFor('BSCT', 'Meta Lead Ad'), 'B-Meta-Leads');
  assert.equal(stationFor('BSCT', 'Email Lead'), 'B-Email-Leads');
  assert.equal(stationFor('AFLF', 'Meta Lead Ad'), 'A-Meta-Leads');
  assert.equal(stationFor('MANN', 'WhatsApp Bulk Reply'), 'M-WhatsApp-Leads');
  assert.equal(stationFor('mann', 'Email Lead'), 'M-Email-Leads');
});

test('unknown NGO or source falls back instead of throwing', () => {
  assert.equal(stationFor('XYZ', 'Meta Lead Ad'), null);
  assert.equal(stationFor('', 'Meta Lead Ad'), null);
  assert.equal(stationFor(null, null), null);
});

test('legacy SS stations stay resolvable for un-migrated rows', () => {
  assert.equal(SS_STATIONS.BSCT, 'SS-BSCT');
  assert.ok(ALL_LEAD_STATIONS.includes('SS-BSCT'));
  assert.ok(ALL_LEAD_STATIONS.includes('B-WhatsApp-Leads'));
  assert.ok(ALL_LEAD_STATIONS.includes('M-Email-Leads'));
  assert.equal(new Set(ALL_LEAD_STATIONS).size, ALL_LEAD_STATIONS.length);
});

test('the matrix is complete: 3 NGOs x 3 sources', () => {
  assert.deepEqual(Object.keys(LEAD_STATIONS).sort(), ['AFLF', 'BSCT', 'MANN']);
  for (const ngo of Object.keys(LEAD_STATIONS)) {
    assert.deepEqual(Object.keys(LEAD_STATIONS[ngo]).sort(), ['email', 'meta', 'whatsapp']);
  }
});

// Routing rules for the Leads Hub. A wrong station here sends a paid lead to a
// queue nobody opens, so the matrix is pinned by tests.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_LEAD_STATIONS,
  LEAD_STATIONS,
  SS_STATIONS,
  scoreMetaLead,
  scoreSsReply,
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

// ── Meta lead scoring ───────────────────────────────────────────────────────
// A Meta lead carries no chat reply, only form answers. Before this, every one
// fell through to "Low 25%" even when the answer was "make_a_donation".
const metaNotes = (answer) => [
  '[Meta Lead: 1132711999126392]',
  '[Platform: fb]',
  '[Campaign: 120252817012720180]',
  '[Form: Blind Ration Kit]',
  '[Account: bsct]',
  'State: Maharashtra',
  'Inbox Url: https://business.facebook.com/latest/29153295920975548',
  `How Would You Like To Support Being Charitable Trust?: ${answer}`,
].join('\n');

test('Meta answers map to intent scores', () => {
  assert.deepEqual(
    { score: scoreMetaLead(metaNotes('make_a_donation')).score, label: scoreMetaLead(metaNotes('make_a_donation')).label },
    { score: 95, label: 'interested' },
  );
  assert.equal(scoreMetaLead(metaNotes('csr_/_corporate_partnership')).score, 85);
  assert.equal(scoreMetaLead(metaNotes('learn_more_about_our_ngo')).score, 65);
  assert.equal(scoreMetaLead(metaNotes('sponsor_a_rozgaar_booth')).score, 85);
});

test('a joined answer takes the strongest intent', () => {
  assert.equal(scoreMetaLead(metaNotes('make_a_donation|learn_more_about_our_ngo')).score, 95);
});

test('geography and bookkeeping lines never score as intent', () => {
  const notes = metaNotes('').replace(/How Would.*\n?/, '');
  assert.equal(scoreMetaLead(notes).score, 35);
  assert.equal(scoreMetaLead(notes).label, 'low');
});

test('scoreSsReply routes Meta notes to the Meta scorer', () => {
  assert.equal(scoreSsReply(metaNotes('make_a_donation')).score, 95);
  // A WhatsApp reply still goes through the button/text rules.
  assert.equal(scoreSsReply('[Button: Donate Now]\n').score, 95);
  assert.equal(scoreSsReply('[Button: Not Interested]\n').score, 5);
});

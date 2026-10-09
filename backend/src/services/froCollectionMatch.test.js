// Guards for the FRO "Collected" card agreeing with the list it opens.
//
// These are pure string/number helpers (services/froCollectionMatch.js), so the
// assertions here need no database. They exist because the card and the list
// drifted onto two different definitions of "this FRO's collection this month"
// and the reported symptom was a total that was too high -- another FRO's money,
// or the same payment counted twice, landing on one person's total.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_LABELS,
  buildAgentNameMatches,
  dedupeCollectionReceipts,
  escapeLikePattern,
  isCategoryLabel,
  mergeAttributedReceipts,
  normalizeAgentName,
  paymentIdentity,
  receiptMatchesAgentName,
  totalCollectionAmount,
} from './froCollectionMatch.js';

test('agent names match regardless of case and surrounding whitespace', () => {
  const matches = buildAgentNameMatches('  Sushma Ambokar  ');
  assert.equal(receiptMatchesAgentName('sushma ambokar', matches), true);
  assert.equal(receiptMatchesAgentName('  SUSHMA AMBOKAR ', matches), true);
  assert.equal(receiptMatchesAgentName('Sushma  Ambokar', matches), false, 'inner spacing is a different name');
});

test('a different FRO is never matched by a shared first or last name', () => {
  // The bug this replaces: a name was matched with ilike, so any printed name
  // containing this one as a pattern (or vice versa) pulled in their receipts.
  const matches = buildAgentNameMatches('Mamta Pal');
  assert.equal(receiptMatchesAgentName('Mamta Shah', matches), false);
  assert.equal(receiptMatchesAgentName('Mamta', matches), false);
});

test('an underscore in a printed name is literal, not a single-char wildcard', () => {
  // ilike('_') matches any single character, so "Sneha_Patil" used to also
  // match "SnehaXPatil" -- a different person, or a mistyped entry.
  const matches = buildAgentNameMatches('Sneha_Patil');
  assert.equal(receiptMatchesAgentName('SnehaXPatil', matches), false);
  assert.equal(receiptMatchesAgentName('Sneha_Patil', matches), true);
  assert.equal(escapeLikePattern('Sneha_Patil%'), 'Sneha\\_Patil\\%');
});

test('curated spelling variants are credited to the same FRO', () => {
  // Migration 080 exists because imported receipts carry printed-name variants
  // that never matched the canonical name, so those donations were never
  // credited to the FRO who actually collected them.
  const matches = buildAgentNameMatches('Sushma Ambokar', ['Sushma Narendra Ambokar']);
  assert.equal(receiptMatchesAgentName('Sushma Narendra Ambokar', matches), true);
  assert.equal(receiptMatchesAgentName('Sushma Ambokar', matches), true);
});

test('one payment recorded twice is counted once, fixing the inflated total', () => {
  // The same payment written by the bank-audit import and again by manual
  // receipt creation, with different receipt numbers but a shared payment_id.
  const rows = [
    { id: 'r1', payment_id: 'PAY123', receipt_no: 'RC-1', donor_id: 'd1', amount: 5000, receipt_date: '2026-10-02' },
    { id: 'r2', payment_id: 'PAY123', receipt_no: 'RC-9', donor_id: 'd1', amount: 5000, receipt_date: '2026-10-02' },
  ];
  assert.equal(totalCollectionAmount(rows), 5000, 'one payment, one amount');
});

test('two genuine donations from one donor in a day both count', () => {
  // Distinct payment references are distinct payments. Collapsing these would
  // under-report, which is the opposite failure and just as wrong.
  const rows = [
    { id: 'r1', payment_id: 'PAY1', receipt_no: null, donor_id: 'd1', amount: 1000, receipt_date: '2026-10-02' },
    { id: 'r2', payment_id: 'PAY2', receipt_no: null, donor_id: 'd1', amount: 1000, receipt_date: '2026-10-02' },
  ];
  assert.equal(totalCollectionAmount(rows), 2000);
});

test('the same receipt id appearing twice is dropped once', () => {
  // A receipt reached by both the in-month query and the verified-in-month
  // union arrives twice in the merged set.
  const row = { id: 'r1', payment_id: 'PAY1', donor_id: 'd1', amount: 700, receipt_date: '2026-10-05' };
  assert.equal(totalCollectionAmount([row, { ...row }]), 700);
});

test('zero and negative amounts are not collection', () => {
  const rows = [
    { id: 'r1', payment_id: 'P1', donor_id: 'd1', amount: 0, receipt_date: '2026-10-01' },
    { id: 'r2', payment_id: 'P2', donor_id: 'd1', amount: -250, receipt_date: '2026-10-01' },
    { id: 'r3', payment_id: 'P3', donor_id: 'd1', amount: 400, receipt_date: '2026-10-01' },
  ];
  assert.equal(totalCollectionAmount(rows), 400);
});

test('legacy rows with neither payment_id nor receipt_no fall back to donor+amount+date', () => {
  const a = { id: 'r1', payment_id: null, receipt_no: null, donor_id: 'd1', amount: 900, receipt_date: '2026-10-03' };
  const b = { id: 'r2', payment_id: null, receipt_no: null, donor_id: 'd1', amount: 900, receipt_date: '2026-10-03' };
  assert.equal(paymentIdentity(a), paymentIdentity(b), 'same donor, amount and day is one payment');
  const c = { ...b, id: 'r3', receipt_date: '2026-10-04' };
  assert.notEqual(paymentIdentity(a), paymentIdentity(c), 'a different day is a different payment');
});

test('an absent or blank agent name matches nothing', () => {
  const matches = buildAgentNameMatches('Kshitija Jadhav');
  assert.equal(receiptMatchesAgentName(null, matches), false);
  assert.equal(receiptMatchesAgentName('   ', matches), false);
  assert.equal(normalizeAgentName(null), '');
});

test('dedupe keeps the first row for a repeated payment and drops the copy', () => {
  const first = { id: 'r1', payment_id: 'PAY1', donor_id: 'd1', amount: 100, receipt_date: '2026-10-01', mode: 'upi' };
  const copy = { id: 'r2', payment_id: 'PAY1', donor_id: 'd1', amount: 100, receipt_date: '2026-10-01', mode: 'cash' };
  const kept = dedupeCollectionReceipts([first, copy]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].mode, 'upi', 'the first sighting wins so the row detail stays stable');
});

// ---------------------------------------------------------------------------
// log_id-first attribution
//
// receipts.agent_name is free text written by many paths and is NOT a reliable
// owner: an agent's work-as switch stamps the label "Agent 13", bank-audit and
// suspense write 'Suspense'/'PG'/free text, and deleting an agent deletes the
// worker_aliases row that used to resolve its label. receipts.log_id ->
// fro_donor_logs.fro_worker_id is a hard FK written at collection time, so it is
// the authoritative owner.
// ---------------------------------------------------------------------------

test('a receipt linked to this FRO log is credited even when agent_name says otherwise', () => {
  // The label was stamped by the agent session, or is simply stale. The log is
  // the owner, so the money must not fall out of this FRO's total.
  const byLog = [{ id: 'r1', log_id: 7, agent_name: 'Agent 13', amount: 5000, receipt_date: '2026-10-02' }];
  const byName = [];
  const merged = mergeAttributedReceipts(byLog, byName);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].attributed_by, 'log');
  assert.equal(totalCollectionAmount(merged), 5000);
});

test('a receipt with no log is still credited by name', () => {
  // Suspense claims and older imports write no log_id. Falling back to the name
  // is what keeps that money attributed at all.
  const merged = mergeAttributedReceipts([], [
    { id: 'r2', log_id: null, agent_name: 'Kshitija Jadhav', amount: 3000, receipt_date: '2026-10-04' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].attributed_by, 'name');
  assert.equal(totalCollectionAmount(merged), 3000);
});

test('a receipt in both windows is credited once, and the log wins', () => {
  const byLog = [{ id: 'r1', log_id: 7, agent_name: 'Agent 13', amount: 5000, receipt_date: '2026-10-02' }];
  const byName = [{ id: 'r1', log_id: 7, agent_name: 'Agent 13', amount: 5000, receipt_date: '2026-10-02' }];
  const merged = mergeAttributedReceipts(byLog, byName);
  assert.equal(merged.length, 1, 'counted once');
  assert.equal(merged[0].attributed_by, 'log');
  assert.equal(totalCollectionAmount(merged), 5000);
});

test('category labels are never credited to a worker', () => {
  // 'Suspense' is bank money nobody has claimed. Crediting it to an FRO who
  // never collected it would inflate a real person's target attainment.
  for (const label of CATEGORY_LABELS) {
    assert.equal(isCategoryLabel(label), true, `${label} is a category label`);
    assert.equal(isCategoryLabel(` ${label.toUpperCase()} `), true, 'case and padding do not matter');
  }
  // Even in the pathological case of a worker whose name IS one of these, the
  // label must not match itself.
  const matches = buildAgentNameMatches('Suspense');
  assert.equal(receiptMatchesAgentName('Suspense', matches), false);
});

test('a real name that merely contains a category word still matches', () => {
  // Only the whole normalized value is the category; a person called
  // "Library Anne" is a person.
  const matches = buildAgentNameMatches('Library Anne');
  assert.equal(receiptMatchesAgentName('Library Anne', matches), true);
  assert.equal(isCategoryLabel('Library Anne'), false);
});

test('one FRO log-linked receipt is not also credited to a colleague by name', () => {
  // The scenario that made the old total too high: agent_name matched a
  // colleague while the log named this FRO, or vice versa. Two different FROs,
  // each keeping only what their own log claims.
  const mine = mergeAttributedReceipts(
    [{ id: 'r1', log_id: 7, agent_name: 'Mamta Shah', amount: 1000, receipt_date: '2026-10-01' }],
    []
  );
  const theirs = mergeAttributedReceipts(
    [{ id: 'r2', log_id: 8, agent_name: 'mamta shah', amount: 4000, receipt_date: '2026-10-01' }],
    []
  );
  assert.equal(totalCollectionAmount(mine), 1000);
  assert.equal(totalCollectionAmount(theirs), 4000);
});

test('rows with no id are never counted twice from an unkeyed set', () => {
  // mergeAttributedReceipts keys on receipt id; a row without one cannot be
  // deduped, so it must still not be summed twice when the same unkeyed row
  // arrives from both windows.
  const unkeyed = [{ amount: 750, receipt_date: '2026-10-03', payment_id: 'P9' }];
  const merged = mergeAttributedReceipts(unkeyed, unkeyed);
  assert.equal(totalCollectionAmount(merged), 750, 'payment identity still collapses it');
});

test('the summed total equals the sum of the rows the list renders', () => {
  // The invariant the card depends on: the headline number is the sum of exactly
  // the rows underneath it, after the same dedup both sides apply.
  const rows = [
    { id: 'r1', payment_id: 'P1', donor_id: 'd1', amount: 4000, receipt_date: '2026-10-01' },
    { id: 'r2', payment_id: 'P2', donor_id: 'd2', amount: 4000, receipt_date: '2026-10-02' },
    { id: 'r3', payment_id: 'P1', donor_id: 'd1', amount: 4000, receipt_date: '2026-10-01' },
  ];
  const listRows = dedupeCollectionReceipts(rows);
  const summed = listRows.reduce((s, r) => s + r.amount, 0);
  assert.equal(totalCollectionAmount(rows), summed);
  assert.equal(summed, 8000);
});
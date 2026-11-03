// Smart-reply matching — unit tests for the pure scorer.
//
// The failure that matters is a confident wrong answer: an operator sees a draft, trusts the
// "matched question" label, and sends it to a donor. So these pin both directions — a paraphrase
// must clear the auto-suggest threshold, and an unrelated greeting must score below it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTO_SUGGEST_THRESHOLD,
  normalizeText,
  rankTemplates,
  scoreTemplate,
  tokenize,
} from './whatsappReplyMatcher.js';

const minimumDonation = {
  id: 't1',
  question: 'What is the minimum donation amount?',
  answer: 'The minimum donation is Rs 500.',
  keywords: 'minimum, smallest amount',
};

const receipt = {
  id: 't2',
  question: 'How do I get an 80G tax exemption receipt?',
  answer: 'Share your PAN and address; the receipt is emailed within 3 working days.',
  keywords: '80g, tax',
};

test('normalizeText strips punctuation and case but keeps Devanagari and digits', () => {
  assert.equal(normalizeText('  Kab tak?  '), 'kab tak');
  assert.equal(normalizeText('80G receipt!'), '80g receipt');
  assert.equal(normalizeText('दान की राशि'), 'दान की राशि');
});

test('tokenize drops filler words that carry no topic', () => {
  assert.deepEqual(tokenize('What is the minimum donation amount?'), ['minimum', 'donation', 'amount']);
  assert.deepEqual(tokenize('kya hai'), []);
});

test('a real paraphrase of the stored question clears the threshold', () => {
  const score = scoreTemplate('what is the minimum donation?', minimumDonation);
  assert.ok(score >= AUTO_SUGGEST_THRESHOLD, `expected >= ${AUTO_SUGGEST_THRESHOLD}, got ${score}`);
});

test('a short donor message with the topic words still matches', () => {
  assert.ok(scoreTemplate('minimum donation kitna hai', minimumDonation) >= AUTO_SUGGEST_THRESHOLD);
});

test('greetings and unrelated chatter do not match', () => {
  for (const message of ['hello', 'good morning sir', 'thanks a lot', 'kya haal hai']) {
    assert.ok(
      scoreTemplate(message, minimumDonation) < AUTO_SUGGEST_THRESHOLD,
      `"${message}" must not trigger a draft`,
    );
  }
});

test('one shared word inside a longer question is not a phrase match', () => {
  const score = scoreTemplate('donation', receipt);
  assert.ok(score < AUTO_SUGGEST_THRESHOLD, `got ${score}`);
});

test('keywords act as extra triggers', () => {
  assert.ok(scoreTemplate('80g chahiye', receipt) >= AUTO_SUGGEST_THRESHOLD);
});

test('an identical question scores 1', () => {
  assert.equal(scoreTemplate('How do I get an 80G tax exemption receipt?', receipt), 1);
});

test('rankTemplates orders by score and trims to the limit', () => {
  const ranked = rankTemplates(
    '80g tax receipt and minimum donation amount',
    [minimumDonation, receipt],
    1,
  );
  assert.equal(ranked.length, 1);
  assert.ok(ranked[0].score > 0);
  const both = rankTemplates('80g tax receipt and minimum donation amount', [minimumDonation, receipt]);
  assert.ok(both[0].score >= both[1].score);
});

test('rankTemplates tolerates empty input', () => {
  assert.deepEqual(rankTemplates('anything', null), []);
  assert.deepEqual(rankTemplates('', [minimumDonation]), []);
});

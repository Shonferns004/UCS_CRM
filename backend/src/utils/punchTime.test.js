import test from 'node:test';
import assert from 'node:assert';
import { resolvePunchTime, PUNCH_TIME_MAX_AGE_MS, PUNCH_TIME_MAX_FUTURE_MS } from './punchTime.js';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const ago = (ms) => new Date(NOW.getTime() - ms);

test('missing / blank punch_time means "now" (a live punch)', () => {
  assert.equal(resolvePunchTime(undefined, NOW).time.getTime(), NOW.getTime());
  assert.equal(resolvePunchTime(null, NOW).time.getTime(), NOW.getTime());
  assert.equal(resolvePunchTime('', NOW).time.getTime(), NOW.getTime());
});

test('a queued punch keeps the time it happened', () => {
  const morning = ago(6 * 60 * 60 * 1000); // 06:00Z, six hours ago
  const r = resolvePunchTime(morning.toISOString(), NOW);
  assert.equal(r.error, undefined);
  assert.equal(r.time.getTime(), morning.getTime());

  // ...even across a day boundary, so the punch lands on its own date.
  const yesterday = ago(26 * 60 * 60 * 1000);
  assert.equal(resolvePunchTime(yesterday.toISOString(), NOW).time.getTime(), yesterday.getTime());
});

test('a device clock running ahead is clamped to now', () => {
  const ahead = new Date(NOW.getTime() + 60 * 60 * 1000); // +1h
  assert.equal(resolvePunchTime(ahead.toISOString(), NOW).time.getTime(), NOW.getTime());
  // within the tolerated skew it is still honoured
  const slight = new Date(NOW.getTime() + 2 * 60 * 1000);
  assert.equal(resolvePunchTime(slight.toISOString(), NOW).time.getTime(), slight.getTime());
});

test('a stale queued punch is rejected instead of being backdated or moved to today', () => {
  const stale = new Date(NOW.getTime() - PUNCH_TIME_MAX_AGE_MS - 1000);
  const r = resolvePunchTime(stale.toISOString(), NOW);
  assert.equal(r.time, undefined);
  assert.match(r.error, /older than 7 days/);
});

test('garbage input falls back to now rather than throwing', () => {
  assert.equal(resolvePunchTime('not-a-date', NOW).time.getTime(), NOW.getTime());
  assert.equal(resolvePunchTime('{bad json}', NOW).time.getTime(), NOW.getTime());
});

test('epoch seconds and milliseconds are both understood', () => {
  const t = NOW.getTime() - 90 * 60 * 1000;
  assert.equal(resolvePunchTime(Math.floor(t / 1000), NOW).time.getTime(), Math.floor(t / 1000) * 1000);
  assert.equal(resolvePunchTime(t, NOW).time.getTime(), t);
  assert.equal(resolvePunchTime(String(Math.floor(t / 1000)), NOW).time.getTime(), Math.floor(t / 1000) * 1000);
  assert.equal(resolvePunchTime(String(t), NOW).time.getTime(), t);
});

test('the future window is small enough to reject a same-day fake punch', () => {
  assert.ok(PUNCH_TIME_MAX_FUTURE_MS <= 15 * 60 * 1000);
});

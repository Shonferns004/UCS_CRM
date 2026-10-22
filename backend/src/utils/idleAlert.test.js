import test from 'node:test';
import assert from 'node:assert';
import { IDLE_ALERT_LEVELS, idleAlertFor, isIdleAlertLevel } from './idleAlert.js';

// The three Warn tiers must stay distinguishable: same-title alerts would make
// the FRO modal and the push notification read identically at every level.
test('every level has its own title and body', () => {
  const titles = new Set();
  const bodies = new Set();
  for (const level of ['yellow', 'orange', 'red']) {
    const alert = idleAlertFor(level, 'Aftab');
    assert.ok(alert, `${level} must resolve`);
    assert.equal(alert.level, level);
    assert.ok(alert.title.length > 0);
    assert.ok(alert.body.length > 0);
    titles.add(alert.title);
    bodies.add(alert.body);
  }
  assert.equal(titles.size, 3, 'titles must be distinct per level');
  assert.equal(bodies.size, 3, 'bodies must be distinct per level');
});

test('the body names the FRO and the band it belongs to', () => {
  assert.match(idleAlertFor('yellow', 'Aftab').body, /^Aftab, /);
  assert.match(idleAlertFor('yellow', 'Aftab').body, /over an hour/);
  assert.match(idleAlertFor('orange', 'Aftab').body, /over 1 hour 30 minutes/);
  assert.match(idleAlertFor('red', 'Aftab').body, /over 2 hours/);
  assert.match(idleAlertFor('red', 'Aftab').body, /urgent/i);
});

test('a blank name falls back to Telecaller', () => {
  assert.match(idleAlertFor('orange', '  ').body, /^Telecaller, /);
  assert.match(idleAlertFor('orange', null).body, /^Telecaller, /);
});

test('unknown or missing levels resolve to null', () => {
  for (const bad of [undefined, null, '', 'blue', 'YELLOW', 1, {}]) {
    assert.equal(isIdleAlertLevel(bad), false);
    assert.equal(idleAlertFor(bad, 'Aftab'), null);
  }
});

test('exactly three levels are exposed', () => {
  assert.deepEqual(Object.keys(IDLE_ALERT_LEVELS).sort(), ['orange', 'red', 'yellow']);
});

import test from 'node:test';
import assert from 'node:assert';
import {
  IDLE_ALERT_LEVELS,
  IDLE_ALERT_THRESHOLDS,
  idleAlertFor,
  idleAlertLevelForSeconds,
  isIdleAlertLevel,
} from './idleAlert.js';

// The three Warn tiers must stay distinguishable: the FRO has to be able to
// tell a first warning from the final one.
test('every tier has its own title and body', () => {
  const titles = new Set();
  const bodies = new Set();
  for (const level of ['green', 'orange', 'red']) {
    const alert = idleAlertFor(level, 'Aftab');
    assert.ok(alert, `${level} must resolve`);
    assert.equal(alert.level, level);
    assert.ok(alert.title.length > 0);
    assert.ok(alert.body.length > 0);
    titles.add(alert.title);
    bodies.add(alert.body);
  }
  assert.deepEqual([...titles].sort(), ['FIRST WARNING', 'SECOND WARNING', 'THIRD AND FINAL WARNING']);
  assert.equal(bodies.size, 3, 'bodies must be distinct per tier');
});

test('the body starts with Dear <name> and quotes its own band', () => {
  assert.match(idleAlertFor('green', 'Aftab').body, /^Dear Aftab,/);
  assert.match(idleAlertFor('green', 'Aftab').body, /1 hour\*/);
  assert.match(idleAlertFor('green', 'Aftab').body, /FIRST WARNING/);

  assert.match(idleAlertFor('orange', 'Aftab').body, /^Dear Aftab,/);
  assert.match(idleAlertFor('orange', 'Aftab').body, /1 hour and 41 minutes/);
  assert.match(idleAlertFor('orange', 'Aftab').body, /SECOND WARNING/);

  assert.match(idleAlertFor('red', 'Aftab').body, /^Dear Aftab,/);
  assert.match(idleAlertFor('red', 'Aftab').body, /2 hours and 11 minutes/);
  assert.match(idleAlertFor('red', 'Aftab').body, /THIRD AND FINAL WARNING/);
});

test('the name is never replaced with the word Telecaller', () => {
  for (const level of ['green', 'orange', 'red']) {
    const body = idleAlertFor(level, '').body;
    assert.doesNotMatch(body, /Telecaller/i);
    assert.match(body, /^Dear ,/);
  }
});

test('the bands match the board: 1:00-1:40 green, 1:41-2:10 orange, 2:11+ red', () => {
  // Pinned as literals, not just via the constants: a comment saying "2:11"
  // over a value of 2:10:10 is exactly how the two surfaces drift apart.
  assert.equal(IDLE_ALERT_THRESHOLDS.green, 3601);   // 1:00:01
  assert.equal(IDLE_ALERT_THRESHOLDS.orange, 6060);  // 1:41:00
  assert.equal(IDLE_ALERT_THRESHOLDS.red, 7860);     // 2:11:00

  assert.equal(idleAlertLevelForSeconds(0), null);
  assert.equal(idleAlertLevelForSeconds(3600), null);
  assert.equal(idleAlertLevelForSeconds(IDLE_ALERT_THRESHOLDS.green - 1), null);
  assert.equal(idleAlertLevelForSeconds(IDLE_ALERT_THRESHOLDS.green), 'green');
  assert.equal(idleAlertLevelForSeconds(6059), 'green');
  assert.equal(idleAlertLevelForSeconds(IDLE_ALERT_THRESHOLDS.orange), 'orange');
  assert.equal(idleAlertLevelForSeconds(7859), 'orange');
  assert.equal(idleAlertLevelForSeconds(7860), 'red');
  assert.equal(idleAlertLevelForSeconds(99999), 'red');
});

test('yellow stays an alias of the first warning for older senders', () => {
  const yellow = idleAlertFor('yellow', 'Aftab');
  const green = idleAlertFor('green', 'Aftab');
  assert.equal(yellow.title, green.title);
  assert.equal(yellow.body, green.body);
});

test('unknown or missing levels resolve to null', () => {
  for (const bad of [undefined, null, '', 'blue', 'GREEN', 1, {}]) {
    assert.equal(isIdleAlertLevel(bad), false);
    assert.equal(idleAlertFor(bad, 'Aftab'), null);
  }
});

test('the canonical levels are exposed', () => {
  assert.deepEqual(Object.keys(IDLE_ALERT_LEVELS).sort(), ['green', 'orange', 'red', 'yellow']);
});

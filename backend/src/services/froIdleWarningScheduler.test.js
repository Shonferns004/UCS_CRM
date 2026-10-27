import test from 'node:test';
import assert from 'node:assert';
import { runIdleWarningSweep, stop } from './froIdleWarningScheduler.js';
import { istDateStr } from '../utils/froIdle.js';

// The sweep is the automatic half of the Warn button: it must fire as soon as
// the FRO's today-idle figure enters a band, and only once per band per day.
// These cases drive it with rows/emitter injected, so no database is touched.

const today = () => istDateStr();
const row = (id, seconds, extra = {}) => ({
  worker_id: id,
  today_idle_seconds: seconds,
  idle_since: null,
  disposition_due_at: null,
  is_paused: false,
  status: 'online',
  stats_date: today(),
  ...extra,
});

function harness(rows, { online = () => true, shift = {}, dayTotals = new Map() } = {}) {
  const emitted = [];
  const opts = {
    rows,
    isOnline: online,
    getShiftWindows: async () => shift,
    getDayTotals: async () => dayTotals,
    names: Object.fromEntries(rows.map((r) => [r.worker_id, `Name ${r.worker_id}`])),
    emit: (type, payload, room) => emitted.push({ type, payload, room }),
  };
  return { emitted, opts };
}

test('fires the first warning once when an FRO enters 1:00-1:40', async () => {
  stop();
  const r = row('green-worker', 3700);
  const { emitted, opts } = harness([r]);

  const first = await runIdleWarningSweep(Date.now(), opts);
  assert.equal(first.warned, 1);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, 'fro:action');
  assert.equal(emitted[0].room, 'role:fro');
  assert.equal(emitted[0].payload.level, 'green');
  assert.equal(emitted[0].payload.auto, true);
  assert.equal(emitted[0].payload.targetWorkerId, 'green-worker');
  assert.match(emitted[0].payload.title, /FIRST WARNING/);
  assert.match(emitted[0].payload.body, /^Dear Name green-worker,/);

  // Still in the same band: nothing else is sent.
  const second = await runIdleWarningSweep(Date.now() + 30_000, opts);
  assert.equal(second.warned, 0);
  assert.equal(emitted.length, 1);
  stop();
});

test('a higher band sends its own warning, not a repeat of the first', async () => {
  stop();
  const rows = [row('orange-worker', 6100), row('red-worker', 7900)];
  const { emitted, opts } = harness(rows);

  const result = await runIdleWarningSweep(Date.now(), opts);
  assert.equal(result.warned, 2);
  const byWorker = Object.fromEntries(emitted.map((e) => [e.payload.targetWorkerId, e.payload]));
  assert.equal(byWorker['orange-worker'].level, 'orange');
  assert.match(byWorker['orange-worker'].title, /SECOND WARNING/);
  assert.match(byWorker['orange-worker'].body, /^Dear Name orange-worker,/);
  assert.equal(byWorker['red-worker'].level, 'red');
  assert.match(byWorker['red-worker'].title, /THIRD AND FINAL WARNING/);
  assert.match(byWorker['red-worker'].body, /^Dear Name red-worker,/);

  // Crossing again with the same rows repeats nothing.
  const again = await runIdleWarningSweep(Date.now() + 30_000, opts);
  assert.equal(again.warned, 0);
  stop();
});

test('uses the ledger day total the board reads, not just the live counter', async () => {
  stop();
  // A FRO who idled 61 minutes, resumed, and idled another 41 minutes has both
  // stretches in the ledger. The live row is only committed on logout, so it
  // still reads 0 while the board already shows orange. The sweep must follow
  // the board, or the warning waits until the FRO leaves for the day.
  const rows = [
    row('ledger-green-worker', 0),
    row('ledger-orange-worker', 3700),
  ];
  const dayTotals = new Map([
    ['ledger-green-worker', { idle_seconds: 3700 }],
    ['ledger-orange-worker', { idle_seconds: 6100 }],
  ]);
  const { emitted, opts } = harness(rows, { dayTotals });

  const result = await runIdleWarningSweep(Date.now(), opts);
  assert.equal(result.warned, 2);
  const byWorker = Object.fromEntries(emitted.map((e) => [e.payload.targetWorkerId, e.payload]));
  assert.equal(byWorker['ledger-green-worker'].level, 'green');
  assert.equal(byWorker['ledger-green-worker'].idle_seconds, 3700);
  assert.equal(byWorker['ledger-orange-worker'].level, 'orange');
  assert.equal(byWorker['ledger-orange-worker'].idle_seconds, 6100);

  const again = await runIdleWarningSweep(Date.now() + 30_000, opts);
  assert.equal(again.warned, 0);
  stop();
});

test('held rows and FROs without a live panel are skipped', async () => {
  stop();
  const rows = [
    row('paused-worker', 9000, { is_paused: true }),
    row('meeting-worker', 9000, { status: 'meeting' }),
    row('offline-worker', 9000),
  ];
  const { emitted, opts } = harness(rows, { online: (id) => id !== 'offline-worker' });

  const result = await runIdleWarningSweep(Date.now(), opts);
  assert.equal(result.warned, 0);
  assert.equal(emitted.length, 0);
  stop();
});

test('outside the shift, no warning is sent', async () => {
  stop();
  const now = Date.now();
  const r = row('after-hours-worker', 9000);
  const { emitted, opts } = harness([r], {
    shift: { 'after-hours-worker': { startMs: now + 60_000, endMs: now + 3600_000 } },
  });

  const result = await runIdleWarningSweep(now, opts);
  assert.equal(result.warned, 0);
  assert.equal(emitted.length, 0);
  stop();
});

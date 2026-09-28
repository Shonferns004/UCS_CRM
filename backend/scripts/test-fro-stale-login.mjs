// Reproduces the "flickers to Resume on login" bug against the real helper.
// Run: node test_stale_login.mjs
import { withoutStaleIdle, withinShift, nextDeadline, deadlinePassed, secondsLeft, liveIdleSeconds, istDateStr } from '../src/utils/froIdle.js';

const H = 3600 * 1000;
let fails = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

// A shift that is open right now, "now" = today 14:00 IST (08:30 UTC).
const nowMs = Date.UTC(2026, 8, 28, 8, 30, 0);
const shift = { startMs: nowMs - 4 * H, endMs: nowMs + 5 * H };

// Yesterday's leftovers, exactly what a closed tab leaves behind.
const staleIdleSince = new Date(Date.UTC(2026, 8, 27, 10, 0, 0)).toISOString();
const staleDeadline = new Date(Date.UTC(2026, 8, 27, 10, 4, 0)).toISOString();

console.log('--- login hydrate with a stale row ---');
const staleRow = {
  worker_id: 'w1',
  idle_since: staleIdleSince,
  disposition_due_at: staleDeadline,
  today_idle_seconds: 900,
  status: 'online',
};
ok('uncleaned row looks idle (this is the bug)', !!staleRow.idle_since || deadlinePassed(staleRow, nowMs));

const clean = withoutStaleIdle(staleRow, shift, nowMs);
ok('stale idle_since dropped', clean.idle_since === null);
ok('stale today_idle_seconds reset', clean.today_idle_seconds === 0);
ok('stale deadline dropped', clean.disposition_due_at === null);
ok('login no longer reports idle', !clean.idle_since && !deadlinePassed(clean, nowMs));

// The clock the panel will then show.
const due = clean.disposition_due_at || nextDeadline(shift, nowMs);
ok('a full window is issued on login', secondsLeft({ disposition_due_at: due }, nowMs) === 240);
ok('in shift', withinShift(shift, nowMs));

console.log('--- a genuine idle from today must survive ---');
const realIdleSince = new Date(nowMs - 90 * 1000).toISOString();
const realRow = { worker_id: 'w1', idle_since: realIdleSince, disposition_due_at: new Date(nowMs - 60 * 1000).toISOString() };
const realClean = withoutStaleIdle(realRow, shift, nowMs);
ok('today\'s idle_since kept', realClean.idle_since === realIdleSince);
ok('today\'s deadline kept', realClean.disposition_due_at === realRow.disposition_due_at);
ok('still reports idle', !!realClean.idle_since);

console.log('--- a deadline from earlier in today\'s shift stays too ---');
const earlierToday = new Date(nowMs - 2 * H).toISOString();
const afterStart = new Date(nowMs - 1 * H).toISOString();
const midRow = { worker_id: 'w1', disposition_due_at: earlierToday };
const midClean = withoutStaleIdle(midRow, { startMs: afterStart, endMs: nowMs + H }, nowMs);
ok('deadline after shift start is kept', midClean.disposition_due_at === earlierToday);

console.log('--- edge cases ---');
ok('null row is safe', withoutStaleIdle(null, shift, nowMs) === null);
ok('no shift window keeps the row', withoutStaleIdle({ idle_since: staleIdleSince }, {}, nowMs).idle_since === null);
ok('clean row is returned untouched (same ref)', (() => { const r = { disposition_due_at: null }; return withoutStaleIdle(r, shift, nowMs) === r; })());
ok('idle totals still computed for a real period', liveIdleSeconds(realRow, shift, nowMs) >= 90);

// Sanity: the IST day boundary the helper relies on.
ok('helper sees the two stamps as different IST days', istDateStr(new Date(staleIdleSince)) !== istDateStr(new Date(nowMs)));

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall checks passed');
process.exit(fails ? 1 : 0);

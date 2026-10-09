// A covered FRO's row and the covering agent's panel must show the same idle.
//
// The row belongs to the FRO, but while an agent is covering it the person at the
// keyboard is the AGENT — and the agent's panel shows the agent's own figure. The
// board used to show the FRO's banked idle instead, so the same row read 44m on the
// board and 2m on the panel, and neither number was wrong: they were two different
// people. This pins the rule that makes one number win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, '..', rel), 'utf8');

// The decision itself, extracted so it is testable without a database.
export function idleCellForRow({ froOwnIdle, bankedIdle, coveringAgentIdle, hasLiveCover }) {
  const fallback = Math.max(Number(froOwnIdle || 0), Number(bankedIdle || 0));
  if (hasLiveCover && coveringAgentIdle != null) return coveringAgentIdle;
  return fallback;
}

test('a live cover makes the board report the agent, matching that agent panel', () => {
  assert.equal(
    idleCellForRow({ froOwnIdle: 2640, bankedIdle: 2640, coveringAgentIdle: 120, hasLiveCover: true }),
    120,
    'the agent at the keyboard is who the panel shows, so the board must show them too'
  );
});

test('an agent with no stamped time yet reads zero, not the covered FRO figure', () => {
  assert.equal(
    idleCellForRow({ froOwnIdle: 2640, bankedIdle: 2640, coveringAgentIdle: 0, hasLiveCover: true }),
    0,
    'zero from the covering agent is a real reading and must not fall through to the FRO'
  );
});

test('no live cover leaves the FRO own figure alone', () => {
  assert.equal(
    idleCellForRow({ froOwnIdle: 2640, bankedIdle: 2640, coveringAgentIdle: 120, hasLiveCover: false }),
    2640
  );
});

test('a cover whose agent has no ledger row falls back to the FRO figure', () => {
  // Unknown agent (ledger absent) must not blank a real number to 0.
  assert.equal(
    idleCellForRow({ froOwnIdle: 2640, bankedIdle: 100, coveringAgentIdle: null, hasLiveCover: true }),
    2640
  );
});

test('the board reads the agent figure from the agent stamp, not from the FRO row', () => {
  const src = read('controllers/ngoAdminController.js');
  assert.match(src, /coveringIdle\s*!=\s*null\s*\?\s*coveringIdle\s*:\s*idleDisplaySeconds/,
    'today_idle_seconds must prefer the covering agent figure while a cover is live');
  // And it must say whose it is, or the cell reads as the FRO's number.
  assert.match(src, /idle_attributed_to/,
    'the board must name whose idle it is reporting while a cover is live');
});

test('an agent idle total is read by agent_id, the only place an agent has rows', () => {
  const sessions = read('services/froTimeSessions.js');
  assert.match(sessions, /export async function dayTotalsForAgents/,
    'the agent totals reader must exist — an agent has no workers row to key a worker query on');
  const board = read('controllers/ngoAdminController.js');
  assert.match(board, /dayTotalsForAgents\(/, 'the board must use it');
  assert.match(board, /operatorUserId/, 'the operator id is the agent stamp on the intervals');
});
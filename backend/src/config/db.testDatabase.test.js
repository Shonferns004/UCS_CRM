// Proof that the suite runs against the test database, never the live one.
//
// `npm test` runs scripts/run-tests.mjs, which forces
// DATABASE_URL=TEST_DATABASE_URL (…/ucs_test) in the child environment before
// src/config/db.js loads. Running `node --test` directly therefore lands on the
// live database instead — the guard below fails loudly in that case, and the
// write test re-checks the database name itself and skips, so nothing is ever
// written outside ucs_test.
//
// The round-trip is the point: env plumbing that looks right but does not
// actually redirect the pool would pass a name check done at load time and
// still write to the wrong database.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import db from './db.js';

const currentDatabase = async () => {
  const { rows } = await db._pool.query('SELECT current_database() AS db');
  return rows[0].db;
};

after(async () => {
  await db._pool.end();
});

test('suite is connected to ucs_test', async () => {
  const dbName = await currentDatabase();
  assert.equal(
    dbName,
    'ucs_test',
    `connected to "${dbName}" — run the suite with "npm test", not "node --test"`
  );
});

test('scratch table write round-trip', async (t) => {
  // Three gates before any write: reachable at all, reachable database is
  // ucs_test, and only then the round-trip itself. A raw `node --test` on a
  // blocked network fails the guard above on the connect error and skips here.
  let dbName;
  try {
    dbName = await currentDatabase();
  } catch (err) {
    t.skip(`no database reachable: ${err?.message || err}`);
    return;
  }
  if (dbName !== 'ucs_test') {
    t.skip(`connected to "${dbName}" — refusing to write outside ucs_test`);
    return;
  }

  await db._pool.query('CREATE TABLE IF NOT EXISTS _test_probe (id integer PRIMARY KEY, note text NOT NULL)');
  await db._pool.query('DELETE FROM _test_probe');
  await db._pool.query('INSERT INTO _test_probe (id, note) VALUES ($1, $2)', [1, 'round-trip']);
  const { rows } = await db._pool.query('SELECT note FROM _test_probe WHERE id = $1', [1]);
  assert.equal(rows[0]?.note, 'round-trip');
  await db._pool.query('DELETE FROM _test_probe');
});

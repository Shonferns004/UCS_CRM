import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTunnelCredentials, describeCredentialProblem } from './tunnel-creds.mjs';

// The whole point of this module: a developer's DATABASE_URL points at the
// LOCAL Postgres on the LAN, while the tunnel dials AWS RDS. Copying the
// DATABASE_URL credentials into the tunnel authenticates as the wrong user and
// RDS answers "password authentication failed" (28P01) — which looks exactly
// like a network problem and sends you debugging the tunnel instead of the
// credentials.

test('explicit DB_TUNNEL_* variables win over DATABASE_URL', () => {
  const creds = resolveTunnelCredentials({
    DB_TUNNEL_PGUSER: 'ucs_admin',
    DB_TUNNEL_PGPASSWORD: 'rds-password',
    DB_TUNNEL_PGDATABASE: 'postgres',
    DATABASE_URL: 'postgres://postgres:lan-password@192.168.1.152:5432/ucs_crm',
  });

  assert.equal(creds.user, 'ucs_admin');
  assert.equal(creds.password, 'rds-password');
  assert.equal(creds.database, 'postgres');
  assert.equal(creds.source, 'explicit');
});

test('falls back to DATABASE_URL when no explicit variables are set', () => {
  const creds = resolveTunnelCredentials({
    DATABASE_URL: 'postgres://someuser:somepassword@db.example.com:5432/somedb',
  });

  assert.equal(creds.user, 'someuser');
  assert.equal(creds.password, 'somepassword');
  assert.equal(creds.database, 'somedb');
  assert.equal(creds.source, 'database_url');
});

test('an empty explicit variable falls back rather than producing an empty credential', () => {
  // An empty password never authenticates against RDS. Treating "" as "set"
  // would build a tunnel that fails with a generic auth error instead of
  // falling back to a working source.
  const creds = resolveTunnelCredentials({
    DB_TUNNEL_PGUSER: '',
    DB_TUNNEL_PGPASSWORD: '',
    DATABASE_URL: 'postgres://someuser:somepassword@db.example.com:5432/somedb',
  });

  assert.equal(creds.user, 'someuser');
  assert.equal(creds.password, 'somepassword');
  assert.equal(creds.source, 'database_url');
});

test('the database name defaults to postgres', () => {
  const creds = resolveTunnelCredentials({
    DB_TUNNEL_PGUSER: 'ucs_admin',
    DB_TUNNEL_PGPASSWORD: 'rds-password',
  });

  assert.equal(creds.database, 'postgres');
});

test('percent-encoded credentials in DATABASE_URL are decoded', () => {
  const creds = resolveTunnelCredentials({
    DATABASE_URL: 'postgres://someuser:p%40ss%3Aword@db.example.com:5432/somedb',
  });

  assert.equal(creds.password, 'p@ss:word');
});

test('a malformed DATABASE_URL does not throw and reports no credentials', () => {
  const creds = resolveTunnelCredentials({ DATABASE_URL: 'not a url at all' });

  assert.equal(creds.user, null);
  assert.equal(creds.password, null);
  assert.equal(creds.source, 'none');
});

test('the problem description names the variable that is missing', () => {
  const noUser = describeCredentialProblem({ user: null, password: 'x' });
  assert.match(noUser, /DB_TUNNEL_PGUSER/);

  const noPassword = describeCredentialProblem({ user: 'ucs_admin', password: null });
  assert.match(noPassword, /DB_TUNNEL_PGPASSWORD/);

  assert.equal(describeCredentialProblem({ user: 'ucs_admin', password: 'x' }), null);
});

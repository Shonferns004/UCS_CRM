import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES, isPlaceholder } from './security-check.mjs';

// SN-12 exists because of a real miss. The RDS superuser password sat in
// scripts/run-backend-tunnel.mjs as `process.env.PGPASSWORD='...'` while the
// scanner ran clean: SN-09 anchors on a word boundary before the keyword, and
// in "PGPASSWORD" there is no boundary (G and P are both word characters), so
// the rule could never reach the spelling the code actually used.

const rule = (id) => RULES.find((r) => r.id === id);

function matches(id, text) {
  const r = rule(id);
  const re = new RegExp(r.re.source, r.re.flags);
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[r.group]);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

test('SN-12 catches a credential in an env-var-shaped assignment', () => {
  assert.deepEqual(
    matches('SN-12', "process.env.PGPASSWORD='ucscompany123'"),
    ['ucscompany123'],
    'the exact spelling that slipped through must be caught',
  );
});

test('SN-12 catches the other prefixed credential spellings', () => {
  assert.deepEqual(matches('SN-12', "db_password='hunter2hunter2'"), ['hunter2hunter2']);
  assert.deepEqual(matches('SN-12', "JWT_SECRET='abcdef123456'"), ['abcdef123456']);
  assert.deepEqual(matches('SN-12', 'DB_TUNNEL_PGPASSWORD = "s3cretvalue"'), ['s3cretvalue']);
  assert.deepEqual(matches('SN-12', 'AWS_SECRET_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"'), ['AKIAIOSFODNN7EXAMPLE']);
});

test('SN-12 does not duplicate what SN-09 already reports', () => {
  // The bare keyword belongs to SN-09. SN-12 only handles the prefixed
  // spelling, so one credential produces one finding rather than two.
  assert.deepEqual(matches('SN-09', "password: 'sevak123'"), ['sevak123']);
  assert.deepEqual(matches('SN-12', "password: 'sevak123'"), []);
});

test('SN-12 does not flag a name that merely mentions a credential', () => {
  // A Secrets Manager path and an Android broadcast constant are not
  // credentials. The first is not matched by the rule at all, because the
  // keyword does not end the identifier.
  assert.deepEqual(matches('SN-12', 'SECRET_NAME: "ucs-crm/rds-password"'), []);
  assert.deepEqual(matches('SN-12', 'const val EVENT_SECRET_CODE = "secretCodeUsed"'), []);
});

test('a credential-shaped name that is not a secret is suppressed by ALLOW_EXACT', () => {
  // EXTRA_FROM_SECRET ends in SECRET, so the rule cannot tell it apart from a
  // credential by shape alone. It is suppressed the way the scanner documents:
  // by listing the value in ALLOW_EXACT, which isPlaceholder() honours.
  assert.deepEqual(
    matches('SN-12', 'const val EXTRA_FROM_SECRET = "fromSecretCode"'),
    ['fromSecretCode'],
    'the rule still matches; suppression happens downstream',
  );
  assert.equal(isPlaceholder('fromSecretCode'), true, 'ALLOW_EXACT must suppress it');
  assert.equal(isPlaceholder('secretCodeUsed'), true);
});

test('SN-12 ignores an env read with no literal value', () => {
  assert.deepEqual(matches('SN-12', 'process.env.PGPASSWORD'), []);
  assert.deepEqual(matches('SN-12', 'const secret = process.env.MY_SECRET;'), []);
});

test('SN-13 catches an unquoted shell or dotenv credential', () => {
  // This is how the leak actually looked in scripts/aws-*.sh: the value was
  // unquoted, so SN-12 (which requires quotes) walked straight past it.
  assert.deepEqual(matches('SN-13', 'export PGPASSWORD=ucscompany123'), ['ucscompany123']);
  assert.deepEqual(matches('SN-13', 'DB_TUNNEL_PGPASSWORD=ucscompany123'), ['ucscompany123']);
});

test('SN-13 ignores expressions and variable references', () => {
  assert.deepEqual(matches('SN-13', 'process.env.PGPASSWORD=creds.password;'), []);
  assert.deepEqual(matches('SN-13', 'export PGPASSWORD="${PGPASSWORD}"'), []);
  assert.deepEqual(matches('SN-13', '# export PGPASSWORD=ucscompany123'), []);
});

test('the placeholder filter still treats documentation values as safe', () => {
  assert.equal(isPlaceholder('replace-with-a-long-random-password'), true);
  assert.equal(isPlaceholder('replace-with-the-rds-password'), true);
  assert.equal(isPlaceholder('your-master-password'), true);
  assert.equal(isPlaceholder('ucscompany123'), false);
});

// Runs the test suite against the TEST database. The live database is never
// reachable from `npm test`: DATABASE_URL is forced to TEST_DATABASE_URL in the
// child environment before any test file (and therefore src/config/db.js) is
// loaded, and the run is refused outright if TEST_DATABASE_URL is missing or
// does not point at ucs_test.
//
// Run from backend/:  npm test
import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { viaTunnelIfUp } from './lib/tunnel-url.mjs';

const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv({ path: path.join(BACKEND_DIR, '.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('[test] TEST_DATABASE_URL is not set in backend/.env — refusing to run tests, they would hit the live database.');
  process.exit(1);
}
if (new URL(testUrl).pathname !== '/ucs_test') {
  console.error(`[test] TEST_DATABASE_URL must point at /ucs_test, got "${new URL(testUrl).pathname}" — refusing to run tests.`);
  process.exit(1);
}

// On a network that blocks the RDS IP, the suite runs through the SSH tunnel
// (host rewritten to 127.0.0.1) — exactly what the diag scripts do.
const env = { ...process.env, DATABASE_URL: await viaTunnelIfUp(testUrl), NODE_ENV: 'test', READ_DATABASE_URL: '' };

const child = spawn(
  process.execPath,
  ['--test', '--test-force-exit', 'src/**/*.test.js'],
  { cwd: BACKEND_DIR, env, stdio: 'inherit' }
);

child.on('error', (err) => {
  console.error('[test] failed to start:', err?.message || err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});

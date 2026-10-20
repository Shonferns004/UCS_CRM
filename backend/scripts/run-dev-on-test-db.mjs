// Runs the backend SERVER against the TEST database (ucs_test) instead of the
// live one — use this for app testing so every entry a tester creates lands in
// ucs_test and never in production.
//
// Run from backend/:  npm run dev:test
//
// Safety: refuses to start unless TEST_DATABASE_URL points at /ucs_test;
// DATABASE_URL is forced to it (and READ_DATABASE_URL cleared) in the child
// environment before src/config/db.js is loaded, same as npm test.
import { config as dotenv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { viaTunnelIfUp } from './lib/tunnel-url.mjs';

const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv({ path: path.join(BACKEND_DIR, '.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('[dev:test] TEST_DATABASE_URL is not set in backend/.env — refusing to start, the server would hit the live database.');
  process.exit(1);
}
if (new URL(testUrl).pathname !== '/ucs_test') {
  console.error(`[dev:test] TEST_DATABASE_URL must point at /ucs_test, got "${new URL(testUrl).pathname}" — refusing to start.`);
  process.exit(1);
}

const connStr = await viaTunnelIfUp(testUrl);
const ping = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
try {
  await ping.connect();
  const { rows } = await ping.query('SELECT current_database() AS db');
  if (rows[0].db !== 'ucs_test') throw new Error(`connected to ${rows[0].db}`);
} catch (err) {
  console.error(`[dev:test] cannot reach ucs_test (${err?.message || err}).`);
  if (connStr === testUrl) console.error('[dev:test] tunnel is not up and RDS is blocked here — start it:  node scripts/tunnel-db.mjs start');
  process.exit(1);
} finally {
  await ping.end().catch(() => {});
}

const port = process.env.PORT || '3000';
console.log('==========================================================');
console.log('  BACKEND STARTING ON TEST DB: ucs_test  (live = SAFE)');
console.log(`  port ${port}  |  DATABASE_URL forced to /ucs_test`);
console.log('  Stop with Ctrl+C. Run `npm start` for the live database.');
console.log('==========================================================');

const env = { ...process.env, DATABASE_URL: connStr, READ_DATABASE_URL: '' };
const nodemonBin = path.join(BACKEND_DIR, 'node_modules', 'nodemon', 'bin', 'nodemon.js');
const useNodemon = fs.existsSync(nodemonBin);
const [cmd, args] = useNodemon ? [process.execPath, [nodemonBin, 'src/index.js']] : [process.execPath, ['src/index.js']];

const child = spawn(cmd, args, { cwd: BACKEND_DIR, env, stdio: 'inherit' });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
child.on('error', (err) => {
  console.error('[dev:test] failed to start:', err?.message || err);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));

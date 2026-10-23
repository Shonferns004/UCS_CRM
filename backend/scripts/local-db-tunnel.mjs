#!/usr/bin/env node
/**
 * Reach the office Postgres from any network, without opening a port anywhere.
 *
 *   office box  --ssh -R-->  EC2 jump host (127.0.0.1:15433)  <--ssh -L--  laptop
 *
 * The office box dials OUT to EC2, so it keeps working behind NAT. EC2 binds the
 * forwarded port to loopback only, so the database is not on the public internet:
 * the EC2 host is the only thing that can reach it, and only over SSH.
 *
 * Two halves, run on two machines:
 *
 *   expose    ON the machine that can reach the database (the office box)
 *   connect   ON the machine you want to use the database from (the laptop)
 *
 * Nothing in Postgres is changed. The connection arrives at the office box from
 * 127.0.0.1, which pg_hba.conf already allows.
 *
 * Ports are deliberately different from the RDS tunnel (15432) so both can run
 * at once without a collision.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, '..');

// --- configuration ---------------------------------------------------------

function readDotEnv() {
  const file = path.join(BACKEND_DIR, '.env');
  const out = {};
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const DOTENV = readDotEnv();
const pick = (...names) => names.map((n) => process.env[n] ?? DOTENV[n]).find((v) => v && v.trim());

const JUMP_HOST = pick('DB_TUNNEL_JUMP_HOST') || 'ec2-user@13.207.47.116';
const KEY =
  pick('DB_TUNNEL_KEY') ||
  (fs.existsSync(path.join(os.homedir(), '.ssh', 'ucs-backend.pem'))
    ? path.join(os.homedir(), '.ssh', 'ucs-backend.pem')
    : path.join(BACKEND_DIR, '..', 'key', 'ucs-backend.pem'));

// Where the database actually is, as seen from the office box.
const DB_HOST = pick('LOCAL_DB_HOST') || '127.0.0.1';
const DB_PORT = parseInt(pick('LOCAL_DB_PORT') || '5432', 10);

// The port the office box claims on the EC2 loopback interface.
const REMOTE_PORT = parseInt(pick('OFFICE_DB_REMOTE_PORT') || '15433', 10);
// The port the laptop listens on.
const LOCAL_PORT = parseInt(pick('OFFICE_DB_LOCAL_PORT') || '15435', 10);

const SSH_OPTS = [
  '-o', 'BatchMode=yes',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=15',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-i', KEY,
];

const PID_FILE = path.join(os.tmpdir(), 'ucs-office-db-client.pid');
const LOG_FILE = path.join(os.tmpdir(), 'ucs-office-db-client.log');

// --- helpers ---------------------------------------------------------------

const log = (msg) => {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireKey() {
  if (!fs.existsSync(KEY)) {
    console.error(`SSH key not found: ${KEY}`);
    console.error('Set DB_TUNNEL_KEY to the .pem path, or put it at ~/.ssh/ucs-backend.pem.');
    process.exit(1);
  }
}

function portOpen(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function waitForPort(port, ms = 20000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await portOpen(port)) return true;
    await sleep(400);
  }
  return false;
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    return alive(pid) ? pid : null;
  } catch {
    return null;
  }
}

function killTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

/** Credentials for the office database, for the convenience of the connect side. */
function dbIdentity() {
  const url = pick('DATABASE_URL');
  if (url) {
    try {
      const u = new URL(url);
      return {
        user: decodeURIComponent(u.username) || 'postgres',
        password: decodeURIComponent(u.password) || '',
        database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'ucs_crm',
      };
    } catch {
      /* fall through */
    }
  }
  return {
    user: pick('LOCAL_DB_USER') || 'postgres',
    password: pick('LOCAL_DB_PASSWORD') || '',
    database: pick('LOCAL_DB_NAME') || 'ucs_crm',
  };
}

/**
 * "The local port is open" is NOT proof the tunnel works.
 *
 * `ssh -L` binds the local port as soon as it has a connection to the server, so
 * the listener appears even when nothing is publishing on the far end. The only
 * honest test is to send a Postgres startup packet through it:
 *
 *   - a reset / timeout me:  the far side has nothing listening -> tunnel dead
 *   - an auth or "no such database" error:  a real server answered -> tunnel good
 */
async function probeTunnel() {
  const { user, password, database } = dbIdentity();
  const client = new pg.Client({
    host: '127.0.0.1',
    port: LOCAL_PORT,
    user,
    password,
    database,
    ssl: false,
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    await client.end();
    return { ok: true, note: null };
  } catch (err) {
    const code = err.code || '';
    const dead =
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'EPIPE' ||
      /econnreset|socket hang up|terminated unexpectedly|connection terminated/i.test(err.message || '');
    if (dead) return { ok: false, note: null, error: err.message };
    // The server answered, so the bytes arrived. Most likely a credentials or
    // database-name problem, which is a different fix.
    const hint =
      code === '28P01'
        ? 'password authentication failed - the tunnel is fine, the password in backend/.env is not'
        : code === '3D000'
          ? `database "${database}" does not exist - the tunnel is fine, the name is wrong`
          : `server answered with ${code || err.message} - the tunnel is fine`;
    return { ok: true, note: hint };
  }
}

// --- expose (office box) ---------------------------------------------------

async function cmdExpose() {
  requireKey();

  console.log('Reaching the database from any network, without opening a port.');
  console.log('');
  console.log(`  database      ${DB_HOST}:${DB_PORT}  (as seen from this machine)`);
  console.log(`  jump host     ${JUMP_HOST}`);
  console.log(`  published at  ${JUMP_HOST.split('@').pop()} 127.0.0.1:${REMOTE_PORT}  (loopback only)`);
  console.log(`  key           ${KEY}`);
  console.log('');
  console.log('Leave this window open, or run start-office-db-tunnel.bat at login.');
  console.log('Press Ctrl+C to stop.');
  console.log('');

  let stopping = false;
  let child = null;
  let backoff = 5000;

  const stop = () => {
    stopping = true;
    log('stopping...');
    if (child && child.pid) killTree(child.pid);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  for (;;) {
    const startedAt = Date.now();
    const args = [
      ...SSH_OPTS,
      '-N',
      '-R', `127.0.0.1:${REMOTE_PORT}:${DB_HOST}:${DB_PORT}`,
      JUMP_HOST,
    ];
    log(`connecting ${JUMP_HOST} ...`);
    child = spawn('ssh', args, { stdio: ['ignore', 'inherit', 'inherit'] });

    const exitCode = await new Promise((resolve) => child.once('exit', resolve));
    const ranFor = Date.now() - startedAt;
    if (stopping) break;

    if (ranFor > 60000) {
      backoff = 5000;
    } else {
      backoff = Math.min(30000, backoff * 2);
    }
    log(
      `tunnel closed (ssh exit ${exitCode}) after ${Math.round(ranFor / 1000)}s; ` +
        `reconnecting in ${Math.round(backoff / 1000)}s`,
    );
    await sleep(backoff);
  }
}

// --- connect (laptop) ------------------------------------------------------

async function cmdConnect() {
  requireKey();

  const existing = readPid();
  if (existing) {
    log(`already connected (pid ${existing}) on 127.0.0.1:${LOCAL_PORT}`);
    printInstructions();
    return;
  }

  const args = [
    ...SSH_OPTS,
    '-N',
    '-L', `${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}`,
    JUMP_HOST,
  ];

  log(`opening 127.0.0.1:${LOCAL_PORT} -> ${JUMP_HOST} -> office database ...`);
  const child = spawn('ssh', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));

  const up = await waitForPort(LOCAL_PORT);
  if (!up) {
    killTree(child.pid);
    fs.rmSync(PID_FILE, { force: true });
    console.error('');
    console.error('Could not open the tunnel.');
    console.error('The most likely cause: nothing is exposing the database.');
    console.error('On the office box, run:  npm run db:expose');
    process.exit(1);
  }

  const probe = await probeTunnel();
  if (!probe.ok) {
    killTree(child.pid);
    fs.rmSync(PID_FILE, { force: true });
    console.error('');
    console.error('The local listener opened, but no database answered through it.');
    console.error('That means the office box is not publishing the database.');
    console.error('On the office box, run:  npm run db:expose');
    console.error(`(detail: ${probe.error})`);
    process.exit(1);
  }

  log(`connected (pid ${child.pid})`);
  if (probe.note) console.warn(`Warning: ${probe.note}`);
  printInstructions();
}

function printInstructions() {
  const { user, database } = dbIdentity();
  console.log('');
  console.log('  host      127.0.0.1');
  console.log(`  port      ${LOCAL_PORT}`);
  console.log(`  user      ${user}`);
  console.log(`  database  ${database}`);
  console.log(`  password  the one already in backend/.env`);
  console.log('');
  console.log(`  psql -h 127.0.0.1 -p ${LOCAL_PORT} -U ${user} -d ${database}`);
  console.log('');
  console.log(`  stop it with:  npm run db:disconnect`);
}

async function cmdDisconnect() {
  const pid = readPid();
  if (!pid) {
    fs.rmSync(PID_FILE, { force: true });
    console.log('Not connected.');
    return;
  }
  killTree(pid);
  fs.rmSync(PID_FILE, { force: true });
  console.log(`Disconnected (pid ${pid}).`);
}

async function cmdStatus() {
  const pid = readPid();
  const open = await portOpen(LOCAL_PORT);
  console.log(`Client: ${pid ? `running (pid ${pid})` : 'not running'}`);
  console.log(`127.0.0.1:${LOCAL_PORT}: ${open ? 'open' : 'closed'}`);

  if (!open) {
    if (!pid) {
      console.log('');
      console.log('Start it with:  npm run db:connect');
    }
    return;
  }

  const probe = await probeTunnel();
  console.log(`Database through the tunnel: ${probe.ok ? 'OK' : 'NOT REACHABLE'}`);
  if (probe.note) console.log(`  ${probe.note}`);
  if (!probe.ok) {
    console.log('');
    console.log('The office box is not publishing the database.');
    console.log('On the office box, run:  npm run db:expose');
    return;
  }

  const { user, database } = dbIdentity();
  console.log('');
  console.log(`  psql -h 127.0.0.1 -p ${LOCAL_PORT} -U ${user} -d ${database}`);
}

// --- entry point -----------------------------------------------------------

const command = process.argv[2];
const commands = {
  expose: cmdExpose,
  connect: cmdConnect,
  disconnect: cmdDisconnect,
  status: cmdStatus,
};

if (!command || !commands[command]) {
  console.error('Usage: node scripts/local-db-tunnel.mjs <command>');
  console.error('');
  console.error('  expose      run ON the office box (the machine that reaches the database)');
  console.error('  connect     run ON your laptop; opens 127.0.0.1:' + LOCAL_PORT);
  console.error('  disconnect  close the laptop side');
  console.error('  status      is the laptop side up?');
  process.exit(command ? 1 : 0);
}

await commands[command]();

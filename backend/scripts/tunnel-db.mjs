// Opens an SSH tunnel from this machine to the CRM's AWS RDS instance by way of
// the production EC2 box, which already has a security-group path to Postgres.
//
// Why this exists: some networks (office VPN egress, hosting providers) block the
// RDS IP outright. Both AWS APIs and SSH to the EC2 box work from those networks,
// so a tunnel over port 22 is the path that survives. This script does not change
// any network policy -- it only forwards a local TCP port.
//
//   node scripts/tunnel-db.mjs start     # background tunnel, writes a .pid file
//   node scripts/tunnel-db.mjs stop      # close the tunnel, remove the .pid file
//   node scripts/tunnel-db.mjs status    # is the tunnel up?
//   node scripts/tunnel-db.mjs backend   # start the tunnel if needed, then the backend
//   node scripts/tunnel-db.mjs env       # print PG* vars for the current shell
//   node scripts/tunnel-db.mjs ui        # browser panel with a "Start Local" button
//
// Simplest way to run locally on a blocked network: `node scripts/tunnel-db.mjs backend`.
// It applies the tunnel env to the child process, so no password is ever printed.
//
// While the tunnel is up, point the backend at localhost by exporting the vars that
// `env` prints. Do NOT edit backend/.env -- db.js prefers DATABASE_URL over PG* when
// both are set, and the real URL would win and point straight back at the blocked IP.
//
// Reversible: `stop` kills the local ssh process. Nothing in AWS is modified.

import { config as dotenv } from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv({ path: path.join(__dirname, '..', '.env') });

const HOST = 'ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com';
const JUMP_HOST = process.env.DB_TUNNEL_JUMP_HOST || 'ec2-user@13.207.47.116';
const KEY = process.env.DB_TUNNEL_KEY
  || (fs.existsSync(path.join(os.homedir(), '.ssh', 'ucs-backend.pem'))
    ? path.join(os.homedir(), '.ssh', 'ucs-backend.pem')
    : path.join(__dirname, '..', '..', 'key', 'ucs-backend.pem'));
const LOCAL_PORT = parseInt(process.env.DB_TUNNEL_LOCAL_PORT || '15432', 10);
const REMOTE_PORT = parseInt(process.env.DB_TUNNEL_REMOTE_PORT || '5432', 10);
const PID_FILE = path.join(os.tmpdir(), 'ucs-crm-db-tunnel.pid');
const LOG_FILE = path.join(os.tmpdir(), 'ucs-crm-db-tunnel.log');

// Read DATABASE_URL without printing it. Only the username is ever shown.
function readDbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function localPortBusy(port) {
  return new Promise(resolve => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = v => { sock.destroy(); resolve(v); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(1500, () => done(false));
  });
}

// True only if something answers with a Postgres-style byte. A tunnel that is
// merely holding the port open but not forwarding still fails this, which is the
// difference between "up" and "useless".
async function portForwarding(url) {
  const user = url ? decodeURIComponent(url.username || '') : '';
  const sock = net.connect({ port: LOCAL_PORT, host: '127.0.0.1' });
  const ok = await new Promise(resolve => {
    const settle = v => { sock.destroy(); resolve(v); };
    sock.setTimeout(6000, () => settle(false));
    sock.once('connect', () => {
      // Postgres startup message: length-prefixed, protocol 3.0.
      sock.write(Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]));
    });
    sock.once('data', d => settle(d.length > 0 && d.toString('latin1', 1, 2) === 'R' || d.length > 0));
    sock.once('error', () => settle(false));
  });
  return { ok, user, hasPassword: url ? Boolean(url.password) : false };
}

function readPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!pid) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tunnel watchdog
//
// ssh to the jump host dies whenever the local network drops for longer than
// the keepalive budget: a VPN reconnect, a Wi-Fi roam, the laptop waking from
// sleep. On this machine those events happen several times an hour. Once ssh
// is gone nothing else brings the tunnel back -- the backend process stays up
// but every query fails, which looks exactly like "the backend stopped
// working". While a tunnel is wanted (started, and not explicitly stopped),
// this restarts it automatically. `stop` and the panel's Stop button clear
// the flag, so an intentional stop is never overridden.
// ---------------------------------------------------------------------------
let tunnelWanted = false;
let tunnelRestarting = false;
let lastTunnelRestartAt = 0;

function watchTunnel(log) {
  if (!tunnelWanted || tunnelRestarting) return;
  if (readPid()) return;
  const now = Date.now();
  // Cooldown so a start that fails immediately (no key, blocked port) does not
  // respawn every tick.
  if (now - lastTunnelRestartAt < 20000) return;
  tunnelRestarting = true;
  lastTunnelRestartAt = now;
  log('[tunnel] connection lost -- restarting');

  // Run `start` as a child rather than in-process: cmdStart exits(1) on
  // failure, which must not take the panel down with it.
  const child = uiRunSelf(['start']);
  const relay = stream => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      buf += chunk;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? '';
      for (const line of parts) if (line.trim()) log(line);
    });
    stream.on('end', () => { if (buf.trim()) log(buf); });
  };
  relay(child.stdout);
  relay(child.stderr);
  child.on('error', err => { log(`[tunnel] restart failed: ${err.message}`); tunnelRestarting = false; });
  child.on('exit', code => {
    if (code !== 0) log(`[tunnel] restart exited with code ${code} -- see ${LOG_FILE}`);
    tunnelRestarting = false;
  });
}

async function cmdStart() {
  const existing = readPid();
  if (existing) {
    console.log(`Tunnel already running (pid ${existing}).`);
    // Asking for `start` means the tunnel should be up, alive or not -- the
    // watchdog takes over from here.
    tunnelWanted = true;
    await cmdStatus();
    return;
  }

  if (!fs.existsSync(KEY)) {
    console.error(`SSH key not found: ${KEY}`);
    console.error('Set DB_TUNNEL_KEY to the .pem path, or restore key/ucs-backend.pem.');
    process.exit(1);
  }

  const url = readDbUrl();
  if (!url) {
    console.error('DATABASE_URL not set in backend/.env -- cannot read db user for the probe.');
    process.exit(1);
  }

  if (await localPortBusy(LOCAL_PORT)) {
    console.error(`Port ${LOCAL_PORT} on 127.0.0.1 is already in use.`);
    console.error(`Set DB_TUNNEL_LOCAL_PORT to another port, or run 'stop' if a stale tunnel holds it.`);
    process.exit(1);
  }

  const args = [
    '-N', '-T',
    '-o', 'BatchMode=yes',
    '-o', 'ExitOnForwardFailure=yes',
    // 15s keepalives: this machine's network drops several times an hour (VPN
    // reconnects, Wi-Fi roams) and each drop kills the ssh TCP session. With a
    // 30s interval ssh took up to 90s to notice; 15s cuts that to ~45s, which
    // is what the watchdog below then reacts to.
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-i', KEY,
    '-L', `127.0.0.1:${LOCAL_PORT}:${HOST}:${REMOTE_PORT}`,
    JUMP_HOST,
  ];

  // Append, never truncate: ssh's own death message ("Connection closed by
  // remote host", "Connection reset by peer", "kex_exchange_identification")
  // arrives on stderr AFTER the start line, and wiping the file on every start
  // threw that away -- which is exactly the evidence needed to tell a network
  // drop from an auth failure. Rotate only past 512KB so it cannot grow
  // forever.
  if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) {
    fs.writeFileSync(LOG_FILE, '');
  }
  fs.appendFileSync(LOG_FILE, `\n[${new Date().toISOString()}] starting: ssh ${args.join(' ')}\n`);
  const child = spawn('ssh', args, { detached: true, stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')] });
  child.unref();

  // ExitOnForwardFailure means ssh dies if the local bind fails. Wait briefly, then
  // check whether the child is still alive -- reading the pid file here would always
  // be false because it is written after this check.
  await new Promise(r => setTimeout(r, 2500));

  let alive = true;
  try {
    process.kill(child.pid, 0);
  } catch {
    alive = false;
  }
  if (!alive) {
    console.error(`ssh exited before the tunnel was established. See ${LOG_FILE}`);
    process.exit(1);
  }
  fs.writeFileSync(PID_FILE, String(child.pid));

  // The first connection through a COLD tunnel takes longer than one probe:
  // ssh has to establish, then the jump host dials RDS, then RDS does its
  // auth/SSL handshake. One 6s shot reported healthy tunnels as dead, so
  // "Start Local" failed on the first press and succeeded on the second.
  // Retry until the deadline instead of trusting a single attempt.
  const deadline = Date.now() + 45000;
  let probe = { ok: false, user: '', hasPassword: false };
  while (Date.now() < deadline) {
    probe = await portForwarding(url);
    if (probe.ok) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!probe.ok) {
    console.error('Tunnel process is up but port forwarding did not answer a Postgres handshake.');
    console.error(`See ${LOG_FILE}`);
    // Leave nothing half-started behind: a live ssh with a pid file makes the
    // NEXT attempt print "Tunnel already running" while every probe still
    // fails, which looks exactly like "the tunnel is up but nothing works".
    try { process.kill(child.pid); } catch { /* already gone */ }
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(1);
  }

  console.log(`Tunnel up. 127.0.0.1:${LOCAL_PORT} -> ${JUMP_HOST} -> ${HOST}:${REMOTE_PORT}`);
  console.log(`Database user: ${probe.user} (password ${probe.hasPassword ? 'present' : 'MISSING'})`);
  tunnelWanted = true;
  console.log('');
  console.log('Next, in the shell you start the backend from:');
  console.log(`  node scripts/tunnel-db.mjs env`);
  console.log('then paste the output into your shell, then start the backend as usual.');
  console.log('');
  console.log('Stop it with: node scripts/tunnel-db.mjs stop');
}

function cmdStop() {
  // An explicit stop must stay stopped: clear the flag BEFORE killing ssh so
  // the watchdog cannot race and bring it straight back.
  tunnelWanted = false;
  const pid = readPid();
  if (!pid) {
    console.log('No tunnel running.');
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    return;
  }
  try {
    process.kill(pid);
    console.log(`Stopped tunnel (pid ${pid}).`);
  } catch (e) {
    console.error(`Could not stop pid ${pid}: ${e.message}`);
    process.exit(1);
  }
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  console.log('Nothing in AWS was modified -- this only closed a local ssh process.');
}

async function cmdStatus() {
  const pid = readPid();
  if (!pid) {
    console.log('Tunnel: not running');
    return;
  }
  const url = readDbUrl();
  const probe = await portForwarding(url);
  console.log(`Tunnel: running (pid ${pid})`);
  console.log(`Forwarding 127.0.0.1:${LOCAL_PORT} -> ${JUMP_HOST} -> ${HOST}:${REMOTE_PORT}`);
  console.log(`Postgres handshake over tunnel: ${probe.ok ? 'OK' : 'NO RESPONSE'}`);
}

function tunnelEnv() {
  const url = readDbUrl();
  if (!url) {
    console.error('DATABASE_URL not set in backend/.env');
    process.exit(1);
  }
  return {
    PGHOST: '127.0.0.1',
    PGPORT: String(LOCAL_PORT),
    PGUSER: decodeURIComponent(url.username || ''),
    PGPASSWORD: decodeURIComponent(url.password || ''),
    PGDATABASE: url.pathname.replace(/^\//, ''),
    PGSSLMODE: 'require',
    DATABASE_URL: '',
    DATABASE_SSL: 'false',
    // Local-only pool tuning. A query through this tunnel costs ~80-200ms and
    // a FRESH connection ~650ms (TCP+TLS+auth via the jump host), versus
    // single-digit ms when the backend sits next to RDS. With the production
    // default of 5 connections that idle out after 10s, the NGO admin
    // dashboard -- which fires ~10 parallel requests, each running dozens of
    // queries -- drains the pool, queues, and pg aborts with "timeout
    // exceeded when trying to connect", so the page never renders. Keep
    // connections warm and widen the pool for this dev path only; anything
    // started without this script keeps the production defaults.
    PG_POOL_MAX: process.env.PG_POOL_MAX || '15',
    PG_IDLE_TIMEOUT_MS: process.env.PG_IDLE_TIMEOUT_MS || '300000',
  };
}

// Starts the backend in the foreground with the tunnel env applied, so no secret
// is ever printed. Ctrl-C stops the backend; the tunnel is left running for the
// next run. Use `stop` to close the tunnel.
async function cmdBackend() {
  if (!readPid()) {
    console.log('No tunnel running -- starting one first.');
    await cmdStart();
  }
  // We are now the thing that needs the tunnel: keep it up. `stop` (or the
  // panel's Stop button) clears this flag and ends the watchdog. When the
  // panel spawned us it owns the watchdog instead -- two of them would race
  // ssh onto the same forward port, so only the standalone CLI path runs one.
  tunnelWanted = true;
  let watchdog = null;
  if (process.env.DB_TUNNEL_UI_CHILD !== '1') {
    watchdog = setInterval(() => watchTunnel(line => console.log(line)), 15000);
    watchdog.unref();
  }

  const env = { ...process.env, ...tunnelEnv() };
  const cwd = path.join(__dirname, '..');

  // Prefer nodemon so saving a backend file reloads the server on its own. The
  // tunnel is a separate ssh process and is untouched by these restarts. Falls
  // back to a plain node run if nodemon is missing, which is why an install that
  // skipped devDependencies still works.
  const nodemonBin = path.join(cwd, 'node_modules', 'nodemon', 'bin', 'nodemon.js');
  const hasNodemon = fs.existsSync(nodemonBin);

  const [command, args] = hasNodemon
    ? [process.execPath, [nodemonBin, 'src/index.js']]
    : [process.execPath, ['src/index.js']];

  if (!hasNodemon) {
    console.log('nodemon not found -- starting without auto-reload.');
    console.log('Run `npm install` in backend/ to get it.');
  }

  const child = spawn(command, args, { cwd, stdio: 'inherit', env });

  const shutdown = () => { try { child.kill('SIGINT'); } catch { /* already gone */ } };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', code => {
    console.log(`Backend exited (code ${code}). Tunnel still up on 127.0.0.1:${LOCAL_PORT}.`);
    process.exit(code ?? 0);
  });
}

function cmdEnv() {
  const url = readDbUrl();
  if (!url) {
    console.error('DATABASE_URL not set in backend/.env');
    process.exit(1);
  }
  const user = decodeURIComponent(url.username || '');
  const pass = decodeURIComponent(url.password || '');
  const dbname = url.pathname.replace(/^\//, '');
  const host = url.hostname;

  // Values come from the existing .env; DATABASE_URL is intentionally omitted so
  // db.js falls through to the PG* branch instead of dialling the blocked IP.
  console.log(`$env:PGHOST="127.0.0.1"`);
  console.log(`$env:PGPORT="${LOCAL_PORT}"`);
  console.log(`$env:PGUSER="${user}"`);
  console.log(`$env:PGPASSWORD="${pass}"`);
  console.log(`$env:PGDATABASE="${dbname}"`);
  console.log(`$env:PGSSLMODE="require"`);
  console.log(`$env:DATABASE_URL=""`);
  console.log(`$env:DATABASE_SSL="false"`);
  // Same local-only pool tuning tunnelEnv() applies (see there for why).
  console.log(`$env:PG_POOL_MAX="15"`);
  console.log(`$env:PG_IDLE_TIMEOUT_MS="300000"`);
  console.log('');
  console.log('Sourced from backend/.env. Host is rewritten to the tunnel; nothing was');
  console.log('hard-coded. Do not paste this output into chat or commit it.');
}

// `ui` serves scripts/tunnel-ui.html and exposes the tunnel lifecycle over HTTP so
// the "Start Local" button can do what the CLI does. A browser cannot spawn ssh
// itself, so this process stands in for it: /api/start runs this same script's
// `backend` command as a child, /api/stop runs `stop`.
//
// Bind address is 0.0.0.0 by default so a phone or second laptop on the same
// network can reach the panel and the backend. Both are unauthenticated and the
// backend speaks to the real database, so keep this to trusted networks (home
// wifi, not a cafe or office guest wifi). DB_TUNNEL_UI_HOST=127.0.0.1 restricts
// it to this machine only.

const UI_PAGE = path.join(__dirname, 'tunnel-ui.html');
const UI_PORT = parseInt(process.env.DB_TUNNEL_UI_PORT || '5173', 10);
const UI_HOST = process.env.DB_TUNNEL_UI_HOST || '0.0.0.0';
const BACKEND_PORT = parseInt(process.env.PORT || '5000', 10);
const MAX_LOG_LINES = 400;

let uiBackend = null;
let uiLog = [];

function uiPush(line) {
  const clean = String(line ?? '').replace(/\s+$/, '');
  if (!clean) return;
  uiLog.push(clean);
  if (uiLog.length > MAX_LOG_LINES) uiLog = uiLog.slice(-MAX_LOG_LINES);
}

function uiRunSelf(args, extraEnv = {}) {
  return spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    cwd: path.join(__dirname, '..'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  });
}

// True if something already answers on the backend port. The backend may have been
// started outside this panel (`tunnel-db.mjs backend`, npm start, an IDE task), so
// the port is the honest signal rather than whether we happen to own a child.
function backendAlive() {
  return new Promise(resolve => {
    const sock = net.connect({ port: BACKEND_PORT, host: '127.0.0.1' });
    const done = v => { sock.destroy(); resolve(v); };
    sock.setTimeout(1500, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

async function uiStart() {
  if (uiBackend) return { ok: true, already: true };
  // The Start button means "keep this running" from now on: the watchdog owns
  // the tunnel until Stop (or closing the panel) says otherwise.
  tunnelWanted = true;
  if (await backendAlive()) {
    uiPush(`[ui] something is already listening on port ${BACKEND_PORT}; leaving it alone.`);
    return { ok: true, already: true };
  }
  const child = uiRunSelf(['backend'], { DB_TUNNEL_UI_CHILD: '1' });
  uiBackend = child;
  uiPush(`\n[ui] starting ${new Date().toLocaleTimeString()}`);

  const relay = stream => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      buf += chunk;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? '';
      for (const line of parts) uiPush(line);
    });
    stream.on('end', () => { if (buf) uiPush(buf); });
  };
  relay(child.stdout);
  relay(child.stderr);

  child.on('error', err => {
    uiPush(`[ui] failed to launch: ${err.message}`);
    if (uiBackend === child) uiBackend = null;
  });
  child.on('exit', code => {
    uiPush(`[ui] backend exited (code ${code}).`);
    if (uiBackend === child) uiBackend = null;
  });
  return { ok: true };
}

async function uiStop() {
  uiPush('\n[ui] stopping');
  tunnelWanted = false;
  const child = uiBackend;
  uiBackend = null;
  if (child) {
    // `backend` spawns src/index.js as a grandchild, so kill the tree on Windows.
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true, stdio: 'ignore' });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* gone */ } }
    }
  }

  // Reuse this script's own stop logic rather than reimplementing the pid handling.
  await new Promise(resolve => {
    const stopper = uiRunSelf(['stop']);
    let out = '';
    stopper.stdout.setEncoding('utf8');
    stopper.stderr.setEncoding('utf8');
    stopper.stdout.on('data', d => { out += d; });
    stopper.stderr.on('data', d => { out += d; });
    stopper.on('close', () => {
      for (const line of out.split(/\r?\n/)) uiPush(line);
      resolve();
    });
  });
  return { ok: true };
}

async function uiStatus() {
  const pid = readPid();
  const running = await backendAlive();
  return {
    tunnel: { running: Boolean(pid), pid },
    backend: {
      running,
      pid: uiBackend ? uiBackend.pid : null,
      url: `http://localhost:${BACKEND_PORT}`,
    },
    log: uiLog,
  };
}

function cmdUi() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const html = fs.readFileSync(UI_PAGE);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length });
        return res.end(html);
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const body = JSON.stringify(await uiStatus());
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(body);
      }
      if (req.method === 'POST' && url.pathname === '/api/start') {
        return res.end(JSON.stringify(await uiStart()));
      }
      if (req.method === 'POST' && url.pathname === '/api/stop') {
        return res.end(JSON.stringify(await uiStop()));
      }
      if (req.method === 'POST' && url.pathname === '/api/clear-log') {
        // Server-side clear, not just the DOM: the panel re-renders from
        // uiLog every 2s, so wiping only the <pre> would bring the old
        // lines straight back on the next poll.
        uiLog = [];
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true }));
      }
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(UI_PORT, UI_HOST, () => {
    console.log(`Local dev UI: http://localhost:${UI_PORT}  (bound to ${UI_HOST})`);
    console.log('Press "Start Local" to open the tunnel and run the backend.');
    if (UI_HOST !== '127.0.0.1') {
      for (const addr of localAddresses()) console.log(`  also on this network: http://${addr}:${UI_PORT}`);
    }
    console.log('The panel and the backend are unauthenticated -- trusted networks only.');
    console.log('Ctrl-C to close the panel (it will stop the tunnel too).');

    // Watchdog. This machine's network drops several times an hour and each
    // drop kills the ssh session; nodemon can lose the backend too. The panel
    // is the long-lived process, so while the user has things started it
    // brings them back and reports it in the Output panel.
    let backendDownPolls = 0;
    setInterval(async () => {
      watchTunnel(uiPush);
      if (!tunnelWanted || uiBackend) { backendDownPolls = 0; return; }
      if (await backendAlive()) { backendDownPolls = 0; return; }
      backendDownPolls += 1;
      // Two consecutive misses (~30s): a nodemon reload takes a few seconds,
      // and racing a second backend onto port 5000 would fail anyway.
      if (backendDownPolls === 2) {
        uiPush('[ui] backend is down -- restarting');
        await uiStart();
      }
    }, 15000).unref();
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      if (uiBackend || readPid()) await uiStop();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    });
  }
}

// Best-effort list of IPv4 addresses other devices can reach this machine on.
function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

const cmd = process.argv[2] || 'start';
if (cmd === 'start') await cmdStart();
else if (cmd === 'stop') cmdStop();
else if (cmd === 'status') await cmdStatus();
else if (cmd === 'env') cmdEnv();
else if (cmd === 'backend') await cmdBackend();
else if (cmd === 'ui') cmdUi();
else {
  console.error(`Unknown command: ${cmd}. Use start | stop | status | env | backend | ui.`);
  process.exit(1);
}
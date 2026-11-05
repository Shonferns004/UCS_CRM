// UCS CRM - Auto-pull server
// Run: node webhook-server.js
// Listens on port 9000. Two ways it picks up new code from GitHub:
//   1. POLLING (default, no public URL needed) - checks the remote master
//      commit every 30s with `git ls-remote` and pulls when it changes.
//   2. WEBHOOK (optional) - POST /webhook from GitHub, if you have a tunnel.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = __dirname;
const PORT = 9000;
const SECRET = (() => {
  try { return fs.readFileSync(path.join(__dirname, '.webhook-secret'), 'utf8').trim(); }
  catch { return ''; }
})();
const AUTO_RESTART = process.env.AUTO_RESTART !== 'false';
const LOG_FILE = path.join(__dirname, 'webhook.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ── Crash guards: keep the auto-pull watcher alive ──
process.on('uncaughtException', (err) => log('uncaughtException (kept alive): ' + ((err && err.stack) || err)));
process.on('unhandledRejection', (reason) => log('unhandledRejection (kept alive): ' + ((reason && reason.stack) || reason)));

function verify(body, sig) {
  if (!SECRET) return true;
  if (!sig) return false;
  const hmac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const expected = 'sha256=' + hmac;
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ── Polling: watch the remote branch for new commits ──
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30', 10) * 1000;
let lastRemoteSha = null;
let lastLocalSha = null;
let polling = false;

function localSha() {
  try { return execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 15000 }).trim(); }
  catch { return null; }
}

function remoteSha() {
  try {
    const out = execSync('git ls-remote origin master', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 20000 });
    const line = out.split(/\r?\n/).find(l => l.includes('refs/heads/master'));
    return line ? line.split(/\s+/)[0] : null;
  } catch { return null; }
}

function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    const remote = remoteSha();
    const local = localSha();
    if (!remote) { log('poll: could not reach origin (offline?)'); return; }
    if (lastRemoteSha === null) {
      lastRemoteSha = remote;
      lastLocalSha = local;
      log('auto-pull ready — watching origin/master (currently ' + String(remote).slice(0, 7) + ')');
      return;
    }
    if (remote !== lastRemoteSha) {
      log('auto-pull: new commit on origin/master (' + String(remote).slice(0, 7) + ') — pulling');
      lastRemoteSha = remote;
      const result = pullLatest();
      if (result.ok && result.changed) {
        lastLocalSha = localSha();
        log('auto-pull: updated to ' + String(lastLocalSha).slice(0, 7) + ' — restarting backend + frontend');
        restartServices();
      } else if (result.ok) {
        log('auto-pull: already up to date (nothing restarted)');
      }
    } else if (local !== lastLocalSha) {
      lastLocalSha = local;
      log('auto-pull: local moved to ' + String(local).slice(0, 7));
    }
  } catch (e) {
    log('poll error: ' + (e.message || e));
  } finally {
    polling = false;
  }
}

function pullLatest() {
  const before = localSha();
  try {
    const out = execSync('git pull --ff-only origin master', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 60000 });
    const after = localSha();
    const changed = before !== after;
    log('pull: ' + out.trim().replace(/\n/g, ' | ').slice(0, 300));
    return { ok: true, changed, message: changed ? 'Pulled latest code' : 'Already up to date' };
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().trim().split('\n').slice(-2).join(' | ').slice(0, 300);
    log('pull failed: ' + msg);
    return { ok: false, changed: false, error: msg };
  }
}

let restarting = false;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// PIDs currently LISTENING on a port (empty set = service is not running).
function portPids(port) {
  const pids = new Set();
  try {
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', timeout: 10000 });
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/\s+(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
  } catch {}
  return pids;
}

function killPort(port) {
  for (const pid of portPids(port)) {
    try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 10000 }); } catch {}
  }
}

function restartServices() {
  if (!AUTO_RESTART) { log('AUTO_RESTART=false -> not restarting services'); return; }
  if (restarting) { log('restart already in progress -> skipping duplicate restart'); return; }
  restarting = true;
  try {
    // Only restart services that were ALREADY running. The old code always
    // spawned a backend, so every pull created a new backend even if none was
    // running (and a duplicate when the old one did not die in time).
    const services = [
      {
        name: 'backend', port: 5000,
        start: () => spawn('C:\\Program Files\\nodejs\\node.exe', ['src/index.js'], { cwd: PROJECT_ROOT + '/backend', detached: true, stdio: 'ignore', windowsHide: true }),
      },
      {
        name: 'frontend', port: 5173,
        start: () => spawn('cmd.exe', ['/c', 'npm run dev -- --host'], { cwd: PROJECT_ROOT + '/client', detached: true, stdio: 'ignore', windowsHide: true, shell: true }),
      },
    ];

    const running = [];
    for (const s of services) {
      if (portPids(s.port).size > 0) { log(s.name + ' is running on :' + s.port + ' -> will restart it'); running.push(s); }
      else log(s.name + ' is not running on :' + s.port + ' -> leaving it stopped');
    }
    if (running.length === 0) { log('nothing was running -> no restart needed'); return; }

    log('restarting ' + running.map(s => s.name).join(' + ') + '...');
    for (const s of running) killPort(s.port);
    sleepSync(1500);

    for (const s of running) {
      if (portPids(s.port).size > 0) { log(s.name + ' :' + s.port + ' is still busy -> not starting a duplicate'); continue; }
      const p = s.start();
      p.on('error', (e) => log('failed to start ' + s.name + ': ' + e.message));
      p.unref();
      log(s.name + ' restarted');
    }
  } finally {
    restarting = false;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' });
    res.end(); return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: PORT, polling: true, intervalMs: POLL_INTERVAL }));
    return;
  }

  if (req.method === 'GET' && req.url === '/poll-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      polling: true,
      intervalMs: POLL_INTERVAL,
      lastRemoteSha,
      lastLocalSha,
      inSync: lastRemoteSha === lastLocalSha,
    }));
    return;
  }

  if (req.method === 'GET' && req.url === '/log') {
    let lines = [];
    try { lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split(/\r?\n/).slice(-30); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ lines }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const sig = req.headers['x-hub-signature-256'];
      if (!verify(body, sig)) { log('rejected: bad signature'); res.writeHead(401); res.end('unauthorized'); return; }

      let payload = {};
      try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('bad json'); return; }

      const ref = payload.ref || '';
      const branch = ref.replace('refs/heads/', '');
      const who = payload.pusher?.name || payload.sender?.login || 'unknown';
      log('push event: ' + (payload.repository?.full_name || 'repo') + ' -> ' + branch + ' by ' + who);

      if (branch !== 'master' && branch !== 'main') {
        log('ignoring non-default branch: ' + branch);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'ignored branch ' + branch }));
        return;
      }

      const result = pullLatest();
      if (result.ok && result.changed) restartServices();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  log('auto-pull server listening on :' + PORT);
  log('polling origin/master every ' + (POLL_INTERVAL / 1000) + 's - no public URL needed');
  log('optional webhook: POST /webhook (if you run a tunnel for it)');
  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL);
});


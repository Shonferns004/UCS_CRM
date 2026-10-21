// UCS CRM - GitHub Webhook Receiver (auto-pull on team push)
// Run: node webhook-server.js
// Listens on port 9000 and pulls the latest code when a teammate merges a PR.
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

function pullLatest() {
  try {
    const out = execSync('git pull --ff-only origin master', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 60000 });
    log('pull: ' + out.trim().replace(/\n/g, ' | ').slice(0, 300));
    return { ok: true, message: 'Pulled latest code' };
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().trim().split('\n').slice(-2).join(' | ').slice(0, 300);
    log('pull failed: ' + msg);
    return { ok: false, error: msg };
  }
}

function restartServices() {
  if (!AUTO_RESTART) { log('AUTO_RESTART=false -> not restarting services'); return; }
  log('restarting backend + frontend...');
  // Kill only the backend (port 5000) and frontend (port 5173) - not this webhook server
  for (const port of [5000, 5173]) {
    try {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) { const m = line.trim().match(/\s+(\d+)\s*$/); if (m) pids.add(m[1]); }
      for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
    } catch {}
  }
  spawn('C:\\Program Files\\nodejs\\node.exe', ['src/index.js'], { cwd: PROJECT_ROOT + '/backend', detached: true, stdio: 'ignore', windowsHide: true }).unref();
  spawn('cmd.exe', ['/c', 'npm run dev -- --host'], { cwd: PROJECT_ROOT + '/client', detached: true, stdio: 'ignore', windowsHide: true, shell: true }).unref();
  log('backend + frontend restarted');
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
    res.end(JSON.stringify({ status: 'ok', port: PORT }));
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
      if (result.ok) restartServices();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  log('webhook server listening on :' + PORT + (SECRET ? ' (signature verification ON)' : ' (no secret - set scripts secret)'));
  log('cloudflared tunnel command: cloudflared tunnel --url http://localhost:9000');
});


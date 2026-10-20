// UCS CRM - GitHub webhook receiver
// Triggered by GitHub "push" events. Pulls latest and (optionally) restarts servers.
//
// Run:   node scripts/webhook-server.js
// Env:   WEBHOOK_PORT=9000  WEBHOOK_SECRET=<shared secret>  AUTO_RESTART=true|false
//
// Setup GitHub webhook:
//   Repo -> Settings -> Webhooks -> Add webhook
//   Payload URL:  https://<your-tunnel>/webhook
//   Content type: application/json
//   Secret:       <WEBHOOK_SECRET>
//   Events:       Just the push event
//
// Expose locally with cloudflared/ngrok:
//   cloudflared tunnel --url http://localhost:9000
//   ngrok http 9000

import http from 'http';
import crypto from 'crypto';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PORT   = parseInt(process.env.WEBHOOK_PORT || '9000', 10);
const SECRET = process.env.WEBHOOK_SECRET || '';
const RESTART = (process.env.AUTO_RESTART || 'false').toLowerCase() === 'true';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

function log(m) { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); fs.appendFileSync(path.join(ROOT, 'webhook.log'), line + '\n'); }

function verifySignature(body, sig) {
  if (!SECRET) return true; // allow unsigned if no secret set (dev only)
  if (!sig) return false;
  const hmac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const expected = 'sha256=' + hmac;
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
  catch { return false; }
}

function run(cmd, cwd) {
  try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { return (e.stdout || '') + (e.stderr || '') + (e.message || ''); }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404); res.end('not found'); return;
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    const sig = req.headers['x-hub-signature-256'];
    if (!verifySignature(body, sig)) { log('rejected: bad signature'); res.writeHead(401); res.end('unauthorized'); return; }

    let payload;
    try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('bad json'); return; }

    const ref = payload.ref || '';
    const branch = ref.replace('refs/heads/', '');
    log(`push event: ${payload.repository?.full_name} -> ${branch} by ${payload.pusher?.name}`);

    if (branch !== 'master' && branch !== 'main') {
      log(`ignoring non-default branch: ${branch}`);
      res.writeHead(200); res.end('ignored'); return;
    }

    // Respond immediately; do work async
    res.writeHead(200); res.end('accepted');

    // Stash if dirty (safety), pull, restore
    const status = run('git status --porcelain', ROOT).trim();
    const stashed = status.length > 0;
    if (stashed) { log('working tree dirty -> stashing'); run('git stash push -m "webhook-stash"', ROOT); }

    log('pulling...');
    const pullOut = run('git pull --ff-only origin master', ROOT);
    log(pullOut.trim().slice(0, 500));

    if (stashed) { log('restoring stash'); run('git stash pop', ROOT); }

    // install deps if package.json changed
    const changed = run('git diff --name-only HEAD@{1} HEAD', ROOT);
    if (/backend\/package\.json/.test(changed)) { log('backend deps changed -> npm install'); run('npm install', ROOT + '/backend'); }
    if (/client\/package\.json/.test(changed))  { log('client deps changed -> npm install');  run('npm install', ROOT + '/client');  }

    if (RESTART) {
      log('restarting servers (targeted, excluding this webhook process)...');
      const myPid = process.pid;
      // Kill tracked server PIDs from pid files (if present)
      for (const pf of ['backend.pid', 'client.pid']) {
        const p = path.join(os.tmpdir(), pf);
        try {
          const pid = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
          if (pid && pid !== myPid) { try { process.kill(pid); log(`killed ${pf} pid ${pid}`); } catch {} }
        } catch {}
      }
      // Also kill any node process whose command line references our app entry points,
      // but never this webhook server or its parent.
      try {
        const out = execSync('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine', { encoding: 'utf8' });
        for (const line of out.split(/\r?\n/)) {
          if (!/src[\\\/]index\.js|vite/i.test(line)) continue;
          const m = line.trim().match(/(\d+)\s*$/);
          if (!m) continue;
          const pid = parseInt(m[1], 10);
          if (pid && pid !== myPid) { try { process.kill(pid); log(`killed node pid ${pid}`); } catch {} }
        }
      } catch (e) { log('wmic scan failed: ' + (e.message || e)); }
      // Give sockets time to release
      await new Promise(r => setTimeout(r, 2000));
      // Restart backend
      const backendProc = spawn(process.execPath, ['src/index.js'], { cwd: ROOT + '/backend', detached: true, stdio: 'ignore', windowsHide: true });
      backendProc.unref();
      try { fs.writeFileSync(path.join(os.tmpdir(), 'backend.pid'), String(backendProc.pid)); } catch {}
      log(`backend restarted (pid ${backendProc.pid})`);
      // Restart frontend (via cmd to run npm)
      const frontendProc = spawn('cmd.exe', ['/c', 'npm', 'run', 'dev', '--', '--host'], { cwd: ROOT + '/client', detached: true, stdio: 'ignore', windowsHide: true, shell: true });
      frontendProc.unref();
      try { fs.writeFileSync(path.join(os.tmpdir(), 'client.pid'), String(frontendProc.pid)); } catch {}
      log(`frontend restart triggered (pid ${frontendProc.pid})`);
    } else {
      log('AUTO_RESTART=false -> servers NOT restarted. Restart manually to apply.');
    }
    log('done');
  });
});

server.listen(PORT, () => log(`webhook server listening on :${PORT} (restart=${RESTART})`));
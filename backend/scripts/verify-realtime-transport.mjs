// End-to-end check of the realtime transport the Lead <-> Bank Audit fan-out
// depends on.
//
// Connects to the live uWebSockets server exactly the way the browser client
// does (auth frame -> auth:ok), then triggers a harmless no-op write and
// asserts the db:change frames arrive with the table name the client filters
// and fans out on.
//
// Run: cd backend && node scripts/verify-realtime-transport.mjs

import jwt from 'jsonwebtoken';
import db from '../src/config/db.js';

const WS_URL = process.env.WS_URL || 'ws://192.168.1.152:5001';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) { console.error('JWT_SECRET not set'); process.exit(1); }

let failures = 0;
const ok = (n, x = '') => console.log(`  PASS  ${n}${x ? ' :: ' + x : ''}`);
const fail = (n, x = '') => { failures++; console.log(`  FAIL  ${n}${x ? ' :: ' + x : ''}`); };

const token = jwt.sign({ id: 'realtime-transport-probe', role: 'admin' }, SECRET, { expiresIn: '5m' });

console.log(`\n== connecting to ${WS_URL} ==`);
const ws = new WebSocket(WS_URL);
const seen = [];
let authed = false;

const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timed out waiting for the realtime exchange')), 25000);

  ws.addEventListener('open', () => {
    console.log('  ....  socket open, sending auth frame');
    ws.send(JSON.stringify({ type: 'auth', payload: { token } }));
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'auth:ok' || msg.type === 'authed' || (msg.type === 'auth' && msg.payload?.ok)) {
      authed = true;
      ok('authenticated against the live uWS server', `type=${msg.type}`);
      triggerWrites();
      return;
    }
    if (msg.type === 'auth:error') {
      clearTimeout(timer);
      reject(new Error('auth:error ' + JSON.stringify(msg.payload)));
      return;
    }
    if (msg.type === 'db:change') {
      // The wire format is { type: 'db:change', payload: {...} }. The client
      // unwraps it (socket.js dispatches msg.payload), so the table lives on
      // msg.payload.table.
      const p = msg.payload || {};
      seen.push({
        table: p.table,
        eventType: p.eventType,
        bulk: p.bulk === true,
        hasRow: ('new' in p && p.new != null) || ('old' in p && p.old != null),
      });
      console.log(`  ....  db:change table=${p.table} event=${p.eventType} bulk=${p.bulk === true}`);
      const tables = new Set(seen.map((s) => s.table));
      // Wait for the two tables this test writes to, not just "any two frames" -
      // the app is live, so unrelated traffic arrives on the same socket.
      if (tables.has('bank_audit_entries') && tables.has('fro_donor_logs')) {
        clearTimeout(timer); resolve();
      }
    }
  });

  ws.addEventListener('error', (e) => { clearTimeout(timer); reject(new Error('socket error: ' + (e.message || 'unknown'))); });
});

function triggerWrites() {
  // Two targeted writes. SET col = col changes no data, but still produces an
  // UPDATE event - which is exactly what the panels listen for.
  (async () => {
    const { data: entry } = await db.from('bank_audit_entries').select('id, updated_at').limit(1).maybeSingle();
    if (entry?.id) {
      await db.from('bank_audit_entries')
        .update({ updated_at: entry.updated_at ?? new Date().toISOString() })
        .eq('id', entry.id);
      console.log(`  ....  wrote bank_audit_entries id=${entry.id}`);
    } else {
      console.log('  ....  no bank_audit_entries row to write');
    }

    const { data: log } = await db.from('fro_donor_logs').select('id, updated_at').limit(1).maybeSingle();
    if (log?.id) {
      await db.from('fro_donor_logs')
        .update({ updated_at: log.updated_at ?? new Date().toISOString() })
        .eq('id', log.id);
      console.log(`  ....  wrote fro_donor_logs id=${log.id}`);
    }
  })().catch((e) => console.log('  ....  write trigger failed:', e.message));
}

try {
  await done;
  console.log('\n== db:change frames observed ==');
  const tables = new Set(seen.map((s) => s.table));
  if (tables.has('bank_audit_entries')) ok('received a db:change for bank_audit_entries');
  else fail('no db:change for bank_audit_entries', 'saw: ' + [...tables].join(','));

  if (tables.has('fro_donor_logs')) ok('received a db:change for fro_donor_logs');
  else fail('no db:change for fro_donor_logs', 'saw: ' + [...tables].join(','));

  // The client fan-out keys off payload.table, so every frame must carry it.
  const missingTable = seen.filter((s) => !s.table);
  if (!missingTable.length) ok('every db:change frame carries a table name');
  else fail(`${missingTable.length} db:change frame(s) had no table name`);

  // The client only refreshes on a *row* payload, so a bulk frame must still
  // carry new/old.
  const noRow = seen.filter((s) => !s.hasRow);
  if (!noRow.length) ok('every db:change frame carries a row (new/old)');
  else fail(`${noRow.length} db:change frame(s) carried no row`);
} catch (err) {
  fail('realtime exchange failed', err.message);
} finally {
  try { ws.close(); } catch { /* ignore */ }
}

console.log(failures ? `\nRESULT: ${failures} check(s) FAILED\n` : '\nRESULT: all checks passed\n');
process.exit(failures ? 1 : 0);

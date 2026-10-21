// THE definitive test for the reported bug, using the REAL client module
// (src/lib/socket.js) and the REAL backend + local Postgres.
//
// It reproduces the user's session exactly:
//   1. the app shell mounts on the LOGIN page  -> getSocket() runs with no token
//   2. the user logs in (SPA navigation, no page reload)
//   3. the user verifies a bank audit entry over HTTP
//   4. the panel must receive the db:change event WITHOUT a page refresh
//
// Step 4 is the user's complaint: "I verify the lead, it is still there, only
// after a refresh does it go away."
import path from 'node:path'
// dotenv + pg live in the backend's node_modules.
import dotenv from '../backend/node_modules/dotenv/lib/main.js'
import pg from '../backend/node_modules/pg/lib/index.js'

// This file is bundled to a temp dir, so import.meta.url is not the source
// location - point dotenv at the backend .env explicitly.
const BACKEND_ENV = 'C:/Users/ADMIN/Desktop/Projects/UCS_CRM/backend/.env'
dotenv.config({ path: BACKEND_ENV })

// Import the REAL client module (it reads import.meta.env.VITE_SOCKET_URL).
const socketLib = await import('./src/lib/socket.js')
// The OLD client module has no reconnectSocket export at all; the NEW one
// exposes it and store.jsx calls it right after login. Guard so the same
// probe runs against both and the difference is what is being measured.
const reconnectSocket = socketLib.reconnectSocket
const { getSocket, onDbChange } = socketLib

const API = 'http://localhost:5000'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, pass, extra = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`)
}

// localStorage shim - the client module reads the token from it
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false })
await db.connect()

// --- STEP 1: the app shell mounts on the login page (no token yet) ----------
const socket = getSocket()
const received = []
const off = onDbChange({
  table: 'bank_audit_entries',
  event: '*',
  onUpdate: (row) => received.push(row),
})
await wait(1500)
check('step1: socket is not connected on the login page', socket.connected === false)

// --- STEP 2: the user logs in (SPA navigation - the page is NOT reloaded) ----
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin@localhost', password: 'Admin@12345' }),
})
const { token } = await loginRes.json()
localStorage.setItem('ucs_token', token)
// Only the NEW module has this; the old one had no way to recover.
if (typeof reconnectSocket === 'function') reconnectSocket()
await wait(2500)
check('step2: socket came up after login (no page reload)', socket.connected === true)

// --- STEP 3: the user verifies a bank audit entry ----------------------------
const hdr = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const srcRes = await fetch(`${API}/api/accounts/bank-audit/sources`, { headers: hdr })
const src = (await srcRes.json())[0]
const { rows: probe } = await db.query(
  `INSERT INTO public.bank_audit_entries
     (source_id, amount, transaction_date, payer_name, payment_id, status, remarks)
   VALUES ($1, 11, CURRENT_DATE, 'E2E-SESSION-PROBE', $2, 'unverified', 'automated session probe')
   RETURNING id`,
  [src.id, 'E2E-' + Date.now()]
)
const probeId = probe[0].id
console.log(`      probe entry ${probeId} created`)

const before = received.length
const vr = await fetch(`${API}/api/accounts/bank-audit/entries/${probeId}/verify`, {
  method: 'PUT',
  headers: hdr,
  body: JSON.stringify({}),
})
console.log(`      verify HTTP ${vr.status}`)

// --- STEP 4: the panel must update live ------------------------------------
const deadline = Date.now() + 15000
while (received.length === before && Date.now() < deadline) await wait(200)
check(
  'step4: the row updated live (db:change received, no refresh needed)',
  received.length > before,
  `received=${received.length}`
)

off()
socket.close()
await db.query('DELETE FROM public.bank_audit_entries WHERE id = $1', [probeId])
await db.end()
const failed = results.filter((r) => !r).length
console.log(`\n${failed ? 'RESULT: ' + failed + ' FAILURE(S)' : 'RESULT: ALL PASS'}`)
process.exit(failed ? 1 : 0)

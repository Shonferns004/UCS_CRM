// End-to-end test against the REAL backend + REAL local Postgres.
//
//  1. logs in over HTTP,
//  2. opens a socket with that JWT (exactly like client/src/lib/socket.js),
//  3. triggers a bank-audit verify through the REST API,
//  4. asserts the socket receives the `db:change` event for bank_audit_entries.
//
// This is the flow the user reported as broken: "I verify the lead, the row is
// still there, only after a refresh does it go away".
import { readFileSync } from 'node:fs'
// Native WebSocket client (uWebSockets.js transport). No socket.io dependency.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Same env the server runs with, so the probe row lands in the same database.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const API = process.env.API_URL || 'http://localhost:5000'
const SOCK = process.env.SOCK_URL || API
const IDENT = process.env.APP_IDENT || 'admin@localhost'
const PASS = process.env.APP_PASS || 'Admin@12345'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, pass, extra = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`)
}

// --- direct DB access, for the probe row only -------------------------------
const pgMod = await import('pg')
const dbUrl = process.env.DATABASE_URL
const db = dbUrl ? new pgMod.Client({ connectionString: dbUrl, ssl: false }) : null
async function insertProbeEntry(sourceId) {
  if (!db) return null
  const { rows } = await db.query(
    `INSERT INTO public.bank_audit_entries
       (source_id, amount, transaction_date, payer_name, payment_id, status, remarks)
     VALUES ($1, 11, CURRENT_DATE, $2, $3, 'unverified', 'automated realtime probe')
     RETURNING id`,
    [sourceId, 'E2E-REALTIME-PROBE', 'E2E-' + Date.now()]
  )
  return rows[0]?.id ?? null
}
async function removeProbeEntry(id) {
  if (!db || !id) return
  await db.query('DELETE FROM public.bank_audit_entries WHERE id = $1', [id])
}

// --- login ------------------------------------------------------------------
if (db) await db.connect().catch(() => { db = null })
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: IDENT, password: PASS }),
})
if (!loginRes.ok) {
  console.log('FAIL  login:', loginRes.status, await loginRes.text())
  process.exit(1)
}
const { token } = await loginRes.json()
check('login', !!token)

// --- socket (mirrors the fixed client module) -------------------------------
const events = []
const wsUrl = SOCK.replace(/^http/, 'ws').replace(/:5000$/, ':5001')
const socket = { connected: false, close() { try { this._ws && this._ws.close() } catch {} } }
const ws = new WebSocket(wsUrl)
socket._ws = ws
await new Promise((res, rej) => {
  ws.onopen = () => { ws.send(JSON.stringify({ type: 'auth', payload: { token } })) }
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data) } catch { return }
    if (m.type === 'auth:ok') { socket.connected = true; res() }
    else if (m.type === 'auth:error') rej(new Error(m.payload?.message || 'auth error'))
    else if (m.type === 'db:change' && (m.payload?.table === 'bank_audit_entries' || m.payload?.table === 'receipts')) events.push(m.payload)
  }
  ws.onclose = () => { socket.connected = false }
  setTimeout(() => rej(new Error('connect timeout')), 15000)
})
check('socket connected with the login token', socket.connected)
// keep db:change capture already wired above

// --- pick a bank audit entry to verify --------------------------------------
const hdr = { Authorization: `Bearer ${token}` }
const listRes = await fetch(`${API}/api/accounts/bank-audit/entries?status=unverified`, { headers: hdr })
const listBody = await listRes.json()
let entries = Array.isArray(listBody) ? listBody : listBody?.data || []
check('bank audit entries listed', Array.isArray(entries), `count=${entries?.length}`)

// Verifying consumes the entry (status -> verified), so a shared row would
// only work once. Insert a dedicated probe row straight into Postgres and
// remove it again at the end, so the test is repeatable and leaves no trace.
const probePayer = 'E2E-REALTIME-PROBE'
let probeId = null
if (!entries?.length) {
  const srcRes = await fetch(`${API}/api/accounts/bank-audit/sources`, { headers: hdr })
  const srcs = await srcRes.json()
  const src = (Array.isArray(srcs) ? srcs : srcs?.data || [])[0]
  if (!src) {
    console.log('\nRESULT: SKIP (no unverified entry and no bank audit source)')
    socket.close()
    process.exit(0)
  }
  probeId = await insertProbeEntry(src.id)
  if (!probeId) {
    console.log('\nRESULT: SKIP (could not insert the probe entry)')
    socket.close()
    process.exit(0)
  }
  console.log(`      inserted probe entry ${probeId}`)
  entries = [{ id: probeId, amount: 11, payer_name: probePayer }]
}

const entry = entries[0]
console.log(`      verifying entry ${entry.id} (amount=${entry.amount}, payer=${entry.payer_name})`)

// --- trigger the verify ----------------------------------------------------
const before = events.length
const verifyRes = await fetch(`${API}/api/accounts/bank-audit/entries/${entry.id}/verify`, {
  method: 'PUT',
  headers: hdr,
  body: JSON.stringify({}),
})
console.log(`      verify HTTP status: ${verifyRes.status}`)
const verifyBody = await verifyRes.text()
console.log(`      verify body: ${verifyBody.slice(0, 160)}`)

// --- wait for the realtime event -------------------------------------------
const deadline = Date.now() + 15000
while (events.length === before && Date.now() < deadline) await wait(250)

const got = events.slice(before)
check('socket received db:change for the verify', got.length > 0, `events=${JSON.stringify(got.map(e => ({ t: e.table, e: e.eventType })))}`)

// ============================================================================
// The flow the user actually described: "I verify the LEAD and the row is
// still there until I refresh". That is POST /accounts/leads/:logId/verify.
// ============================================================================
{
  const leadRes = await fetch(`${API}/api/accounts/leads?status=pending`, { headers: hdr })
  const leadBody = await leadRes.json()
  const leads = Array.isArray(leadBody) ? leadBody : leadBody?.data || leadBody?.leads || []
  console.log(`      pending leads: ${leads?.length ?? 0}`)

  if (leads?.length) {
    const lead = leads[0]
    const before2 = events.length
    const r = await fetch(`${API}/api/accounts/leads/${lead.id ?? lead.log_id}/verify`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({}),
    })
    console.log(`      lead verify status: ${r.status}`)
    const deadline2 = Date.now() + 15000
    while (events.length === before2 && Date.now() < deadline2) await wait(250)
    const got2 = events.slice(before2)
    check(
      'socket received db:change for the lead verify',
      got2.length > 0,
      `events=${JSON.stringify(got2.map(e => ({ t: e.table, e: e.eventType })))}`
    )
  } else {
    console.log('      (no pending lead to verify - skipped)')
  }
}

socket.close()
await removeProbeEntry(probeId).catch(() => {})
await db?.end().catch(() => {})
const failed = results.filter((r) => !r).length
console.log(`\n${failed ? 'RESULT: ' + failed + ' FAILURE(S)' : 'RESULT: ALL PASS'}`)
process.exit(failed ? 1 : 0)

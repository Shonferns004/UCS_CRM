// End-to-end probe for the realtime layer.
//
// Drives the REAL client module (src/lib/socket.js) against a socket.io server
// that reproduces the backend's JWT handshake middleware, and checks that a
// `db:change` event actually reaches a registered onDbChange handler.
//
// Scenario 1 is the reported bug: the socket is built while the app shell is
// still on the LOGIN page (MeetingGate mounts at App level and subscribes to
// db:change), so no token exists yet. The user then logs in via the SPA - no
// page reload - and the socket must recover on its own.
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Server } from '../backend/node_modules/socket.io/dist/index.js'
// Namespace import so the probe builds against BOTH the old and the fixed
// client module (the old one has no reconnectSocket export).
import * as socketLib from './src/lib/socket.js'
const { getSocket, onDbChange } = socketLib
const reconnectSocket = socketLib.reconnectSocket

// --- minimal localStorage shim (the real module reads it at connect time) --
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const SECRET = 'probe-secret'
const b64u = (b) => Buffer.from(b).toString('base64url')
const sign = (payload) => {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }))
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
const verify = (token) => {
  const [head, body, sig] = String(token).split('.')
  if (!head || !body || !sig) throw new Error('malformed')
  const expect = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) throw new Error('bad signature')
  return JSON.parse(Buffer.from(body, 'base64url').toString())
}

// --- server that mirrors backend/src/socket.js auth middleware --------------
const httpServer = createServer()
const io = new Server(httpServer, { cors: { origin: '*' }, path: '/socket.io' })
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token
  if (!token) return next(new Error('unauthorized'))
  try {
    socket.user = verify(token)
    next()
  } catch {
    next(new Error('unauthorized'))
  }
})
io.on('connection', (socket) => {
  socket.on('ping-db', () =>
    socket.emit('db:change', { table: 'bank_audit_entries', eventType: 'UPDATE', new: { id: 42 } })
  )
})

const URL = process.env.SOCK_URL || 'http://localhost:5099'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, pass, extra = '') => {
  results.push({ name, pass, extra })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`)
}

await new Promise((r) => httpServer.listen(5099, r))

// ============================================================================
// SCENARIO 1: socket built before login (the reported bug)
// ============================================================================
{
  const received = []
  const s = getSocket()
  const off = onDbChange({
    table: 'bank_audit_entries',
    event: '*',
    onUpdate: (row) => received.push(row),
  })

  await wait(1200) // let the pre-login handshake fail
  const preLoginConnected = s.connected
  check('scenario1: socket is NOT connected before login', preLoginConnected === false)

  // The user logs in: token lands in localStorage, SPA navigates (no reload).
  localStorage.setItem('ucs_token', sign({ id: 'u1', role: 'accounts' }))
  if (typeof reconnectSocket === 'function') reconnectSocket()

  await wait(2500)
  check('scenario1: socket recovered after login', s.connected === true)

  s.emit('ping-db')
  await wait(800)
  off()
  check(
    'scenario1: db:change reached the onDbChange handler',
    received.length === 1 && received[0]?.id === 42,
    `received=${JSON.stringify(received)}`
  )
}

// ============================================================================
// SCENARIO 2: socket built with a token already present (the F5 case)
// ============================================================================
{
  const received = []
  const s = getSocket()
  const off = onDbChange({
    table: 'bank_audit_entries',
    event: '*',
    onUpdate: (row) => received.push(row),
  })
  await wait(1500)
  check('scenario2: connected with a token already present', s.connected === true)
  s.emit('ping-db')
  await wait(800)
  off()
  check('scenario2: db:change reached the handler', received.length === 1, `received=${JSON.stringify(received)}`)
}

// ============================================================================
// SCENARIO 3: token expires / changes -> the next handshake must use the new one
// ============================================================================
{
  const s = getSocket()
  await wait(500)
  // A fresh token arrives (re-login / impersonation switch).
  localStorage.setItem('ucs_token', sign({ id: 'u2', role: 'fro' }))
  s.disconnect()
  s.connect()
  await wait(2000)
  const serverUser = io.of('/').sockets.size > 0
  check('scenario3: reconnected after the token changed', s.connected === true && serverUser)
}

// ============================================================================
// SCENARIO 4: token appears WITHOUT an explicit reconnect call
// (the self-healing auth retry must bring the socket up on its own)
// ============================================================================
{
  const s = getSocket()
  s.disconnect()
  await wait(600)
  check('scenario4: socket is down before the token appears', s.connected === false)
  localStorage.setItem('ucs_token', sign({ id: 'u3', role: 'accounts' }))
  // No reconnectSocket() call here on purpose.
  await wait(6000)
  check('scenario4: socket recovered on its own (auth retry)', s.connected === true)
}

io.close()
httpServer.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${failed.length ? 'RESULT: ' + failed.length + ' FAILURE(S)' : 'RESULT: ALL PASS'}`)
process.exit(failed.length ? 1 : 0)

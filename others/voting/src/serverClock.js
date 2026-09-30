// A stand-in for client/src/lib/serverClock.js, duplicated because each app in
// others/ is its own npm project and cannot import from client/.
//
// The reason it exists: the ceremony is a timed event. A countdown computed from
// Date.now() would show a different number of seconds remaining on every phone
// in the room depending on how wrong that phone's clock is. The server stamps
// `server_now` on every response; we turn that into a one-time offset and count
// from it instead.
//
// This only affects what the countdown READS. Whether a vote is still in time is
// decided server-side on every submit, so a device with a bad clock cannot get
// extra time - it can only see the wrong number.

let offsetMs = 0
let synced = false
const listeners = new Set()

// A bogus or missing stamp must not poison every timer in the app.
const MAX_PLAUSIBLE_OFFSET_MS = 18 * 60 * 60 * 1000

/**
 * Sync against a payload carrying `server_now` (ISO-8601 with Z).
 * @param payload the parsed response body
 * @param timing  optional { sentAt, receivedAt } marks around the request, used
 *                to halve the network round-trip bias
 */
export function syncFrom(payload, timing) {
  const raw = payload && typeof payload === 'object' ? payload.server_now : null
  if (!raw) return false

  const serverMs = Date.parse(raw)
  if (Number.isNaN(serverMs)) return false

  const localMs =
    timing && Number.isFinite(timing.sentAt) && Number.isFinite(timing.receivedAt)
      ? (timing.sentAt + timing.receivedAt) / 2
      : Date.now()

  const next = serverMs - localMs
  if (!Number.isFinite(next) || Math.abs(next) > MAX_PLAUSIBLE_OFFSET_MS) return false

  const changed = !synced || Math.abs(next - offsetMs) > 250
  offsetMs = next
  synced = true
  if (changed) for (const l of listeners) l(offsetMs)
  return true
}

export const isSynced = () => synced

/** How far this device's clock is from the server's, in ms. */
export const skewMs = () => (synced ? offsetMs : 0)

/** Current time on the server's clock, as best this device can tell. */
export const now = () => Date.now() + (synced ? offsetMs : 0)

export function onSync(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function reset() {
  offsetMs = 0
  synced = false
}

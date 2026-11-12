/**
 * The deadline the session lifecycle races `engine.initialize()` against.
 *
 * It lives outside the adapters because SessionEngineLifecycle applies it to every engine, and
 * importing an adapter just to size a timeout would be a cross-layer import.
 */

/** Largest delay a Node timer can hold; above it `setTimeout` fires after 1 ms instead. */
const MAX_TIMER_MS = 2_147_483_647;

/** Floor for the deadline: long enough for a slow pairing/QR handshake on a loaded host. */
const MIN_INIT_TIMEOUT_MS = 60_000;

/**
 * How long a session waits for `engine.initialize()` before treating it as wedged.
 *
 * Override with `ENGINE_INIT_TIMEOUT_MS` (milliseconds) on a slow host; the value is raised to the
 * floor above and capped at the largest delay a Node timer holds, so a huge or garbage value cannot
 * turn every start into an instant failure. Unset means the floor.
 */
export function resolveEngineInitTimeoutMs(): number {
  const raw = process.env.ENGINE_INIT_TIMEOUT_MS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const ms = Number(raw);
    if (Number.isSafeInteger(ms) && ms > 0) {
      return Math.min(MAX_TIMER_MS, Math.max(MIN_INIT_TIMEOUT_MS, ms));
    }
  }
  return MIN_INIT_TIMEOUT_MS;
}

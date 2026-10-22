// The three warning levels an admin can send from the Telecaller Performance
// board's Warn button, and the message each one delivers to the FRO.
//
// Only the LEVEL travels over the wire (`{ workerId, level }`); the wording is
// resolved here so every channel reads the same copy — the FRO's on-screen
// modal, the web bell (notification_log) and the FCM push. It also means an
// idle alert can never be sent with arbitrary text.
//
// The copy escalates with the board's colours: past an hour is a heads-up,
// past 1h30m is the warning letter the FRO's own 1-hour notice already
// mentions, and past 2h is urgent. No imports here so `node --test` can load
// the module on its own.
export const IDLE_ALERT_LEVELS = {
  yellow: {
    title: 'Idle warning · 1 hour',
    body: (name) => `${name}, you have been idle for over an hour. Please resume working on your leads now — if it reaches 1 hour 30 minutes you will receive a warning letter.`,
  },
  orange: {
    title: 'Idle warning · 1 hour 30 minutes',
    body: (name) => `${name}, you have been idle for over 1 hour 30 minutes, which qualifies for a warning letter. Please resume your work immediately.`,
  },
  red: {
    title: 'Urgent idle warning · 2 hours',
    body: (name) => `${name}, you have been idle for over 2 hours. This is urgent — please resume your work immediately and report to your supervisor.`,
  },
};

export const isIdleAlertLevel = (level) =>
  Object.prototype.hasOwnProperty.call(IDLE_ALERT_LEVELS, level);

// Returns { level, title, body } for a known level, or null so the caller can
// fall back to the older free-text `message` path.
export function idleAlertFor(level, name) {
  if (!isIdleAlertLevel(level)) return null;
  const who = String(name || '').trim() || 'Telecaller';
  const spec = IDLE_ALERT_LEVELS[level];
  return { level, title: spec.title, body: spec.body(who) };
}

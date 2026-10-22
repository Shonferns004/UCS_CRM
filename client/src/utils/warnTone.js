// Escalation colours for the admin's "Warn" button on the Telecaller
// Performance board.
//
// The button appears once a telecaller has been idle for an hour and then
// escalates as the silence grows: yellow after an hour (a nudge), orange
// after an hour and a half (a warning), red at two hours (urgent). Before
// this, every idle telecaller past the hour got the same red button, so a
// one-hour nudge looked identical to a three-hour outage.
//
// Kept in one module so the thresholds, the palette and the unit test can
// never drift apart. Yellow carries dark text because white on yellow is
// unreadable at the 9px this button renders at.
export const WARN_AFTER_SECONDS = 3600;
export const WARN_ORANGE_AFTER_SECONDS = 5400;
export const WARN_RED_AFTER_SECONDS = 7200;

export const WARN_TONES = {
  // `soft`/`ink` are the FRO-side modal's badge palette: same tier, a tint the
  // body text can sit on. The button itself uses bg/border/fg only.
  yellow: { bg: '#facc15', border: '#eab308', fg: '#713f12', soft: '#fefce8', ink: '#713f12', label: 'heads-up' },
  orange: { bg: '#f97316', border: '#ea580c', fg: '#ffffff', soft: '#fff7ed', ink: '#9a3412', label: 'warning' },
  red: { bg: '#dc2626', border: '#b91c1c', fg: '#ffffff', soft: '#fef2f2', ink: '#b91c1c', label: 'urgent' },
};

// Fallback for an idle alert whose level is missing or unknown (an older sender,
// or the free-text `message` path). Neutral so it never claims a tier the board
// did not show.
export const WARN_NEUTRAL = {
  bg: '#e2e8f0', border: '#94a3b8', fg: '#0f172a', soft: '#f8fafc', ink: '#334155', label: 'idle alert',
};

// Returns the tone for an idle stretch in seconds, or null while the button
// should stay hidden (the hour has not been reached yet). The appearance
// rule is unchanged from the original button: it shows only once idle is
// strictly past an hour.
export function warnToneFor(idleSeconds) {
  const s = Number(idleSeconds) || 0;
  if (s >= WARN_RED_AFTER_SECONDS) return { level: 'red', ...WARN_TONES.red };
  if (s >= WARN_ORANGE_AFTER_SECONDS) return { level: 'orange', ...WARN_TONES.orange };
  if (s > WARN_AFTER_SECONDS) return { level: 'yellow', ...WARN_TONES.yellow };
  return null;
}

export default warnToneFor;

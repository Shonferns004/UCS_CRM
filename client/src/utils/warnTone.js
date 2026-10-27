// Escalation colours for the admin's "Warn" button on the Telecaller
// Performance board and FRO idle strips.
//
// 1:00-1:40 -> green
// 1:41-2:10 -> orange
// 2:11+     -> red
export const WARN_AFTER_SECONDS = 3600;          // exactly 1:00 stays hidden
export const WARN_GREEN_MAX_SECONDS = 6059;      // 1:40:59
export const WARN_ORANGE_AFTER_SECONDS = 6060;   // 1:41:00
export const WARN_ORANGE_MAX_SECONDS = 7859;     // 2:10:59
export const WARN_RED_AFTER_SECONDS = 7860;      // 2:11:00

export const WARN_TONES = {
  // `soft`/`ink` are the FRO-side modal's badge palette: same tier, a tint the
  // body text can sit on. The button itself uses bg/border/fg only.
  green: { bg: '#22c55e', border: '#16a34a', fg: '#ffffff', soft: '#f0fdf4', ink: '#166534', label: 'idle' },
  yellow: { bg: '#22c55e', border: '#16a34a', fg: '#ffffff', soft: '#f0fdf4', ink: '#166534', label: 'idle' },
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
// should stay hidden (the hour has not been reached yet).
// 1:00-1:40 -> green, 1:41-2:10 -> orange, 2:11+ -> red
export function warnToneFor(idleSeconds) {
  const s = Number(idleSeconds) || 0;
  if (s >= WARN_RED_AFTER_SECONDS) return { level: 'red', ...WARN_TONES.red };
  if (s >= WARN_ORANGE_AFTER_SECONDS) return { level: 'orange', ...WARN_TONES.orange };
  if (s > WARN_AFTER_SECONDS) return { level: 'green', ...WARN_TONES.green };
  return null;
}

export function idleColorFor(idleSeconds) {
  const s = Number(idleSeconds) || 0;
  if (s >= WARN_RED_AFTER_SECONDS) return { color: '#dc2626', bg: 'rgba(220,38,38,.12)', border: '#fecaca', level: 'red' };
  if (s >= WARN_ORANGE_AFTER_SECONDS) return { color: '#ea580c', bg: 'rgba(249,115,22,.12)', border: '#fdba74', level: 'orange' };
  if (s > WARN_AFTER_SECONDS) return { color: '#16a34a', bg: 'rgba(34,197,94,.12)', border: '#86efac', level: 'green' };
  return { color: 'var(--ink-soft)', bg: 'transparent', border: 'transparent', level: null };
}

export default warnToneFor;

/**
 * The Warn button's colour is the only signal an admin gets about how bad an
 * idle stretch is, so the tier boundaries are pinned here: an hour is a nudge
 * (yellow), an hour and a half is a warning (orange), two hours is urgent
 * (red), and under an hour there is no button at all.
 *
 * Pure function, no DOM needed.  Run from the client/ directory:
 *   node src/utils/warnTone.test.mjs
 */
import { warnToneFor, WARN_AFTER_SECONDS, WARN_ORANGE_AFTER_SECONDS, WARN_RED_AFTER_SECONDS } from './warnTone.js'

const CASES = [
  // idle seconds, expected level (null = button hidden)
  [0, null],
  [1800, null],
  [WARN_AFTER_SECONDS - 1, null],
  [WARN_AFTER_SECONDS, null],          // exactly an hour: still hidden, as before
  [WARN_AFTER_SECONDS + 1, 'yellow'],  // past the hour: nudge
  [3601, 'yellow'],
  [WARN_ORANGE_AFTER_SECONDS - 1, 'yellow'],
  [WARN_ORANGE_AFTER_SECONDS, 'orange'],  // an hour and a half: warning
  [WARN_RED_AFTER_SECONDS - 1, 'orange'],
  [WARN_RED_AFTER_SECONDS, 'red'],        // two hours: urgent
  [10800, 'red'],
]

const MALFORMED = [undefined, null, NaN, '', 'abc', -120]

let failures = 0
console.log('idle(s)   level     bg        border    text')
console.log('-'.repeat(60))

for (const [secs, expected] of CASES) {
  const tone = warnToneFor(secs)
  const got = tone ? tone.level : null
  const ok = got === expected
  if (!ok) failures++
  console.log(
    `${String(secs).padEnd(10)} ${String(got).padEnd(9)} ${(tone?.bg || '-').padEnd(9)} ` +
    `${(tone?.border || '-').padEnd(9)} ${(tone?.fg || '-')}${ok ? '' : `  <<< expected ${expected}`}`,
  )
}

for (const bad of MALFORMED) {
  const tone = warnToneFor(bad)
  const ok = tone === null
  if (!ok) failures++
  console.log(`${String(bad).padEnd(10)} ${String(tone?.level).padEnd(9)} ${(tone?.bg || '-').padEnd(9)} ` +
    `${(tone?.border || '-').padEnd(9)} ${(tone?.fg || '-')}${ok ? '' : '  <<< expected hidden'}`)
}

// Yellow must not use white text: at 9px on a yellow fill it is unreadable.
const yellow = warnToneFor(3601)
const yellowText = (yellow?.fg || '').toLowerCase()
if (yellowText === '#ffffff' || yellowText === '#fff') {
  console.log('yellow text is white  <<< unreadable on yellow')
  failures++
}

console.log(failures === 0 ? '\nALL WARN TONES CORRECT' : `\n${failures} case(s) wrong`)
process.exit(failures === 0 ? 0 : 1)

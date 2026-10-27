/**
 * The Warn button's colour is the only signal an admin gets about how bad an
 * idle stretch is, so the tier boundaries are pinned here:
 *
 *   1:00-1:40 -> green  (FIRST WARNING)
 *   1:41-2:10 -> orange (SECOND WARNING)
 *   2:11+     -> red    (THIRD AND FINAL WARNING)
 *
 * and under an hour there is no button at all. The FRO's My Leads idle strip and
 * the warning modal use the same module, so these cases cover all three.
 *
 * Pure function, no DOM needed.  Run from the client/ directory:
 *   node src/utils/warnTone.test.mjs
 */
import {
  warnToneFor,
  idleColorFor,
  WARN_TONES,
  WARN_NEUTRAL,
  WARN_AFTER_SECONDS,
  WARN_ORANGE_AFTER_SECONDS,
  WARN_RED_AFTER_SECONDS,
} from './warnTone.js'

const CASES = [
  // idle seconds, expected level (null = button hidden / plain strip)
  [0, null],
  [1800, null],
  [WARN_AFTER_SECONDS - 1, null],
  [WARN_AFTER_SECONDS, null],            // exactly an hour: still hidden, as before
  [WARN_AFTER_SECONDS + 1, 'green'],     // 1:00:01 enters the first band
  [3601, 'green'],
  [WARN_ORANGE_AFTER_SECONDS - 1, 'green'],
  [WARN_ORANGE_AFTER_SECONDS, 'orange'], // 1:41
  [WARN_RED_AFTER_SECONDS - 1, 'orange'],
  [WARN_RED_AFTER_SECONDS, 'red'],       // 2:11
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

// The band edges are pinned as literals, not only via the constants: a comment
// saying "2:11" over a value of 2:10:10 is exactly how the board, the strip and
// the server sweep drift apart.
if (WARN_AFTER_SECONDS !== 3600 || WARN_ORANGE_AFTER_SECONDS !== 6060 || WARN_RED_AFTER_SECONDS !== 7860) {
  failures++
  console.log('band edges are not 1:00 / 1:41 / 2:11 sat exactly  <<<')
}

// The FRO strip must agree with the button: same seconds, same level.
for (const secs of [0, 1800, 3600, 3601, 6059, 6060, 7859, 7860]) {
  const button = warnToneFor(secs)
  const strip = idleColorFor(secs)
  const expected = button ? button.level : null
  if (strip.level !== expected) {
    failures++
    console.log(`strip level ${strip.level} != button level ${expected} at ${secs}s  <<<`)
  }
}

// All three tiers must use white text on their solid fill (the button) and have
// a distinct soft/ink pair for the modal badge, otherwise two warnings look alike.
for (const level of ['green', 'orange', 'red']) {
  const tone = WARN_TONES[level]
  const ok = !!(tone?.soft && tone?.ink)
    && !!tone.soft.match(/^#[0-9a-f]{6}$/i)
    && !!tone.ink.match(/^#[0-9a-f]{6}$/i)
    && (tone.fg || '').toLowerCase() === '#ffffff'
  if (!ok) { failures++; console.log(`${level}: missing/invalid soft, ink or fg  <<<`) }
}
const softs = new Set(['green', 'orange', 'red'].map((l) => WARN_TONES[l].soft))
const inks = new Set(['green', 'orange', 'red'].map((l) => WARN_TONES[l].ink))
if (softs.size !== 3 || inks.size !== 3) {
  failures++
  console.log('modal palettes are not distinct  <<<')
}
if (!WARN_NEUTRAL?.soft || !WARN_NEUTRAL?.ink || WARN_NEUTRAL.label !== 'idle alert') {
  failures++
  console.log('neutral fallback tone is incomplete  <<<')
}

console.log(failures === 0 ? '\nALL WARN TONES CORRECT' : `\n${failures} case(s) wrong`)
process.exit(failures === 0 ? 0 : 1)

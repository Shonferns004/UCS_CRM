/**
 * How the star rows read, worst to best.
 *
 * The low end is worded as an observation rather than a number because "1"
 * reads as an arithmetic fact, and somebody about to walk off stage in front of
 * the room deserves to be told "very nervous" rather than "1".
 */
export const STAR_LABELS = {
  confidence: ['Very nervous', 'Nervous', 'Steady', 'Confident', 'Very confident'],
  delivery: ['Very flat', 'Flat', 'Steady', 'Good', 'Excellent'],
  clarity: ['Very unclear', 'Unclear', 'Understandable', 'Clear', 'Very clear'],
  relevance: ['Off topic', 'Loosely related', 'Related', 'Well related', 'Exactly on topic'],
}

/** The timing choices, in reading order. */
export const TIMING_OPTIONS = [
  { key: 'before', label: 'Finished early', hint: 'Ended before the time was up' },
  { key: 'on_time', label: 'On time', hint: 'Kept to the time given' },
  { key: 'beyond', label: 'Went over time', hint: 'Ran past the time given' },
]

export const initials = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?'

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
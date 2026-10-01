// Temporary validation harness for observances.js — run with: node tmp-validate.mjs
import { getObservancesInRange, allThemes, SUPPORTED_LUNAR_YEARS } from './backend/src/utils/observances.js'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const KNOWN_THEMES = new Set([
  'education','disability','environment','rights','community','social-inclusion',
  'health','women-children','technology','livelihoods','sports-culture','nutrition',
  'children',
])
let problems = 0
const bad = (msg) => { problems++; console.log('  !! ' + msg) }

for (const y of [2026, 2027, 2028]) {
  console.log(`\n===== ${y} =====`)
  const all = getObservancesInRange(`${y}-01-01`, `${y+1}-01-01`, { scope: 'all' })
  const byMonth = {}
  for (const o of all) {
    const m = Number(o.date.slice(5, 7))
    ;(byMonth[m] ||= []).push(o)
    if (!KNOWN_THEMES.has(o.kind === 'x' ? '' : '') && o.kind) {
      // kind check
    }
    for (const t of o.themes || []) if (!KNOWN_THEMES.has(t)) bad(`${o.date} "${o.name}" unknown theme "${t}"`)
    if (!['observance','national','festival','religious','week'].includes(o.kind)) bad(`${o.date} "${o.name}" bad kind "${o.kind}"`)
  }
  // empty months
  for (let m = 1; m <= 12; m++) {
    const rows = byMonth[m] || []
    if (!rows.length) bad(`${MONTHS[m-1]} ${y} has NO observances at all`)
  }
  // duplicate same-day-same-name
  const seen = new Map()
  for (const o of all) {
    const k = o.date + '|' + o.name
    if (seen.has(k)) bad(`DUPLICATE ${k}`)
    seen.set(k, 1)
  }
  // near-duplicate names on same date (ignore scope/UN suffix)
  const byDate = {}
  for (const o of all) (byDate[o.date] ||= []).push(o)
  for (const [d, rows] of Object.entries(byDate)) {
    const norm = (s) => s.replace(/\s*\(UN\)|\s*\(India\)|\s*\/.*$/, '').toLowerCase()
    const m = new Map()
    for (const r of rows) {
      const n = norm(r.name)
      if (m.has(n)) bad(`NEAR-DUP ${d}: "${m.get(n)}" vs "${r.name}"`)
      m.set(n, r.name)
    }
  }
  for (let m = 1; m <= 12; m++) {
    const rows = byMonth[m] || []
    const ind = rows.filter(r => r.scope === 'india').length
    const ww = rows.length - ind
    console.log(`  ${MONTHS[m-1]} total=${String(rows.length).padStart(2)}  india=${String(ind).padStart(2)}  worldwide=${String(ww).padStart(2)}`)
  }
  const ind = all.filter(r => r.scope === 'india').length
  console.log(`  TOTAL=${all.length}  india=${ind}  worldwide=${all.length - ind}`)
}

console.log(`\nthemes known to the file: ${allThemes().join(', ')}`)
console.log(`BY_YEAR years: ${SUPPORTED_LUNAR_YEARS.join(', ')}`)
console.log(problems ? `\n${problems} PROBLEM(S)` : '\nno problems found')
// Build guard: refuse to ship a bundle that points the API at the build
// machine's own loopback interface.
//
// Vite inlines import.meta.env at BUILD time, so whatever VITE_API_URL resolves
// to while `vite build` runs is frozen into dist/ forever. A developer keeps a
// local .env (VITE_API_URL=http://localhost:5000/api) for `npm run dev`, and a
// build made on that machine silently ships that address to every volunteer.
//
// The failure is invisible and total: login, the Documents Needed save, the
// signature upload and the signature commit are all fetch() calls to
// http://localhost:5000/api, so on a volunteer's phone they hit nothing. The
// signature is never written to the workers row, and HR's ODAR letter keeps
// printing the blank Volunteer Signature rule -- which reads as "the feature is
// broken" rather than "the bundle was built against the wrong host".
//
// Runs as `prebuild`, so a bad build stops instead of shipping.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Resolved in Vite's own precedence order: a real process.env variable wins,
// then mode-specific files, then the shared ones. `vite build` runs in
// production mode, so that is the file list that matters.
const ENV_FILES = [
  '.env.production.local',
  '.env.production',
  '.env.local',
  '.env',
]

// Enough of the dotenv grammar for this one variable: `KEY=value`, optional
// `export`, and single/double/backtick quotes. Comments and blank lines skipped.
// No ${} expansion is needed -- nothing in this project uses it, and pretending
// to evaluate a shell reference would be worse than not supporting it.
const readEnvFile = (name) => {
  const file = join(root, name)
  if (!existsSync(file)) return null
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m || m[1] !== 'VITE_API_URL') continue
    let value = m[2].trim()
    if (value.length > 1 && /^(['"`])[\s\S]*\1$/.test(value)) value = value.slice(1, -1)
    return value
  }
  return null
}

const resolveApiUrl = () => {
  if (process.env.VITE_API_URL !== undefined) {
    return { url: process.env.VITE_API_URL, from: 'process.env' }
  }
  for (const name of ENV_FILES) {
    const value = readEnvFile(name)
    if (value !== null) return { url: value, from: name }
  }
  // No override anywhere: src/api.js falls back to the production host.
  return { url: '', from: 'src/api.js default' }
}

const LOOPBACK = /^(localhost|127(\.\d+){3}|\[?::1\]?|0\.0\.0\.0)$/i

const { url, from } = resolveApiUrl()
const host = (() => {
  try {
    return url ? new URL(url).hostname : ''
  } catch {
    return null
  }
})()

if (host !== null && LOOPBACK.test(host)) {
  console.error(`\nBuild blocked: VITE_API_URL points at this machine (${host}).`)
  console.error(`  source: ${from}`)
  console.error(`  value:  ${url}`)
  console.error('\nThat address would be frozen into dist/ and served to every')
  console.error('volunteer. Every API call -- login, Documents Needed, signature')
  console.error('upload and signature commit -- would fail on their device, so no')
  console.error('signature would reach the database and the ODAR letter would keep')
  console.error('printing a blank Volunteer Signature line.')
  console.error('\nFix: comment the variable out for the build, or point it at the')
  console.error('real host.\n  VITE_API_URL=https://api.beingsevak.org/api\n')
  process.exit(1)
}

// An unparseable URL is Vite's problem to report, not this guard's.
if (host === null && url) {
  console.warn(`[check-api-url] warning: ${from} has an unparseable VITE_API_URL: ${url}`)
}

console.log(`[check-api-url] ok -- ${from} -> ${url || '(production default)'}`)
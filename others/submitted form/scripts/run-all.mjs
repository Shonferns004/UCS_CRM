// Runs every check and reports one summary. Exits non-zero if any suite fails.
//   npm test
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const SUITES = [
  ['document parser', 'test-documents.mjs'],
  ['design layer', 'test-css-layer.mjs'],
  ['app shell', 'test-app-shell.mjs'],
  ['form flows', 'test-flows.mjs'],
]

const run = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(here, file)], { stdio: 'inherit' })
  child.on('close', (code) => resolve(code === 0))
})

const results = []
for (const [label, file] of SUITES) {
  console.log(`\n> ${label}`)
  results.push([label, await run(file)])
}

const failed = results.filter(([, ok]) => !ok)
console.log(
  failed.length
    ? `\n${failed.length} of ${SUITES.length} suites failed: ${failed.map(([l]) => l).join(', ')}`
    : `\nAll ${SUITES.length} suites passed.`,
)
process.exit(failed.length ? 1 : 0)

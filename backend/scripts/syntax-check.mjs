// Parse-only check for backend ESM files.
//
// The backend has no bundler to lean on, so this uses Node's own parser through
// vm.SourceTextModule -- it parses without executing, which is what we want when
// the point is "does this file merge into something loadable", not "does it run".
//
// Run from backend/:  node --experimental-vm-modules scripts/syntax-check.mjs <file> [...]
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node --experimental-vm-modules scripts/syntax-check.mjs <file> [...]')
  process.exit(2)
}

let failed = 0
for (const rel of files) {
  const abs = path.resolve(process.cwd(), rel)
  const src = fs.readFileSync(abs, 'utf8')
  try {
    // eslint-disable-next-line no-new
    new vm.SourceTextModule(src, { identifier: abs })
    console.log(`  ok    ${rel}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${rel}`)
    console.log(`        ${e.message}`)
  }
}

console.log(failed ? `\n${failed} file(s) failed to parse` : `\nall ${files.length} file(s) parsed`)
process.exit(failed ? 1 : 0)
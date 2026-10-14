// Parse-only check that a .jsx file is syntactically valid.
//
// The full `vite build` catches this too, but it takes ~90s and prints a wall of
// chunk names; this fails fast and points at the offending line, which matters
// when a merge resolution concatenates two versions of a block.
//
// Run from client/:  node scripts/syntax-check.cjs <file> [...]
const { transformSync } = require('esbuild')
const fs = require('fs')
const path = require('path')

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/syntax-check.cjs <file> [...]')
  process.exit(2)
}

let failed = 0
for (const rel of files) {
  const file = path.resolve(process.cwd(), rel)
  const loader = file.endsWith('.jsx') ? 'jsx' : file.endsWith('.ts') || file.endsWith('.tsx') ? 'ts' : 'js'
  try {
    transformSync(fs.readFileSync(file, 'utf8'), { loader, jsx: 'automatic', sourcefile: file })
    console.log(`  ok    ${rel}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${rel}`)
    for (const err of e.errors || []) console.log(`        line ${err.location?.line}: ${err.text}`)
  }
}

console.log(failed ? `\n${failed} file(s) failed to parse` : `\nall ${files.length} file(s) parsed`)
process.exit(failed ? 1 : 0)
// Round-trip check for the submitted-form document parser.
//   Run alone: node scripts/test-documents.mjs
import {
  parseDocumentsValue,
  serializeSelection,
  DOC_OPTIONS,
  OTHER_DOC,
} from '../src/documents.js'

let pass = 0
const fails = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) { pass++ } else { fails.push(`${name}\n      got      ${a}\n      expected ${e}`) }
}

// The single-select UI only ever stores 0 or 1 entries, but a record written
// by the multi-select HR form can hold several, and it must survive being read.
check('array string single', parseDocumentsValue('["10th"]', '').selected, ['10th'])
check('array string multi preserved', parseDocumentsValue('["10th","Degree","Voter ID"]', '').selected, ['10th', 'Degree', 'Voter ID'])
check('mangled array salvaged', parseDocumentsValue('["10th","Deg', '').selected, ['10th', 'Deg'].filter(o => DOC_OPTIONS.includes(o)))
check('mangled array salvaged (Degree)', parseDocumentsValue('["10th","Degree"', '').selected, ['10th', 'Degree'])
check('legacy single string', parseDocumentsValue('12th', '').selected, ['12th'])
check('real array', parseDocumentsValue(['Degree'], '').selected, ['Degree'])
check('null -> empty', parseDocumentsValue(null, '').selected, [])
check('empty string -> empty', parseDocumentsValue('', '').selected, [])
check('whitespace -> empty', parseDocumentsValue('   ', '').selected, [])
check('unknown dropped', parseDocumentsValue('["Bogus","10th"]', '').selected, ['10th'])
check('junk never throws', parseDocumentsValue('[[[', '').selected, [])
check('number coerced', parseDocumentsValue(10, '').selected, [])

// Canonical order regardless of the order they were stored in.
check('canonical order', parseDocumentsValue('["Voter ID","10th"]', '').selected, ['10th', 'Voter ID'])
check('duplicates collapse', parseDocumentsValue('["10th","10th"]', '').selected, ['10th'])

// "Other" and its name are independent.
check('other selected', parseDocumentsValue('["Other"]', 'Passport').selected, [OTHER_DOC])
check('other name kept', parseDocumentsValue('["Other"]', 'Passport').otherText, 'Passport')
check('other name trimmed', parseDocumentsValue('["Other"]', '  Passport  ').otherText, 'Passport')
check('other name capped', parseDocumentsValue('["Other"]', 'x'.repeat(200)).otherText, 'x'.repeat(120))
check('name dropped when not other', parseDocumentsValue('["10th"]', 'Passport').otherText, 'Passport')

// serialize -> parse must be lossless for anything the UI can produce.
for (const sel of [[], ['10th'], [OTHER_DOC], ['Marriage Certificate', OTHER_DOC]]) {
  const round = parseDocumentsValue(serializeSelection(sel), '').selected
  check(`round-trip ${JSON.stringify(sel)}`, round, DOC_OPTIONS.filter(o => sel.includes(o)))
}
check('serialize none is empty string', serializeSelection([]), '')
check('serialize one is array string', serializeSelection(['Degree']), '["Degree"]')

// The dropdown must offer exactly what the parser accepts.
check('options end with Other', DOC_OPTIONS[DOC_OPTIONS.length - 1], OTHER_DOC)
check('no duplicate options', new Set(DOC_OPTIONS).size, DOC_OPTIONS.length)

console.log(`  documents : ${pass}/${pass + fails.length} passed`)
if (fails.length) {
  console.log(fails.map(f => '    FAIL ' + f).join('\n'))
  process.exit(1)
}

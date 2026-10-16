// The regression that opened the "New Conversation" sheet for a donor who
// already had a thread on the agent's other Being Sevak number.
//
// Run from client/:  node check-contact-match.mjs
import assert from 'node:assert/strict'
import { samePhone, findExistingThread } from './src/panels/fro/utils/contactPhoneMatch.js'

let passed = 0
const check = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name) }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); process.exitCode = 1 }
}

const conv = (id, project, phone) => ({
  id, project, status: 'open',
  contact: { phone, phone_normalized: phone },
})

console.log('samePhone')
check('identical numbers match', () => assert.ok(samePhone('919819155594', '919819155594')))
check('10-digit deep link matches a stored +91 number', () =>
  assert.ok(samePhone('919819155594', '9819155594')))
check('spaced and prefixed input matches', () =>
  assert.ok(samePhone('919819155594', '+91 98191 55594')))
check('different numbers do not match', () =>
  assert.ok(!samePhone('919819155594', '9820424573')))
check('empty input never matches', () =>
  assert.ok(!samePhone('', '9819155594')))

console.log('findExistingThread')
// The real shape of the report: the agent sits on bsct2, this donor's thread is
// on bsct, and the previous code only searched the active tab's list.
const all = [conv('c-bsct', 'bsct', '919819155594'), conv('c-other', 'bsct2', '919000000001')]

check('finds a thread on a number other than the active tab', () => {
  const hit = findExistingThread(all, '9819155594', 'bsct2')
  assert.equal(hit?.id, 'c-bsct')
})
check('returns null when the donor has never written in', () =>
  assert.equal(findExistingThread(all, '9999999999', 'bsct2'), null))
check('prefers the thread on the active number when both exist', () => {
  const two = [conv('on-bsct', 'bsct', '919819155594'), conv('on-bsct2', 'bsct2', '919819155594')]
  assert.equal(findExistingThread(two, '9819155594', 'bsct2')?.id, 'on-bsct2')
})
check('falls back to any thread when none is on the active number', () => {
  const two = [conv('on-bsct', 'bsct', '919819155594'), conv('on-bsct2', 'bsct2', '919819155594')]
  assert.equal(findExistingThread(two, '9819155594', 'mann')?.id, 'on-bsct')
})
check('tolerates a missing contact', () =>
  assert.equal(findExistingThread([{ id: 'x', project: 'bsct' }], '9819155594'), null))
check('tolerates a non-array', () =>
  assert.equal(findExistingThread(null, '9819155594'), null))

console.log(`\n${passed} checks passed`)
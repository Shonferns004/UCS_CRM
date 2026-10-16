// Ad-hoc check of the donor -> authorized-account resolver. No framework; the
// module under test is plain ESM with no JSX, so Node loads it directly.
// Usage: node --experimental-vm-modules backend/scripts/check-wa-project-resolver.mjs
import assert from 'node:assert/strict'
import { resolveWhatsAppProject, getWhatsAppProject } from '../../client/src/panels/fro/utils/whatsappProject.js'

// localStorage is not defined outside a browser; stub the one key it reads.
const store = { wa_agents: null }
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v },
  removeItem: (k) => { delete store[k] },
}

const held = (...projects) => (store.wa_agents = JSON.stringify(projects.map(project => ({ project }))))

let passed = 0
const check = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ', name) }
  catch (e) { console.log('  FAIL', name, '->', e.message); process.exitCode = 1 }
}

console.log('getWhatsAppProject(donor)')
check('authoritative donor_project wins', () =>
  assert.equal(getWhatsAppProject({ donor_project: 'bsct', ngo_names: ['AFLF'] }), 'bsct'))
check('donor_project bsct2 collapses to the canonical organisation value', () =>
  assert.equal(getWhatsAppProject({ donor_project: 'bsct2' }), 'bsct'))
check('falls back to a single unambiguous NGO', () =>
  assert.equal(getWhatsAppProject({ ngo_name: 'AFLF' }), 'aflf'))
check('two different NGOs are ambiguous, not guessed', () =>
  assert.equal(getWhatsAppProject({ ngo_names: ['BSCT', 'AFLF'] }), ''))
check('no project at all is empty', () =>
  assert.equal(getWhatsAppProject({ donor_project: null }), ''))

console.log('resolveWhatsAppProject(canonical, held)')
check('exact match is used as-is', () =>
  assert.equal(resolveWhatsAppProject('bsct', ['bsct', 'bsct2']), 'bsct'))
check('bsct bridges to bsct2 when that is the only one held', () =>
  assert.equal(resolveWhatsAppProject('bsct', ['bsct2']), 'bsct2'))
check('bsct2 bridges to bsct when that is the only one held', () =>
  assert.equal(resolveWhatsAppProject('bsct2', ['bsct']), 'bsct'))
check('holding BOTH Being Sevak numbers still prefers the exact match', () =>
  assert.equal(resolveWhatsAppProject('bsct', ['bsct', 'bsct2']), 'bsct'))
check('ambiguous only matters when there is no exact match to prefer', () =>
  assert.equal(resolveWhatsAppProject('bsct', ['bsct2', 'aflf']), 'bsct2'))
check('holding neither Being Sevak number -> no pin', () =>
  assert.equal(resolveWhatsAppProject('bsct', ['aflf']), ''))
check('other orgs still resolve normally', () =>
  assert.equal(resolveWhatsAppProject('aflf', ['aflf', 'mann']), 'aflf'))
check('unknown donor project -> no pin', () =>
  assert.equal(resolveWhatsAppProject('', ['bsct2']), ''))

console.log(`\n${passed} checks passed`)
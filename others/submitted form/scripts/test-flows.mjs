// Mounts the real SignatureConsent in jsdom and drives the actual flows:
// login, documents, policies, draw, draft save, commit, locked view, re-sign,
// the 409 that must surface "Update signature", and the policy fetch failure
// that must NOT silently substitute an older policy.
//   Run alone: node scripts/test-flows.mjs
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PROJ = join(here, '..') + '/'

// ---- fake 2d context (jsdom has no canvas backend) ----------------------
const ink = new Uint8ClampedArray(300 * 150 * 4)
ink[3] = 255 // one opaque pixel => hasInk() true
const ctx2d = {
  lineWidth: 1, lineCap: '', lineJoin: '', strokeStyle: '', fillStyle: '',
  setTransform() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {},
  // Painting must leave ink, otherwise hasInk() sees a blank pad and every
  // save is correctly rejected - which would look like a component bug.
  fill() { ink[3] = 255 },
  stroke() { ink[3] = 255 },
  getImageData: () => ({ data: ink }),
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://localhost/', pretendToBeVisual: true,
})
const { window } = dom
for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLInputElement',
  'HTMLSelectElement', 'HTMLCanvasElement', 'Event', 'MouseEvent', 'Node', 'getComputedStyle', 'requestAnimationFrame']) {
  // Node 24 defines some of these (navigator) as getter-only globals.
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.HTMLCanvasElement.prototype.getContext = () => ctx2d
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA'
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
  width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150, x: 0, y: 0,
})

// react-dom binds its event system to the global `document` at module-eval time,
// so it must be imported *after* the jsdom globals above are installed. A
// static import would hoist it to the top of the file and it would bind to
// nothing, which silently breaks controlled-input onChange.
const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')

// ---- mock api ------------------------------------------------------------
const calls = []
let sigState = { signature_url: null, signature_status: null, signature_signed_at: null, policies: [] }
const mockApiSrc = `
export const api = {
  login: async (id, pw) => ({ token: 'tok', user: { id: 7, name: 'Asha Rao', documents_value: '["10th"]', documents_other: '' } }),
  myProfile: async () => ({ id: 7, name: 'Asha Rao', documents_value: '["10th"]', documents_other: '' }),
  signature: async () => {
    if (globalThis.__sigThrows) { const e = globalThis.__sigThrows; globalThis.__sigThrows = null; throw e; }
    return globalThis.__sigState();
  },
  saveDocumentsNeeded: async (...a) => { globalThis.__calls.push({ name: 'saveDocumentsNeeded', args: a }); },
  uploadSignature: async (...a) => {
    globalThis.__calls.push({ name: 'uploadSignature', args: a });
    if (globalThis.__uploadThrows) { const e = globalThis.__uploadThrows; globalThis.__uploadThrows = null; throw e; }
    return { signature_url: 'https://cdn/sig.png', signature_status: 'draft', signature_signed_at: null };
  },
  commitSignature: async () => {
    globalThis.__calls.push({ name: 'commitSignature', args: [] });
    return { signature_url: 'https://cdn/sig.png', signature_status: 'signed', signature_signed_at: '2026-09-30T10:00:00Z' };
  },
  policies: async () => globalThis.__sigState().policies,
}
`
globalThis.__calls = calls
globalThis.__sigState = () => sigState
globalThis.__sigThrows = null
globalThis.__uploadThrows = null

// ---- bundle the component against the mock ------------------------------
// Output inside the project so Node resolves the external `react` imports;
// node_modules/.flowtest is git-ignored and removed at the end.
const dir = PROJ + 'node_modules/.flowtest'
mkdirSync(dir, { recursive: true })
const mockPath = join(dir, 'api.mjs')
writeFileSync(mockPath, mockApiSrc)

await build({
  entryPoints: [PROJ + 'src/components/SignatureConsent.jsx'],
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  outfile: join(dir, 'component.mjs'),
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  plugins: [{ name: 'mock', setup(b) { b.onResolve({ filter: /^\.\.\/api$/ }, () => ({ path: mockPath })) } }],
})

const { act } = React
const { default: SignatureConsent } = await import('file:///' + join(dir, 'component.mjs').replace(/\\/g, '/'))

// ---- harness -------------------------------------------------------------
let pass = 0
const fails = []
const check = (name, cond, extra = '') => {
  if (cond) pass++
  else fails.push(`${name}${extra ? ' :: ' + extra : ''}`)
}
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const $ = (sel) => container.querySelector(sel)
const text = () => container.textContent
const button = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent))

const setNative = (el, prop, val) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement : window.HTMLInputElement
  Object.getOwnPropertyDescriptor(proto.prototype, prop).set.call(el, val)
  el.dispatchEvent(new window.Event(prop === 'value' ? (el.tagName === 'SELECT' ? 'change' : 'input') : 'change', { bubbles: true }))
}
const click = async (el) => { await act(async () => { el.click() }) }
const pointer = (el, type, x, y) => act(async () => {
  el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))
})
const login = async () => {
  $('#login-id').value = 'asha'
  $('#login-pass').value = 'secret'
  await click($('#login-btn'))
  await flush()
}

const container = document.getElementById('root')
let root = null
// A React root cannot be re-rendered after unmount(), and each scenario needs
// a clean mount, so every scenario gets a brand new root.
const mount = async () => {
  if (root) await act(async () => { root.unmount() })
  container.innerHTML = ''
  root = createRoot(container)
  await act(async () => { root.render(React.createElement(SignatureConsent)) })
  await flush()
}
const logout = async () => {
  await click(container.querySelector('.sf-icon-btn'))
  await flush()
}
await mount()

// 1. login screen
check('login screen rendered', !!$('#login-screen'))
check('wizard hidden initially', $('#wizard-screen').className.includes('hidden'))
check('login labels present', text().includes('Login ID / Email') && text().includes('Password'))

// 2. sign in
await login()
check('wizard shown after login', !$('#wizard-screen').className.includes('hidden'))
check('worker name shown', text().includes('Asha Rao'))
check('profile cached', !!JSON.parse(window.localStorage.getItem('ucs_worker')))

// 3. documents: the saved value came back and the dropdown reflects it
const sel = $('#documents-needed')
check('documents dropdown present', !!sel)
check('saved selection restored', sel.value === '10th', `got "${sel.value}"`)
check('Other field hidden', !$('#documents-other'))

setNative(sel, 'value', 'Degree')
await flush()
const docSave = calls.filter(c => c.name === 'saveDocumentsNeeded').pop()
check('saving a document calls the API', !!docSave)
check('stored as array string', docSave?.args[0] === '["Degree"]', JSON.stringify(docSave?.args))
check('other name cleared with it', docSave?.args[1] === '')

setNative(sel, 'value', 'Other')
await flush()
check('Other field appears for Other', !!$('#documents-other'))
setNative($('#documents-other'), 'value', 'Passport')
await act(async () => { await new Promise(r => setTimeout(r, 700)) })
const otherSave = calls.filter(c => c.name === 'saveDocumentsNeeded').pop()
check('custom name saved', otherSave?.args[0] === '["Other"]' && otherSave?.args[1] === 'Passport', JSON.stringify(otherSave?.args))

// 4. the real policy listing: ten rows from company_policies
const TITLES = [
  'Appointment and Remuneration',
  'Probation, Confirmation and Termination',
  'Office Time, Attendance and Grace Time',
  'Leave, Half-Day and Weekly-Off Rules',
  'Lunch, Dress Code and Office Conduct',
  'Office Assets and Data',
  'College Student Volunteer Policy',
  'Exit, Separation and Abandonment',
  'Incentive and Legal Indemnification',
  'Confidentiality and Non-Disclosure',
]
const FALLBACK_TEXT = 'I have read, understood and agree to abide by the Volunteer Guidelines'
const listing = TITLES.map((title, i) => ({ id: i + 1, title, content: `${title} body text. ` }))
sigState = { ...sigState, policies: listing }
await mount()

const box = container.querySelector('.sf-policies')
check('one scroll box holds the listing', !!box)
check('box is keyboard-scrollable', box.getAttribute('tabindex') === '0')
check('box is labelled for screen readers', !!box.getAttribute('aria-label'))
check('all 10 policies rendered', container.querySelectorAll('.sf-policy').length === 10)
check('every policy sits inside the box',
  TITLES.every(t => [...box.querySelectorAll('.sf-policy-title')].some(h => h.textContent === t)))
check('full text shown, not a summary', text().includes('Confidentiality and Non-Disclosure body text.'))
// The accept row must stay outside the scroll region, or it can be scrolled away.
check('accept row is outside the scroll box', !box.contains(container.querySelector('.sf-accept')))
check('accept wording covers a list', text().includes('I accept all of the policies above'))
check('no Read more toggle remains', ![...container.querySelectorAll('button')].some(b => /read more|show less/i.test(b.textContent)))
check('Documents Needed heading kept', text().includes('Documents Needed'))

// 5. pad is gated behind accepting
check('pad locked before accept', !$('#signature-pad'))
await click($('#accept-policy'))
check('pad unlocked after accept', !!$('#signature-pad'))

// 6. empty pad refuses to save
const saveBtn = button(/Save Signature/)
ink.fill(0)
await click(saveBtn)
check('empty pad rejected', !calls.some(c => c.name === 'uploadSignature'))
check('toast shown for empty pad', !!document.querySelector('.toast-error'))

// 7. draw, then save as draft
const pad = $('#signature-pad')
await pointer(pad, 'pointerdown', 20, 40)
await pointer(pad, 'pointermove', 90, 70)
await pointer(pad, 'pointerup', 120, 80)
check('canvas sized for the display', pad.width === 300 && pad.height === 150, `${pad.width}x${pad.height}`)
await click(button(/Save Signature/))
await flush()
const up = calls.filter(c => c.name === 'uploadSignature').pop()
check('draft uploaded', !!up)
check('raw base64 sent, not the data url', up?.args[0] === 'AAAA')
check('not a re-sign', up?.args[2]?.re_sign === undefined)
check('captured preview shown', text().includes('Signature captured'))

// 8. submit commits
await click(button(/Submit Signature/))
await flush()
check('commit called', calls.some(c => c.name === 'commitSignature'))
check('confirmation shown', text().includes('Signed!'))
check('signed date shown', /30\s+\w+\s+2026|2026/.test(text()) && text().includes('2026'))
check('Finish offered on confirmation', button(/^\s*Finish\s*$/) !== undefined)

// 9. locked view + re-sign
sigState = { signature_url: 'https://cdn/old.png', signature_status: 'signed', signature_signed_at: '2026-01-05T00:00:00Z', policies: [] }
await mount()
check('locked note shown', text().includes('Signature recorded'))
check('Update signature offered', text().includes('Update signature'))
check('no pad while locked', !$('#signature-pad'))
await click(button(/Update signature/))
// Re-signing withdraws consent, so the pad is held back exactly like the
// first-time flow: tick the policy, then the pad unlocks.
check('consent cleared for re-sign', $('#accept-policy').checked === false)
check('pad held back until the policy is re-accepted', !$('#signature-pad'))
check('consent prompt shown instead', text().includes('Accept the policy above'))
await click($('#accept-policy'))
check('pad opened after re-accepting', !!$('#signature-pad'))
const pad2 = $('#signature-pad')
await pointer(pad2, 'pointerdown', 20, 40)
await pointer(pad2, 'pointerup', 60, 60)
// In the re-sign pad the save button is relabelled "Update signature"; the
// bottom submit button still reads "Submit Signature".
await click(button(/^\s*Update signature\s*$/))
await flush()
const resign = calls.filter(c => c.name === 'uploadSignature').pop()
check('re-sign flag sent', resign?.args[2]?.re_sign === true, JSON.stringify(resign?.args[2]))

// 10. the 409 must not lose the lock state
sigState = { signature_url: null, signature_status: null, signature_signed_at: null, policies: [] }
await mount()
await click($('#accept-policy'))
const pad3 = $('#signature-pad')
await pointer(pad3, 'pointerdown', 20, 40)
await pointer(pad3, 'pointerup', 60, 60)
const e409 = new Error('Signature already recorded. Use "Update signature" to replace it.')
e409.status = 409
e409.data = { can_resign: true, signature_url: 'https://cdn/old.png', signature_status: 'signed', signature_signed_at: '2026-01-05T00:00:00Z' }
globalThis.__uploadThrows = e409
await click(button(/Save Signature/))
await flush()
check('409 surfaced to the volunteer', text().includes('Signature already recorded'))
check('409 told the app the record is now locked', text().includes('Update signature'))
check('pad closed once locked', !$('#signature-pad'))

// 11. logout. The 409 lands on the locked view rather than the confirmation
// screen, so the header's logout button is what is exercised here.
await logout()
check('logged out to login screen', $('#login-screen').style.display === '')
check('wizard hidden after logout', $('#wizard-screen').className.includes('hidden'))
check('token cleared', !window.localStorage.getItem('ucs_token'))
check('cached worker cleared', !window.localStorage.getItem('ucs_worker'))

// 12. an EMPTY policy table is a real state, not a failure: HR may simply not
// have seeded company_policies yet, and the built-in policy is the right
// answer. The consent gate must not over-correct and block signing here.
sigState = { signature_url: null, signature_status: null, signature_signed_at: null, policies: [] }
globalThis.__sigThrows = null
await mount()
await login()
check('empty policy table still falls back', text().includes(FALLBACK_TEXT))
check('accept offered on the fallback', !!container.querySelector('#accept-policy'))
await click(container.querySelector('#accept-policy'))
check('pad opens on the fallback policy', !!$('#signature-pad'))

// 13. a FAILED read is the case that matters. Falling back here would let a
// volunteer tick "I accept" against text the Trust has since replaced, so the
// stale text must stay off-screen and signing must pause until it can load.
await logout()
const e500 = new Error('Failed to fetch')
e500.status = 500
globalThis.__sigThrows = e500
await login()
check('failed read does not substitute the built-in policy', !text().includes(FALLBACK_TEXT))
check('no policy rows rendered on failure', !container.querySelector('.sf-policy'))
check('no accept checkbox offered on failure', !container.querySelector('#accept-policy'))
check('failure explained to the volunteer', text().includes('could not be loaded'))
const retry = button(/try again/i)
check('retry offered', !!retry)
check('pad never opens on failure', !$('#signature-pad'))

// ...and the retry must fully recover the flow, not just clear the error.
globalThis.__sigThrows = null
sigState = { ...sigState, policies: listing }
await click(retry)
await flush()
check('retry restores all 10 policies', container.querySelectorAll('.sf-policy').length === 10)
check('retry shows the server policy, not the fallback', text().includes('Confidentiality and Non-Disclosure body text.'))
check('accept checkbox returns after retry', !!container.querySelector('#accept-policy'))
check('failure message cleared', !text().includes('could not be loaded'))
await click(container.querySelector('#accept-policy'))
check('pad opens after a successful retry', !!$('#signature-pad'))

console.log(`  flows     : ${pass}/${pass + fails.length} passed`)
if (fails.length) {
  console.log('    FAILED:\n      ' + fails.join('\n      '))
  rmSync(dir, { recursive: true, force: true })
  process.exit(1)
}
rmSync(dir, { recursive: true, force: true })

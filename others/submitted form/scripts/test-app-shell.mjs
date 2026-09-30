// Covers the wiring above SignatureConsent: main.jsx -> ErrorBoundary -> App ->
// routes. Nothing else in the suite mounts App, so a crash there (a bad router
// path, a broken import) would otherwise only show up as a blank page.
//
// It also proves the ErrorBoundary actually catches. A boundary that silently
// re-throws is worse than none, because it looks like the fix is in place.
//   Run alone: node scripts/test-app-shell.mjs
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PROJ = join(here, '..') + '/'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://localhost/', pretendToBeVisual: true,
})
const { window } = dom
for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLInputElement',
  'HTMLSelectElement', 'HTMLCanvasElement', 'Event', 'MouseEvent', 'Node', 'getComputedStyle', 'requestAnimationFrame',
  'history', 'location']) {
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// react-dom binds to the global `document` at module-eval time, so it must be
// imported dynamically, after the jsdom globals above are installed.
const React = (await import('react')).default

const dir = PROJ + 'node_modules/.shelltest'
mkdirSync(dir, { recursive: true })
const mockPath = join(dir, 'api.mjs')
writeFileSync(mockPath, `
export const api = {
  login: async () => ({ token: 'tok', user: { id: 7, name: 'Asha Rao', documents_value: '', documents_other: '' } }),
  myProfile: async () => ({ id: 7, name: 'Asha Rao', documents_value: '', documents_other: '' }),
  signature: async () => ({ signature_url: null, signature_status: null, signature_signed_at: null, policies: [] }),
  saveDocumentsNeeded: async () => {},
  uploadSignature: async () => ({}),
  commitSignature: async () => ({}),
  policies: async () => [],
}
`)

// An entry that throws during render, to prove the boundary intercepts it.
// It mounts into its own container: main.jsx has already claimed #root, and a
// second createRoot on the same node is undefined behaviour.
const boomPath = join(dir, 'boom.jsx')
writeFileSync(boomPath, `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from ${JSON.stringify(PROJ + 'src/components/ErrorBoundary.jsx')}
const Boom = () => { throw new Error('deliberate render failure') }
export function mountCrash() {
  const host = document.createElement('div')
  host.id = 'crashroot'
  document.body.appendChild(host)
  createRoot(host).render(React.createElement(ErrorBoundary, null, React.createElement(Boom)))
  return host
}
`)

const common = {
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  // index.css is not under test here; the design layer is checked separately.
  loader: { '.css': 'empty' },
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react-router-dom'],
  plugins: [{ name: 'mock', setup(b) { b.onResolve({ filter: /^\.\.\/api$/ }, () => ({ path: mockPath })) } }],
}

await build({ ...common, entryPoints: [PROJ + 'src/main.jsx'], outfile: join(dir, 'main.mjs') })
await build({ ...common, entryPoints: [boomPath], outfile: join(dir, 'boom.mjs') })

// ---- part A: the real app shell mounts ---------------------------------
const root = document.getElementById('root')
await import('file:///' + join(dir, 'main.mjs').replace(/\\/g, '/'))
await new Promise(r => setTimeout(r, 50))

let pass = 0
const fails = []
const check = (name, cond, extra = '') => {
  if (cond) pass++
  else fails.push(`${name}${extra ? ' :: ' + extra : ''}`)
}

check('App mounted something', root.innerHTML.length > 0)
check('login screen rendered', !!root.querySelector('#login-screen'))
check('login form fields present', !!root.querySelector('#login-id') && !!root.querySelector('#login-pass'))
check('wizard hidden before login', root.querySelector('#wizard-screen').className.includes('hidden'))
check('ErrorBoundary stayed out of the way', !root.textContent.includes('Something went wrong'))

// ---- part B: the boundary really catches -------------------------------
// React logs the caught error; silence it so the summary stays readable.
const realError = console.error
console.error = () => {}
const { mountCrash } = await import('file:///' + join(dir, 'boom.mjs').replace(/\\/g, '/'))
const host = mountCrash()
await new Promise(r => setTimeout(r, 50))
console.error = realError

check('crash UI shown instead of a blank page', host.textContent.includes('Something went wrong'))
check('crash message surfaced', host.textContent.includes('deliberate render failure'))
check('reload offered', [...host.querySelectorAll('button')].some(b => /reload/i.test(b.textContent)))
check('crash UI is styled with the app layer', !!host.querySelector('.sf-auth-card'))
check('the failed child is not left mounted', !host.querySelector('#login-screen'))
check('the healthy app above it is untouched', !!document.getElementById('root').querySelector('#login-screen'))

console.log(`  app shell : ${pass}/${pass + fails.length} passed`)
if (fails.length) {
  console.log('    FAILED:\n      ' + fails.join('\n      '))
  rmSync(dir, { recursive: true, force: true })
  process.exit(1)
}
rmSync(dir, { recursive: true, force: true })

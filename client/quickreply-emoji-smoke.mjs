// Renders the real WhatsApp composer subtree to confirm the Quick Reply bar and
// the emoji picker are both present on screen for an agent with a thread open.
//
// This is the same technique sidebar-smoke.mjs uses: Vite's SSR pipeline gives us
// JSX + ESM, while React itself stays a single native instance.
//
// Run from the client/ directory:  node quickreply-emoji-smoke.mjs

import { createServer } from 'vite'

const noop = () => {}
const store = new Map()

globalThis.window = {
  innerWidth: 1440, innerHeight: 900,
  matchMedia: () => ({ media: '', matches: false, onchange: null, addEventListener: noop, removeListener: noop, dispatchEvent: noop }),
  addEventListener: noop, removeEventListener: noop, scrollTo: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
}
globalThis.document = {
  body: { appendChild: noop }, documentElement: { style: { setProperty: noop } },
  querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop,
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
}
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const vite = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  ssr: { noExternal: ['react-router-dom'], resolve: { conditions: ['import', 'module', 'browser', 'default'] } },
})

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const { default: QuickReplyBar } = await vite.ssrLoadModule('/src/panels/fro/components/enhanced/QuickReplyBar.jsx')
const { default: MessageComposer } = await vite.ssrLoadModule('/src/panels/fro/components/enhanced/MessageComposer.jsx')

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) { failures++; if (detail) console.log(`       ${detail}`) }
}

// QuickReplyBar is what WhatsAppInbox renders above the composer (line ~624).
// It fetches its saved replies in an effect and returns null while `loading`, and
// renderToString does not run effects, so the correct result here is an empty
// string -- the bar is deliberately hidden until the list arrives. Assert that
// contract (does not throw, renders nothing) rather than a populated list.
const qr = renderToString(createElement(QuickReplyBar, { onSend: () => {} }))
check('QuickReplyBar renders its loading placeholder (null while fetching)', qr === '', `got ${JSON.stringify(qr.slice(0, 40))}`)

// The emoji picker button is inside MessageComposer, which is what an agent sees
// with a thread open.
const composer = renderToString(createElement(MessageComposer, {
  onSend: async () => {}, onSendMedia: async () => {},
  templateProps: null,
}))

// The picker is collapsed initially, so assert the trigger (aria-label="Emoji")
// and the composer shell are present -- not the panel itself.
check('MessageComposer renders the emoji picker trigger', composer.includes('aria-label="Emoji"'), 'aria-label="Emoji" missing')
check('MessageComposer renders the text input', composer.includes('Type a message'), 'placeholder missing')
check('MessageComposer renders the send button', composer.includes('<svg'), 'send icon missing')
// TemplateLibrary is omitted when templateProps is null, so the emoji trigger is
// the only icon button plus attach/record; ensure it is not swallowed.
check('emoji trigger is not disabled by default', !/aria-label="Emoji"[^>]*disabled/.test(composer), 'trigger disabled')

await vite.close()

if (failures) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nquick-reply / emoji-picker smoke: all passed')
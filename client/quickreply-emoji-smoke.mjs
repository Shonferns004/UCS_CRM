// Renders the real WhatsApp composer subtree to confirm the Quick Reply bar and
// the composer's template-library trigger both behave as expected for an agent
// with a thread open.
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

// The template library trigger lives inside MessageComposer, to the right of the
// mic, which is what an agent sees with a thread open.
const composer = renderToString(createElement(MessageComposer, {
  onSend: async () => {}, onSendMedia: async () => {},
  templateProps: null,
}))

// With templateProps null the library is omitted entirely, so only the
// attach/record icons plus the text input and send button should render.
check('MessageComposer omits the template library without templateProps', !composer.includes('Template library'), 'library leaked without props')
check('MessageComposer renders the text input', composer.includes('Type a message'), 'placeholder missing')
check('MessageComposer renders the send button', composer.includes('<svg'), 'send icon missing')
// The emoji picker is always present; its trigger is collapsed by default.
check('MessageComposer renders the emoji picker trigger', composer.includes('aria-label="Emoji"'), 'aria-label="Emoji" missing')
check('emoji trigger is not disabled by default', !/aria-label="Emoji"[^>]*disabled/.test(composer), 'trigger disabled')

// With templateProps supplied (a conversation open) the library trigger must
// appear next to the mic.
const composerWithTemplates = renderToString(createElement(MessageComposer, {
  onSend: async () => {}, onSendMedia: async () => {},
  templateProps: {
    conversationId: 'conv-1', contactId: 'c-1', project: 'bsct',
    userId: 'u-1', agentToken: 'tok', onSent: () => {},
  },
}))
check('MessageComposer renders the template library trigger with templateProps', composerWithTemplates.includes('Template library'), 'template library trigger missing')

// ConversationList carries the per-row affordances behind the inbox's Groups /
// Favourites filters: a Group badge (+ people avatar) on group threads and a
// star (favourite) toggle on every row.
const { default: ConversationList } = await vite.ssrLoadModule('/src/panels/fro/components/enhanced/ConversationList.jsx')

const nowIso = new Date().toISOString()
const listHtml = renderToString(createElement(ConversationList, {
  conversations: [
    {
      id: 'g1', is_group: true, group_id: '12036302847@g.us',
      project: 'bsct', unread_count: 2, last_message_at: nowIso, labels: null,
      contact: { phone: '919999999999', wa_profile_name: 'Sender' },
    },
    {
      id: 'f1', is_group: false, group_id: null, project: 'bsct',
      unread_count: 0, last_message_at: nowIso, labels: ['favourite'],
      contact: { phone: '918888888888', wa_profile_name: 'Donor' },
    },
  ],
  activeId: null, onSelect: () => {}, onToggleFavorite: () => {},
}))
check('ConversationList badges group threads', listHtml.includes('Group · ') && listHtml.includes('302847'), 'group badge missing')
check('ConversationList renders a star toggle on each row', (listHtml.match(/wa-star/g) || []).length === 2, 'star toggle missing')
check('favourite thread shows a filled active star', listHtml.includes('wa-star is-fav') && listHtml.includes('aria-label="Remove from favourites"'), 'favourite star state missing')
check('non-favourite thread offers the add-favourite action', listHtml.includes('aria-label="Add to favourites"'), 'add-favourite action missing')

await vite.close()

if (failures) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nquick-reply / emoji-picker smoke: all passed')
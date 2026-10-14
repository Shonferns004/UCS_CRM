/**
 * Table-driven DOM test over the REAL template shapes returned by Meta, because
 * the Send button's enabled state depends on the shape: a template with a
 * media header, one with a variable, and one with neither.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import TemplateLibrary from './TemplateLibrary.jsx'

const REAL = [
  {
    id: 'a', name: 'navratri', language: 'en', category: 'MARKETING', status: 'APPROVED',
    headerFormat: 'IMAGE', headerFromTemplate: true, headerMediaUrl: 'https://cdn.test/n.jpg',
    components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Dear Donor,\nPlease refer {{1}}.' }],
  },
  {
    id: 'b', name: 'trust_details', language: 'en', category: 'MARKETING', status: 'APPROVED',
    components: [{ type: 'BODY', text: '*BEING SEVAK CHARITABLE TRUST*' }],
  },
  {
    id: 'c', name: 'hello_maam', language: 'en', category: 'MARKETING', status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hello maam... Myself {{name}} from *Being Sevak*' }],
  },
  {
    id: 'd', name: 'bsct_receipt_2', language: 'en', category: 'UTILITY', status: 'APPROVED',
    headerFormat: 'DOCUMENT', headerFromTemplate: true, headerMediaUrl: 'https://cdn.test/r.pdf',
    components: [{ type: 'HEADER', format: 'DOCUMENT' }, { type: 'BODY', text: '*Dear Donor,*' }],
  },
  {
    id: 'e', name: '_pitru_paksh', language: 'en', category: 'MARKETING', status: 'APPROVED',
    // Media header but the server did NOT report a cached copy for it.
    headerFormat: 'IMAGE', headerFromTemplate: false,
    components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Pitru Paksh appeal' }],
  },
  {
    // Variable in a dynamic URL button -- previously not editable at all.
    id: 'f', name: 'donate_link', language: 'en', category: 'UTILITY', status: 'APPROVED',
    components: [
      { type: 'BODY', text: 'Dear {{1}}, donate here' },
      { type: 'BUTTONS', buttons: [
        { type: 'URL', text: 'Donate now', url: 'https://donate.test/d/{{1}}', index: 0 },
      ] },
    ],
  },
  {
    // Named variable in header text as well as body.
    id: 'g', name: 'welcome_named', language: 'en', category: 'MARKETING', status: 'APPROVED',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Namaste {{name}}' },
      { type: 'BODY', text: 'Your receipt {{receipt}} is ready' },
      { type: 'FOOTER', text: 'Thank you' },
    ],
  },
]

const calls = []
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null })
  if (String(url).includes('/templates')) {
    return new Response(JSON.stringify(REAL), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, message: { id: 'x' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function click(el) {
  el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
}
const findButton = (root, text) => [...root.querySelectorAll('button')]
  .find((b) => (b.textContent || '').trim().toLowerCase().includes(text.toLowerCase()))

async function openTemplate(rootEl, name) {
  const opener = rootEl.querySelector('button[title="Template library"]')
  await act(async () => { click(opener); await sleep(30) })
  const item = findButton(rootEl, name)
  if (!item) return { error: 'item not listed' }
  await act(async () => { click(item); await sleep(30) })
  const sendBtn = findButton(rootEl, 'Send Template')
  if (!sendBtn) return { error: 'send button missing' }
  const inputs = [...rootEl.querySelectorAll('input')].filter((i) => (i.placeholder || '').includes('Enter a value'))
  return { sendBtn, inputs, preview: rootEl.textContent.includes('WhatsApp preview') }
}

async function fill(rootEl, inputs) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  for (const input of inputs) {
    await act(async () => {
      setter.call(input, 'Sample Value')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
  }
}

let failures = 0
console.log('template          preview  inputs  disabledBefore  disabledAfter  sent')
console.log('-'.repeat(78))

for (const tpl of REAL) {
  const rootEl = document.createElement('div')
  document.body.appendChild(rootEl)
  const root = createRoot(rootEl)
  await act(async () => {
    root.render(React.createElement(TemplateLibrary, {
      conversationId: 'c1', contactId: 'k1', project: 'bsct2', userId: 'u1', agentToken: 'tk', onSent: () => {},
    }))
  })
  await act(async () => { await sleep(40) })

  const { sendBtn, inputs, preview, error } = await openTemplate(rootEl, tpl.name)
  if (error) { console.log(`${tpl.name.padEnd(16)} ERROR: ${error}`); failures++; continue }

  const before = sendBtn.disabled
  const expected = new Set()
  for (const c of tpl.components || []) {
    if (c.type === 'BODY') (c.text || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) => expected.add(k))
    if (c.type === 'HEADER' && c.format === 'TEXT') (c.text || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) => expected.add(k))
    if (c.type === 'BUTTONS') for (const b of c.buttons || []) (b.url || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) => expected.add(k))
  }
  const inputCount = new Set(inputs.map((i) => (i.placeholder || '').replace(/[^0-9A-Za-z_]/g, '').slice(-12))).size
  const allEditable = inputs.length === expected.size && inputs.length === new Set(inputs.map((i) => i.placeholder)).size

  await fill(rootEl, inputs)
  const after = findButton(rootEl, 'Send Template')?.disabled

  calls.length = 0
  await act(async () => { click(findButton(rootEl, 'Send Template')); await sleep(60) })
  const sentCall = calls.find((c) => c.url.includes('send-template'))
  const sent = !!sentCall

  const ok = sent && after === false && allEditable
  if (!ok) failures++
  console.log(
    `${tpl.name.padEnd(16)} ${String(preview).padEnd(7)} need=${String(expected.size).padEnd(2)} inputs=${String(inputs.length).padEnd(2)} ` +
    `${String(before).padEnd(9)} ${String(after).padEnd(8)} ${sent ? 'YES' : 'NO <<<'}${allEditable ? '' : '  <<< variable not editable'}`,
  )
  if (sentCall && expected.size) {
    console.log(`                 payload: ${JSON.stringify(sentCall.body.paramValues)}`)
  }
  root.unmount()
  rootEl.remove()
}

console.log(failures === 0 ? '\nALL TEMPLATE SHAPES SEND' : `\n${failures} shape(s) could not send`)
process.exit(failures === 0 ? 0 : 1)

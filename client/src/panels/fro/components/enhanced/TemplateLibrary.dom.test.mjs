/**
 * Interaction test for TemplateLibrary in a real DOM: does clicking
 * "Send Template" actually reach the API? A server render cannot answer that --
 * it exercises no events and no handlers.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import TemplateLibrary from './TemplateLibrary.jsx'

// Record every fetch the component makes.
const calls = []
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null })
  if (String(url).includes('/templates')) {
    return new Response(JSON.stringify([
      {
        id: '1', name: 'hello_world', language: 'en_US', category: 'UTILITY', status: 'APPROVED',
        headerFormat: 'TEXT', headerFromTemplate: false,
        components: [
          { type: 'HEADER', format: 'TEXT', text: 'Hello {{name}}' },
          { type: 'BODY', text: 'Welcome and congratulations!!' },
        ],
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (String(url).includes('send-template')) {
    return new Response(JSON.stringify({ success: true, message: { id: 'x' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const PROPS = {
  conversationId: 'conv-1',
  contactId: 'contact-1',
  project: 'bsct2',
  userId: 'user-1',
  agentToken: 'token-1',
  onSent: () => {},
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function click(el) {
  el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
}
function findButton(root, text) {
  const all = root.querySelectorAll('button')
  return [...all].find((b) => (b.textContent || '').trim().toLowerCase().includes(text.toLowerCase()))
}

const rootEl = document.getElementById('root')
const root = createRoot(rootEl)

try {
  await act(async () => { root.render(React.createElement(TemplateLibrary, PROPS)) })
  await act(async () => { await sleep(60) })

  console.log('1. library rendered:', rootEl.querySelectorAll('button').length > 0 ? 'yes' : 'NO')

  // Open the dropdown.
  const opener = rootEl.querySelector('button[title="Template library"]')
  console.log('2. opener button found:', !!opener)
  if (!opener) throw new Error('library opener missing')
  await act(async () => { click(opener) })
  await act(async () => { await sleep(40) })

  const docText = rootEl.textContent
  console.log('3. dropdown shows template name:', docText.includes('hello_world'))
  console.log('   shows category:', docText.includes('Utility') || docText.includes('UTILITY'))

  const item = findButton(rootEl, 'hello_world')
  console.log('4. template item found:', !!item)
  if (!item) throw new Error('template item missing from list')
  await act(async () => { click(item) })
  await act(async () => { await sleep(40) })

  const afterOpen = rootEl.textContent
  console.log('5. preview modal opened:', afterOpen.includes('WhatsApp preview'))
  const inputs = [...rootEl.querySelectorAll('input')]
  console.log('   inputs in modal:', inputs.length,
    inputs.map((i) => `${i.type}/${i.className || '(no class)'}/${i.placeholder || ''}`).join(' | '))
  const modal = rootEl.querySelector('.template-params-modal')
  console.log('   .template-params-modal present:', !!modal)
  if (modal) console.log('   modal classes:', modal.className)
  const sendBtn = findButton(rootEl, 'Send Template')
  console.log('6. Send Template button found:', !!sendBtn)
  if (!sendBtn) {
    console.log('   visible text was:', afterOpen.slice(0, 400))
    throw new Error('Send Template button missing')
  }
  console.log('   button disabled?', sendBtn.disabled === true)

  // Fill the one variable the template has.
  // React omits the type attribute when JSX omits it, so select by placeholder.
  const input = [...rootEl.querySelectorAll('input')].find((i) => (i.placeholder || '').includes('Enter a value'))
  console.log('7. variable input found:', !!input)
  if (!input) throw new Error('variable input not found')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(input, 'Ramesh')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })

  console.log('   disabled after filling?', sendBtn.disabled === true)
  calls.length = 0
  await act(async () => { click(sendBtn) })
  await act(async () => { await sleep(120) })

  const sent = calls.find((c) => c.url.includes('send-template'))
  console.log('8. send-template called:', !!sent)
  if (sent) console.log('   payload:', JSON.stringify(sent.body))
  console.log('9. modal closed after send:', !rootEl.textContent.includes('WhatsApp preview'))

  const pass = !!sent && rootEl.textContent.includes('hello_world') === false
  console.log(pass ? '\nSEND BUTTON WORKS' : '\nSEND BUTTON DID NOT FIRE')
  process.exit(pass ? 0 : 1)
} catch (err) {
  console.log('THREW:', err.message)
  process.exit(1)
}

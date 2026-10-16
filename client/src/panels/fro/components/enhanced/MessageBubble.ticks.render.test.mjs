/**
 * Tick semantics: one grey tick = sent, two grey = delivered, two blue = read.
 * Asserts the tick COUNT and the COLOUR, because a single blue tick is
 * indistinguishable from a single grey one and that bug shipped once already.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageBubble } from './MessageBubble.jsx'

const base = {
  id: 'x', direction: 'outbound', message_type: 'text', status: 'sent',
  created_at: '2026-10-10T19:00:00Z', body_text: 'Namaste',
}

const cases = [
  ['queued', 'clock', null],
  ['sent', '1', '#8696a0'],
  ['accepted', '1', '#8696a0'],
  ['delivered', '2', '#8696a0'],
  ['read', '2', '#53bdeb'],
  ['failed', 'failed', '#ef4444'],
]

let failures = 0
console.log('status      ticks  colour     result')
console.log('-'.repeat(52))

for (const [status, wantTicks, wantColor] of cases) {
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, { message: { ...base, status }, isFirst: true, isLast: true, isGroup: false }),
  )
  const ticks = (html.match(/data-ticks="([^"]+)"/) || [])[1]
  const color = (html.match(/stroke="([^"]+)"/) || [])[1]
  const okTicks = ticks === wantTicks
  const okColor = wantColor === null || color === wantColor
  const ok = okTicks && okColor
  if (!ok) failures++
  console.log(
    `${status.padEnd(11)} ${String(ticks).padEnd(6)} ${String(color || '-').padEnd(10)} ${ok ? 'PASS' : `FAIL (want ticks=${wantTicks} colour=${wantColor})`}`,
  )
}

// The two states an agent actually compares must not look alike.
const sent = renderToStaticMarkup(React.createElement(MessageBubble, { message: { ...base, status: 'sent' }, isFirst: true, isLast: true, isGroup: false }))
const delivered = renderToStaticMarkup(React.createElement(MessageBubble, { message: { ...base, status: 'delivered' }, isFirst: true, isLast: true, isGroup: false }))
const read = renderToStaticMarkup(React.createElement(MessageBubble, { message: { ...base, status: 'read' }, isFirst: true, isLast: true, isGroup: false }))

const distinct = [
  ['sent differs from delivered', sent !== delivered],
  ['delivered differs from read', delivered !== read],
  ['delivered uses 2 polylines', (delivered.match(/<polyline/g) || []).length === 2],
  ['read uses 2 polylines', (read.match(/<polyline/g) || []).length === 2],
  ['sent uses 1 polyline', (sent.match(/<polyline/g) || []).length === 1],
  ['read tooltip mentions donor', read.includes('Read')],
]
for (const [label, ok] of distinct) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

// Ticks must appear on EVERY outbound message kind, not just typed text --
// template bubbles have their own render branch and used to skip them.
const kinds = [
  ['text', { message_type: 'text', body_text: 'Namaste' }],
  ['image', { message_type: 'image', body_text: '', media_url: 'https://cdn.test/a.jpg', media_mime_type: 'image/jpeg' }],
  ['audio', { message_type: 'audio', body_text: '', media_url: 'https://cdn.test/a.mp3', media_mime_type: 'audio/mpeg' }],
  ['template', {
    message_type: 'template', body_text: 'Dear Donor',
    media_url: 'https://cdn.test/n.jpg', media_mime_type: 'image/jpeg',
    template_params: { kind: 'whatsapp_template', name: 'navratri', body: 'Dear Donor', headerFormat: 'IMAGE', footer: 'Trust', buttons: [] },
  }],
]

console.log('\n-- ticks per message kind --')
for (const [label, extra] of kinds) {
  for (const [status, wantTicks, wantColor] of [['sent', '1', '#8696a0'], ['delivered', '2', '#8696a0'], ['read', '2', '#53bdeb']]) {
    const html = renderToStaticMarkup(
      React.createElement(MessageBubble, { message: { ...base, ...extra, status }, isFirst: true, isLast: true, isGroup: false }),
    )
    const ticks = (html.match(/data-ticks="([^"]+)"/) || [])[1]
    const color = (html.match(/stroke="([^"]+)"/) || [])[1]
    const ok = ticks === wantTicks && color === wantColor
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(9)} ${status.padEnd(10)} ticks=${ticks} colour=${color}${ok ? '' : `  (want ${wantTicks}/${wantColor})`}`)
  }
}

// Inbound messages must never show a tick.
const inbound = renderToStaticMarkup(
  React.createElement(MessageBubble, {
    message: { ...base, direction: 'inbound', status: 'delivered' },
    isFirst: true, isLast: true, isGroup: false,
  }),
)
const noTick = !inbound.includes('data-ticks')
if (!noTick) failures++
console.log(`${noTick ? 'PASS' : 'FAIL'}  inbound shows no tick`)

console.log(failures === 0 ? '\nALL TICK CHECKS PASS' : `\n${failures} tick check(s) failed`)
process.exit(failures === 0 ? 0 : 1)

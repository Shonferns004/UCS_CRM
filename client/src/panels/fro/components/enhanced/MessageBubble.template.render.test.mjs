/**
 * The inbox must show the whole template the donor received, not just its
 * internal name. Renders MessageBubble with the row shape sendTemplateReply
 * now writes, plus a legacy row that only stored the name.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageBubble, MessageList } from './MessageBubble.jsx'

const summary = {
  kind: 'whatsapp_template',
  name: 'navratri',
  language: 'en',
  category: 'MARKETING',
  body: 'Dear Donor,\nPlease refer to the attached *NAVRATRI* appeal, Mr Sharma.',
  headerText: null,
  footer: 'Being Sevak Charitable Trust',
  headerFormat: 'IMAGE',
  buttons: [
    { kind: 'QUICK_REPLY', label: 'Yes, I will donate' },
    { kind: 'URL', label: 'Donate now', url: 'https://donate.test/x' },
  ],
}

const newRow = {
  id: '1', direction: 'outbound', message_type: 'template', status: 'delivered',
  created_at: '2026-10-10T19:00:00Z',
  body_text: 'Dear Donor,\nPlease refer to the attached *NAVRATRI* appeal, Mr Sharma.',
  media_url: 'https://cdn.test/navratri.jpg',
  media_mime_type: 'image/jpeg',
  template_params: summary,
}

const legacyRow = {
  id: '2', direction: 'outbound', message_type: 'template', status: 'delivered',
  created_at: '2026-10-10T19:01:00Z',
  body_text: 'hello_world',
  media_url: null, media_mime_type: null, template_params: null,
}

const cases = [
  ['new template row shows full content', newRow, (h) => [
    ['shows body text', h.includes('Please refer to the attached')],
    ['substituted variable', h.includes('Mr Sharma')],
    ['no leftover placeholder', !h.includes('{{')],
    ['renders bold', h.includes('<strong>NAVRATRI</strong>')],
    ['shows footer', h.includes('Being Sevak Charitable Trust')],
    ['embeds header image', h.includes('https://cdn.test/navratri.jpg')],
    ['shows quick-reply button', h.includes('Yes, I will donate')],
    ['shows url button', h.includes('Donate now')],
    ['labels it a template', h.includes('navratri')],
    ['body is not bare name', !h.includes('>navratri<')],
  ]],
  ['legacy row still shows its name', legacyRow, (h) => [
    ['shows stored body', h.includes('hello_world')],
    ['does not crash', h.includes('Template')],
  ]],
]

let failures = 0
for (const [label, message, checks] of cases) {
  let html = ''
  try {
    html = renderToStaticMarkup(
      React.createElement(MessageBubble, { message, isFirst: true, isLast: true, isGroup: false }),
    )
  } catch (err) {
    console.log(`THREW ${label}: ${err.message}`)
    failures++
    continue
  }
  const bad = checks(html).filter(([, ok]) => !ok)
  if (bad.length) {
    failures++
    console.log(`FAIL ${label}`)
    for (const [what] of bad) console.log(`      missing: ${what}`)
    console.log(`      html: ${html.slice(0, 300)}`)
  } else {
    console.log(`PASS ${label}  (${html.length} chars)`)
  }
}

// The list must not lose template rows either.
try {
  const listHtml = renderToStaticMarkup(
    React.createElement(MessageList, { messages: [newRow, legacyRow] }),
  )
  const ok = listHtml.includes('NAVRATRI') && listHtml.includes('hello_world')
  console.log(ok ? 'PASS MessageList renders template rows' : 'FAIL MessageList dropped a template row')
  if (!ok) failures++
} catch (err) {
  console.log('THREW MessageList:', err.message)
  failures++
}

console.log(failures === 0 ? '\nALL TEMPLATE BUBBLE CHECKS PASS' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)

/**
 * Real render test: bundle the actual component with esbuild and render it with
 * react-dom/server. This is what would have caught the `key={i}` bug -- a
 * production build does not, because a bare `i` is a legal global until the
 * component actually runs.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TemplatePreview from './TemplatePreview.jsx'

const tplNavratri = {
  name: 'navratri',
  language: 'en',
  category: 'MARKETING',
  status: 'APPROVED',
  headerFormat: 'IMAGE',
  headerFromTemplate: true,
  headerMediaUrl: 'https://example.test/navratri.jpg',
  components: [
    { type: 'HEADER', format: 'IMAGE' },
    { type: 'BODY', text: 'Dear Donor,\nPlease refer to the attached *NAVRATRI* appeal for {{name}}.' },
    { type: 'FOOTER', text: 'Being Sevak Charitable Trust' },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Yes, I will donate' }, { type: 'URL', text: 'Donate now', url: 'https://donate.test/{{name}}' }] },
  ],
}

const tplHelloMaam = {
  name: 'hello_maam',
  language: 'en',
  category: 'MARKETING',
  status: 'APPROVED',
  components: [{ type: 'BODY', text: 'Hello maam... Myself {{name}} from *Being Sevak charitable trust*' }],
}

const tplReceipt = {
  name: 'bsct_receipt_2',
  language: 'en',
  category: 'UTILITY',
  status: 'APPROVED',
  headerFormat: 'DOCUMENT',
  headerFromTemplate: true,
  headerMediaUrl: 'https://example.test/receipt.pdf',
  components: [
    { type: 'HEADER', format: 'DOCUMENT', example: { filename: 'receipt.pdf' } },
    { type: 'BODY', text: '*Dear Donor,* Thank you for your generous support.' },
  ],
}

const tplTextHeader = {
  name: 'hello_world',
  language: 'en_US',
  category: 'UTILITY',
  status: 'APPROVED',
  components: [
    { type: 'HEADER', format: 'TEXT', text: 'Hello {{name}}' },
    { type: 'BODY', text: 'Welcome and congratulations!!' },
  ],
}

const cases = [
  ['IMAGE header + footer + buttons, nothing filled', tplNavratri, {}, 'https://example.test/navratri.jpg'],
  ['IMAGE header, variable filled', tplNavratri, { name: 'Mr Sharma' }, 'https://example.test/navratri.jpg'],
  ['named variable only', tplHelloMaam, {}, null],
  ['named variable filled', tplHelloMaam, { name: 'Mrs Patel' }, null],
  ['DOCUMENT header', tplReceipt, {}, 'https://example.test/receipt.pdf'],
  ['TEXT header with variable', tplTextHeader, { name: 'Ramesh' }, null],
]

let failures = 0
for (const [label, template, values, mediaUrl] of cases) {
  try {
    const html = renderToStaticMarkup(
      React.createElement(TemplatePreview, { template, values, mediaUrl }),
    )
    const filledVar = Object.values(values).filter(Boolean)[0]
    const checks = [
      ['renders html', html.length > 40],
      ['has bubble', html.includes('12:04 PM')],
      ['no raw {{}} leak when filled', filledVar ? !html.includes('{{' + Object.keys(values)[0] + '}}') : true],
      ['shows {{var}} when empty', Object.keys(values).length && !filledVar ? html.includes('{{' + Object.keys(values)[0] + '}}') : true],
    ]
    if (mediaUrl) checks.push(['embeds media url', html.includes(mediaUrl)])
    if (template.components.some((c) => c.type === 'FOOTER')) checks.push(['shows footer', html.includes('Being Sevak Charitable Trust')])
    if (template.components.some((c) => c.type === 'BUTTONS')) {
      checks.push(['renders quick reply', html.includes('Yes, I will donate')])
      checks.push(['renders url button', html.includes('Donate now')])
    }
    if (template.components.some((c) => c.type === 'BODY' && c.text.includes('*'))) {
      checks.push(['renders <strong> for *bold*', html.includes('<strong>')])
    }
    const bad = checks.filter(([, ok]) => !ok)
    if (bad.length) {
      failures++
      console.log(`FAIL  ${label}`)
      for (const [what] of bad) console.log(`        missing: ${what}`)
      console.log(`        html: ${html.slice(0, 260)}`)
    } else {
      console.log(`PASS  ${label}  (${html.length} chars)`)
    }
  } catch (err) {
    failures++
    console.log(`THREW ${label}`)
    console.log(`        ${err.constructor.name}: ${err.message}`)
  }
}

console.log(failures === 0 ? '\nALL RENDER CASES PASS' : `\n${failures} case(s) failed`)
process.exit(failures === 0 ? 0 : 1)

/**
 * The call history panel fetches on mount, so it has to be exercised in a real
 * DOM where effects run -- a server render would only ever see the loading
 * state and could never prove the populated rows are correct.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import CallHistoryPanel from './CallHistoryPanel.jsx'
import { formatDuration } from './CallOverlay.jsx'

let callsResponse = []
globalThis.fetch = async () =>
  new Response(JSON.stringify({ calls: callsResponse }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
globalThis.localStorage = { getItem: () => 'tok', setItem: () => {}, removeItem: () => {} }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function renderPanel() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => {
    root.render(React.createElement(CallHistoryPanel, {
      project: 'bsct2', agentToken: 'tok', onClose: () => {},
    }))
  })
  await act(async () => { await sleep(60) })
  return { el, root, text: el.textContent }
}

let failures = 0
const check = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra && !cond ? `  -- ${extra}` : ''}`)
}

console.log('-- empty state --')
callsResponse = []
let { el, root, text } = await renderPanel()
check('explains there are no calls yet', text.includes('No calls yet'), text.slice(0, 120))
check('mentions the number', text.includes('Call history'))
root.unmount(); el.remove()

console.log('\n-- populated state --')
callsResponse = [
  { id: '1', direction: 'inbound', status: 'connected', duration_seconds: 95, started_at: new Date().toISOString() },
  { id: '2', direction: 'outbound', status: 'failed', duration_seconds: null, started_at: new Date().toISOString(), failure_reason: 'This donor has not given call permission yet.' },
  { id: '3', direction: 'outbound', status: 'missed', duration_seconds: null, started_at: new Date().toISOString() },
  { id: '4', direction: 'outbound', status: 'rejected', duration_seconds: null, started_at: new Date().toISOString() },
]
;({ el, root, text } = await renderPanel())
check('renders every outcome', ['Completed', 'Failed', 'Missed', 'Declined'].every((l) => text.includes(l)), text.slice(0, 260))
check('shows the duration of a connected call', text.includes('01:35'))
check('keeps the failure reason from Meta', text.includes('call permission'))
check('labels direction', text.includes('Received') && text.includes('Outgoing'))
check('summarises totals', text.includes('Talk time'))
root.unmount(); el.remove()

console.log('\n-- duration formatting --')
for (const [input, want] of [[0, '00:00'], [9, '00:09'], [65, '01:05'], [3600, '1:00:00'], [3725, '1:02:05']]) {
  const got = String(formatDuration(input))
  check(`${input}s -> ${want}`, got === want, got)
}

console.log(failures === 0 ? '\nALL CALL HISTORY CHECKS PASS' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)

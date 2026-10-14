// Boots a jsdom window, points React at it, then runs the bundled test.
import { JSDOM } from 'jsdom'
import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'

const bundlePath = process.argv[2]
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 24 exposes navigator as a getter-only global, so it must be redefined
// rather than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
})
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLInputElement = dom.window.HTMLInputElement
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.Event = dom.window.Event
globalThis.Node = dom.window.Node
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const bundle = readFileSync(bundlePath, 'utf8')
const tmp = bundlePath.replace(/\.mjs$/, '.run.mjs')
const { writeFileSync, unlinkSync } = await import('fs')
writeFileSync(tmp, bundle)

try {
  await import(pathToFileURL(tmp).href)
} finally {
  try { unlinkSync(tmp) } catch { /* best effort */ }
}

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import EventPosterReport from './EventPosterReport.jsx'

/* One-page A4 PDF of the event poster (EventPosterReport). The poster is a fixed
   794×1123 px node, so it is captured whole and placed edge to edge — no page
   slicing. Photos are preloaded first so no collage slot is captured blank. */
export async function exportPosterToPdf(el, filename, photoUrls = []) {
  if (!el) throw new Error('Poster is not ready yet.')
  const { default: html2canvas } = await import('html2canvas')
  const { default: jsPDF } = await import('jspdf')
  await Promise.all(photoUrls.filter(Boolean).map(u => new Promise(resolve => {
    const im = new Image()
    im.onload = () => resolve(); im.onerror = () => resolve()
    im.src = u
  })))
  await (document.fonts && document.fonts.ready)
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 15000 })
  const pdf = new jsPDF('p', 'mm', 'a4')
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
  pdf.save(filename)
}

/* Render the poster from props off-screen and download it as a one-page PDF.
   Used by screens that hold the event data but have no poster in the DOM (the
   Monthly Planner's create/download actions). The host is mounted off-screen,
   captured synchronously, then unmounted so nothing is left behind. */
export async function renderPosterToPdf(props, filename) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)
  let node = null
  const root = createRoot(host)
  try {
    flushSync(() => {
      root.render(<EventPosterReport {...props} ref={(el) => { node = el }} />)
    })
    await exportPosterToPdf(node || host.firstElementChild, filename, [
      ...(props.photos || []), props.logoUrl, props.sevakBanoImage, props.brandImage,
    ])
  } finally {
    root.unmount()
    host.remove()
  }
}

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import EventPosterReport from './EventPosterReport.jsx'
import EventPosterReportAflf from './EventPosterReportAflf.jsx'

/* Preload every image the poster will paint, so no collage slot is captured
   blank. Failures resolve too: a missing logo must not block the download. */
async function preloadImages(urls) {
  await Promise.all((urls || []).filter(Boolean).map(u => new Promise(resolve => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => resolve(); im.onerror = () => resolve()
    im.src = u
  })))
}

async function capturePoster(el, photoUrls = []) {
  if (!el) throw new Error('Poster is not ready yet.')
  const { default: html2canvas } = await import('html2canvas')
  await preloadImages(photoUrls)
  await (document.fonts && document.fonts.ready)
  return await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 15000 })
}

/* One-page PDF: width is always A4 (210mm); height follows the poster's
   aspect ratio (a normal A4 poster still comes out 297mm). */
async function canvasToPdf(canvas, filename) {
  const { default: jsPDF } = await import('jspdf')
  const pageW = 210
  const pageH = +(pageW * canvas.height / canvas.width).toFixed(2)
  const pdf = new jsPDF({
    orientation: pageH >= pageW ? 'p' : 'l',
    unit: 'mm',
    format: [pageW, pageH],
  })
  pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pageW, pageH)
  pdf.save(filename)
}

export async function exportPosterToPdf(el, filename, photoUrls = []) {
  const canvas = await capturePoster(el, photoUrls)
  await canvasToPdf(canvas, filename)
}

/* Render the poster from props off-screen and return its canvas. */
export async function renderPosterCanvas(props) {
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
    const ReportComponent = props?.template === 'aflf' ? EventPosterReportAflf : EventPosterReport
    flushSync(() => {
      root.render(<ReportComponent {...props} ref={(el) => { node = el }} />)
    })
    return await capturePoster(node || host.firstElementChild, [
      ...(props.photos || []), props.logoUrl, props.sevakBanoImage, props.brandImage,
    ])
  } finally {
    root.unmount()
    host.remove()
  }
}

/* Render the poster from props off-screen and download it as a one-page PDF. */
export async function renderPosterToPdf(props, filename) {
  const canvas = await renderPosterCanvas(props)
  await canvasToPdf(canvas, filename)
}
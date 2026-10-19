// Kit Given PDF — a printable A4 report of the filtered kit handouts, printed
// on the same NGO "blank letter" letterhead HR uses (branded header image +
// watermark + registered-address footer) with each beneficiary's enrolled
// fingerprint scan in the last column.
//
// Rows are grouped by NGO so each group gets its own letterhead (one event is
// normally one NGO, but an unfiltered export can span several).
//
// `rows`      — beneficiary rows (from GET /beneficiaries?kit_given=true…)
// `images`    — { [beneficiary_id]: dataURL | { image, ... } }
// `eventName` — optional, shown in the sub-title when an event filter is on

const pageW = 210
const pageH = 297
const ROW_H = 14
const HEADER_H = 7

// Branding copied from HR's blank-letter template (Letters.jsx) so both
// surfaces print the identical letterhead.
const NGO_NAME = {
  BSCT: 'BEING SEVAK CHARITABLE TRUST',
  AFLF: 'ASHRAY FOR LIFE FOUNDATION',
  MANN: 'MANN CARE FOUNDATION',
  UCS: 'ULTIMATE CONSULTANCY SERVICES',
}
const NGO_ADDRESS = {
  BSCT: '506, Sanjar Enclave, Bhadran Nagar, Kandivali (West), Mumbai, Maharashtra 400067.',
  AFLF: 'Unit - 218, 2nd Floor, Auris Galleria, S.V Road, Andheri (West), Mumbai 400058.',
  MANN: '1708 ONE WORLD, SV ROAD NEAR NL HIGH SCHOOL MALAD WEST MUMBAI 400064.',
  UCS: 'Sanjar Enclave, Office no 506, S.V Road, Kandivali West, Mumbai - 400067',
}
const LETTERHEAD_IMG = {
  BSCT: '/Letter Head BSCT (1).png',
  AFLF: '/Letter Head AFLF.png',
  MANN: '/Letter Head MANN.png',
}
const LOGO_IMG = {
  BSCT: '/logo/beingsevak-logo.png',
  AFLF: '/logo/aflf-logo.png',
  MANN: '/logo/mann-logo.png',
  UCS: '/logo/ucs-logo.png',
}
// Percentages of the page the branded image reserves for letter body.
const LETTERHEAD_BODY = {
  BSCT: { top: 13, bottom: 9, left: 5.5, right: 5.5 },
  AFLF: { top: 17, bottom: 8, left: 6, right: 6 },
  MANN: { top: 12, bottom: 5, left: 6, right: 6 },
  UCS: { top: 20, bottom: 12, left: 6, right: 6 },
}
const HAS_LH = (k) => k === 'BSCT' || k === 'AFLF' || k === 'MANN'

// Columns before scaling to the letter's content width.
const BASE_COLS = [
  { key: 'idx', label: '#', width: 7, align: 'right' },
  { key: 'name', label: 'Name', width: 40 },
  { key: 'type', label: 'Type', width: 34 },
  { key: 'mobile', label: 'Mobile', width: 20 },
  { key: 'ngo', label: 'NGO', width: 14 },
  { key: 'event', label: 'Event', width: 34 },
  { key: 'givenOn', label: 'Given On', width: 20 },
  { key: 'fp', label: 'Fingerprint', width: 16, align: 'center' },
]

function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ngoKeyOf(b) {
  const raw = String(b?.ngos?.name || b?.ngo || '').trim().toUpperCase()
  if (raw && NGO_NAME[raw]) return raw
  const n = raw.toLowerCase()
  if (n.includes('being') || n.includes('sevak')) return 'BSCT'
  if (n.includes('ashray')) return 'AFLF'
  if (n.includes('mann')) return 'MANN'
  if (n.includes('ultimate') || n.includes('consult')) return 'UCS'
  return 'BSCT'
}

function contentBox(ngoKey) {
  const b = LETTERHEAD_BODY[ngoKey] || LETTERHEAD_BODY.BSCT
  const x = (pageW * b.left) / 100
  const y = (pageH * b.top) / 100
  const w = pageW - (pageW * (b.left + b.right)) / 100
  const h = pageH - (pageH * (b.top + b.bottom)) / 100
  return { x, y, w, h }
}

function buildCols(contentW) {
  const total = BASE_COLS.reduce((s, c) => s + c.width, 0)
  return BASE_COLS.map((c) => ({ ...c, w: (c.width / total) * contentW }))
}

// jsPDF embeds an image at its FULL pixel size (PNG is stored uncompressed), so
// a 765 KB logo handed in raw ballooned a two-page report past 100 MB. Every
// image is therefore resized through a canvas first: the letterhead becomes a
// page-sized JPEG and the watermark logo a small PNG. Same asset is cached, and
// jsPDF de-duplicates identical images across pages, so the file stays small no
// matter how many pages the report runs to.
const imgCache = new Map()
async function loadScaled(url, maxW, maxH, type = 'image/jpeg', quality = 0.9) {
  if (!url) return null
  const key = `${url}|${maxW}x${maxH}|${type}|${quality}`
  if (imgCache.has(key)) return imgCache.get(key)
  const p = (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const img = await new Promise((resolve, reject) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = reject
        im.src = objUrl
      })
      URL.revokeObjectURL(objUrl)
      const w0 = img.naturalWidth || img.width
      const h0 = img.naturalHeight || img.height
      const scale = Math.min(1, maxW / w0, maxH / h0)
      const w = Math.max(1, Math.round(w0 * scale))
      const h = Math.max(1, Math.round(h0 * scale))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) }
      ctx.drawImage(img, 0, 0, w, h)
      return c.toDataURL(type, quality)
    } catch { return null }
  })()
  imgCache.set(key, p)
  return p
}

// The server hands back the full-resolution scan as a PNG data URL (~200 KB
// each), far more than an 11 mm cell can show. Downscaling to a small JPEG
// first keeps a long report in the hundreds of KB instead of tens of MB.
// Async, so it is awaited once before the table is drawn.
function toSmallJpeg(src, maxSide = 240) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || img.width
        const h0 = img.naturalHeight || img.height
        const scale = Math.min(1, maxSide / Math.max(w0, h0))
        const w = Math.max(1, Math.round(w0 * scale))
        const h = Math.max(1, Math.round(h0 * scale))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', 0.8))
      } catch { resolve(src) }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

export async function downloadKitGivenPdf({ rows, images, eventName }) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Shrink the fingerprint scans once, up front.
  const thumbs = {}
  if (images) {
    await Promise.all(Object.entries(images).map(async ([id, entry]) => {
      const src = entry && typeof entry === 'object' ? entry.image : entry
      if (src) thumbs[id] = await toSmallJpeg(src)
    }))
  }

  // Group rows by NGO so every group carries the right letterhead.
  const groups = new Map()
  for (const b of rows) {
    const k = ngoKeyOf(b)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(b)
  }

  // The first page already exists; every later one is added.
  let pageFresh = true
  const startPage = () => {
    if (pageFresh) pageFresh = false
    else doc.addPage()
  }

  const drawChrome = (letterhead, logo) => {
    if (HAS_LH(currentKey) && letterhead) {
      doc.addImage(letterhead, 'JPEG', 0, 0, pageW, pageH)
    } else {
      doc.setFont('times', 'bold')
      doc.setFontSize(15)
      doc.setTextColor(8, 47, 90)
      doc.text(NGO_NAME[currentKey] || '', pageW / 2, 24, { align: 'center' })
      doc.setDrawColor(11, 115, 196)
      doc.setLineWidth(0.8)
      doc.line(pageW * 0.07, 30, pageW * 0.93, 30)
      doc.setDrawColor(245, 130, 32)
      doc.setLineWidth(0.4)
      doc.line(pageW * 0.07, 31.4, pageW * 0.93, 31.4)
      doc.setFont('times', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(107, 114, 128)
      doc.text(`Regd. Address: ${NGO_ADDRESS[currentKey] || ''}`, pageW / 2, pageH - 10, { align: 'center' })
    }
    // Watermark: the NGO logo, very faint, centred (same as HR's blank letter).
    if (logo) {
      try {
        doc.saveGraphicsState()
        doc.setGState(new doc.GState({ opacity: 0.08 }))
        const wm = 90
        doc.addImage(logo, 'PNG', (pageW - wm) / 2, (pageH - wm) / 2, wm, wm)
        doc.restoreGraphicsState()
      } catch { /* opacity is cosmetic; never block the report */ }
    }
  }

  let currentKey = 'BSCT'

  const fit = (text, maxW) => {
    let s = String(text ?? '')
    if (doc.getTextWidth(s) <= maxW) return s
    while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1)
    return s + '…'
  }

  const drawTitle = (box, cols, count) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(15, 23, 42)
    doc.text('Kit Given', box.x, box.y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    const sub = [eventName ? `Event: ${eventName}` : 'All events', `${count} beneficiary(ies)`].join('   •   ')
    doc.text(sub, box.x, box.y + 12)
    return box.y + 17
  }

  const drawHeaderRow = (box, cols, y) => {
    doc.setFillColor(241, 245, 249)
    doc.rect(box.x, y, box.w, HEADER_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(51, 65, 85)
    let x = box.x
    cols.forEach((c) => {
      const tx = c.align === 'right' ? x + c.w - 1 : c.align === 'center' ? x + c.w / 2 : x + 1
      doc.text(c.label, tx, y + 5, { align: c.align || 'left' })
      x += c.w
    })
    doc.setLineWidth(0.2)
    doc.setDrawColor(203, 213, 225)
    doc.line(box.x, y + HEADER_H, box.x + box.w, y + HEADER_H)
    return y + HEADER_H
  }

  let rowNo = 0
  for (const [ngoKey, groupRows] of groups) {
    currentKey = ngoKey
    const letterhead = HAS_LH(ngoKey)
      ? await loadScaled(LETTERHEAD_IMG[ngoKey], 1240, 1754, 'image/jpeg', 0.9)
      : null
    const logo = await loadScaled(LOGO_IMG[ngoKey] || LOGO_IMG.BSCT, 260, 260, 'image/png')
    const box = contentBox(ngoKey)
    const cols = buildCols(box.w)

    // Open the group's first page with its title.
    startPage()
    drawChrome(letterhead, logo)
    let y = drawTitle(box, cols, groupRows.length)
    y = drawHeaderRow(box, cols, y)

    for (let i = 0; i < groupRows.length; i++) {
      if (y + ROW_H > box.y + box.h) {
        startPage()
        drawChrome(letterhead, logo)
        y = drawHeaderRow(box, cols, box.y)
      }

      const b = groupRows[i]
      rowNo += 1
      const values = {
        idx: String(rowNo),
        name: b.full_name || '',
        type: b.beneficiary_type || '',
        mobile: b.mobile || '',
        ngo: b.ngos?.name || '',
        event: b.kit_event_name || '',
        givenOn: fmtDate(b.kit_given_at),
      }

      let x = box.x
      cols.forEach((c) => {
        if (c.key === 'fp') {
          const src = thumbs[b.id]
          if (src) {
            try {
              const size = ROW_H - 3
              doc.addImage(src, 'JPEG', x + (c.w - size) / 2, y + 1.5, size, size)
            } catch { /* a bad frame must not abort the report */ }
          }
        } else {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(30, 41, 59)
          const tx = c.align === 'right' ? x + c.w - 1 : x + 1
          doc.text(fit(values[c.key], c.w - 2), tx, y + ROW_H / 2 + 1, { align: c.align || 'left' })
        }
        x += c.w
      })

      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.1)
      doc.line(box.x, y + ROW_H, box.x + box.w, y + ROW_H)
      y += ROW_H
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`kit-given_${stamp}.pdf`)
}

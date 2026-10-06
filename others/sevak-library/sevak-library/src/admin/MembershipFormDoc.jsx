import { formatINR, formatDate } from '../formUtils.js'

const A4_W = 210
const A4_H = 297

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function a4Html(row, photoUrl) {
  const d = row.data || {}
  const f = (k) => escapeHtml(d[k] ?? '—')
  const photo = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Passport" />` : '<span class="doc-photo-placeholder">Photo</span>'

  const block = (title, cols) => {
    const cells = Object.entries(cols)
      .map(
        ([k, v]) =>
          `<div class="doc-field"><span class="doc-field-label">${escapeHtml(k)}</span><span class="doc-field-value">${escapeHtml(v)}</span></div>`
      )
      .join('')
    return `<div class="doc-block"><div class="doc-block-title">${escapeHtml(title)}</div><div class="doc-block-cols">${cells}</div></div>`
  }

  const sections = [
    block('Section 1 · Membership Information', {
      'Membership ID': row.membership_id || '—',
      'Application Date': d.applicationDate ? formatDate(d.applicationDate) : '—',
      'Membership Plan': row.membership_type || '—',
      Category: d.category || '—',
      'Start Date': row.start_date ? formatDate(row.start_date) : '—',
      'End Date': row.end_date ? formatDate(row.end_date) : '—',
      'Membership Fee': formatINR(row.membership_fee)
    }),
    block('Section 2 · Personal Details', {
      'Full Name': row.full_name || '—',
      "Father's / Mother's / Guardian's Name": d.guardianName || '—',
      'Date of Birth': d.dateOfBirth ? formatDate(d.dateOfBirth) : '—',
      Gender: d.gender || '—',
      Occupation: d.occupation || '—',
      'Educational Qualification': d.educationalQualification || '—'
    }),
    block('Section 3 · Contact Details', {
      'Mobile Number': row.mobile || '—',
      'Alternate Mobile Number': d.alternateMobileNumber || '—',
      'Email Address': row.email || '—'
    }),
    block('Section 4 · Address', { 'Current Address': [d.currentAddress, d.city, d.state, d.pinCode].filter(Boolean).join(', ') || '—' }),
    block('Section 5 · Identity Proof', {
      'Identity Proof Type': row.identity_proof_type || '—',
      'Identity Number': row.identity_number || '—'
    })
  ].join('')

  return `
    <div class="doc-a4">
      <div class="doc-logo"><img src="/sevak-logo.png" alt="Sevak Library" /></div>
      <div class="doc-header">
        <h1>Sevak Library</h1>
        <h2>Library Membership Registration Form</h2>
        <p>Initiative by Being Sevak Charitable Trust</p>
      </div>
      <div class="doc-meta">
        <div class="doc-photo">${photo}</div>
        <div class="doc-ref"><span class="doc-ref-label">Reference No.</span><span class="doc-ref-value">${escapeHtml(row.ref || '—')}</span></div>
      </div>
      ${sections}
      <div class="doc-declaration">
        <p><strong>Declaration:</strong> I hereby declare that the information provided in this form is true and correct and I agree to follow all the rules and regulations of Sevak Library.</p>
        <div class="doc-sign-wrap">
          <div class="doc-sign"><span class="doc-sign-label">Applicant Signature</span><span class="doc-sign-value">${f('applicantSignature')}</span></div>
          <div class="doc-sign"><span class="doc-sign-label">Date</span><span class="doc-sign-value">${d.submissionDate ? formatDate(d.submissionDate) : ''}</span></div>
        </div>
      </div>
      <div class="doc-footer">Sevak Library · Being Sevak Charitable Trust | Turning Pages, Changing Lives</div>
    </div>
  `
}

async function renderToCanvas(node) {
  const { default: html2canvas } = await import('html2canvas')
  return await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
}

export async function pdfMemberDoc(rows, photoUrls) {
  if (!rows || rows.length === 0) return

  const [{ default: jsPDF }] = await Promise.all([import('jspdf')])

  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;'
  holder.setAttribute('aria-hidden', 'true')
  document.body.appendChild(holder)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  try {
    for (let i = 0; i < rows.length; i++) {
      const node = document.createElement('div')
      node.innerHTML = a4Html(rows[i], photoUrls?.[i])
      holder.appendChild(node)

      const canvas = await renderToCanvas(node)
      const img = canvas.toDataURL('image/jpeg', 0.92)
      const ratio = canvas.width / canvas.height
      let w = A4_W - 22
      let h = w / ratio
      if (h > A4_H - 22) {
        h = A4_H - 22
        w = h * ratio
      }
      doc.addImage(img, 'JPEG', (A4_W - w) / 2, 11, w, h)

      if (i < rows.length - 1) doc.addPage()
      node.remove()
    }
  } finally {
    document.body.removeChild(holder)
  }

  const first = rows[0]
  const name = (first?.full_name || first?.ref || 'member').replace(/[^\w.-]+/g, '_').slice(0, 40)
  const id = first?.membership_id ? `${first.membership_id}-` : ''
  doc.save(`${id}registration-${name}.pdf`)
}

export { a4Html }
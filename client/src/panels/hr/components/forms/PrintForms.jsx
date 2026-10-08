import { useEffect, useRef, useState } from 'react'
import WelcomeLetter from './WelcomeLetter'
import Template1 from './Template1'
import Template2 from './Template2'
import Template3 from './Template3'
import Template4 from './Template4'
import Template5 from './Template5'
import Template6 from './Template6'


export default function PrintForms({ data, onClose }) {
  const ref = useRef(null)
  const [contentOnly, setContentOnly] = useState(() => {
    try { return localStorage.getItem('wl_content_only') === '1' } catch { return false }
  })
  const [topMargin, setTopMargin] = useState(() => {
    try { return Number(localStorage.getItem('wl_top_margin')) || 60 } catch { return 60 }
  })

  useEffect(() => { try { localStorage.setItem('wl_content_only', contentOnly ? '1' : '0') } catch {} }, [contentOnly])
  useEffect(() => { try { localStorage.setItem('wl_top_margin', String(topMargin)) } catch {} }, [topMargin])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { alert('Please allow pop-ups to print forms'); return }
    const content = ref.current.innerHTML
    const origin = window.location.origin
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head><title>Volunteer Forms</title>
      <base href="${origin}/">
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; padding: 0; background: #fff; }
        .print-page { page-break-after: always; }
        .t1 { margin-top: 40px !important; }
        .wl { height: 297mm !important; overflow: hidden !important; margin-top: 40px !important; }
        .t2 { height: 297mm !important; overflow: hidden !important; margin-top: 40px !important; }
        .t4 { height: 297mm !important; overflow: hidden !important; margin-top: 40px !important; }
        .t5 { height: 297mm !important; overflow: hidden !important; margin-top: 40px !important; }
        .t6 { height: 297mm !important; overflow: hidden !important; margin-top: 40px !important; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
      </head>
      <body>${content}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 500)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#fff', zIndex: 9999, overflow: 'auto',
      padding: '20px 0',
    }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 100, background: '#fff',
        borderBottom: '2px solid #333', padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Print Preview — All Forms</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={contentOnly} onChange={(e) => setContentOnly(e.target.checked)} />
            Welcome letter: signed-paper (content-only)
          </label>
          {contentOnly && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              Top margin (mm):
              <input type="number" value={topMargin} min={0} max={200}
                onChange={(e) => setTopMargin(Number(e.target.value) || 0)}
                style={{ width: 70, padding: '4px 6px' }} />
            </label>
          )}
          <button className="btn btn-primary" onClick={handlePrint}
            style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700 }}>
            🖨️ Print All Forms
          </button>
          <button className="btn" onClick={onClose}
            style={{ padding: '10px 24px', fontSize: 14 }}>
            Close
          </button>
        </div>
      </div>
      <div ref={ref}>
        <WelcomeLetter personal={data.personal} ngoName={data.ngoName} ngoCode={data.ngoCode} contentOnly={contentOnly} topMargin={topMargin} />
        {!contentOnly && <>
        <Template1 personal={data.personal} education={data.education} family={data.family || []} organizations={data.organizations || []} photo_url={data.photo_url || ''} />
        <Template2 />
        <Template3 personal={data.personal} declarationDate={data.declarationDate} place={data.place} />
        <Template4 personal={data.personal} signatureUrl={data.signature_url || ''} />
        <Template5 personal={data.personal} declarationDate={data.declarationDate} place={data.place} signatureUrl={data.signature_url || ''} signatureDate={data.signature_signed_at || null} />
        <Template6 personal={data.personal} declarationDate={data.declarationDate} place={data.place} signatureUrl={data.signature_url || ''} />
        </>}
      </div>
    </div>
  )
}

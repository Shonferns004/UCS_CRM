import { useEffect, useRef, useState } from 'react'

// Canvas signature pad for the declaration section — the applicant draws with a
// mouse or finger instead of typing their name. The value committed to form
// state is a PNG data URL; api.js converts it to a Blob for the `signature`
// file upload (stored in S3, never inside the `data` JSON).
export default function SignaturePad({ field, value, onChange, error }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [hasInk, setHasInk] = useState(false)

  const pos = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height
    }
  }

  // Draw once on mount (restores a signature kept in form state, e.g. after
  // stepping between sections). The canvas keeps a fixed backing size and is
  // scaled by CSS, so window resizes never need a redraw.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.width = 640
    c.height = 220
    if (typeof value === 'string' && value.startsWith('data:image')) {
      const img = new Image()
      img.onload = () => c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      img.src = value
      setHasInk(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    last.current = pos(e)
    try { canvasRef.current.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const move = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f2937'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    setHasInk(true)
    onChange(field.id, canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setHasInk(false)
    onChange(field.id, '')
  }

  return (
    <div className={`field sig-field ${error ? 'has-error' : ''}`}>
      <label className="field-label">
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      {field.helpText && <p className="help-text">{field.helpText}</p>}
      <div className="sig-pad">
        <canvas
          ref={canvasRef}
          className="sig-canvas"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Signature drawing pad"
        />
        {!hasInk && <span className="sig-hint">Sign here</span>}
      </div>
      <div className="sig-actions">
        <button type="button" className="sig-clear" onClick={clear} disabled={!hasInk}>
          Clear
        </button>
        <span className={`sig-status ${hasInk ? 'ok' : ''}`}>
          {hasInk ? '✓ Signature captured' : 'Draw your signature with a mouse or finger'}
        </span>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

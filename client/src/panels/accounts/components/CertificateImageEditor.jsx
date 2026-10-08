import { useState, useEffect, useRef, useCallback } from 'react'
import { certificateApi } from '../api/certificates'
import { toast } from '../../../components/Toast'
import {
  Plus, Trash2, Wand2, CheckCircle2, ChevronLeft, Type as TypeIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Italic, ZoomIn, ZoomOut, Maximize, Loader2, X, Copy, GripVertical, ArrowUp, ArrowDown,
} from 'lucide-react'

// Visaul certificate editor for image templates. The uploaded image is the
// canvas; fields are positioned visually on top of it. All coordinates are
// stored in the ORIGINAL image pixel space (never browser CSS pixels) so the
// backend renderer produces identical output at any zoom level.

export const CERT_FONT_FAMILIES = [
  'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana',
  'Tahoma', 'Courier New', 'Impact', 'Comic Sans MS', 'Segoe UI', 'Bookman Old Style',
  'Poppins', 'Montserrat', 'Open Sans', 'Playfair Display', 'Cinzel', 'Inter', 'Lato',
  'Glacial Indifference', 'Cormorant Garamond', 'Kelvinch', 'Kelvinch Italic', 'Podkova',
]

const FIELD_TYPES = ['text', 'number', 'date', 'time', 'datetime', 'longtext', 'select']

const defaultStyle = (canvasW, canvasH, i) => ({
  x: Math.round(canvasW * 0.25),
  y: Math.round(Math.min(canvasH * 0.9, 60 + i * (canvasH * 0.12))),
  width: Math.round(canvasW * 0.5),
  height: Math.round(canvasH * 0.08),
  fontFamily: 'Arial',
  fontSize: Math.max(12, Math.round(canvasH * 0.05)),
  fontWeight: 600,
  fontStyle: 'normal',
  color: '#111111',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.2,
  letterSpacing: 0,
  autoFit: true,
  minFontSize: 12,
})

export default function CertificateImageEditor({ draft, setDraft, canManage, onSave, onCancel, TemplateMeta, ngos, purposes }) {
  const [imgUrl, setImgUrl] = useState(null)
  const [scale, setScale] = useState(0.5)
  const [selected, setSelected] = useState(0)
  const [drag, setDrag] = useState(null) // {mode:'move'|'resize', startX,startY, orig:{...}}
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [sampleValues, setSampleValues] = useState({})
  const [guides, setGuides] = useState(null)
  const [listDrag, setListDrag] = useState(null)
  const [listDrop, setListDrop] = useState(null)
  const stageRef = useRef(null)
  const wrapRef = useRef(null)

  const canvasW = draft?.canvas_width || 1920
  const canvasH = draft?.canvas_height || 1080
  const fields = draft?.fields || []
  const sel = fields[selected]

  // Load authenticated template image as an object URL for the canvas.
  useEffect(() => {
    let cancelled = false
    let url = null
    if (!draft?.id) return
    certificateApi.getTemplateFile(draft.id)
      .then((r) => r.arrayBuffer())
      .catch(() => null)
      .then(async (buf) => {
        if (!buf || cancelled) return
        url = URL.createObjectURL(new Blob([buf]))
        if (!cancelled) setImgUrl(url)
      })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [draft?.id, draft?.version])

  const updateField = useCallback((idx, patch) => {
    setDraft((d) => ({
      ...d,
      fields: (d.fields || []).map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }))
  }, [setDraft])

  const patchStyle = useCallback((idx, patch) => {
    setDraft((d) => ({
      ...d,
      fields: (d.fields || []).map((f, i) => (i === idx ? { ...f, style: { ...(f.style || {}), ...patch } } : f)),
    }))
  }, [setDraft])

  const addField = () => {
    setDraft((d) => {
      const key = `field_${(d.fields || []).length + 1}`
      return {
        ...d,
        fields: [...(d.fields || []), {
          field_key: key, display_name: `Field ${(d.fields || []).length + 1}`, field_type: 'text',
          required: true, default_value: '', in_template: true,
          style: defaultStyle(canvasW, canvasH, (d.fields || []).length),
        }],
      }
    })
    setSelected(fields.length)
  }

  const removeField = (idx) => {
    setDraft((d) => ({ ...d, fields: (d.fields || []).filter((_, i) => i !== idx) }))
    setSelected((i) => Math.max(0, Math.min(i, fields.length - 2)))
  }

  const duplicateField = (idx) => {
    setDraft((d) => {
      const f = (d.fields || [])[idx]
      if (!f) return d
      const copy = { ...f, field_key: `${f.field_key}_copy`, display_name: `${f.display_name} (copy)`, style: { ...(f.style || {}), x: (f.style?.x || 0) + 40, y: (f.style?.y || 0) + 40 } }
      const next = [...(d.fields || [])]
      next.splice(idx + 1, 0, copy)
      return { ...d, fields: next }
    })
  }

  // Drag/resize via pointer events. Convert screen deltas back to canvas units.
  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      const dx = (e.clientX - drag.startX) / scale
      const dy = (e.clientY - drag.startY) / scale
      if (drag.mode === 'move') {
        // Snap toward the canvas center (helps center fields) and show guides.
        const f = fields[drag.index]?.style || {}
        const fw = f.width || 100
        const fh = f.height || 40
        let nx = drag.orig.x + dx
        let ny = drag.orig.y + dy
        const g = { vCenter: false, hCenter: false, vLeft: false, hTop: false, vRight: false, hBottom: false }
        const cx = nx + fw / 2
        if (Math.abs(cx - canvasW / 2) < 8) { nx = canvasW / 2 - fw / 2; g.vCenter = true }
        const cy = ny + fh / 2
        if (Math.abs(cy - canvasH / 2) < 8) { ny = canvasH / 2 - fh / 2; g.hCenter = true }
        if (Math.abs(nx) < 6) { nx = 0; g.vLeft = true }
        if (Math.abs(ny) < 6) { ny = 0; g.hTop = true }
        if (Math.abs(nx + fw - canvasW) < 6) { nx = canvasW - fw; g.vRight = true }
        if (Math.abs(ny + fh - canvasH) < 6) { ny = canvasH - fh; g.hBottom = true }
        setGuides(g)
        setDraft((d) => ({
          ...d,
          fields: (d.fields || []).map((f2, i) => (i === drag.index
            ? { ...f2, style: { ...(f2.style || {}), x: Math.round(Math.max(0, Math.min(canvasW - 20, nx))), y: Math.round(Math.max(0, Math.min(canvasH - 10, ny))) } }
            : f2)),
        }))
        return
      }
      setDraft((d) => {
        const fields2 = (d.fields || []).map((f2, i) => {
          if (i !== drag.index) return f2
          const s = { ...(f2.style || {}) }
          s.width = Math.round(Math.max(40, drag.orig.width + dx))
          s.height = Math.round(Math.max(16, drag.orig.height + dy))
          return { ...f2, style: s }
        })
        return { ...d, fields: fields2 }
      })
    }
    const onUp = () => { setDrag(null); setGuides(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [drag, scale, canvasW, canvasH, setDraft, fields])

  const fitToWidth = () => {
    if (wrapRef.current) setScale(Math.min(2, (wrapRef.current.clientWidth - 4) / canvasW))
  }
  useEffect(() => { fitToWidth(); /* fit on mount */ }, []) // eslint-disable-line

  const runEditorPreview = async () => {
    if (!draft?.id) return
    setPreviewBusy(true)
    try {
      const values = {}
      for (const f of fields) values[f.field_key] = sampleValues[f.field_key] ?? f.default_value ?? ''
      const resp = await certificateApi.preview({ template_id: draft.id, field_values: values })
      if (!resp.ok) { let msg = 'Preview failed'; try { msg = (await resp.json()).message || msg } catch {} throw new Error(msg) }
      const blob = await resp.blob()
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob) })
    } catch (e) { toast(e.message, 'error') } finally { setPreviewBusy(false) }
  }

  const selStyle = sel?.style || {}
  const alignBtn = (val, Icon) => (
    <button key={val} type="button" className="btn btn-sm" style={{ padding: '4px 8px', borderColor: selStyle.textAlign === val ? 'var(--sage)' : undefined }} onClick={() => patchStyle(selected, { textAlign: val })}>
      <Icon size={14} />
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {TemplateMeta && <TemplateMeta ngos={ngos} purposes={purposes} value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-sm btn-primary" onClick={addField}><Plus size={14} /> Add field</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => setScale((s) => Math.max(0.2, s - 0.1))} title="Zoom out"><ZoomOut size={14} /></button>
        <span style={{ fontSize: 12, color: 'var(--ink-soft)', minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button className="btn btn-sm" onClick={() => setScale((s) => Math.min(2, s + 0.1))} title="Zoom in"><ZoomIn size={14} /></button>
        <button className="btn btn-sm" onClick={fitToWidth} title="Fit"><Maximize size={14} /></button>
        <button className="btn btn-sm" onClick={runEditorPreview} disabled={previewBusy}>
          {previewBusy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} Preview
        </button>
        {canManage && <button className="btn btn-sm btn-primary" onClick={onSave}><CheckCircle2 size={14} /> Save template</button>}
        <button className="btn btn-sm" onClick={onCancel}><ChevronLeft size={14} /> Cancel</button>
      </div>

      <div className="editor-grid" style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr) 360px', gap: 12, alignItems: 'start' }}>
        <style>{`
          .editor-grid { min-width: 0; }
          @media (max-width: 1200px) { .editor-grid { grid-template-columns: 240px minmax(0,1fr) 320px !important; } }
          @media (max-width: 992px) { .editor-grid { grid-template-columns: 1fr !important; } }
        `}</style>
        {/* fields list */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Fields <span style={{ fontWeight: 400 }}>(drag to reorder)</span></div>
          {fields.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No fields yet — click "Add field".</div>}
          {fields.map((f, i) => (
            <div
              key={f.field_key || i}
              draggable
              role="button"
              tabIndex={0}
              onDragStart={() => setListDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setListDrop(i) }}
              onDragEnd={() => { setListDrag(null); setListDrop(null) }}
              onDrop={(e) => {
                e.preventDefault()
                const from = listDrag
                if (from == null || from === i) return
                setDraft((d) => {
                  const next = [...(d.fields || [])]
                  const [moved] = next.splice(from, 1)
                  next.splice(i, 0, moved)
                  return { ...d, fields: next }
                })
                setSelected(i)
                setListDrag(null)
                setListDrop(null)
              }}
              onClick={() => setSelected(i)}
              style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 8, border: selected === i ? '1px solid var(--sage)' : '1px solid var(--line)', background: selected === i ? 'var(--sage-soft,#eef3ea)' : 'transparent', fontSize: 12.5, cursor: 'grab', fontFamily: 'inherit', outline: listDrop === i && listDrag != null && listDrag !== i ? '2px dashed var(--sage)' : 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GripVertical size={13} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{f.display_name || f.field_key}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{f.field_type}{f.required ? ' · required' : ''}</div>
                </div>
                <button
                  type="button"
                  title="Move up"
                  onClick={(e) => { e.stopPropagation(); if (i === 0) return; setDraft((d) => { const next = [...(d.fields || [])]; const [moved] = next.splice(i, 1); next.splice(i - 1, 0, moved); return { ...d, fields: next } }); setSelected(i - 1) }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-soft)' }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  title="Move down"
                  onClick={(e) => { e.stopPropagation(); if (i === fields.length - 1) return; setDraft((d) => { const next = [...(d.fields || [])]; const [moved] = next.splice(i, 1); next.splice(i + 1, 0, moved); return { ...d, fields: next } }); setSelected(i + 1) }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-soft)' }}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* canvas */}
        <div ref={wrapRef} style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg,#f3f4f6)', overflow: 'auto', maxHeight: '70vh' }}>
          <div ref={stageRef} style={{ position: 'relative', width: canvasW * scale, height: canvasH * scale, margin: '0 auto' }}>
            {imgUrl
              ? <img src={imgUrl} alt="certificate" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}><Loader2 size={18} className="spin" /></div>}
            {fields.map((f, i) => {
              const s = f.style || {}
              if (s.hidden) return null
              return (
                <div
                  key={i}
                  onPointerDown={(e) => { setSelected(i); setDrag({ mode: 'move', index: i, startX: e.clientX, startY: e.clientY, orig: { x: s.x || 0, y: s.y || 0, width: s.width || 100, height: s.height || 40 } }) }}
                  style={{
                    position: 'absolute',
                    left: s.x * scale, top: s.y * scale, width: (s.width || 100) * scale, height: (s.height || 40) * scale,
                    border: selected === i ? '1.5px solid var(--sage)' : '1px dashed rgba(0,0,0,.35)',
                    background: 'rgba(255,255,255,.35)', cursor: 'move', overflow: 'hidden', boxSizing: 'border-box',
                  }}
                >
                  <div style={{
                    fontFamily: s.fontFamily || 'Arial', fontSize: (s.fontSize || 24) * scale, fontWeight: s.fontWeight || 600,
                    fontStyle: s.fontStyle || 'normal', color: s.color || '#111', textAlign: s.textAlign || 'center',
                    lineHeight: s.lineHeight || 1.2, letterSpacing: (s.letterSpacing || 0) * scale,
                    width: '100%', height: '100%', display: 'flex', alignItems: s.verticalAlign === 'top' ? 'flex-start' : s.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                    justifyContent: s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'stretch',
                    padding: 2, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                  }}>
                    <span style={{ width: '100%', display: 'block', overflowWrap: 'break-word' }}>
                      {sampleValues[f.field_key] || f.default_value || (f.display_name || f.field_key)}
                    </span>
                  </div>
                  {selected === i && (
                    <div
                      onPointerDown={(e) => { e.stopPropagation(); setDrag({ mode: 'resize', index: i, startX: e.clientX, startY: e.clientY, orig: { x: s.x || 0, y: s.y || 0, width: s.width || 100, height: s.height || 40 } }) }}
                      style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, background: 'var(--sage)', cursor: 'nwse-resize', borderRadius: 2 }}
                    />
                  )}
                </div>
              )
            })}
            {guides && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {guides.vCenter && <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#ec4899' }} />}
                {guides.hCenter && <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#ec4899' }} />}
                {guides.vLeft && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: '#3b82f6' }} />}
                {guides.hTop && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: '#3b82f6' }} />}
                {guides.vRight && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: '#3b82f6' }} />}
                {guides.hBottom && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: '#3b82f6' }} />}
              </div>
            )}
          </div>
        </div>

        {/* properties */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          {!sel && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Select a field to edit its properties.</div>}
          {sel && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Properties</div>
              <label style={{ fontSize: 12 }}>Display name</label>
              <input className="fld" style={{ padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} value={sel.display_name} onChange={(e) => updateField(selected, { display_name: e.target.value })} />
              <label style={{ fontSize: 12 }}>Field key</label>
              <input className="fld" style={{ padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} value={sel.field_key} onChange={(e) => updateField(selected, { field_key: e.target.value })} />
              <label style={{ fontSize: 12 }}>Type</label>
              <select style={{ padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }} value={sel.field_type} onChange={(e) => updateField(selected, { field_type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={{ fontSize: 12 }}>Default value</label>
              <input style={{ padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} value={sel.default_value || ''} onChange={(e) => updateField(selected, { default_value: e.target.value })} />
              {sel.field_type === 'select' && (
                <>
                  <label style={{ fontSize: 12 }}>Options (one per line)</label>
                  <textarea
                    rows={4}
                    style={{ padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
                    placeholder={'Appreciation\nParticipation\nAchievement'}
                    value={sel.options || ''}
                    onChange={(e) => updateField(selected, { options: e.target.value })}
                  />
                </>
              )}
              <label style={{ fontSize: 12 }}>Sample value (preview in editor)</label>
              <input style={{ padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} value={sampleValues[sel.field_key] || ''} onChange={(e) => setSampleValues((v) => ({ ...v, [sel.field_key]: e.target.value }))} placeholder="e.g. Shon Fernandes" />
              <label style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={sel.required !== false} onChange={(e) => updateField(selected, { required: e.target.checked })} /> Required (uncheck to make optional)
              </label>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Text style</div>
              <label style={{ fontSize: 12 }}>Font</label>
              <select style={{ padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }} value={selStyle.fontFamily || 'Arial'} onChange={(e) => patchStyle(selected, { fontFamily: e.target.value })}>
                {CERT_FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Size</label>
                  <input type="number" min={6} value={selStyle.fontSize || 24} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} onChange={(e) => patchStyle(selected, { fontSize: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Weight</label>
                  <select value={String(selStyle.fontWeight || 600)} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }} onChange={(e) => patchStyle(selected, { fontWeight: Number(e.target.value) })}>
                    <option value="400">Normal (400)</option>
                    <option value="600">Semi-bold (600)</option>
                    <option value="700">Bold (700)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label style={{ fontSize: 12, marginRight: 6 }}>Style</label>
                <button type="button" className="btn btn-sm" style={{ padding: '4px 8px', borderColor: Number(selStyle.fontWeight) >= 700 ? 'var(--sage)' : undefined }} onClick={() => patchStyle(selected, { fontWeight: Number(selStyle.fontWeight) >= 700 ? 400 : 700 })}><Bold size={14} /></button>
                <button type="button" className="btn btn-sm" style={{ padding: '4px 8px', borderColor: selStyle.fontStyle === 'italic' ? 'var(--sage)' : undefined }} onClick={() => patchStyle(selected, { fontStyle: selStyle.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic size={14} /></button>
                <label style={{ fontSize: 12, marginLeft: 8 }}>Color</label>
                <input type="color" value={selStyle.color || '#111111'} onChange={(e) => patchStyle(selected, { color: e.target.value })} style={{ width: 34, height: 30, padding: 0, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {alignBtn('left', AlignLeft)}
                {alignBtn('center', AlignCenter)}
                {alignBtn('right', AlignRight)}
                {alignBtn('justify', AlignJustify)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Vertical</label>
                  <select value={selStyle.verticalAlign || 'middle'} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }} onChange={(e) => patchStyle(selected, { verticalAlign: e.target.value })}>
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Line height</label>
                  <input type="number" step="0.1" min={0.8} max={3} value={selStyle.lineHeight ?? 1.2} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} onChange={(e) => patchStyle(selected, { lineHeight: Number(e.target.value) })} />
                </div>
              </div>
              <label style={{ fontSize: 12 }}>Letter spacing</label>
              <input type="number" step="0.5" value={selStyle.letterSpacing ?? 0} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} onChange={(e) => patchStyle(selected, { letterSpacing: Number(e.target.value) })} />
              <label style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={selStyle.autoFit !== false} onChange={(e) => patchStyle(selected, { autoFit: e.target.checked })} /> Auto-fit long text (shrink to fit)
              </label>
              <label style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={!selStyle.hidden} onChange={(e) => patchStyle(selected, { hidden: !e.target.checked })} /> Show this field on canvas
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => duplicateField(selected)}><Copy size={13} /> Duplicate</button>
                <button className="btn btn-sm" style={{ color: '#dc2626' }} onClick={() => removeField(selected)}><Trash2 size={13} /> Delete</button>
              </div>
            </>
          )}
        </div>
      </div>

      {previewUrl && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
            <span>Preview (same renderer as final output)</span>
            <button className="btn btn-sm" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}><X size={13} /> Close</button>
          </div>
          <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

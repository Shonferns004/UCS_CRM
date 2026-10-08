import { useState, useEffect, useRef, useMemo } from 'react'
import { certificateApi } from '../api/certificates'
import { toast } from '../../../components/Toast'
import {
  ArrowLeft, AlignCenter, AlignJustify, AlignLeft, AlignRight, AlertTriangle, Bold,
  Building2, Calendar, ChevronDown, Copy, GripVertical, Italic, Loader2, Maximize2,
  MessageSquare, MoreVertical, Plus, Redo2, RotateCcw, Trash2, Trophy, Undo2, UploadCloud, User,
  Wand2, X, ZoomIn, ZoomOut,
} from 'lucide-react'

export const CERT_FONT_FAMILIES = [
  'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana',
  'Tahoma', 'Courier New', 'Impact', 'Comic Sans MS', 'Segoe UI', 'Bookman Old Style',
  'Poppins', 'Montserrat', 'Open Sans', 'Playfair Display', 'Cinzel', 'Inter', 'Lato',
  'Glacial Indifference', 'Cormorant Garamond', 'Kelvinch', 'Kelvinch Italic', 'Podkova',
]

const FIELD_TYPES = ['text', 'longtext', 'number', 'date', 'time', 'datetime', 'select']

const FIELD_LIBRARY = [
  { type: 'text', key: 'text_field', label: 'Text Field', desc: 'Single line text', Icon: AlignLeft },
  { type: 'longtext', key: 'notes', label: 'Multi-line Text', desc: 'Paragraph or message', Icon: MessageSquare },
  { type: 'text', key: 'name', label: 'Name', desc: 'Participant/Recipient name', Icon: User },
  { type: 'date', key: 'date', label: 'Date', desc: 'Event or issue date', Icon: Calendar },
  { type: 'text', key: 'rank', label: 'Rank', desc: 'Position or achievement rank', Icon: Trophy },
  { type: 'longtext', key: 'description', label: 'Description', desc: 'Custom text or message', Icon: AlignLeft },
  { type: 'text', key: 'organization', label: 'Organization', desc: 'NGO or organization name', Icon: Building2 },
]

const TYPE_LABEL = {
  text: 'Text Field', longtext: 'Multi-line Text', number: 'Number', date: 'Date',
  time: 'Time', datetime: 'Date & Time', select: 'Select',
}

const DATE_FORMATS = [
  ['', 'As typed (YYYY-MM-DD)'],
  ['DD/MM/YYYY', 'DD/MM/YYYY'],
  ['DD MMM YYYY', 'DD MMM YYYY'],
  ['MMMM D, YYYY', 'MMMM D, YYYY'],
]

const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 1]

const DEFAULT_CS = { showGrid: false, gridSize: 10, snapGrid: false, snapGuides: true, showBorders: true, safeArea: false }

const loadCanvasSettings = () => {
  try {
    const raw = localStorage.getItem('ced-canvas-settings')
    return raw ? { ...DEFAULT_CS, ...JSON.parse(raw) } : { ...DEFAULT_CS }
  } catch { return { ...DEFAULT_CS } }
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

const snapOf = (d) => JSON.stringify(d ?? null)

const parseOptions = (s) => String(s || '').split(/[\r\n,;]+/).map((x) => x.trim()).filter(Boolean)

const uniqueKey = (base, fields, selfKey) => {
  const taken = new Set(fields.filter((f) => f.field_key !== selfKey).map((f) => String(f.field_key)))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i += 1
  return `${base}_${i}`
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDateValue(raw, pattern) {
  if (raw == null || raw === '') return raw
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(raw))
  if (!m) return raw
  const [, y, mo, d, hh, mm] = m
  const day = Number(d)
  const month = Number(mo)
  let out
  if (pattern === 'DD/MM/YYYY') out = `${d}/${mo}/${y}`
  else if (pattern === 'DD MMM YYYY') out = `${d} ${MONTHS_SHORT[month - 1] || mo} ${y}`
  else if (pattern === 'MMMM D, YYYY') out = `${MONTHS_LONG[month - 1] || mo} ${day}, ${y}`
  else out = `${y}-${mo}-${d}`
  if (hh && mm) out += ` ${hh}:${mm}`
  return out
}

export function applyDateFormats(tpl, vals) {
  const out = { ...vals }
  for (const f of tpl?.fields || []) {
    const pat = f.style?.dateFormat
    if (!pat || pat === 'YYYY-MM-DD') continue
    if (f.field_type !== 'date' && f.field_type !== 'datetime') continue
    const v = out[f.field_key]
    if (v != null && String(v).trim() !== '') out[f.field_key] = formatDateValue(v, pat)
  }
  return out
}

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
  showBorder: true,
})

export default function CertificateEditorPage({ draft, setDraft, canManage, ngos, onCancel, onSave, onReplaceFile }) {
  const [imgUrl, setImgUrl] = useState(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const [natDims, setNatDims] = useState(null)
  const [zoom, setZoom] = useState(0.5)
  const [zoomFit, setZoomFit] = useState(true)
  const [selKey, setSelKey] = useState(null)
  const [rightTab, setRightTab] = useState('field')
  const [advOpen, setAdvOpen] = useState(false)
  const [drag, setDrag] = useState(null)
  const [guides, setGuides] = useState(null)
  const [hist, setHist] = useState({ past: [], future: [] })
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [replaceError, setReplaceError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewErr, setPreviewErr] = useState('')
  const [deleteIdx, setDeleteIdx] = useState(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [sample, setSample] = useState({})
  const [cs, setCs] = useState(loadCanvasSettings)
  const [listDragIdx, setListDragIdx] = useState(null)
  const [listDropIdx, setListDropIdx] = useState(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoName, setInfoName] = useState('')
  const [infoNgo, setInfoNgo] = useState('')
  const [infoTouched, setInfoTouched] = useState(false)

  const stageRef = useRef(null)
  const wrapRef = useRef(null)
  const fileRef = useRef(null)
  const draftRef = useRef(draft)
  const lastPushRef = useRef({ key: null, t: 0 })

  draftRef.current = draft

  const fields = useMemo(() => draft?.fields || [], [draft])
  const selIdx = useMemo(() => fields.findIndex((f) => f.field_key === selKey), [fields, selKey])
  const sel = selIdx >= 0 ? fields[selIdx] : null
  const canvasW = natDims?.w || draft?.canvas_width || 1920
  const canvasH = natDims?.h || draft?.canvas_height || 1080
  const [baseline, setBaseline] = useState(null)
  const dirty = baseline != null && baseline !== snapOf(draft)

  useEffect(() => { setBaseline(snapOf(draft)) }, [draft?.id, draft?.version])

  useEffect(() => {
    const list = draft?.fields
    if (!list?.length) return
    let changed = false
    const normalized = list.map((f, i) => {
      const s = f.style || {}
      if (Number(s.width) > 0 && Number(s.height) > 0) return f
      changed = true
      return {
        ...f,
        style: {
          ...s,
          x: Number(s.x) || Math.round(canvasW * 0.1),
          y: Number(s.y) || Math.round(canvasH * 0.15 + i * 60),
          width: Math.round(canvasW * 0.5),
          height: Math.round(canvasH * 0.08),
        },
      }
    })
    if (!changed) return
    const next = { ...draft, fields: normalized }
    setDraft(() => next)
    setBaseline(snapOf(next))
  }, [draft?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem('ced-canvas-settings', JSON.stringify(cs)) } catch { /* ignore */ }
  }, [cs])

  useEffect(() => {
    let cancelled = false
    let url = null
    if (!draft?.id) return undefined
    setImgFailed(false)
    certificateApi.getTemplateFile(draft.id)
      .then((r) => r.arrayBuffer())
      .catch(() => null)
      .then((buf) => {
        if (!buf || cancelled) return
        url = URL.createObjectURL(new Blob([buf]))
        if (!cancelled) setImgUrl(url)
      })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [draft?.id, draft?.version, retryTick])

  const fitZoom = () => {
    const el = wrapRef.current
    const w = el?.clientWidth
    const h = el?.clientHeight
    if (!w || !h) return 0.5
    return Math.min(1, Math.max(0.05, Math.min((w - 32) / canvasW, (h - 32) / canvasH)))
  }

  const applyFit = () => { setZoom(fitZoom()); setZoomFit(true) }

  useEffect(() => { applyFit() }, [canvasW, canvasH]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!zoomFit) return undefined
    const onResize = () => setZoom(fitZoom())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [zoomFit, canvasW]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return undefined
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const pushSnap = (before, groupKey) => {
    const now = Date.now()
    const sameBurst = !!groupKey && lastPushRef.current.key === groupKey && now - lastPushRef.current.t < 900
    lastPushRef.current = { key: groupKey || null, t: now }
    if (sameBurst) return
    setHist((h) => (h.past[h.past.length - 1] === before
      ? h
      : { past: [...h.past, before].slice(-80), future: [] }))
  }

  const mutate = (updater, groupKey) => {
    pushSnap(snapOf(draftRef.current), groupKey)
    setDraft(updater)
  }

  const undo = () => {
    if (!hist.past.length) return
    const prev = hist.past[hist.past.length - 1]
    const cur = snapOf(draftRef.current)
    setDraft(JSON.parse(prev))
    setHist({ past: hist.past.slice(0, -1), future: [...hist.future, cur] })
  }

  const redo = () => {
    if (!hist.future.length) return
    const next = hist.future[hist.future.length - 1]
    const cur = snapOf(draftRef.current)
    setDraft(JSON.parse(next))
    setHist({ past: [...hist.past, cur], future: hist.future.slice(0, -1) })
  }

  const updateField = (key, patch, groupKey) => mutate((d) => ({
    ...d,
    fields: (d.fields || []).map((f) => (f.field_key === key ? { ...f, ...patch } : f)),
  }), groupKey || `u:${key}:${Object.keys(patch)[0]}`)

  const patchStyle = (key, patch, groupKey) => mutate((d) => ({
    ...d,
    fields: (d.fields || []).map((f) => (f.field_key === key ? { ...f, style: { ...(f.style || {}), ...patch } } : f)),
  }), groupKey || `s:${key}:${Object.keys(patch)[0]}`)

  const addPreset = (preset, at) => {
    const list = draftRef.current?.fields || []
    const key = uniqueKey(preset.key, list)
    const st = defaultStyle(canvasW, canvasH, list.length)
    let x = st.x
    let y = st.y
    if (at) {
      x = clamp(Math.round(at.x - st.width / 2), 0, Math.max(0, canvasW - st.width))
      y = clamp(Math.round(at.y - st.height / 2), 0, Math.max(0, canvasH - st.height))
    }
    const field = {
      field_key: key,
      display_name: preset.label,
      field_type: preset.type,
      required: true,
      default_value: '',
      in_template: true,
      options: preset.type === 'select' ? '' : '',
      style: { ...st, x, y },
    }
    mutate((d) => ({ ...d, fields: [...(d.fields || []), field] }))
    setSelKey(key)
    setRightTab('field')
    toast('Field added', 'success')
  }

  const duplicateField = (idx) => {
    const list = draftRef.current?.fields || []
    const f = list[idx]
    if (!f) return
    const key = uniqueKey(String(f.field_key || 'field'), list)
    const copy = {
      ...f,
      field_key: key,
      display_name: `${f.display_name || f.field_key} (copy)`,
      style: { ...(f.style || {}), x: clamp((f.style?.x || 0) + 40, 0, canvasW - (f.style?.width || 100)), y: clamp((f.style?.y || 0) + 40, 0, canvasH - (f.style?.height || 40)) },
    }
    mutate((d) => {
      const next = [...(d.fields || [])]
      next.splice(idx + 1, 0, copy)
      return { ...d, fields: next }
    })
    setSelKey(key)
    toast('Field duplicated', 'success')
  }

  const confirmDelete = () => {
    const idx = deleteIdx
    if (idx == null) return
    const list = draftRef.current?.fields || []
    const f = list[idx]
    mutate((d) => ({ ...d, fields: (d.fields || []).filter((_, i) => i !== idx) }))
    setDeleteIdx(null)
    if (f && f.field_key === selKey) setSelKey(null)
    toast('Field deleted', 'success')
  }

  const reorder = (from, to) => {
    if (from == null || to == null || from === to) return
    mutate((d) => {
      const next = [...(d.fields || [])]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { ...d, fields: next }
    })
  }

  const startFieldDrag = (mode, handle, key, e) => {
    e.stopPropagation()
    const list = draftRef.current?.fields || []
    const idx = list.findIndex((f) => f.field_key === key)
    if (idx < 0) return
    const s = list[idx].style || {}
    setSelKey(key)
    setDrag({
      mode, handle, key,
      startX: e.clientX, startY: e.clientY,
      orig: { x: s.x || 0, y: s.y || 0, width: s.width || 100, height: s.height || 40 },
      before: snapOf(draftRef.current),
    })
  }

  useEffect(() => {
    if (!drag) return undefined
    const onMove = (e) => {
      const dx = (e.clientX - drag.startX) / zoom
      const dy = (e.clientY - drag.startY) / zoom
      const list = draftRef.current?.fields || []
      const idx = list.findIndex((f) => f.field_key === drag.key)
      if (idx < 0) return
      if (drag.mode === 'move') {
        let nx = drag.orig.x + dx
        let ny = drag.orig.y + dy
        if (cs.snapGrid) {
          const g = Math.max(1, Number(cs.gridSize) || 10)
          nx = Math.round(nx / g) * g
          ny = Math.round(ny / g) * g
        }
        const g2 = { vCenter: false, hCenter: false, vLeft: false, hTop: false, vRight: false, hBottom: false }
        if (cs.snapGuides) {
          const th = 10 / Math.max(zoom, 0.05)
          const fw = drag.orig.width
          const fh = drag.orig.height
          if (Math.abs(nx + fw / 2 - canvasW / 2) < th) { nx = canvasW / 2 - fw / 2; g2.vCenter = true }
          if (Math.abs(ny + fh / 2 - canvasH / 2) < th) { ny = canvasH / 2 - fh / 2; g2.hCenter = true }
          if (Math.abs(nx) < th) { nx = 0; g2.vLeft = true }
          if (Math.abs(ny) < th) { ny = 0; g2.hTop = true }
          if (Math.abs(nx + fw - canvasW) < th) { nx = canvasW - fw; g2.vRight = true }
          if (Math.abs(ny + fh - canvasH) < th) { ny = canvasH - fh; g2.hBottom = true }
        }
        setGuides(g2)
        setDraft((d) => ({
          ...d,
          fields: (d.fields || []).map((f, i) => (i === idx
            ? { ...f, style: { ...(f.style || {}), x: clamp(Math.round(nx), 0, Math.max(0, canvasW - (f.style?.width || 100))), y: clamp(Math.round(ny), 0, Math.max(0, canvasH - (f.style?.height || 40))) } }
            : f)),
        }))
        return
      }
      let x = drag.orig.x
      let y = drag.orig.y
      let width = drag.orig.width
      let height = drag.orig.height
      const h = drag.handle || 'se'
      if (h.includes('e')) width = drag.orig.width + dx
      if (h.includes('w')) {
        const nx = clamp(drag.orig.x + dx, 0, drag.orig.x + drag.orig.width - 40)
        width = drag.orig.width + (drag.orig.x - nx)
        x = nx
      }
      if (h.includes('s')) height = drag.orig.height + dy
      if (h.includes('n')) {
        const ny = clamp(drag.orig.y + dy, 0, drag.orig.y + drag.orig.height - 16)
        height = drag.orig.height + (drag.orig.y - ny)
        y = ny
      }
      width = clamp(width, 40, Math.max(40, canvasW - x))
      height = clamp(height, 16, Math.max(16, canvasH - y))
      setDraft((d) => ({
        ...d,
        fields: (d.fields || []).map((f, i) => (i === idx ? { ...f, style: { ...(f.style || {}), x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) } } : f)),
      }))
    }
    const onUp = () => {
      if (drag.before) pushSnap(drag.before, null)
      setDrag(null)
      setGuides(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [drag, zoom, cs, canvasW, canvasH]) // eslint-disable-line react-hooks/exhaustive-deps

  const stepZoom = (dir) => {
    if (dir > 0) setZoom(ZOOMS.find((s) => s > zoom + 0.001) ?? 1)
    else setZoom([...ZOOMS].reverse().find((s) => s < zoom - 0.001) ?? 0.25)
    setZoomFit(false)
  }

  const alignField = (how) => {
    if (!sel) return
    const s = sel.style || {}
    const w = s.width || 100
    const h = s.height || 40
    const pos = {
      left: { x: 0 }, center: { x: Math.round((canvasW - w) / 2) }, right: { x: canvasW - w },
      top: { y: 0 }, middle: { y: Math.round((canvasH - h) / 2) }, bottom: { y: canvasH - h },
    }[how]
    patchStyle(sel.field_key, pos, `align:${sel.field_key}:${how}`)
  }

  const moveByKey = (key, dx, dy) => {
    const list = draftRef.current?.fields || []
    const f = list.find((x) => x.field_key === key)
    if (!f) return
    const s = f.style || {}
    patchStyle(key, {
      x: clamp((s.x || 0) + dx, 0, Math.max(0, canvasW - (s.width || 100))),
      y: clamp((s.y || 0) + dy, 0, Math.max(0, canvasH - (s.height || 40))),
    }, `kb:${key}`)
  }

  const validate = (d) => {
    const errs = {}
    if (!String(d?.name || '').trim()) errs.name = 'Template name is required.'
    if (!d?.ngo_id) errs.ngo = 'Please select an NGO.'
    const list = d?.fields || []
    if (!list.length) errs.fields = 'Add at least one field before saving.'
    const seen = new Set()
    list.forEach((f, i) => {
      const k = String(f.field_key || '').trim()
      if (!k) errs[`key${i}`] = 'Field key is required.'
      else if (seen.has(k)) errs[`key${i}`] = 'Field key already exists.'
      else seen.add(k)
      if (!String(f.display_name || '').trim()) errs[`name${i}`] = 'Display name is required.'
      if (f.field_type === 'select') {
        const opts = parseOptions(f.options)
        if (!opts.length) errs[`opts${i}`] = 'Add at least one option.'
        else if (new Set(opts).size !== opts.length) errs[`opts${i}`] = 'Options must be unique.'
      }
      const s = f.style || {}
      if (!(Number(s.width) > 0) || !(Number(s.height) > 0)) errs[`geom${i}`] = 'Field size must be greater than zero.'
    })
    return errs
  }

  const errors = submitted ? validate(draft) : {}

  const doSave = async () => {
    if (saving) return false
    setSubmitted(true)
    const errs = validate(draftRef.current)
    if (Object.keys(errs).length) {
      const list = draftRef.current?.fields || []
      const idx = list.findIndex((_, i) => errs[`key${i}`] || errs[`name${i}`] || errs[`opts${i}`] || errs[`geom${i}`])
      if (idx >= 0) {
        setSelKey(list[idx].field_key)
        setRightTab('field')
      }
      if (errs.name || errs.ngo) {
        setInfoTouched(true)
        setInfoOpen(true)
      }
      toast(errs.name || errs.ngo || errs.fields
        || (idx >= 0 ? (errs[`key${idx}`] || errs[`name${idx}`] || errs[`opts${idx}`] || errs[`geom${idx}`])
          : 'Fix the highlighted errors before saving.'), 'error')
      return false
    }
    setSaving(true)
    try {
      const ok = await onSave()
      if (ok !== false) {
        setBaseline(snapOf(draftRef.current))
        return true
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const runPreview = async () => {
    if (!draft?.id) return
    setPreviewOpen(true)
    setPreviewErr('')
    setPreviewBusy(true)
    try {
      const values = {}
      for (const f of fields) values[f.field_key] = sample[f.field_key] ?? f.default_value ?? ''
      const resp = await certificateApi.preview({ template_id: draft.id, field_values: applyDateFormats(draft, values) })
      if (!resp.ok) {
        let msg = 'Preview failed'
        try { msg = (await resp.json()).message || msg } catch { /* keep default */ }
        throw new Error(msg)
      }
      const blob = await resp.blob()
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob) })
    } catch (e) {
      setPreviewErr(e.message || 'Preview failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  const doReplace = async (file) => {
    setReplaceError('')
    if (!file) return
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setReplaceError('Unsupported file type — use PNG, JPG, JPEG or WEBP.')
      toast('Unsupported file type', 'error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setReplaceError('File exceeds the maximum allowed size (10 MB).')
      toast('File exceeds the maximum allowed size', 'error')
      return
    }
    setReplacing(true)
    try {
      const ok = await onReplaceFile(file)
      if (ok !== false) toast('Background replaced', 'success')
    } catch (e) {
      setReplaceError(e?.message || 'Upload failed — the previous background was kept.')
    } finally {
      setReplacing(false)
    }
  }

  const requestLeave = () => {
    if (dirty) setLeaveOpen(true)
    else onCancel()
  }

  const openInfo = () => {
    setInfoName(draft?.name || '')
    setInfoNgo(draft?.ngo_id || '')
    setInfoTouched(false)
    setInfoOpen(true)
  }

  const saveInfo = () => {
    setInfoTouched(true)
    if (!String(infoName || '').trim() || !infoNgo) return
    const name = infoName.trim()
    const ngo = String(infoNgo)
    if (name === String(draft?.name || '').trim() && ngo === String(draft?.ngo_id || '')) {
      setInfoOpen(false)
      return
    }
    mutate((d) => ({ ...d, name, ngo_id: ngo }), 'tpl-info')
    setInfoOpen(false)
    toast('Details updated', 'success')
  }

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); return }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (e.key === 'Escape') {
        if (infoOpen) setInfoOpen(false)
        else if (previewOpen) setPreviewOpen(false)
        else if (deleteIdx != null) setDeleteIdx(null)
        else if (leaveOpen) setLeaveOpen(false)
        else if (sheet) setSheet(null)
        else if (selKey) setSelKey(null)
        return
      }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); setDeleteIdx(selIdx); return }
      if (sel && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (dx || dy) moveByKey(sel.field_key, dx, dy)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onStageDrop = (e) => {
    e.preventDefault()
    const raw = e.dataTransfer?.getData('text/ced-field-type')
    if (!raw) return
    const [type, key, label] = raw.split('|')
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) { addPreset({ type, key, label }); return }
    addPreset({ type, key, label }, { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom })
  }

  const typeName = sel ? (TYPE_LABEL[sel.field_type] || sel.field_type) : ''
  const errKey = selIdx >= 0 ? errors[`key${selIdx}`] : null
  const errName = selIdx >= 0 ? errors[`name${selIdx}`] : null
  const errOpts = selIdx >= 0 ? errors[`opts${selIdx}`] : null
  const errGeom = selIdx >= 0 ? errors[`geom${selIdx}`] : null
  const selStyle = sel?.style || {}

  return (
    <div className="ced">
      <style>{`
        .ced { --blue:#2563EB; --blue-l:#EFF6FF; --purple:#7C3AED; --green:#10B981; --amber:#F59E0B; --red:#EF4444;
          --bg:#F8FAFF; --surface:#FFFFFF; --line:#E5E7EB; --ink:#0F172A; --ink2:#64748B; --ink3:#94A3B8;
          font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); box-sizing:border-box;
          height:100%; display:flex; flex-direction:column; overflow:hidden; }
        .ced *, .ced *::before, .ced *::after { box-sizing:border-box; }
        .ced h1,.ced h2,.ced h3 { margin:0; }
        .ced-inp { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:8px; font-size:13px; font-family:inherit;
          color:var(--ink); background:#fff; outline:none; transition:border-color .15s, box-shadow .15s; }
        .ced-inp:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(37,99,235,.12); }
        .ced-inp.err { border-color:var(--red); }
        .ced-inp:disabled { background:#F8FAFC; color:var(--ink3); }
        .ced-lbl { font-size:12px; font-weight:600; color:var(--ink2); display:block; margin-bottom:4px; }
        .ced-err { font-size:11.5px; color:var(--red); margin-top:4px; }
        .ced-ibtn { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:32px; height:32px; padding:0 9px;
          border:1px solid var(--line); border-radius:8px; background:#fff; color:#334155; font-size:12.5px; font-family:inherit;
          cursor:pointer; transition:background .15s, border-color .15s, color .15s; }
        .ced-ibtn:hover:not(:disabled) { background:var(--blue-l); border-color:#BFDBFE; color:var(--blue); }
        .ced-ibtn:disabled { opacity:.45; cursor:not-allowed; }
        .ced-ibtn:focus-visible, .ced-btn:focus-visible, .ced-back:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
        .ced-ibtn.primary { background:var(--blue); border-color:var(--blue); color:#fff; }
        .ced-ibtn.primary:hover:not(:disabled) { background:#1D4ED8; border-color:#1D4ED8; color:#fff; }
        .ced-ibtn.danger { color:var(--red); }
        .ced-ibtn.danger:hover:not(:disabled) { background:#FEF2F2; border-color:#FECACA; color:var(--red); }
        .ced-ibtn.on { background:var(--blue-l); border-color:#BFDBFE; color:var(--blue); }
        .ced-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:36px; padding:0 14px; border-radius:9px;
          font-size:13px; font-weight:600; font-family:inherit; cursor:pointer; border:1px solid var(--line); background:#fff; color:#334155;
          transition:background .15s, border-color .15s, color .15s, box-shadow .15s; white-space:nowrap; }
        .ced-btn:hover:not(:disabled) { background:#F8FAFC; }
        .ced-btn:disabled { opacity:.55; cursor:not-allowed; }
        .ced-btn.primary { background:var(--blue); border-color:var(--blue); color:#fff; box-shadow:0 1px 3px rgba(37,99,235,.35); }
        .ced-btn.primary:hover:not(:disabled) { background:#1D4ED8; border-color:#1D4ED8; }
        .ced-back { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:9px; border:1px solid var(--line);
          background:#fff; color:#334155; cursor:pointer; flex-shrink:0; }
        .ced-back:hover { background:var(--blue-l); border-color:#BFDBFE; color:var(--blue); }

        .ced-head { display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--line); border-radius:12px;
          padding:10px 14px; box-shadow:0 1px 3px rgba(15,23,42,.05); flex-wrap:wrap; flex-shrink:0; }
        .ced-head-titles { min-width:0; flex:1; }
        .ced-head h1 { font-size:18px; line-height:1.25; font-weight:700; letter-spacing:-.01em; }
        .ced-unsaved { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; color:#B45309; background:#FFFBEB;
          border:1px solid #FDE68A; border-radius:999px; padding:4px 10px; white-space:nowrap; }
        .ced-unsaved::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--amber); }
        .ced-head-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .ced-only-narrow { display:none; }

        .ced-work { margin-top:10px; display:grid; grid-template-columns:230px minmax(0,1fr) 300px; gap:10px;
          min-width:0; flex:1; min-height:0; }
        .ced-panel { position:relative; background:var(--surface); border:1px solid var(--line); border-radius:12px; display:flex; flex-direction:column;
          min-height:0; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,.05); }
        .ced-panel-body { flex:1; min-height:0; overflow-y:auto; padding:10px; }
        .ced-panel-head { padding:10px 12px 8px; border-bottom:1px solid var(--line); }
        .ced-panel-head h2 { font-size:15px; font-weight:700; }
        .ced-panel-head .ph-sub { font-size:12px; color:var(--blue); font-weight:600; margin-top:2px; }
        .ced-panel-head .ph-desc { font-size:12px; color:var(--ink2); margin-top:6px; line-height:1.45; }
        .ced-sec-title { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--ink3); margin:14px 0 8px; }
        .ced-sec-title:first-child { margin-top:0; }

        .ced-type-item { display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:9px 10px; border:1px solid var(--line);
          border-radius:10px; background:#fff; cursor:grab; font-family:inherit; margin-bottom:8px; transition:border-color .15s, background .15s, transform .15s; }
        .ced-type-item:hover { border-color:#BFDBFE; background:var(--blue-l); }
        .ced-type-item:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }
        .ced-type-item:active { cursor:grabbing; transform:scale(.99); }
        .ced-type-item .tico { width:30px; height:30px; border-radius:8px; background:#F1F5F9; color:#475569; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ced-type-item:hover .tico { background:#fff; color:var(--blue); }
        .ced-type-item .tlab { font-size:13px; font-weight:600; color:var(--ink); }
        .ced-type-item .tdesc { font-size:11.5px; color:var(--ink3); margin-top:1px; }
        .ced-type-item .tadd { margin-left:auto; color:var(--ink3); opacity:0; transition:opacity .15s; }
        .ced-type-item:hover .tadd, .ced-type-item:focus-visible .tadd { opacity:1; color:var(--blue); }
        .ced-type-item .tgrip { color:#CBD5E1; flex-shrink:0; }

        .ced-list-item { display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:8px 9px; border:1px solid var(--line);
          border-radius:9px; background:#fff; cursor:pointer; font-family:inherit; margin-bottom:6px; transition:border-color .15s, background .15s; }
        .ced-list-item:hover { border-color:#BFDBFE; }
        .ced-list-item:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }
        .ced-list-item.sel { border-color:var(--blue); background:var(--blue-l); }
        .ced-list-item.err { border-color:var(--red); background:#FEF2F2; }
        .ced-list-item.drop { outline:2px dashed var(--blue); outline-offset:-2px; }
        .ced-list-item .lname { font-size:12.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ced-list-item .ltype { font-size:11px; color:var(--ink3); }
        .ced-empty { font-size:12.5px; color:var(--ink3); text-align:center; padding:18px 8px; border:1px dashed var(--line); border-radius:10px; line-height:1.5; }

        .ced-canvas-col { display:flex; flex-direction:column; min-width:0; min-height:0; gap:10px; }
        .ced-canvas-bar { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:8px 12px; display:flex;
          align-items:center; gap:12px; flex-wrap:wrap; box-shadow:0 1px 3px rgba(15,23,42,.05); position:relative; z-index:20; }
        .ced-canvas-bar h2 { font-size:14px; font-weight:700; }
        .ced-canvas-bar .csub { font-size:11.5px; color:var(--ink2); margin-top:1px; }
        .ced-tools { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-left:auto; }
        .ced-zoom-val { min-width:52px; text-align:center; font-size:12px; font-weight:600; color:#334155; background:#F1F5F9;
          border:1px solid var(--line); border-radius:8px; height:32px; line-height:30px; cursor:pointer; user-select:none; }
        .ced-stage { position:relative; flex:1; min-height:0; background:#F1F5F9; border:1px solid var(--line); border-radius:12px; overflow:auto; }
        .ced-stage-pad { width:max-content; min-width:100%; margin:0 auto; padding:14px; display:flex; justify-content:center; }
        .ced-paper { position:relative; background:#fff; border-radius:3px; box-shadow:0 8px 30px rgba(15,23,42,.16); overflow:hidden; flex-shrink:0; }
        .ced-paper img.ced-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; display:block; user-select:none; pointer-events:none; }
        .ced-skel { position:absolute; inset:0; background:linear-gradient(100deg,#F1F5F9 30%,#E2E8F0 50%,#F1F5F9 70%); background-size:200% 100%;
          animation:cedShimmer 1.3s linear infinite; display:flex; align-items:center; justify-content:center; color:var(--ink3); font-size:12.5px; gap:8px; }
        @keyframes cedShimmer { to { background-position:-200% 0; } }
        .ced-broken { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
          background:#F8FAFC; color:var(--ink2); font-size:13px; text-align:center; padding:20px; }
        .ced-fld { position:absolute; overflow:hidden; cursor:move; touch-action:none; }
        .ced-fld-txt { width:100%; height:100%; display:flex; padding:2px; word-break:break-word; white-space:pre-wrap; overflow-wrap:break-word; pointer-events:none; }
        .ced-handle { position:absolute; width:11px; height:11px; background:#fff; border:2px solid var(--blue); border-radius:3px; z-index:2; }
        .ced-handle.se { right:-6px; bottom:-6px; cursor:nwse-resize; }
        .ced-handle.sw { left:-6px; bottom:-6px; cursor:nesw-resize; }
        .ced-handle.ne { right:-6px; top:-6px; cursor:nesw-resize; }
        .ced-handle.nw { left:-6px; top:-6px; cursor:nwse-resize; }
        .ced-guide { position:absolute; background:#EC4899; pointer-events:none; z-index:3; }
        .ced-safe { position:absolute; inset:4%; border:1px dashed rgba(37,99,235,.55); border-radius:4px; pointer-events:none; z-index:1; }

        .ced-tabs { display:flex; border-bottom:1px solid var(--line); background:#F8FAFC; }
        .ced-tab { flex:1; padding:11px 8px; border:none; background:transparent; font-size:12.5px; font-weight:600; color:var(--ink2);
          font-family:inherit; cursor:pointer; border-bottom:2px solid transparent; transition:color .15s, border-color .15s, background .15s; }
        .ced-tab:hover { color:var(--ink); background:#fff; }
        .ced-tab.active { color:var(--blue); border-bottom-color:var(--blue); background:#fff; }
        .ced-prop-head { display:flex; align-items:center; gap:10px; padding-bottom:10px; border-bottom:1px solid var(--line); margin-bottom:12px; }
        .ced-prop-head .pico { width:34px; height:34px; border-radius:9px; background:var(--blue-l); color:var(--blue); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ced-prop-head .pname { font-size:14px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ced-prop-head .ptype { font-size:11.5px; color:var(--ink3); }
        .ced-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .ced-field { margin-bottom:11px; min-width:0; }
        .ced-btnrow { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .ced-adv { border-top:1px solid var(--line); margin-top:12px; padding-top:10px; }
        .ced-adv-btn { display:flex; align-items:center; justify-content:space-between; width:100%; padding:8px 10px; border:1px solid var(--line);
          border-radius:9px; background:#F8FAFC; font-size:12.5px; font-weight:600; color:var(--ink); font-family:inherit; cursor:pointer; }
        .ced-adv-btn:hover { background:var(--blue-l); border-color:#BFDBFE; }
        .ced-check { display:flex; align-items:flex-start; gap:9px; font-size:12.5px; color:#334155; padding:7px 0; cursor:pointer; line-height:1.4; }
        .ced-check input { margin-top:2px; accent-color:var(--blue); width:15px; height:15px; flex-shrink:0; }
        .ced-toggle { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 0; border-bottom:1px solid #F1F5F9; font-size:12.5px; color:#334155; }
        .ced-toggle:last-child { border-bottom:none; }
        .ced-switch { position:relative; width:36px; height:20px; flex-shrink:0; }
        .ced-switch input { position:absolute; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; }
        .ced-switch i { position:absolute; inset:0; background:#CBD5E1; border-radius:999px; transition:background .15s; pointer-events:none; }
        .ced-switch i::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; background:#fff; border-radius:50%;
          transition:transform .15s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
        .ced-switch input:checked + i { background:var(--blue); }
        .ced-switch input:checked + i::after { transform:translateX(16px); }
        .ced-switch input:focus-visible + i { outline:2px solid var(--blue); outline-offset:2px; }

        .ced-backdrop { position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:499; display:none; }
        .ced-backdrop.show { display:block; }
        .ced-panel-close { display:none; }

        .ced-modal-overlay { position:fixed; inset:0; z-index:1000; background:rgba(15,23,42,.55); display:flex; align-items:center;
          justify-content:center; padding:20px; animation:cedFade .15s ease; }
        @keyframes cedFade { from { opacity:0 } to { opacity:1 } }
        .ced-modal { background:#fff; border-radius:16px; box-shadow:0 24px 60px rgba(15,23,42,.28); width:100%; max-width:520px;
          overflow:hidden; animation:cedPop .16s ease; }
        .ced-modal.wide { max-width:min(960px, 94vw); }
        @keyframes cedPop { from { opacity:0; transform:translateY(8px) scale(.985) } to { opacity:1; transform:none } }
        .ced-modal-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 16px; border-bottom:1px solid var(--line); }
        .ced-modal-head h3 { font-size:15px; font-weight:700; }
        .ced-modal-body { padding:16px; max-height:76vh; overflow:auto; }
        .ced-modal-foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid var(--line); background:#F8FAFC; }
        .ced-note { display:flex; gap:8px; align-items:flex-start; font-size:12px; color:#92400E; background:#FFFBEB; border:1px solid #FDE68A;
          border-radius:9px; padding:8px 10px; margin-bottom:12px; line-height:1.45; }
        .ced-prev-wrap { background:#F1F5F9; border-radius:10px; padding:12px; display:flex; align-items:center; justify-content:center; min-height:220px; }
        .ced-prev-wrap img { max-width:100%; max-height:60vh; border-radius:6px; box-shadow:0 6px 20px rgba(15,23,42,.14); background:#fff; }

        @media (max-width: 1199px) {
          .ced-work { grid-template-columns:210px minmax(0,1fr) 280px; }
          .ced-head h1 { font-size:17px; }
        }
        @media (max-width: 1024px) {
          .ced-work { grid-template-columns:minmax(0,1fr); }
          .ced-only-narrow { display:inline-flex; }
          .ced-panel { position:fixed; top:0; bottom:0; width:min(340px,88vw); border-radius:0; z-index:500; max-height:none; }
          .ced-left { left:0; transform:translateX(-103%); transition:transform .2s ease; }
          .ced-right { right:0; transform:translateX(103%); transition:transform .2s ease; }
          .ced-left.open, .ced-right.open { transform:none; box-shadow:0 12px 44px rgba(15,23,42,.22); }
          .ced-panel-close { display:inline-flex; position:absolute; top:10px; right:10px; z-index:2; }
          .ced-panel-head { padding-right:52px; }
        }
        @media (min-width: 1025px) { .ced-backdrop.show { display:none; } }
        @media (max-width: 767px) {
          .ced-head { padding:12px; gap:10px; }
          .ced-head h1 { font-size:17px; }
          .ced-head-actions { width:100%; justify-content:flex-end; }
          .ced-unsaved { order:3; }
          .ced-panel { top:auto; left:0; right:0; width:auto; max-height:74vh; border-radius:18px 18px 0 0;
            transform:translateY(103%); transition:transform .2s ease; }
          .ced-left.open, .ced-right.open { transform:none; }
          .ced-tools { margin-left:0; width:100%; }
          .ced-btn { height:40px; }
          .ced-ibtn { min-width:36px; height:36px; }
        }
      `}</style>

      <header className="ced-head">
        <button type="button" className="ced-back" onClick={requestLeave} aria-label="Back to templates" title="Back">
          <ArrowLeft size={17} />
        </button>
        <div className="ced-head-titles" style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <h1 style={{ whiteSpace: 'nowrap' }}>Edit Certificate Template</h1>
          {draft?.name && (
            <span style={{ fontSize: 13, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={draft.name}>{draft.name}</span>
          )}
        </div>
        {dirty && <span className="ced-unsaved">Unsaved changes</span>}
        <div className="ced-head-actions">
          <button type="button" className="ced-ibtn" onClick={openInfo} title="Template details — name & NGO" aria-label="Edit template details"><MoreVertical size={15} /></button>
          <button type="button" className="ced-btn" onClick={runPreview} title="Preview the generated certificate">
            <Wand2 size={15} /> Preview
          </button>
          <button type="button" className="ced-btn" onClick={requestLeave}>Cancel</button>
          {canManage && (
            <button type="button" className="ced-btn primary" onClick={doSave} disabled={saving} title="Save template (Ctrl+S)">
              {saving ? <><Loader2 size={15} style={{ animation: 'cedspin .8s linear infinite' }} /> Saving…</> : <>Save Template</>}
            </button>
          )}
        </div>
      </header>

      <style>{`@keyframes cedspin { to { transform:rotate(360deg) } }`}</style>

      <div className="ced-work">
        <aside className={`ced-panel ced-left ${sheet === 'fields' ? 'open' : ''}`} aria-label="Field library">
          <button type="button" className="ced-ibtn ced-panel-close" onClick={() => setSheet(null)} aria-label="Close fields panel"><X size={15} /></button>
          <div className="ced-panel-head">
            <h2>Fields</h2>
            <div className="ph-sub">Drag to add</div>
            <div className="ph-desc">Add dynamic fields to your certificate. Drag and drop or click to add.</div>
          </div>
          <div className="ced-panel-body">
            <div className="ced-sec-title">Field types</div>
            {FIELD_LIBRARY.map((p) => (
              <button
                key={p.key}
                type="button"
                className="ced-type-item"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/ced-field-type', `${p.type}|${p.key}|${p.label}`); e.dataTransfer.effectAllowed = 'copy' }}
                onClick={() => addPreset(p)}
                title={`Add ${p.label}`}
              >
                <span className="tico"><p.Icon size={15} /></span>
                <span style={{ minWidth: 0 }}>
                  <span className="tlab" style={{ display: 'block' }}>{p.label}</span>
                  <span className="tdesc" style={{ display: 'block' }}>{p.desc}</span>
                </span>
                <span className="tadd"><Plus size={15} /></span>
                <span className="tgrip"><GripVertical size={14} /></span>
              </button>
            ))}

            <div className="ced-sec-title">On this certificate ({fields.length})</div>
            {errors.fields && <div className="ced-err" style={{ marginTop: -4, marginBottom: 8 }}>{errors.fields}</div>}
            {fields.length === 0 ? (
              <div className="ced-empty">No fields yet.<br />Click a field type above or drag it onto the canvas.</div>
            ) : fields.map((f, i) => {
              const itemErr = errors[`key${i}`] || errors[`name${i}`] || errors[`opts${i}`] || errors[`geom${i}`]
              return (
              <div
                key={f.field_key || i}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={() => setListDragIdx(i)}
                onDragOver={(e) => { e.preventDefault(); setListDropIdx(i) }}
                onDragEnd={() => { setListDragIdx(null); setListDropIdx(null) }}
                onDrop={(e) => { e.preventDefault(); reorder(listDragIdx, i); setListDragIdx(null); setListDropIdx(null) }}
                onClick={() => { setSelKey(f.field_key); setRightTab('field') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelKey(f.field_key); setRightTab('field') }
                  if (e.altKey && e.key === 'ArrowUp' && i > 0) { e.preventDefault(); reorder(i, i - 1) }
                  if (e.altKey && e.key === 'ArrowDown' && i < fields.length - 1) { e.preventDefault(); reorder(i, i + 1) }
                }}
                className={`ced-list-item ${selKey === f.field_key ? 'sel' : ''} ${itemErr ? 'err' : ''} ${listDropIdx === i && listDragIdx != null && listDragIdx !== i ? 'drop' : ''}`}
                title={itemErr || 'Click to edit · drag to reorder · Alt+↑/↓ to move'}
              >
                <GripVertical size={14} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="lname" style={{ display: 'block' }}>{f.display_name || f.field_key || 'Untitled'}</span>
                  <span className="ltype" style={{ display: 'block' }}>{TYPE_LABEL[f.field_type] || f.field_type}{f.required ? ' · required' : ' · optional'}{f.style?.hidden ? ' · hidden' : ''}</span>
                  {itemErr && <span className="ced-err" style={{ display: 'block', marginTop: 2 }}>{itemErr}</span>}
                </span>
              </div>
              )
            })}
          </div>
        </aside>

        <section className="ced-canvas-col" aria-label="Certificate canvas">
          <div className="ced-canvas-bar">
            <div style={{ minWidth: 0 }}>
              <h2>Canvas</h2>
              <div className="csub">Drag fields, resize and position them on the certificate.</div>
            </div>
            <div className="ced-tools">
              <button type="button" className="ced-ibtn" onClick={undo} disabled={!hist.past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={15} /></button>
              <button type="button" className="ced-ibtn" onClick={redo} disabled={!hist.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={15} /></button>
              <span className="ced-zoom-val" title="Current zoom" onClick={() => { const i = ZOOMS.indexOf(zoom); setZoom(ZOOMS[(i + 1) % ZOOMS.length] ?? 0.5); setZoomFit(false) }}>{Math.round(zoom * 100)}%</span>
              <button type="button" className="ced-ibtn" onClick={() => stepZoom(-1)} title="Zoom out" aria-label="Zoom out"><ZoomOut size={15} /></button>
              <button type="button" className="ced-ibtn" onClick={() => stepZoom(1)} title="Zoom in" aria-label="Zoom in"><ZoomIn size={15} /></button>
              <button type="button" className="ced-ibtn" onClick={applyFit} title="Fit to screen" aria-label="Fit canvas"><Maximize2 size={15} /></button>
              <button type="button" className="ced-ibtn" onClick={() => { setZoom(1); setZoomFit(false) }} title="Reset to 100%" aria-label="Reset zoom"><RotateCcw size={15} /></button>
              {canManage && (
                <button type="button" className="ced-ibtn" onClick={() => fileRef.current?.click()} disabled={replacing} title={`Replace background${draft?.file_name ? ` — ${draft.file_name}` : ''}${draft?.version ? ` (v${draft.version})` : ''}`}>
                  {replacing ? <Loader2 size={15} style={{ animation: 'cedspin .8s linear infinite' }} /> : <UploadCloud size={15} />} Replace
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                hidden
                onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; doReplace(f) }}
              />
              {replaceError && <span className="ced-err" style={{ margin: 0 }}>{replaceError}</span>}
              <button type="button" className={`ced-ibtn ced-only-narrow ${sheet === 'fields' ? 'on' : ''}`} onClick={() => setSheet(sheet === 'fields' ? null : 'fields')}>Fields</button>
              <button type="button" className={`ced-ibtn ced-only-narrow ${sheet === 'props' ? 'on' : ''}`} onClick={() => setSheet(sheet === 'props' ? null : 'props')}>Properties</button>
            </div>
          </div>

          <div
            className="ced-stage"
            ref={wrapRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onStageDrop}
          >
            <div className="ced-stage-pad">
              <div
                className="ced-paper"
                ref={stageRef}
                style={{ width: canvasW * zoom, height: canvasH * zoom }}
                onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('ced-bg')) setSelKey(null) }}
              >
                {imgUrl && !imgFailed ? (
                  <img
                    className="ced-bg"
                    src={imgUrl}
                    alt="Certificate background"
                    draggable={false}
                    onLoad={(e) => setNatDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                    onError={() => setImgFailed(true)}
                  />
                ) : !imgFailed ? (
                  <div className="ced-skel">
                    <Loader2 size={16} style={{ animation: 'cedspin .8s linear infinite' }} /> Loading certificate…
                  </div>
                ) : (
                  <div className="ced-broken">
                    <AlertTriangle size={20} />
                    <div>Unable to load certificate preview.</div>
                    <div className="ced-btnrow" style={{ justifyContent: 'center' }}>
                      <button type="button" className="ced-ibtn" onClick={() => setRetryTick((t) => t + 1)}>Try Again</button>
                      {canManage && <button type="button" className="ced-ibtn primary" onClick={() => fileRef.current?.click()}>Replace File</button>}
                    </div>
                  </div>
                )}

                {cs.showGrid && !imgFailed && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      backgroundImage: 'linear-gradient(to right, rgba(148,163,184,.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,.4) 1px, transparent 1px)',
                      backgroundSize: `${Math.max(4, cs.gridSize * zoom)}px ${Math.max(4, cs.gridSize * zoom)}px`,
                    }}
                  />
                )}
                {cs.safeArea && !imgFailed && <div aria-hidden className="ced-safe" />}

                {!imgFailed && fields.map((f, i) => {
                  const s = f.style || {}
                  if (s.hidden) return null
                  const isSel = f.field_key === selKey
                  const showBorder = cs.showBorders && s.showBorder !== false
                  const border = isSel
                    ? '2px solid #2563EB'
                    : showBorder ? '1px dashed rgba(100,116,139,.65)' : '1px solid transparent'
                  const text = sample[f.field_key] || f.default_value || s.placeholder || f.display_name || f.field_key
                  return (
                    <div
                      key={f.field_key || i}
                      className="ced-fld"
                      onPointerDown={(e) => startFieldDrag('move', null, f.field_key, e)}
                      style={{
                        left: (s.x || 0) * zoom,
                        top: (s.y || 0) * zoom,
                        width: Math.max(8, (s.width || 100) * zoom),
                        height: Math.max(8, (s.height || 40) * zoom),
                        border,
                        background: isSel ? 'rgba(37,99,235,.06)' : 'rgba(255,255,255,.28)',
                      }}
                      title={`${f.display_name || f.field_key} — drag to move`}
                    >
                      <div
                        className="ced-fld-txt"
                        style={{
                          fontFamily: s.fontFamily || 'Arial',
                          fontSize: Math.max(6, (s.fontSize || 24) * zoom),
                          fontWeight: s.fontWeight || 600,
                          fontStyle: s.fontStyle || 'normal',
                          color: s.color || '#111',
                          textAlign: s.textAlign || 'center',
                          lineHeight: s.lineHeight || 1.2,
                          letterSpacing: (s.letterSpacing || 0) * zoom,
                          alignItems: s.verticalAlign === 'top' ? 'flex-start' : s.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                          justifyContent: s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'stretch',
                        }}
                      >
                        <span style={{ width: '100%', display: 'block', overflowWrap: 'break-word' }}>{text}</span>
                      </div>
                      {isSel && ['nw', 'ne', 'sw', 'se'].map((h) => (
                        <span
                          key={h}
                          className={`ced-handle ${h}`}
                          onPointerDown={(e) => startFieldDrag('resize', h, f.field_key, e)}
                        />
                      ))}
                    </div>
                  )
                })}

                {guides && (
                  <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {guides.vCenter && <span className="ced-guide" style={{ left: '50%', top: 0, bottom: 0, width: 1 }} />}
                    {guides.hCenter && <span className="ced-guide" style={{ top: '50%', left: 0, right: 0, height: 1 }} />}
                    {guides.vLeft && <span className="ced-guide" style={{ left: 0, top: 0, bottom: 0, width: 1, background: '#3B82F6' }} />}
                    {guides.hTop && <span className="ced-guide" style={{ top: 0, left: 0, right: 0, height: 1, background: '#3B82F6' }} />}
                    {guides.vRight && <span className="ced-guide" style={{ right: 0, top: 0, bottom: 0, width: 1, background: '#3B82F6' }} />}
                    {guides.hBottom && <span className="ced-guide" style={{ bottom: 0, left: 0, right: 0, height: 1, background: '#3B82F6' }} />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className={`ced-panel ced-right ${sheet === 'props' ? 'open' : ''}`} aria-label="Properties">
          <button type="button" className="ced-ibtn ced-panel-close" onClick={() => setSheet(null)} aria-label="Close properties panel"><X size={15} /></button>
          <div className="ced-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={rightTab === 'field'} className={`ced-tab ${rightTab === 'field' ? 'active' : ''}`} onClick={() => setRightTab('field')}>Field Properties</button>
            <button type="button" role="tab" aria-selected={rightTab === 'canvas'} className={`ced-tab ${rightTab === 'canvas' ? 'active' : ''}`} onClick={() => setRightTab('canvas')}>Canvas Settings</button>
          </div>

          {rightTab === 'field' ? (
            <div className="ced-panel-body">
              {!sel ? (
                <div className="ced-empty" style={{ marginTop: 8 }}>
                  Select a field on the canvas or in the list to edit its properties.
                </div>
              ) : (
                <>
                  <div className="ced-prop-head">
                    <span className="pico"><GripVertical size={16} /></span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="pname" style={{ display: 'block' }}>{sel.display_name || sel.field_key}</span>
                      <span className="ptype" style={{ display: 'block' }}>{typeName}</span>
                    </span>
                    <button type="button" className="ced-ibtn danger" onClick={() => setDeleteIdx(selIdx)} aria-label="Delete field" title="Delete field">
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-fkey">Field Key *</label>
                    <input
                      id="ced-fkey"
                      className={`ced-inp ${errKey ? 'err' : ''}`}
                      value={sel.field_key || ''}
                      onChange={(e) => { const v = e.target.value; setSelKey(v); updateField(sel.field_key, { field_key: v }, `fkey:${sel.field_key}`) }}
                      placeholder="name"
                      aria-invalid={!!errKey}
                    />
                    {errKey && <div className="ced-err">{errKey}</div>}
                  </div>

                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-fname">Display Name *</label>
                    <input
                      id="ced-fname"
                      className={`ced-inp ${errName ? 'err' : ''}`}
                      value={sel.display_name || ''}
                      onChange={(e) => updateField(sel.field_key, { display_name: e.target.value })}
                      placeholder="Name"
                      aria-invalid={!!errName}
                    />
                    {errName && <div className="ced-err">{errName}</div>}
                  </div>

                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-ftype">Type</label>
                    <select id="ced-ftype" className="ced-inp" value={sel.field_type || 'text'} onChange={(e) => updateField(sel.field_key, { field_type: e.target.value })}>
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                  </div>

                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-fdef">Default Value</label>
                    <input id="ced-fdef" className="ced-inp" value={sel.default_value || ''} onChange={(e) => updateField(sel.field_key, { default_value: e.target.value })} placeholder="Enter default value" />
                  </div>

                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-fph">Placeholder</label>
                    <input id="ced-fph" className="ced-inp" value={selStyle.placeholder || ''} onChange={(e) => patchStyle(sel.field_key, { placeholder: e.target.value })} placeholder="Participant Name" />
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>Shown when no value is available.</div>
                  </div>

                  {sel.field_type === 'select' && (
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fopts">Options (one per line)</label>
                      <textarea
                        id="ced-fopts"
                        className={`ced-inp ${errOpts ? 'err' : ''}`}
                        rows={4}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                        value={sel.options || ''}
                        onChange={(e) => updateField(sel.field_key, { options: e.target.value })}
                        placeholder={'APPRECIATION\nACHIEVEMENT\nPARTICIPATION'}
                      />
                      {errOpts && <div className="ced-err">{errOpts}</div>}
                    </div>
                  )}

                  {(sel.field_type === 'date' || sel.field_type === 'datetime') && (
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fdatefmt">Date Format</label>
                      <select id="ced-fdatefmt" className="ced-inp" value={selStyle.dateFormat || ''} onChange={(e) => patchStyle(sel.field_key, { dateFormat: e.target.value })}>
                        {DATE_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-fsample">Sample Value (editor preview)</label>
                    <input id="ced-fsample" className="ced-inp" value={sample[sel.field_key] || ''} onChange={(e) => setSample((v) => ({ ...v, [sel.field_key]: e.target.value }))} placeholder="e.g. Shon Fernandes" />
                  </div>

                  <div className="ced-sec-title">Typography</div>
                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-ffont">Font</label>
                    <select id="ced-ffont" className="ced-inp" value={selStyle.fontFamily || 'Arial'} onChange={(e) => patchStyle(sel.field_key, { fontFamily: e.target.value })}>
                      {CERT_FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="ced-row">
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fsize">Size</label>
                      <input id="ced-fsize" type="number" min={6} max={400} className="ced-inp" value={selStyle.fontSize || 24} onChange={(e) => patchStyle(sel.field_key, { fontSize: clamp(Number(e.target.value) || 6, 6, 400) })} />
                    </div>
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fweight">Weight</label>
                      <select id="ced-fweight" className="ced-inp" value={String(selStyle.fontWeight || 600)} onChange={(e) => patchStyle(sel.field_key, { fontWeight: Number(e.target.value) })}>
                        <option value="400">Normal (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="600">Semi-bold (600)</option>
                        <option value="700">Bold (700)</option>
                      </select>
                    </div>
                  </div>
                  <div className="ced-field">
                    <span className="ced-lbl">Style</span>
                    <div className="ced-btnrow">
                      <button type="button" className={`ced-ibtn ${Number(selStyle.fontWeight) >= 700 ? 'on' : ''}`} onClick={() => patchStyle(sel.field_key, { fontWeight: Number(selStyle.fontWeight) >= 700 ? 400 : 700 })} aria-label="Bold" title="Bold"><Bold size={15} /></button>
                      <button type="button" className={`ced-ibtn ${selStyle.fontStyle === 'italic' ? 'on' : ''}`} onClick={() => patchStyle(sel.field_key, { fontStyle: selStyle.fontStyle === 'italic' ? 'normal' : 'italic' })} aria-label="Italic" title="Italic"><Italic size={15} /></button>
                      <span style={{ width: 6 }} />
                      <label className="ced-lbl" htmlFor="ced-fcolor" style={{ margin: 0, alignSelf: 'center' }}>Color</label>
                      <input id="ced-fcolor" type="color" value={selStyle.color || '#111111'} onChange={(e) => patchStyle(sel.field_key, { color: e.target.value })} style={{ width: 36, height: 32, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', cursor: 'pointer' }} aria-label="Text color" />
                    </div>
                  </div>
                  <div className="ced-field">
                    <span className="ced-lbl">Alignment</span>
                    <div className="ced-btnrow">
                      {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignJustify]].map(([v, Ico]) => (
                        <button key={v} type="button" className={`ced-ibtn ${selStyle.textAlign === v ? 'on' : ''}`} onClick={() => patchStyle(sel.field_key, { textAlign: v })} aria-label={`Align ${v}`} title={`Align ${v}`}>
                          <Ico size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ced-row">
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-flh">Line Height</label>
                      <input id="ced-flh" type="number" step="0.1" min={0.8} max={3} className="ced-inp" value={selStyle.lineHeight ?? 1.2} onChange={(e) => patchStyle(sel.field_key, { lineHeight: clamp(Number(e.target.value) || 1.2, 0.8, 3) })} />
                    </div>
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fls">Letter Spacing</label>
                      <input id="ced-fls" type="number" step="0.5" className="ced-inp" value={selStyle.letterSpacing ?? 0} onChange={(e) => patchStyle(sel.field_key, { letterSpacing: Number(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="ced-field">
                    <label className="ced-lbl" htmlFor="ced-fvalign">Vertical</label>
                    <select id="ced-fvalign" className="ced-inp" value={selStyle.verticalAlign || 'middle'} onChange={(e) => patchStyle(sel.field_key, { verticalAlign: e.target.value })}>
                      <option value="top">Top</option>
                      <option value="middle">Middle</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>

                  <div className="ced-sec-title">Position &amp; Size</div>
                  {errGeom && <div className="ced-err" style={{ marginBottom: 6 }}>{errGeom}</div>}
                  <div className="ced-row">
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fx">X</label>
                      <input id="ced-fx" type="number" className="ced-inp" value={Math.round(selStyle.x || 0)} onChange={(e) => patchStyle(sel.field_key, { x: clamp(Number(e.target.value) || 0, 0, canvasW) })} />
                    </div>
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fy">Y</label>
                      <input id="ced-fy" type="number" className="ced-inp" value={Math.round(selStyle.y || 0)} onChange={(e) => patchStyle(sel.field_key, { y: clamp(Number(e.target.value) || 0, 0, canvasH) })} />
                    </div>
                  </div>
                  <div className="ced-row">
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fw">Width</label>
                      <input id="ced-fw" type="number" min={40} className={`ced-inp ${errGeom ? 'err' : ''}`} value={Math.round(selStyle.width || 0)} onChange={(e) => patchStyle(sel.field_key, { width: clamp(Number(e.target.value) || 40, 40, canvasW) })} />
                    </div>
                    <div className="ced-field">
                      <label className="ced-lbl" htmlFor="ced-fh">Height</label>
                      <input id="ced-fh" type="number" min={16} className={`ced-inp ${errGeom ? 'err' : ''}`} value={Math.round(selStyle.height || 0)} onChange={(e) => patchStyle(sel.field_key, { height: clamp(Number(e.target.value) || 16, 16, canvasH) })} />
                    </div>
                  </div>
                  <div className="ced-field">
                    <span className="ced-lbl">Align to canvas</span>
                    <div className="ced-btnrow">
                      <button type="button" className="ced-ibtn" onClick={() => alignField('left')} title="Align left" aria-label="Align left"><AlignLeft size={14} /></button>
                      <button type="button" className="ced-ibtn" onClick={() => alignField('center')} title="Align center" aria-label="Align center"><AlignCenter size={14} /></button>
                      <button type="button" className="ced-ibtn" onClick={() => alignField('right')} title="Align right" aria-label="Align right"><AlignRight size={14} /></button>
                      <span style={{ width: 4 }} />
                      <button type="button" className="ced-ibtn" onClick={() => alignField('top')} title="Align top" aria-label="Align top" style={{ transform: 'rotate(90deg)' }}><AlignLeft size={14} /></button>
                      <button type="button" className="ced-ibtn" onClick={() => alignField('middle')} title="Align middle" aria-label="Align middle" style={{ transform: 'rotate(90deg)' }}><AlignCenter size={14} /></button>
                      <button type="button" className="ced-ibtn" onClick={() => alignField('bottom')} title="Align bottom" aria-label="Align bottom" style={{ transform: 'rotate(90deg)' }}><AlignRight size={14} /></button>
                    </div>
                  </div>

                  <div className="ced-adv">
                    <button type="button" className="ced-adv-btn" onClick={() => setAdvOpen((v) => !v)} aria-expanded={advOpen}>
                      Advanced Options
                      <ChevronDown size={15} style={{ transform: advOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </button>
                    {advOpen && (
                      <div style={{ paddingTop: 6 }}>
                        <label className="ced-check">
                          <input type="checkbox" checked={sel.required !== false} onChange={(e) => updateField(sel.field_key, { required: e.target.checked })} />
                          Required field
                        </label>
                        <label className="ced-check">
                          <input type="checkbox" checked={!sel.style?.hidden} onChange={(e) => patchStyle(sel.field_key, { hidden: !e.target.checked })} />
                          Show this field on canvas
                        </label>
                        <label className="ced-check">
                          <input type="checkbox" checked={selStyle.showBorder !== false} onChange={(e) => patchStyle(sel.field_key, { showBorder: e.target.checked })} />
                          Show field border on canvas
                        </label>
                        <label className="ced-check">
                          <input type="checkbox" checked={selStyle.autoFit !== false} onChange={(e) => patchStyle(sel.field_key, { autoFit: e.target.checked })} />
                          Auto-fit text to box
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="ced-btnrow" style={{ marginTop: 12 }}>
                    <button type="button" className="ced-ibtn" onClick={() => duplicateField(selIdx)}><Copy size={14} /> Duplicate</button>
                    <button type="button" className="ced-ibtn danger" onClick={() => setDeleteIdx(selIdx)}><Trash2 size={14} /> Delete</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="ced-panel-body">
              <div className="ced-sec-title">Background</div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#F8FAFC' }}>
                <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
                  {imgUrl ? <img src={imgUrl} alt="Background" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Loader2 size={16} style={{ animation: 'cedspin .8s linear infinite', color: '#94A3B8' }} />}
                </div>
                <div style={{ padding: '8px 10px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft?.file_name}</span>
                  {canManage && (
                    <button type="button" className="ced-ibtn" onClick={() => fileRef.current?.click()} disabled={replacing}>
                      {replacing ? <Loader2 size={14} style={{ animation: 'cedspin .8s linear infinite' }} /> : <UploadCloud size={14} />} Replace Background
                    </button>
                  )}
                </div>
              </div>

              <div className="ced-sec-title">Editor Guides</div>
              <div className="ced-toggle">
                <span>Show grid</span>
                <span className="ced-switch"><input type="checkbox" checked={cs.showGrid} onChange={(e) => setCs((c) => ({ ...c, showGrid: e.target.checked }))} aria-label="Show grid" /><i /></span>
              </div>
              {cs.showGrid && (
                <div className="ced-toggle">
                  <span>Grid size</span>
                  <select className="ced-inp" style={{ width: 90 }} value={cs.gridSize} onChange={(e) => setCs((c) => ({ ...c, gridSize: Number(e.target.value) }))} aria-label="Grid size">
                    <option value={8}>8 px</option>
                    <option value={10}>10 px</option>
                  </select>
                </div>
              )}
              <div className="ced-toggle">
                <span>Snap to grid</span>
                <span className="ced-switch"><input type="checkbox" checked={cs.snapGrid} onChange={(e) => setCs((c) => ({ ...c, snapGrid: e.target.checked }))} aria-label="Snap to grid" /><i /></span>
              </div>
              <div className="ced-toggle">
                <span>Snap to guides</span>
                <span className="ced-switch"><input type="checkbox" checked={cs.snapGuides} onChange={(e) => setCs((c) => ({ ...c, snapGuides: e.target.checked }))} aria-label="Snap to guides" /><i /></span>
              </div>
              <div className="ced-toggle">
                <span>Show field borders</span>
                <span className="ced-switch"><input type="checkbox" checked={cs.showBorders} onChange={(e) => setCs((c) => ({ ...c, showBorders: e.target.checked }))} aria-label="Show field borders" /><i /></span>
              </div>
              <div className="ced-toggle">
                <span>Safe area</span>
                <span className="ced-switch"><input type="checkbox" checked={cs.safeArea} onChange={(e) => setCs((c) => ({ ...c, safeArea: e.target.checked }))} aria-label="Show safe area" /><i /></span>
              </div>
              <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 10, lineHeight: 1.5 }}>
                Grid, snapping and guides are editor aids only — they never appear on the generated certificate. Preferences are saved in this browser.
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className={`ced-backdrop ${sheet ? 'show' : ''}`} onClick={() => setSheet(null)} aria-hidden />

      {infoOpen && (
        <div className="ced-modal-overlay" role="dialog" aria-modal="true" aria-label="Template details" onClick={(e) => { if (e.target === e.currentTarget) setInfoOpen(false) }}>
          <div className="ced-modal" style={{ maxWidth: 440 }}>
            <div className="ced-modal-head">
              <h3>Template details</h3>
              <button type="button" className="ced-ibtn" onClick={() => setInfoOpen(false)} aria-label="Close"><X size={15} /></button>
            </div>
            <div className="ced-modal-body">
              <div className="ced-field">
                <label className="ced-lbl" htmlFor="ced-info-name">Template Name *</label>
                <input
                  id="ced-info-name"
                  className={`ced-inp ${infoTouched && !String(infoName || '').trim() ? 'err' : ''}`}
                  value={infoName}
                  onChange={(e) => setInfoName(e.target.value)}
                  placeholder="ASHRAY Certificate"
                  autoFocus
                />
                {infoTouched && !String(infoName || '').trim() && <div className="ced-err">Template name is required.</div>}
              </div>
              <div className="ced-field" style={{ marginBottom: 0 }}>
                <label className="ced-lbl" htmlFor="ced-info-ngo">NGO *</label>
                <select
                  id="ced-info-ngo"
                  className={`ced-inp ${infoTouched && !infoNgo ? 'err' : ''}`}
                  value={infoNgo}
                  onChange={(e) => setInfoNgo(e.target.value)}
                >
                  <option value="">Select NGO</option>
                  {(ngos || []).map((n) => <option key={String(n.id)} value={n.id}>{n.name}</option>)}
                </select>
                {infoTouched && !infoNgo && <div className="ced-err">Please select an NGO.</div>}
              </div>
            </div>
            <div className="ced-modal-foot">
              <button type="button" className="ced-btn" onClick={() => setInfoOpen(false)}>Cancel</button>
              <button type="button" className="ced-btn primary" onClick={saveInfo}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {deleteIdx != null && (
        <div className="ced-modal-overlay" role="dialog" aria-modal="true" aria-label="Delete field" onClick={(e) => { if (e.target === e.currentTarget) setDeleteIdx(null) }}>
          <div className="ced-modal">
            <div className="ced-modal-head">
              <h3>Delete “{fields[deleteIdx]?.display_name || fields[deleteIdx]?.field_key || 'field'}”?</h3>
              <button type="button" className="ced-ibtn" onClick={() => setDeleteIdx(null)} aria-label="Close"><X size={15} /></button>
            </div>
            <div className="ced-modal-body" style={{ fontSize: 13.5, color: '#334155' }}>
              This field will be removed from the template.
            </div>
            <div className="ced-modal-foot">
              <button type="button" className="ced-btn" onClick={() => setDeleteIdx(null)}>Cancel</button>
              <button type="button" className="ced-btn" style={{ background: '#EF4444', borderColor: '#EF4444', color: '#fff' }} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {leaveOpen && (
        <div className="ced-modal-overlay" role="dialog" aria-modal="true" aria-label="Unsaved changes" onClick={(e) => { if (e.target === e.currentTarget) setLeaveOpen(false) }}>
          <div className="ced-modal" style={{ maxWidth: 430 }}>
            <div className="ced-modal-head">
              <h3>Unsaved changes</h3>
              <button type="button" className="ced-ibtn" onClick={() => setLeaveOpen(false)} aria-label="Close"><X size={15} /></button>
            </div>
            <div className="ced-modal-body" style={{ fontSize: 13.5, color: '#334155' }}>
              You have changes that haven't been saved.
            </div>
            <div className="ced-modal-foot">
              <button type="button" className="ced-btn" onClick={() => setLeaveOpen(false)}>Stay</button>
              <button type="button" className="ced-btn" style={{ background: '#EF4444', borderColor: '#EF4444', color: '#fff' }} onClick={() => { setLeaveOpen(false); onCancel() }}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="ced-modal-overlay" role="dialog" aria-modal="true" aria-label="Certificate preview" onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false) }}>
          <div className="ced-modal wide">
            <div className="ced-modal-head">
              <h3>Preview</h3>
              <button type="button" className="ced-ibtn" onClick={() => setPreviewOpen(false)} aria-label="Close preview"><X size={15} /></button>
            </div>
            <div className="ced-modal-body">
              {dirty && (
                <div className="ced-note">
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Preview reflects the last saved version — unsaved edits are not included.{' '}
                    <button
                      type="button"
                      style={{ border: 'none', background: 'none', color: '#B45309', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}
                      onClick={async () => { const ok = await doSave(); if (ok) runPreview() }}
                    >
                      Save &amp; preview
                    </button>
                  </span>
                </div>
              )}
              <div className="ced-prev-wrap">
                {previewBusy ? (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: '#64748B', fontSize: 13 }}>
                    <Loader2 size={16} style={{ animation: 'cedspin .8s linear infinite' }} /> Rendering preview…
                  </span>
                ) : previewErr ? (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: '#EF4444', fontSize: 13 }}>
                    <AlertTriangle size={16} /> {previewErr}
                    <button type="button" className="ced-ibtn" onClick={runPreview}>Try again</button>
                  </span>
                ) : previewUrl ? (
                  <img src={previewUrl} alt="Certificate preview" />
                ) : null}
              </div>
            </div>
            <div className="ced-modal-foot">
              <button type="button" className="ced-btn" onClick={() => setPreviewOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useRef, useCallback } from 'react'

// Reads the first image found in a paste event and returns it via onImage as
// { base64, mime, file }. Kept in a hook so the same handler can be attached to
// any image input alongside the existing file picker.
export default function usePasteImage(onImage) {
  const cbRef = useRef(onImage)
  cbRef.current = onImage

  const handlePaste = useCallback((e) => {
    const cd = e.clipboardData
    if (!cd) return

    const items = cd.items
    let file = null

    if (items && items.length) {
      for (const item of items) {
        if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
          file = item.getAsFile()
          break
        }
      }
    }

    if (!file && cd.files && cd.files.length) {
      for (const f of cd.files) {
        if (f.type && f.type.startsWith('image/')) {
          file = f
          break
        }
      }
    }

    if (!file) return

    e.preventDefault()
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const comma = dataUrl.indexOf(',')
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
      const mime = file.type || 'image/png'
      if (cbRef.current) cbRef.current({ base64, mime, file })
    }
    reader.readAsDataURL(file)
  }, [])

  return handlePaste
}

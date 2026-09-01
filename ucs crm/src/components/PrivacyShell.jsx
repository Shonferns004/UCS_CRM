import { useEffect, useRef, useState } from 'react'
import { useUcs } from '../store'

const BLOCKED_KEYS = new Set(['PrintScreen'])
const BLOCKED_COMBOS = [
  // Ctrl/Cmd + P -> print
  { key: 'p', ctrl: true },
  // F12, Ctrl+Shift+I/J/C/S/U
  { key: 'F12' },
  { key: 'f12' },
  { key: 'I', ctrl: true, shift: true },
  { key: 'i', ctrl: true, shift: true },
  { key: 'J', ctrl: true, shift: true },
  { key: 'j', ctrl: true, shift: true },
  { key: 'C', ctrl: true, shift: true },
  { key: 'c', ctrl: true, shift: true },
  { key: 'S', ctrl: true, shift: true },
  { key: 's', ctrl: true, shift: true },
  { key: 'U', ctrl: true },
  { key: 'u', ctrl: true },
]

function keyMatch(e, combo) {
  const wantsCtrl = !!combo.ctrl
  const wantsShift = !!combo.shift
  const hasCtrl = e.ctrlKey || e.metaKey
  const hasShift = e.shiftKey
  if (wantsCtrl !== hasCtrl) return false
  if (wantsShift !== hasShift) return false
  return e.key === combo.key
}

export default function PrivacyShell() {
  const { user } = useUcs()
  const active = !!(user && user.id != null && user.id !== -1 && user.id !== 0)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const [visible, setVisible] = useState(true)

  const identity = active
    ? (user.name || user.worker_id || ('#' + user.id)) + ' · ' + (user.role || user.department || '')
    : ''

  const notify = (msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  useEffect(() => {
    if (!active) return

    const onKeyDown = (e) => {
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        notify('Screenshots are disabled on this portal.')
        return
      }
      if (BLOCKED_COMBOS.some((c) => keyMatch(e, c))) {
        e.preventDefault()
        e.stopPropagation()
        notify('This action is disabled on this portal.')
        return
      }
    }

    const onContextMenu = (e) => {
      e.preventDefault()
    }

    const onDragStart = (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        e.preventDefault()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') setVisible(false)
      else setVisible(true)
    }

    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('dragstart', onDragStart, true)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [active])

  if (!active) return null

  return (
    <>
      <div
        className={"privacy-watermark" + (visible ? '' : ' privacy-dimmed')}
        aria-hidden="true"
      >
        <div className="privacy-wm-line">{identity}</div>
      </div>
      {toast && (
        <div className="privacy-toast" role="alert">
          {toast}
        </div>
      )}
    </>
  )
}

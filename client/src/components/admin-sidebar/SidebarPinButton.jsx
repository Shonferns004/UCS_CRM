import { useLayoutEffect, useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

const STORAGE_KEY = 'crm_rail_pinned'

/**
 * Small pin control next to the sidebar mark. Unpinned, the rail expands on
 * hover; pinned, it stays open and the content keeps the wider offset.
 */
export default function SidebarPinButton() {
  const buttonRef = useRef(null)
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  useLayoutEffect(() => {
    const sidebar = buttonRef.current?.closest('aside')
    if (sidebar) sidebar.classList.toggle('rail-pinned', pinned)
    try { localStorage.setItem(STORAGE_KEY, pinned ? '1' : '0') } catch { /* storage unavailable */ }
  }, [pinned])

  return (
    <button
      ref={buttonRef}
      type="button"
      className="sb-pin"
      onClick={() => setPinned((value) => !value)}
      aria-label={pinned ? 'Collapse sidebar' : 'Pin sidebar open'}
      aria-expanded={pinned}
      title={pinned ? 'Collapse sidebar' : 'Pin sidebar open'}
    >
      {pinned ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
    </button>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SIZE = 56
const MOBILE_SIZE = 52
const MARGIN = 20
const MOBILE_MARGIN = 16
const DRAG_THRESHOLD = 5
const LONG_PRESS_MS = 500
const X_AUTO_HIDE_MS = 4000

/**
 * Keep the circle fully on screen.
 *
 * Called on every pointermove during a drag, so it has to tolerate a
 * `pos` that has not been sanitised yet. The `Math.max` floor matters on
 * very small viewports: when the window is narrower than size + 2*margin the
 * naive version produced a negative max and threw the circle off the left
 * edge, where it became unreachable.
 */
export function clampFabPosition(pos, opts = {}) {
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 767
  const size = opts.size ?? (mobile ? MOBILE_SIZE : SIZE)
  const margin = opts.margin ?? (mobile ? MOBILE_MARGIN : MARGIN)
  const maxX = Math.max(margin, window.innerWidth - size - margin)
  const maxY = Math.max(margin, window.innerHeight - size - margin)
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY),
  }
}

/**
 * The draggable community circle.
 *
 * Purely presentational. It owns no persisted state and knows nothing about
 * dismissal or message history — ChatFabHost owns all of that, because this
 * component unmounts when the user hides the circle and a listener that
 * unmounts with it can never see the next incoming message.
 *
 * Pointer Events rather than separate mouse/touch handlers: one code path for
 * mouse, touch and pen, and `setPointerCapture` keeps the drag alive when the
 * cursor outruns the element.
 */
export default function ChatFab({
  count = 0,
  pos = null,
  onMove,
  onDismiss,
  chatPath,
}) {
  const navigate = useNavigate()
  const nodeRef = useRef(null)
  const dragRef = useRef(null)
  const longPressRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [xOpen, setXOpen] = useState(false)

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button > 0) return
    const rect = nodeRef.current?.getBoundingClientRect()
    if (!rect) return

    // Anchor the grab point inside the circle. Without this the circle jumps
    // so its centre tracks the pointer, which reads as a glitch on pick-up.
    dragRef.current = {
      pointerId: e.pointerId,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      fromX: e.clientX,
      fromY: e.clientY,
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort; the document-level guards still work */
    }
    longPressRef.current = setTimeout(() => {
      if (!dragRef.current?.moved) setXOpen(true)
    }, LONG_PRESS_MS)
  }, [])

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return

    if (!drag.moved) {
      const dist = Math.hypot(e.clientX - drag.fromX, e.clientY - drag.fromY)
      // Below the threshold this is still a tap. Committing to a drag on the
      // first pixel of jitter would make the primary action (open chat)
      // unreliable, which is worse than a drag that starts a few px late.
      if (dist < DRAG_THRESHOLD) return
      drag.moved = true
      clearLongPress()
      setDragging(true)
    }
    e.preventDefault()
    onMove(clampFabPosition({ x: e.clientX - drag.grabX, y: e.clientY - drag.grabY }))
  }, [onMove, clearLongPress])

  const endDrag = useCallback((e) => {
    const drag = dragRef.current
    clearLongPress()
    if (!drag || e.pointerId !== drag.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    dragRef.current = null
    if (drag.moved) {
      setDragging(false)
      return
    }
    navigate(chatPath)
  }, [chatPath, navigate, clearLongPress])

  // Touch has no hover, so the dismiss affordance has to time out or it
  // covers the circle's own icon for the rest of the session.
  useEffect(() => {
    if (!xOpen) return
    const t = setTimeout(() => setXOpen(false), X_AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [xOpen])

  useEffect(() => clearLongPress, [clearLongPress])

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate(chatPath)
    } else if (e.key === 'Escape') {
      setXOpen(false)
    }
  }, [chatPath, navigate])

  const style = pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : undefined
  const label = count > 0 ? `Open Community chat, ${count} unread` : 'Open Community chat'
  const className = [
    'chat-fab',
    pos ? 'is-placed' : '',
    dragging ? 'is-dragging' : '',
    xOpen ? 'x-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={nodeRef}
      className={className}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setXOpen(true)}
      onMouseLeave={() => {
        if (!dragging) setXOpen(false)
      }}
    >
      <span className="chat-fab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </span>

      {count > 0 && (
        <span className="chat-fab-badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}

      <button
        type="button"
        className="chat-fab-x"
        aria-label="Hide community chat button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
      >
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

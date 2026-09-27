import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useUcs } from '../../store'
import { resolveChatIdentity } from './chatIdentity'
import { useChatEvents } from './useChatRealtime'
import { useSharedUnread } from './ChatUnreadProvider'
import ChatFab, { clampFabPosition } from './ChatFab'

const STORAGE_PREFIX = 'ucs_chatfab_v1:'

function readStored(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Owner of the circle's position and visibility.
 *
 * This component stays mounted for the whole session even when the circle is
 * hidden. That is the whole point: a listener that unmounts with the circle
 * would never observe the next incoming message, so the "hide it until
 * somebody writes" behaviour could never re-arm itself.
 */
export default function ChatFabHost({ chatPath }) {
  const { user } = useUcs()
  const me = useMemo(() => resolveChatIdentity(user), [user])
  const { count } = useSharedUnread() || {}
  const location = useLocation()

  const storageKey = me?.uid ? `${STORAGE_PREFIX}${me.uid}` : null
  const [pos, setPos] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [ready, setReady] = useState(false)

  // Per-user key: on a shared machine one person must not inherit another's
  // dragged position, and `dismissed` is a personal preference too.
  useEffect(() => {
    if (!storageKey) {
      setReady(false)
      return
    }
    const stored = readStored(storageKey)
    if (stored) {
      if (typeof stored.x === 'number' && typeof stored.y === 'number') {
        setPos(clampFabPosition({ x: stored.x, y: stored.y }))
      }
      setDismissed(!!stored.dismissed)
    } else {
      setPos(null)
      setDismissed(false)
    }
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || !ready) return
    try {
      const next = { dismissed }
      if (pos) {
        next.x = pos.x
        next.y = pos.y
      }
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* private mode / quota — the circle still works, it just forgets */
    }
  }, [pos, dismissed, storageKey, ready])

  // A message from anyone else re-arms the circle. Own messages are excluded
  // by uid, matching the same check the workspace uses for its unread counts.
  useChatEvents(
    useCallback(
      (evt) => {
        if (evt?.type !== 'message:new') return
        if (!evt.message) return
        if (!me?.uid) return
        if (evt.message.sender_uid === me.uid) return
        setDismissed(false)
      },
      [me?.uid]
    )
  )

  // A position stored on a large screen can land off-viewport after a
  // rotate or a window resize, which would strand the circle unreachably.
  useEffect(() => {
    const reclamp = () => setPos((prev) => (prev ? clampFabPosition(prev) : prev))
    window.addEventListener('resize', reclamp)
    window.addEventListener('orientationchange', reclamp)
    return () => {
      window.removeEventListener('resize', reclamp)
      window.removeEventListener('orientationchange', reclamp)
    }
  }, [])

  const onChatPage = !!chatPath && location.pathname === chatPath
  if (!ready || !chatPath) return null
  if (dismissed || onChatPage) return null

  return (
    <ChatFab
      count={count || 0}
      pos={pos}
      onMove={setPos}
      onDismiss={() => setDismissed(true)}
      chatPath={chatPath}
    />
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUcs } from '../../store'
import { resolveChatIdentity } from './chatIdentity'
import { chatApi } from './chatApi'
import { useChatEvents } from './useChatRealtime'
import NoticePopup from './NoticePopup'
import './chat.css'

/**
 * Owner of the one-time notice popup, mounted for the whole session next to
 * ChatFabHost so it survives panel navigation — a notice has to reach people
 * wherever they are, not only inside Community.
 *
 * Two inputs feed one queue:
 *
 *   - live: a `message:new` socket frame whose message is a notice. The server
 *     has already excluded nobody here, so this component drops the caller's own
 *     posts by uid — sending a notice is not seeing it.
 *   - backlog: GET /notices/pending on mount, the offline/next-login path.
 *
 * Both funnel through `seen`, a session-wide set of ids, because the two paths
 * overlap: a notice posted while the socket was reconnecting can arrive on
 * both, and two popups for one notice is exactly the bug the server-side view
 * table exists to prevent. The server check (chat_notice_views) is what makes
 * it once-per-person across devices; `seen` only de-duplicates within this tab.
 *
 * Dismissal is optimistic in the UI and acknowledged to the server. If the
 * ack fails the popup simply comes back on the next load — showing a notice
 * twice is recoverable, silently never showing it is not.
 */
export default function NoticePopupHost() {
  const { user } = useUcs()
  const me = useMemo(() => resolveChatIdentity(user), [user])
  const [queue, setQueue] = useState([])
  const seen = useRef(new Set())

  const enqueue = useCallback(
    (items) => {
      if (!me?.uid || !Array.isArray(items) || !items.length) return
      const fresh = items.filter((n) => {
        if (!n?.id || seen.current.has(n.id)) return false
        if (n.sender_uid === me.uid) return false
        seen.current.add(n.id)
        return true
      })
      if (fresh.length) setQueue((prev) => [...prev, ...fresh])
    },
    [me?.uid]
  )

  // Backlog on login/reload.
  useEffect(() => {
    if (!me?.uid) return undefined
    let live = true
    chatApi
      .getPendingNotices()
      .then((list) => {
        if (live) enqueue(list)
      })
      .catch(() => {
        /* a missing/broken notices route must not break the panel */
      })
    return () => {
      live = false
    }
  }, [me?.uid, enqueue])

  // Live path.
  useChatEvents(
    useCallback(
      (evt) => {
        if (evt?.type !== 'message:new') return
        if (!evt.message?.is_notice) return
        enqueue([evt.message])
      },
      [enqueue]
    )
  )

  const dismiss = useCallback(async (notice) => {
    if (!notice?.id) return
    setQueue((prev) => prev.filter((n) => n.id !== notice.id))
    try {
      await chatApi.markNoticeViewed(notice.id)
    } catch {
      /* unacked — it will be offered again on the next load */
    }
  }, [])

  const current = queue[0] || null
  const dismissCurrent = useCallback(() => dismiss(current), [dismiss, current])

  if (!me?.uid || !current) return null
  return <NoticePopup notice={current} onDismiss={dismissCurrent} />
}

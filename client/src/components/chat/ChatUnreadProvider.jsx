import { createContext, useContext, useMemo } from 'react'
import { useUcs } from '../../store'
import { resolveChatIdentity } from './chatIdentity'
import { useUnreadCount } from './useChatRealtime'

const ChatUnreadContext = createContext(null)

/**
 * One unread total for the whole panel shell.
 *
 * useUnreadCount is not cheap: it fetches on mount, opens a socket
 * subscription, and registers focus + visibilitychange listeners. Each
 * consumer that calls it independently multiplies all of that. With the nav
 * badge alone that was tolerable, but the floating circle needs the same
 * number, and the circle's host is mounted permanently on every panel — so
 * without this the cost is now a permanent duplicate on all eight panels.
 */
export function ChatUnreadProvider({ children }) {
  const { user } = useUcs()
  const me = useMemo(() => resolveChatIdentity(user), [user])
  const { count, loaded, refresh } = useUnreadCount(me)
  const value = useMemo(() => ({ count, loaded, refresh }), [count, loaded, refresh])
  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>
}

/** Null when no provider is mounted; consumers must handle that case. */
export function useSharedUnread() {
  return useContext(ChatUnreadContext)
}

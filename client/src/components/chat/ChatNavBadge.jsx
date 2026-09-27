import { useMemo } from 'react'
import { useUcs } from '../../store'
import { resolveChatIdentity } from './chatIdentity'
import { useUnreadCount } from './useChatRealtime'
import { useSharedUnread } from './ChatUnreadProvider'
import ChatBellBadge from './ChatBellBadge'

/**
 * Fallback for a panel rendered outside ChatUnreadProvider. Split into its own
 * component on purpose: calling useUnreadCount in the same component body as
 * the context read would subscribe unconditionally, which is exactly the
 * duplicate we are removing.
 */
function StandaloneBadge({ quiet }) {
  const { user } = useUcs()
  const me = useMemo(() => resolveChatIdentity(user), [user])
  const { count } = useUnreadCount(me)
  return <ChatBellBadge count={count} quiet={quiet} />
}

/**
 * Self-subscribing unread pill for a host panel's navigation row.
 *
 * Kept separate from the workspace so a panel can show the badge without
 * mounting chat at all. Renders nothing when the count is zero, so a quiet
 * Community room leaves the sidebar untouched.
 */
export default function ChatNavBadge({ quiet = false }) {
  const shared = useSharedUnread()
  if (shared) return <ChatBellBadge count={shared.count} quiet={quiet} />
  return <StandaloneBadge quiet={quiet} />
}

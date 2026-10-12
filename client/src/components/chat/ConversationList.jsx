import { Avatar } from '../ui'
import { formatListTime } from './chatTime'
import { HashIcon, SearchIcon, PlusIcon, LockIcon } from './chatIcons'

/**
 * Screen 01 — conversation list.
 *
 * Every group room the viewer belongs to is pinned above the tabs and never
 * filtered out, so a read-only viewer (who has no DMs at all) still sees the
 * community room rather than an empty list with a tab they cannot use. The
 * seeded Community room sorts first; user-created groups follow alphabetically.
 */
export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  tab,
  onTab,
  filter,
  onFilter,
  loading,
  error,
  onRetry,
  canDm,
  canCreateGroup,
  onNewMessage,
  onNewGroup,
  title,
  loadingNode,
}) {
  const groups = conversations
    .filter((c) => c.kind === 'group')
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
  const dms = conversations.filter((c) => c.kind === 'direct')
  const term = filter.trim().toLowerCase()

  const matches = (c) =>
    !term ||
    c.title.toLowerCase().includes(term) ||
    (c.last_message?.body || '').toLowerCase().includes(term)

  const shownGroups = groups.filter(matches)
  const shownDms = dms.filter((c) => (tab === 'direct' ? true : matches(c)))

  // The header always renders. Only the row area swaps, so the rail does not
  // flash from a bare skeleton to a titled list on every load.
  return (
    <>
      <div className="chat-rail-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <h2 className="chat-rail-title" style={{ flex: 1, minWidth: 0 }}>
            {title}
          </h2>
          {canCreateGroup && (
            <button
              type="button"
              className="chat-btn chat-btn-primary"
              onClick={onNewGroup}
              aria-label="Create a new group"
            >
              <PlusIcon size={15} />
              New group
            </button>
          )}
          {canDm && (
            <button
              type="button"
              className="chat-btn"
              onClick={onNewMessage}
              aria-label="Start a new direct message"
            >
              <PlusIcon size={15} />
              New
            </button>
          )}
        </div>

        {canDm ? (
          <div className="chat-tabs" role="tablist" aria-label="Conversation filters">
            <button
              type="button"
              role="tab"
              className="chat-tab"
              aria-selected={tab === 'all'}
              onClick={() => onTab('all')}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              className="chat-tab"
              aria-selected={tab === 'direct'}
              onClick={() => onTab('direct')}
            >
              Direct
            </button>
          </div>
        ) : (
          <div className="chat-readonly" style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
            <span className="chat-readonly-icon">
              <LockIcon size={14} />
            </span>
            <span>Read-only · you can follow the rooms below</span>
          </div>
        )}

        {!loading && conversations.length > 1 && (
          <div className="chat-field">
            <span className="chat-field-icon">
              <SearchIcon size={15} />
            </span>
            <input
              type="search"
              value={filter}
              onChange={(e) => onFilter(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
          </div>
        )}
      </div>

      {loading ? (
        loadingNode
      ) : error ? (
        <div className="chat-state" role="alert" style={{ height: 'auto', padding: '32px 20px' }}>
          <p className="chat-state-title">Could not load conversations</p>
          <p className="chat-state-sub">{error}</p>
          <button type="button" className="chat-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <div className="chat-list">
          {shownGroups.map((c) => (
            <ConvoRow key={c.id} conversation={c} active={activeId === c.id} onSelect={onSelect} />
          ))}

          {shownDms.map((c) => (
            <ConvoRow key={c.id} conversation={c} active={activeId === c.id} onSelect={onSelect} />
          ))}

          {conversations.length === 0 && (
            <div className="chat-state" style={{ height: 'auto', padding: '32px 20px' }}>
              <p className="chat-state-title">No conversations yet</p>
              <p className="chat-state-sub">
                {canDm
                  ? 'Start a direct message to open a private conversation.'
                  : 'You will see community updates here.'}
              </p>
            </div>
          )}

          {conversations.length > 0 && !shownGroups.length && !shownDms.length && (
            <div className="chat-state" style={{ height: 'auto', padding: '28px 20px' }}>
              <p className="chat-state-sub">No conversations match “{filter.trim()}”.</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function ConvoRow({ conversation, active, onSelect }) {
  const last = conversation.last_message
  const isGroup = conversation.kind === 'group'
  const unread = conversation.unread_count || 0
  const adminsOnly = isGroup && conversation.post_policy === 'admins_only'

  return (
    <button
      type="button"
      className="chat-convo"
      aria-current={active ? 'true' : 'false'}
      onClick={() => onSelect(conversation)}
    >
      <span className="chat-convo-avatar">
        {isGroup ? (
          <span
            className="avatar"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--chat-navy)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden="true"
          >
            <HashIcon size={20} />
          </span>
        ) : (
          <Avatar name={conversation.title} size={40} />
        )}
      </span>

      <span className="chat-convo-body">
        <span className="chat-convo-top">
          <span className="chat-convo-name">
            {conversation.title || (isGroup ? 'Group' : 'Conversation')}
            {adminsOnly && (
              <span
                className="chat-bubble-role"
                style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                title="Only admins can post in this group"
              >
                <LockIcon size={11} />
                Admins
              </span>
            )}
            {isGroup && (
              <span className="chat-bubble-role" style={{ marginLeft: 6 }}>
                {conversation.member_count} members
              </span>
            )}
          </span>
        </span>
        <span className="chat-convo-preview">
          {last ? (
            <>
              {!isGroup && <strong>{last.sender_name}: </strong>}
              {last.body}
            </>
          ) : (
            'No messages yet'
          )}
        </span>
      </span>

      <span className="chat-convo-meta">
        {last && <span className="chat-convo-time">{formatListTime(last.created_at)}</span>}
        {unread > 0 && (
          <span className="chat-convo-unread" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </span>

      <span className="chat-sr">
        {isGroup
          ? `${conversation.title || 'Group'}${adminsOnly ? ', admins only' : ''}`
          : `Direct message with ${conversation.title}`}
        {unread > 0 ? `, ${unread} unread` : ''}
      </span>
    </button>
  )
}

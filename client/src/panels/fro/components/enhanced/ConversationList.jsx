const PROJECT_LABELS = {
  bsct: 'Being Sevak',
  aflf: 'Ashray Life',
  mann: 'Mann Care',
}

const PROJECT_BADGES = {
  bsct: { bg: '#dbeafe', text: '#1d4ed8' },
  aflf: { bg: '#dcfce7', text: '#16a34a' },
  mann: { bg: '#fce7f3', text: '#db2777' },
}

// Deterministic avatar gradients so the same contact always keeps the same
// colour, without needing an avatar image from WhatsApp.
const AVATAR_GRADIENTS = [
  ['#7f66ff', '#5b3df5'],
  ['#ff7a59', '#f04438'],
  ['#00bfa5', '#00897b'],
  ['#3d8bff', '#2563eb'],
  ['#f5a623', '#ef6c00'],
  ['#e040fb', '#9c27b0'],
  ['#26a69a', '#00695c'],
  ['#ec407a', '#ad1457'],
]

function avatarGradient(name) {
  const key = String(name || '?')
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  const [from, to] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}

function formatListTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function ConversationList({ conversations = [], activeId, onSelect, loading, searchQuery, emptyText, onToggleFavorite }) {
  if (loading) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px', borderBottom: '1px solid #f5f6f6' }}>
            <div className="sk" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="sk" style={{ height: 12, width: index % 2 ? '56%' : '70%', marginBottom: 7 }} />
              <div className="sk" style={{ height: 10, width: '42%' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const filtered = searchQuery
    ? conversations.filter(c => {
        const q = searchQuery.toLowerCase()
        const name = c.contact?.wa_profile_name || c.contact?.phone || ''
        return name.toLowerCase().includes(q) || (c.contact?.phone || '').includes(q)
      })
    : conversations

  if (!filtered || filtered.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', fontSize: 12.5, color: '#8696a0', lineHeight: 1.5 }}>
        {searchQuery ? 'No conversations match your search' : (emptyText || 'No conversations yet')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {filtered.map(conv => {
        const isActive = conv.id === activeId
        const contact = conv.contact || {}
        const name = contact.wa_profile_name || contact.phone || 'Unknown'
        const unread = conv.unread_count || 0
        const lastMsgTime = formatListTime(conv.last_message_at)
        const project = conv.project || contact.project || ''
        const badge = PROJECT_BADGES[project] || null
        const projectLabel = PROJECT_LABELS[project] || project.toUpperCase()
        const isGroup = !!conv.is_group
        const isFav = Array.isArray(conv.labels) && conv.labels.includes('favourite')

        return (
          <div
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`wa-conv-row${isActive ? ' is-active' : ''}`}
            style={{ padding: '10px 12px', borderBottom: '1px solid #f5f6f6' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: isActive ? 'linear-gradient(135deg,#00a884,#008069)' : (isGroup ? 'linear-gradient(135deg,#54656f,#3b4a54)' : avatarGradient(name)),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: isActive ? '0 1px 3px rgba(0,128,105,.35)' : '0 1px 2px rgba(11,20,26,.15)',
                position: 'relative',
              }}>
                {isGroup ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ) : (
                  name.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 13.5, fontWeight: unread > 0 ? 700 : 500, color: '#111b21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isGroup ? (conv.group_id ? `Group · ${String(conv.group_id).replace('@g.us', '').slice(-6)}` : 'Group') : name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {lastMsgTime && (
                      <div style={{
                        fontSize: 10.5,
                        color: unread > 0 ? '#00a884' : '#8696a0',
                        fontWeight: unread > 0 ? 700 : 500,
                      }}>
                        {lastMsgTime}
                      </div>
                    )}
                    <button
                      className={`wa-star${isFav ? ' is-fav' : ''}`}
                      onClick={e => { e.stopPropagation(); onToggleFavorite?.(conv) }}
                      title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                      aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, color: '#667781', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                      {contact.phone || ''}
                    </span>
                    {isGroup && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 9, fontWeight: 700, borderRadius: 4,
                        padding: '1px 5px', flexShrink: 0,
                        background: '#e7f8f3', color: '#008069',
                      }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        Group
                      </span>
                    )}
                    {badge && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, borderRadius: 4,
                        padding: '1px 5px', flexShrink: 0,
                        background: badge.bg, color: badge.text,
                      }}>
                        {projectLabel}
                      </span>
                    )}
                  </div>
                  {unread > 0 && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      background: '#25d366',
                      color: '#fff',
                      borderRadius: 999,
                      minWidth: 18,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      padding: '0 5px',
                      flexShrink: 0,
                    }}>
                      {unread > 99 ? '99+' : unread}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PROJECT_LABELS = {
  bsct: 'Being Sevak',
  aflf: 'Ashray Life',
  maan: 'Mann Care',
}

const PROJECT_BADGES = {
  bsct: { bg: '#dbeafe', text: '#1d4ed8' },
  aflf: { bg: '#dcfce7', text: '#16a34a' },
  maan: { bg: '#fce7f3', text: '#db2777' },
}

export default function ConversationList({ conversations = [], activeId, onSelect, loading, searchQuery }) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
        Loading conversations...
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
      <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
        {searchQuery ? 'No conversations match your search' : 'No conversations yet...'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {filtered.map(conv => {
        const isActive = conv.id === activeId
        const contact = conv.contact || {}
        const name = contact.wa_profile_name || contact.phone || 'Unknown'
        const unread = conv.unread_count || 0
        const lastMsg = conv.last_message_at
          ? new Date(conv.last_message_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : ''
        const project = conv.project || contact.project || ''
        const badge = PROJECT_BADGES[project] || null
        const projectLabel = PROJECT_LABELS[project] || project.toUpperCase()

        return (
          <div
            key={conv.id}
            onClick={() => onSelect(conv)}
            style={{
              padding: '10px 12px',
              cursor: 'pointer',
              background: isActive ? '#f0fdf4' : '#fff',
              borderLeft: isActive ? '3px solid #25D366' : '3px solid transparent',
              transition: 'background .15s',
            }}
            onMouseOver={e => { if (!isActive) e.currentTarget.style.background = '#f9fafb' }}
            onMouseOut={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: isActive ? '#25D366' : '#e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  {lastMsg && (
                    <div style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, marginLeft: 4 }}>{lastMsg}</div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                      {contact.phone || ''}
                    </span>
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
                      background: '#25D366',
                      color: '#fff',
                      borderRadius: '50%',
                      minWidth: 18,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      padding: '0 4px',
                      flexShrink: 0,
                      marginLeft: 4,
                    }}>
                      {unread > 9 ? '9+' : unread}
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

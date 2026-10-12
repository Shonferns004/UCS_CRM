// `bsct` and `bsct2` are two WhatsApp numbers for the same organisation (Being
// Sevak). Both render under one name; the slug is what identifies the number,
// not what a caller should see next to a donor's name.
const PROJECT_LABELS = {
  bsct: 'Being Sevak',
  bsct2: 'Being Sevak',
  aflf: 'Ashray Life',
  mann: 'Mann Care',
}

const PROJECT_BADGES = {
  bsct: { bg: '#dbeafe', text: '#1d4ed8' },
  bsct2: { bg: '#dbeafe', text: '#1d4ed8' },
  aflf: { bg: '#dcfce7', text: '#16a34a' },
  mann: { bg: '#fce7f3', text: '#db2777' },
}

// The four lifecycle values `conversations.status` has always allowed. "Any"
// clears the filter rather than sending a value, so the list stays unpinned.
const STATUS_FILTERS = [
  { id: '', label: 'Any' },
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Pending' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
]

const chipStyle = active => ({
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 10,
  cursor: 'pointer',
  border: `1px solid ${active ? '#25D366' : '#d1d5db'}`,
  background: active ? '#25D366' : '#fff',
  color: active ? '#fff' : '#6b7280',
  whiteSpace: 'nowrap',
})

// Counts drive the unread toggle and the label list, so the sidebar can show
// what a filter would yield without a second round trip per chip.
export function ConversationFilters({
  unreadOnly, onUnreadChange, unreadTotal,
  statusFilter, onStatusChange, statusCounts,
  labels, activeLabel, onLabelChange,
}) {
  return (
    <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onUnreadChange(!unreadOnly)}
          aria-pressed={unreadOnly}
          style={chipStyle(unreadOnly)}
        >
          Unread{unreadTotal > 0 ? ` (${unreadTotal > 99 ? '99+' : unreadTotal})` : ''}
        </button>
        {STATUS_FILTERS.map(s => (
          <button
            key={s.id || 'any'}
            type="button"
            onClick={() => onStatusChange(s.id)}
            aria-pressed={statusFilter === s.id}
            style={chipStyle(statusFilter === s.id)}
          >
            {s.label}
            {s.id && statusCounts?.[s.id] != null ? ` (${statusCounts[s.id]})` : ''}
          </button>
        ))}
      </div>

      {labels?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: .3 }}>Labels</span>
          <button type="button" onClick={() => onLabelChange('')} style={chipStyle(!activeLabel)}>All</button>
          {labels.map(l => (
            <button
              key={l.label}
              type="button"
              onClick={() => onLabelChange(activeLabel === l.label ? '' : l.label)}
              aria-pressed={activeLabel === l.label}
              style={chipStyle(activeLabel === l.label)}
            >
              {l.label}{l.count != null ? ` (${l.count})` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConversationList({ conversations = [], activeId, onSelect, loading, searchQuery }) {
  if (loading) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div className="sk" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
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
        // labels is text[] on conversations.labels. Normalise defensively: a row
        // written by an older path could hold a comma string rather than an array.
        const rawLabels = conv.labels
        const convLabels = (Array.isArray(rawLabels) ? rawLabels : String(rawLabels || '').split(','))
          .map(s => String(s).trim())
          .filter(Boolean)
        const shownLabels = convLabels.slice(0, 2)
        const hiddenLabelCount = convLabels.length - shownLabels.length

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
            {(shownLabels.length > 0 || conv.status !== 'open') && (
              <div style={{ display: 'flex', gap: 4, marginTop: 4, paddingLeft: 46, flexWrap: 'wrap', alignItems: 'center' }}>
                {conv.status && conv.status !== 'open' && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px',
                    background: conv.status === 'closed' ? '#f3f4f6' : conv.status === 'resolved' ? '#dcfce7' : '#fef3c7',
                    color: conv.status === 'closed' ? '#6b7280' : conv.status === 'resolved' ? '#15803d' : '#b45309',
                  }}>
                    {String(conv.status).toUpperCase()}
                  </span>
                )}
                {shownLabels.map(l => (
                  <span key={l} style={{
                    fontSize: 9, fontWeight: 600, borderRadius: 4, padding: '1px 5px',
                    background: '#eef2ff', color: '#4338ca', maxWidth: 120,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {l}
                  </span>
                ))}
                {hiddenLabelCount > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af' }}>+{hiddenLabelCount}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

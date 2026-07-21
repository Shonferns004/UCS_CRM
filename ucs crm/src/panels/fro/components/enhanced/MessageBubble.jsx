import { useState } from 'react'

function MessageStatusIcon({ status }) {
  if (status === 'queued' || status === 'sending') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#8696a0">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z"/>
        <path d="M12.5 7H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
      </svg>
    )
  }
  if (status === 'sent') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#8696a0">
        <path d="M9 16.2l-3.5-3.5c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l4.2 4.2c.4.4 1 .4 1.4 0L20.3 7.7c.4-.4.4-1 0-1.4s-1-.4-1.4 0L9 16.2z"/>
      </svg>
    )
  }
  if (status === 'delivered') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#8696a0">
        <path d="M18 7.5c-.4-.4-1-.4-1.4 0L10 14.2l-2.6-2.6c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l3.3 3.3c.4.4 1 .4 1.4 0l7.3-7.3c.4-.4.4-1 0-1.4z"/>
      </svg>
    )
  }
  if (status === 'read') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#53bdeb">
        <path d="M18 7.5c-.4-.4-1-.4-1.4 0L10 14.2l-2.6-2.6c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l3.3 3.3c.4.4 1 .4 1.4 0l7.3-7.3c.4-.4.4-1 0-1.4z"/>
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    )
  }
  return null
}

function TimeDisplay({ ts }) {
  if (!ts) return null
  const d = new Date(ts)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function DateSeparator({ dateStr }) {
  if (!dateStr) return null
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  let label
  if (dateStr === today) label = 'Today'
  else if (dateStr === yesterday) label = 'Yesterday'
  else label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px 0 8px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '4px 12px', borderRadius: 8 }}>
        {label}
      </div>
    </div>
  )
}

function getMessageDate(ts) {
  if (!ts) return null
  return new Date(ts).toISOString().slice(0, 10)
}

function shouldGroup(prev, curr) {
  if (!prev || !curr) return false
  const sameSender = prev.direction === curr.direction
  const closeTime = new Date(curr.created_at) - new Date(prev.created_at) < 600000
  return sameSender && closeTime
}

export function MessageBubble({ message, isFirst, isLast, isGroup, onContextMenu }) {
  const isOutbound = message.direction === 'outbound'
  const text = message.body_text || message.body || ''

  const bubbleStyle = {
    maxWidth: '75%',
    padding: '6px 10px 6px 10px',
    borderRadius: 8,
    background: isOutbound ? '#dcfce7' : '#f3f4f6',
    borderBottomRightRadius: isOutbound ? (isLast ? 4 : 8) : 8,
    borderBottomLeftRadius: isOutbound ? 8 : (isLast ? 4 : 8),
    borderTopRightRadius: isOutbound ? (isFirst ? 8 : 4) : 8,
    borderTopLeftRadius: isOutbound ? 8 : (isFirst ? 8 : 4),
    position: 'relative',
    wordBreak: 'break-word',
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isOutbound ? 'flex-end' : 'flex-start',
        marginBottom: isGroup ? 2 : 6,
        padding: '0 12px',
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, message) }}
    >
      <div style={bubbleStyle}>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: '#111827', whiteSpace: 'pre-wrap' }}>
          {text}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1 }}>
            <TimeDisplay ts={message.created_at} />
          </span>
          {isOutbound && <MessageStatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  )
}

export function MessageList({ messages, onContextMenu }) {
  if (!messages) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading messages...</div>
      </div>
    )
  }
  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="#d1d5db">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
          <path d="M11 7h2v4h-2zm0 6h2v2h-2z"/>
        </svg>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>No messages yet</div>
        <div style={{ fontSize: 11, color: '#d1d5db' }}>Send a message to start the conversation</div>
      </div>
    )
  }

  const elements = []
  let lastDate = null
  let lastMsg = null

  messages.forEach((msg, i) => {
    const date = getMessageDate(msg.created_at)
    if (date && date !== lastDate) {
      elements.push(<DateSeparator key={`d-${date}`} dateStr={date} />)
      lastDate = date
    }
    const groupWithPrev = shouldGroup(lastMsg, msg)
    const groupWithNext = shouldGroup(msg, messages[i + 1])
    const isFirstInGroup = !groupWithPrev
    const isLastInGroup = !groupWithNext

    elements.push(
      <MessageBubble
        key={msg.id || i}
        message={msg}
        isFirst={isFirstInGroup}
        isLast={isLastInGroup}
        isGroup={groupWithPrev || groupWithNext}
        onContextMenu={onContextMenu}
      />
    )
    lastMsg = msg
  })

  return <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>{elements}</div>
}

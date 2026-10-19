import { useState, useEffect } from 'react'
import { getQuickReplies } from '../../api/whatsappApi'

const CATEGORY_ICONS = {
  QR: '⬛',
  receipt: '🧾',
  info: 'ℹ️',
  greeting: '👋',
  payment: '💳',
  default: '📋',
}

export default function QuickReplyBar({ onSend }) {
  const [replies, setReplies] = useState([])
  const [sendingId, setSendingId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getQuickReplies()
      .then(data => setReplies(data || []))
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => setLoading(false))
  }, [])

  const handleClick = async (reply) => {
    if (sendingId) return
    setSendingId(reply.id)
    try {
      await onSend(reply.message_text)
    } catch (e) { console.error('Error:', e.message); }
    setSendingId(null)
  }

  if (loading || replies.length === 0) return null

  return (
    <div style={{ padding: '6px 12px', borderTop: '1px solid #e9edef', background: '#fff', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {replies.map(reply => (
        <button
          key={reply.id}
          className="wa-quick-chip"
          onClick={() => handleClick(reply)}
          disabled={sendingId === reply.id}
          style={{ opacity: sendingId === reply.id ? 0.55 : 1, cursor: sendingId === reply.id ? 'not-allowed' : 'pointer' }}
        >
          <span style={{ fontSize: 12 }}>{CATEGORY_ICONS[reply.category] || CATEGORY_ICONS.default}</span>
          <span>{reply.name}</span>
        </button>
      ))}
    </div>
  )
}

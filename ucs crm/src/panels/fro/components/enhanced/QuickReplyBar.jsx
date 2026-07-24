import { useState, useEffect } from 'react'
import { getQuickReplies } from '../../api/whatsappSupabase'

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
    <div style={{ padding: '6px 12px', borderTop: '1px solid #e5e7eb', background: '#fff', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {replies.map(reply => (
        <button
          key={reply.id}
          onClick={() => handleClick(reply)}
          disabled={sendingId === reply.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            background: sendingId === reply.id ? '#f3f4f6' : '#fff',
            color: '#374151',
            cursor: sendingId === reply.id ? 'not-allowed' : 'pointer',
            transition: 'all .15s',
            opacity: sendingId === reply.id ? 0.6 : 1,
          }}
        >
          <span style={{ fontSize: 12 }}>{CATEGORY_ICONS[reply.category] || CATEGORY_ICONS.default}</span>
          <span>{reply.name}</span>
        </button>
      ))}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { searchMessages } from '../../api/whatsappSupabase'

export default function MessageSearchModal({ userId, onClose, onSelectConversation }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = async (q) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const data = await searchMessages(userId, q.trim())
      setResults(data || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(val), 400)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Search Messages</h3>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: 12 }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder="Search messages..."
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '0 12px 12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: '#9ca3af' }}>Searching...</div>
          ) : results.length === 0 && query.trim() ? (
            <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: '#9ca3af' }}>No messages found</div>
          ) : (
            results.map((r, i) => (
              <div
                key={r.id || i}
                onClick={() => { onSelectConversation?.(r.conversation_id); onClose() }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  transition: 'background .15s',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    {r.contact?.wa_profile_name || r.contact?.phone || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.body_text || r.body || ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

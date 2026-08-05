import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Notices() {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.notices()
      .then(d => setNotices(Array.isArray(d) ? d : d?.notices || []))
      .catch(e => setError(e.message || 'Could not load notices'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="app-container space-y-4 animate-fade-in">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-[var(--border)] animate-pulse" />)}
      </div>
    )
  }

  if (error) {
    return <div className="app-container p-4 rounded-xl bg-[var(--red-bg)] text-[var(--red)] text-sm">{error}</div>
  }

  return (
    <div className="app-container space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold">Notices</h2>
      {notices.length === 0 && (
        <div className="p-6 rounded-2xl bg-white border border-[var(--border)] text-center text-sm text-[var(--ink-muted)]">No notices yet.</div>
      )}
      {notices.map(n => (
        <div key={n.id} className="bg-white rounded-2xl border border-[var(--border)] p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">{n.title}</h3>
            {n.created_at && (
              <span className="text-[10px] text-[var(--ink-muted)] whitespace-nowrap mt-0.5">
                {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
          {n.content && <p className="text-xs text-[var(--ink-soft)] leading-relaxed whitespace-pre-wrap">{n.content}</p>}
        </div>
      ))}
    </div>
  )
}

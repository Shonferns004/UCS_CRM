import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Holidays() {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.holidays()
      .then(d => setHolidays(Array.isArray(d) ? d : d?.holidays || []))
      .catch(e => setError(e.message || 'Could not load holidays'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="app-container space-y-4 animate-fade-in">
        <div className="h-6 w-36 bg-gray-200 rounded animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-[var(--border)] animate-pulse" />)}
      </div>
    )
  }

  if (error) {
    return <div className="app-container p-4 rounded-xl bg-[var(--red-bg)] text-[var(--red)] text-sm">{error}</div>
  }

  return (
    <div className="app-container space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold">Holidays</h2>
      {holidays.length === 0 && (
        <div className="p-6 rounded-2xl bg-white border border-[var(--border)] text-center text-sm text-[var(--ink-muted)]">No holidays scheduled.</div>
      )}
      <div className="bg-white rounded-2xl border border-[var(--border)] divide-y divide-[var(--border)]">
        {holidays.map(h => (
          <div key={h.id} className="flex items-center gap-4 px-4 py-3">
            {h.date && (
              <div className="w-12 shrink-0 text-center rounded-lg bg-[var(--primary)] text-white py-1.5">
                <div className="text-lg leading-none font-bold">{new Date(h.date).getDate()}</div>
                <div className="text-[9px] uppercase tracking-wide mt-0.5">
                  {new Date(h.date).toLocaleDateString('en-IN', { month: 'short' })}
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{h.name || h.title || 'Holiday'}</div>
              {h.description && <div className="text-xs text-[var(--ink-soft)] truncate">{h.description}</div>}
            </div>
            {h.date && (
              <span className="text-xs text-[var(--ink-muted)] whitespace-nowrap">
                {new Date(h.date).toLocaleDateString('en-IN', { weekday: 'short' })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { getCallHistory } from '../../api/whatsappCalling'
import { formatDuration } from './CallOverlay'

/** Direction, outcome and duration for past calls, newest first. */
const OUTCOME = {
  connected: { label: 'Completed', color: '#047857', bg: '#ecfdf5' },
  terminated: { label: 'Ended', color: '#475569', bg: '#f1f5f9' },
  rejected: { label: 'Declined', color: '#92400e', bg: '#fffbeb' },
  failed: { label: 'Failed', color: '#b91c1c', bg: '#fef2f2' },
  missed: { label: 'Missed', color: '#b91c1c', bg: '#fef2f2' },
  expired: { label: 'Expired', color: '#92400e', bg: '#fffbeb' },
  ringing: { label: 'Ringing', color: '#1d4ed8', bg: '#eff6ff' },
  accepted: { label: 'Connected', color: '#047857', bg: '#ecfdf5' },
  offered: { label: 'Ringing', color: '#1d4ed8', bg: '#eff6ff' },
  queued: { label: 'Starting', color: '#1d4ed8', bg: '#eff6ff' },
}

function callTime(row) {
  const ts = row.started_at || row.created_at
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function CallHistoryPanel({ project, conversationId, agentToken, onClose }) {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!project) return
    setLoading(true)
    getCallHistory({ project, conversationId, limit: 50 }, agentToken)
      .then((d) => setCalls(d?.calls || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [project, conversationId, agentToken])

  useEffect(() => { load() }, [load])

  const completed = calls.filter((c) => c.status === 'connected' || c.status === 'terminated')
  const totalSeconds = completed.reduce((sum, c) => sum + (c.duration_seconds || 0), 0)
  const missed = calls.filter((c) => c.status === 'missed' || c.status === 'rejected').length

  return (
    <div style={{ width: 300, borderLeft: '1px solid #e5e7eb', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 12, color: '#111827' }}>Call history</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={load} title="Refresh" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: 2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 11-3-6.7" /><polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <button onClick={onClose} title="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: 2, fontSize: 15, lineHeight: 1 }}>&times;</button>
        </div>
      </div>

      {!loading && calls.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
          <Stat label="Calls" value={calls.length} />
          <Stat label="Talk time" value={formatDuration(totalSeconds)} />
          <Stat label="Missed" value={missed} />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {loading ? (
          <div style={{ fontSize: 11, color: '#9ca3af', padding: 10 }}>Loading calls…</div>
        ) : error ? (
          <div style={{ fontSize: 11, color: '#b91c1c', padding: 10 }}>{error}</div>
        ) : calls.length === 0 ? (
          <div style={{ fontSize: 11, color: '#9ca3af', padding: 10, lineHeight: 1.5 }}>
            No calls yet. Calls appear here as soon as one is made or received on this number.
          </div>
        ) : (
          calls.map((call) => {
            const outcome = OUTCOME[call.status] || { label: call.status, color: '#4b5563', bg: '#f3f4f6' }
            const inbound = call.direction === 'inbound'
            return (
              <div key={call.id} style={{ display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 8, alignItems: 'flex-start' }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: inbound ? '#e0f2fe' : '#dcfce7', color: inbound ? '#0369a1' : '#15803d',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
                    style={{ transform: inbound ? 'scaleX(-1)' : 'none' }}>
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.75-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.15-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                  </svg>
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                      background: outcome.bg, color: outcome.color,
                    }}>
                      {outcome.label}
                    </span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{callTime(call)}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2 }}>
                    {inbound ? 'Received' : 'Outgoing'}
                    {call.duration_seconds ? ` · ${formatDuration(call.duration_seconds)}` : ''}
                  </div>
                  {call.failure_reason && (
                    <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2, lineHeight: 1.35 }}>
                      {call.failure_reason}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1, background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 8, padding: '5px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</div>
      <div style={{ fontSize: 9, color: '#9ca3af' }}>{label}</div>
    </div>
  )
}

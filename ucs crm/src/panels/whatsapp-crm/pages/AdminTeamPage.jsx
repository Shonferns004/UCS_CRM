import { useState, useEffect } from 'react'
import { supabase } from '../../fro/lib/supabase'

export default function AdminTeamPage({ onSelectMember }) {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('fro_whatsapp_assignments')
      .select('id, fro_worker_id, is_active, created_at, workers!inner(id, name, email, phone), whatsapp_accounts!inner(id, name, phone_number_id)')
      .order('created_at', { ascending: true })
      .then(({ data }) => setAgents(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Loading...</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Team</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>{agents.length} agent{agents.length !== 1 ? 's' : ''}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {agents.map(a => {
          const w = a.workers || {}
          const acc = a.whatsapp_accounts || {}
          const name = w.name || w.email || 'Unknown'
          const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
          return (
            <div
              key={a.id}
              onClick={() => onSelectMember(a.fro_worker_id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', background: '#fff', borderRadius: 8,
                border: '1px solid #e5e7eb', cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = '#25D366'}
              onMouseOut={e => e.currentTarget.style.borderColor = '#e5e7eb'}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#5B6B4E20', color: '#5B6B4E',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {initials || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{w.email || w.phone || ''}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{acc.name || 'Unassigned'}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{acc.phone_number_id || ''}</div>
              </div>
              <span style={{ fontSize: 16, color: '#9ca3af', marginLeft: 4 }}>›</span>
            </div>
          )
        })}
        {agents.length === 0 && (
          <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 40 }}>
            No agents assigned yet
          </div>
        )}
      </div>
    </div>
  )
}

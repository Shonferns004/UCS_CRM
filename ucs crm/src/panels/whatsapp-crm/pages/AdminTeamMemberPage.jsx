import { useState, useEffect } from 'react'
import { supabase } from '../../fro/lib/supabase'

export default function AdminTeamMemberPage({ workerId, onBack }) {
  const [worker, setWorker] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [currentAssignment, setCurrentAssignment] = useState(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workerId) return
    Promise.all([
      supabase.from('workers').select('*').eq('id', workerId).single(),
      supabase.from('whatsapp_accounts').select('*').eq('is_active', true),
      supabase.from('fro_whatsapp_assignments').select('*').eq('fro_worker_id', workerId).maybeSingle(),
    ]).then(([workerRes, accountsRes, assignRes]) => {
      if (workerRes.data) setWorker(workerRes.data)
      setAccounts(accountsRes.data || [])
      if (assignRes.data) {
        setCurrentAssignment(assignRes.data)
        setSelectedAccountId(String(assignRes.data.whatsapp_account_id))
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [workerId])

  const handleSave = async () => {
    if (!selectedAccountId) return
    setSaving(true)
    setMessage(null)
    try {
      if (currentAssignment) {
        const { error: delErr } = await supabase
          .from('fro_whatsapp_assignments')
          .delete()
          .eq('fro_worker_id', workerId)
        if (delErr) throw delErr
      }
      const { error: insErr } = await supabase
        .from('fro_whatsapp_assignments')
        .insert({ fro_worker_id: workerId, whatsapp_account_id: Number(selectedAccountId) })
      if (insErr) throw insErr

      if (worker?.login_id) {
        await supabase.from('agent_phone_assignments').delete().eq('user_id', worker.login_id)
        await supabase.from('agent_phone_assignments').insert({ user_id: worker.login_id, account_id: Number(selectedAccountId) })
      }

      setCurrentAssignment({ fro_worker_id: workerId, whatsapp_account_id: Number(selectedAccountId) })
      setMessage({ type: 'success', text: 'Assignment updated successfully' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, fontSize: 13, color: '#9ca3af' }}>Loading...</div>
  }

  if (!worker) {
    return (
      <div style={{ padding: 24 }}>
        <button onClick={onBack} style={{ fontSize: 12, color: '#25D366', cursor: 'pointer', border: 'none', background: 'none', padding: 0, marginBottom: 16 }}>← Back to Team</button>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>Worker not found</div>
      </div>
    )
  }

  const name = worker.name || worker.email || 'Unknown'
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ padding: 24 }}>
      <button
        onClick={onBack}
        style={{ fontSize: 12, color: '#25D366', cursor: 'pointer', border: 'none', background: 'none', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        ← Back to Team
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#5B6B4E20', color: '#5B6B4E',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, flexShrink: 0,
        }}>
          {initials || '?'}
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>{name}</h2>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{worker.email}{worker.phone ? ` · ${worker.phone}` : ''}</p>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, maxWidth: 480 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
          Assigned WhatsApp Account
        </label>
        <select
          value={selectedAccountId}
          onChange={e => setSelectedAccountId(e.target.value)}
          style={{
            width: '100%', padding: '9px 12px', fontSize: 13,
            border: '1px solid #d1d5db', borderRadius: 6,
            background: '#fff', color: '#111827', marginBottom: 16,
          }}
        >
          <option value="">— Select account —</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.phone_number_id})
            </option>
          ))}
        </select>

        {currentAssignment && (
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>
            Current: {accounts.find(a => a.id === currentAssignment.whatsapp_account_id)?.name || 'Unknown'}
          </div>
        )}

        {message && (
          <div style={{
            fontSize: 12, padding: '8px 12px', borderRadius: 6, marginBottom: 16,
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#16a34a' : '#dc2626',
          }}>
            {message.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !selectedAccountId}
          style={{
            padding: '9px 20px', fontSize: 13, fontWeight: 600,
            border: 'none', borderRadius: 6, cursor: 'pointer',
            background: !selectedAccountId ? '#d1d5db' : '#25D366',
            color: !selectedAccountId ? '#9ca3af' : '#fff',
            transition: 'all .15s',
          }}
        >
          {saving ? 'Saving...' : 'Save Assignment'}
        </button>
      </div>
    </div>
  )
}

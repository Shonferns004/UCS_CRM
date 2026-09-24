import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPatch } from '../store'

const styles = {
  btn: { padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  card: { background: 'var(--card-bg)', boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)', border: '1px solid var(--line)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--line)', fontWeight: 600, color: 'var(--ink-soft)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'var(--bg)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--bg)', color: 'var(--ink)' },
  pill: (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: bg, color: fg }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' },
  modal: { background: 'var(--card-bg)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', maxWidth: 520, width: '100%', padding: '20px', border: '1px solid var(--line)' },
  field: { marginBottom: '12px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' },
}

// Name-only catalog modal shared by "Kits" and "Organizers" (dropdown sources
// for the Beneficiaries app's Operator Details screen).
export default function CatalogModal({ kind, title, subtitle, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiGet(`/beneficiaries/catalog/${kind}`)
      setItems(res?.[kind] || [])
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.name.trim()) {
      setError(`${title.slice(0, -1)} name is required`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await apiPost(`/beneficiaries/catalog/${kind}`, { name: form.name.trim() })
      setForm({ name: '' })
      await load()
    } catch (e) {
      setError(e.message || 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (item) => {
    try {
      await apiPatch(`/beneficiaries/catalog/${kind}/${item.id}`, { is_active: !item.is_active })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !item.is_active } : i))
    } catch (e) {
      setError(e.message || 'Failed to update')
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h3>
            {subtitle && <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ ...styles.btn, background: 'var(--bg)', color: 'var(--ink)' }}>Close</button>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#fee2e2', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
        )}

        {/* Add form */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '10px' }}>Add {title.toLowerCase()}</div>
          <div style={styles.field}>
            <label style={styles.label}>Name *</label>
            <input
              style={styles.input}
              value={form.name}
              onChange={(e) => setForm({ name: e.target.value })}
              placeholder={`e.g. ${kind === 'kits' ? 'Nutrition Kit' : 'Riya Sharma'}`}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <button onClick={create} disabled={saving} style={{ ...styles.btn, background: 'var(--sage)', color: '#fff', opacity: saving ? .6 : 1 }}>
            {saving ? 'Adding...' : `+ Add ${title.slice(0, -1)}`}
          </button>
        </div>

        {/* List */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>
            {loading ? 'Loading...' : `${items.length} ${title.toLowerCase()}`}
          </div>
          {!loading && items.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px' }}>
              Nothing here yet. Add one above.
            </div>
          )}
          {!loading && items.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.td}>{item.name}</td>
                    <td style={styles.td}>{item.is_active ? <span style={styles.pill('#dcfce7', '#166534')}>Active</span> : <span style={styles.pill('var(--bg)', 'var(--ink-soft)')}>Inactive</span>}</td>
                    <td style={styles.td}>
                      <button onClick={() => toggle(item)} style={{ ...styles.btn, background: 'var(--bg)', color: item.is_active ? '#991b1b' : 'var(--ink)' }}>
                        {item.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBnfBase } from '../bnfUi'
import { apiGet, apiPost, apiPatch } from '../store'
import CatalogModal from '../components/CatalogModal'

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  filterBar: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', minWidth: '160px' },
  btn: { padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  card: { background: 'var(--card-bg)', boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)', border: '1px solid var(--line)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--line)', fontWeight: 600, color: 'var(--ink-soft)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'var(--bg)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--bg)', color: 'var(--ink)' },
  pill: (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: bg, color: fg }),
  link: { color: 'var(--sage)', textDecoration: 'none', cursor: 'pointer', fontWeight: 500 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' },
  modal: { background: 'var(--card-bg)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', maxWidth: 640, width: '100%', padding: '20px', border: '1px solid var(--line)' },
  field: { marginBottom: '12px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
}

const STATUS_COLORS = {
  DRAFT: ['var(--bg)', 'var(--ink-soft)'],
  PLANNED: ['#dbeafe', '#1e40af'],
  APPROVED: ['#dcfce7', '#166534'],
  ONGOING: ['#fef3c7', '#92400e'],
  COMPLETED: ['#dcfce7', '#166534'],
  CANCELLED: ['#fee2e2', '#991b1b'],
}

export default function Programs() {
  const navigate = useNavigate()
  const base = useBnfBase()
  const [data, setData] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 25

  // ── App operators modal ─────────────────────────────────────────────
  const [showOps, setShowOps] = useState(false)
  const [ops, setOps] = useState([])
  const [opsLoading, setOpsLoading] = useState(false)
  const [opsError, setOpsError] = useState('')
  const [opForm, setOpForm] = useState({ name: '', phone: '', email: '' })
  const [opSaving, setOpSaving] = useState(false)
  const [newOp, setNewOp] = useState(null)

  // ── Kit + organizer catalogs ─────────────────────────────────────────
  const [showKits, setShowKits] = useState(false)
  const [showOrganizers, setShowOrganizers] = useState(false)

  const loadOperators = useCallback(async () => {
    setOpsLoading(true)
    setOpsError('')
    try {
      const res = await apiGet('/beneficiaries/operators')
      setOps(res?.operators || [])
    } catch (e) {
      setOpsError(e.message || 'Failed to load operators')
    } finally {
      setOpsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showOps) loadOperators()
  }, [showOps, loadOperators])

  const openModal = () => {
    setNewOp(null)
    setOpForm({ name: '', phone: '', email: '' })
    setOpsError('')
    setShowOps(true)
  }

  const createOperator = async () => {
    if (!opForm.name.trim()) {
      setOpsError('Operator name is required')
      return
    }
    setOpSaving(true)
    setOpsError('')
    try {
      const res = await apiPost('/beneficiaries/operators', {
        name: opForm.name.trim(),
        phone: opForm.phone.trim() || null,
        email: opForm.email.trim() || null,
      })
      setNewOp(res)
      setOps((prev) => [res.operator, ...prev])
      setOpForm({ name: '', phone: '', email: '' })
      await loadOperators()
    } catch (e) {
      setOpsError(e.message || 'Failed to create operator')
    } finally {
      setOpSaving(false)
    }
  }

  const toggleOperator = async (op) => {
    try {
      await apiPatch(`/beneficiaries/operators/${op.id}`, { is_active: !op.is_active })
      setOps((prev) => prev.map((o) => (o.id === op.id ? { ...o, is_active: !op.is_active } : o)))
    } catch (e) {
      setOpsError(e.message || 'Failed to update operator')
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize })
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      const result = await apiGet(`/programs?${params}`)
      setData(result)
    } catch (e) {
      console.error('Failed to load programs:', e)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => { loadData() }, [loadData])

  const totalPages = Math.ceil((data.total || 0) / pageSize)

  return (
    <div>
      <div style={styles.header}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Programs</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowKits(true)} style={{ ...styles.btn, background: 'var(--bg)', color: 'var(--ink)' }}>
            Kits
          </button>
          <button onClick={() => setShowOrganizers(true)} style={{ ...styles.btn, background: 'var(--bg)', color: 'var(--ink)' }}>
            Organizers
          </button>
          <button onClick={openModal} style={{ ...styles.btn, background: 'var(--bg)', color: 'var(--ink)' }}>
            Operators
          </button>
          <button onClick={() => navigate(base + '/programs/new')} style={{ ...styles.btn, background: 'var(--sage)', color: '#fff' }}>
            + New Program
          </button>
        </div>
      </div>

      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search programs..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          style={{ ...styles.input, minWidth: '220px' }}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} style={styles.input}>
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="PLANNED">Planned</option>
          <option value="APPROVED">Approved</option>
          <option value="ONGOING">Ongoing</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{data.total || 0} programs</span>
      </div>

      <div style={styles.card}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>Loading...</div>
        ) : data.data?.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>No programs found</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Location</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.map((p) => {
                const [bg, fg] = STATUS_COLORS[p.status] || ['var(--bg)', 'var(--ink-soft)']
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(base + `/programs/${p.id}`)}>
                    <td style={styles.td}><code style={{ fontSize: '12px', background: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>{p.program_code}</code></td>
                    <td style={styles.td}><span style={styles.link}>{p.title}</span></td>
                    <td style={styles.td}>{p.program_date || '-'}</td>
                    <td style={styles.td}>{p.location_name || '-'}</td>
                    <td style={styles.td}><span style={styles.pill(bg, fg)}>{p.status}</span></td>
                    <td style={styles.td}>
                      <span onClick={(e) => { e.stopPropagation(); navigate(base + `/programs/${p.id}`) }} style={styles.link}>View</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '16px' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ ...styles.btn, background: 'var(--bg)', opacity: page <= 1 ? 0.5 : 1 }}>Prev</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <button key={p} onClick={() => setPage(p)} style={{ ...styles.btn, background: p === page ? 'var(--sage)' : 'var(--bg)', color: p === page ? '#fff' : 'var(--ink)' }}>{p}</button>
            )
          })}
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ ...styles.btn, background: 'var(--bg)', opacity: page >= totalPages ? 0.5 : 1 }}>Next</button>
        </div>
      )}

      {/* App Operators modal */}
      {showOps && (
        <div style={styles.overlay} onClick={() => setShowOps(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>App Operators</h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  Only these accounts can log into the Beneficiaries mobile app.
                </div>
              </div>
              <button onClick={() => setShowOps(false)} style={{ ...styles.btn, background: 'var(--bg)', color: 'var(--ink)' }}>Close</button>
            </div>

            {opsError && (
              <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#fee2e2', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>{opsError}</div>
            )}

            {newOp && (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: '#dcfce7', color: '#166534', fontSize: '13px', marginBottom: '12px' }}>
                <strong>Operator created.</strong> Share these credentials with <strong>{newOp.operator?.name}</strong>:
                <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span><span style={{ opacity: .7 }}>Login ID:</span> <code>{newOp.login_id}</code></span>
                  <span><span style={{ opacity: .7 }}>Password:</span> <code>{newOp.password}</code></span>
                </div>
              </div>
            )}

            {/* Add operator form */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '10px' }}>Add operator</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={styles.field}>
                  <label style={styles.label}>Name *</label>
                  <input style={styles.input} value={opForm.name} onChange={(e) => setOpForm({ ...opForm, name: e.target.value })} placeholder="e.g. Riya Sharma" />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Mobile</label>
                  <input style={styles.input} value={opForm.phone} onChange={(e) => setOpForm({ ...opForm, phone: e.target.value })} placeholder="10-digit mobile" />
                </div>
                <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
                  <label style={styles.label}>Email (optional)</label>
                  <input style={{ ...styles.input, width: '100%' }} value={opForm.email} onChange={(e) => setOpForm({ ...opForm, email: e.target.value })} placeholder="operator@beingsevak.org" />
                </div>
              </div>
              <button onClick={createOperator} disabled={opSaving} style={{ ...styles.btn, background: 'var(--sage)', color: '#fff', marginTop: '4px', opacity: opSaving ? .6 : 1 }}>
                {opSaving ? 'Adding...' : '+ Add Operator'}
              </button>
            </div>

            {/* Operator list */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>
                {opsLoading ? 'Loading...' : `${ops.length} operator${ops.length === 1 ? '' : 's'}`}
              </div>
              {!opsLoading && ops.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px' }}>
                  No operators yet. Add one above to let them log into the app.
                </div>
              )}
              {!opsLoading && ops.length > 0 && (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Login ID</th>
                      <th style={styles.th}>Contact</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op) => (
                      <tr key={op.id}>
                        <td style={styles.td}>{op.name}</td>
                        <td style={styles.td}><code style={{ fontSize: '12px', background: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>{op.login_id}</code></td>
                        <td style={styles.td}>{op.phone || op.email || '-'}</td>
                        <td style={styles.td}>{op.is_active ? <span style={styles.pill('#dcfce7', '#166534')}>Active</span> : <span style={styles.pill('var(--bg)', 'var(--ink-soft)')}>Inactive</span>}</td>
                        <td style={styles.td}>
                          <button onClick={() => toggleOperator(op)} style={{ ...styles.btn, background: 'var(--bg)', color: op.is_active ? '#991b1b' : 'var(--ink)' }}>
                            {op.is_active ? 'Deactivate' : 'Activate'}
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
      )}

      {/* Kit catalog modal */}
      {showKits && (
        <CatalogModal
          kind="kits"
          title="Kits"
          subtitle="Kits the operators hand out. Shown as a dropdown on the app's Operator Details screen."
          onClose={() => setShowKits(false)}
        />
      )}

      {/* Organizer catalog modal */}
      {showOrganizers && (
        <CatalogModal
          kind="organizers"
          title="Organizers"
          subtitle="Who runs the program. Shown as a dropdown on the app's Operator Details screen."
          onClose={() => setShowOrganizers(false)}
        />
      )}
    </div>
  )
}
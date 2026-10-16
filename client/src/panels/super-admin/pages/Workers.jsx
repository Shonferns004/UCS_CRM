import { useState, useEffect } from 'react'
import { MagnifyingGlass, Eye, LockKey, Trash } from '@phosphor-icons/react'
import { api } from '../api/auth'
import { useSalaryPrivacy } from '../../../context/SalaryPrivacyContext'
import ResetPasswordModal from '../components/ResetPasswordModal'
import { deptLabel } from '../../../lib/labels'

const PAGE_SIZES = [10, 20, 50, 100]

export default function Workers({ onViewWorker }) {
  const { formatSalary } = useSalaryPrivacy()
  const [workers, setWorkers] = useState([])
  const [ngos, setNgos] = useState([])
  const [filterNgo, setFilterNgo] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [resetWorker, setResetWorker] = useState(null)

  const [causes, setCauses] = useState([])
  const [ngoForm, setNgoForm] = useState({ name: '', code: '', address: '', registration_no: '' })
  const [showNgoForm, setShowNgoForm] = useState(false)
  const [causeForm, setCauseForm] = useState({ ngo_id: '', name: '', description: '' })
  const [showCauseForm, setShowCauseForm] = useState(false)

  const load = () => {
    api('/workers').then(setWorkers).catch(e => setErr(e.message)).finally(() => setLoading(false))
    api('/ngos').then(setNgos).catch((err) => { console.error('Error:', err.message); })
    api('/causes').then(setCauses).catch((err) => { console.error('Error:', err.message); })
  }
  useEffect(load, [])

  const openNewNgo = () => { setNgoForm({ name: '', code: '', address: '', registration_no: '' }); setShowNgoForm(true) }
  const saveNgo = async () => {
    setErr('')
    try {
      await api('/ngos', { method: 'POST', body: JSON.stringify(ngoForm) })
      setShowNgoForm(false); load()
    } catch (e) { setErr(e.message) }
  }
  const openNewCause = () => { setCauseForm({ ngo_id: '', name: '', description: '' }); setShowCauseForm(true) }
  const saveCause = async () => {
    setErr('')
    try {
      await api('/causes', { method: 'POST', body: JSON.stringify(causeForm) })
      setShowCauseForm(false); load()
    } catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this worker?')) return
    try { await api(`/workers/${id}`, { method: 'DELETE' }); load() }
    catch (e) { setErr(e.message) }
  }

  const HIDE_DEPTS = ['hr-recruitment', 'hr recruitment', 'hr_recruitment', 'hrrecruitment']
  const depts = [...new Set(workers.map(w => w.department).filter(Boolean))]
    .filter(d => !HIDE_DEPTS.includes(d.toLowerCase().trim()))

  const filtered = workers.filter(w => {
    if (filterNgo && String(w.ngo_id) !== filterNgo) return false
    if (filterDept && w.department !== filterDept) return false
    if (search) {
      const s = search.toLowerCase()
      if (!(w.name || '').toLowerCase().includes(s) && !(w.login_id || '').toLowerCase().includes(s)) return false
    }
    return true
  })

  useEffect(() => { setPage(1) }, [filterNgo, filterDept, search, pageSize])

  const totalPages = Math.ceil(filtered.length / pageSize) || 1
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Enter/Space on the name cell, which is an <a> without an href and so is not
  // natively focusable. tabIndex + role keeps the existing click behaviour and
  // makes the row reachable by keyboard (spec §7).
  const nameKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewWorker(id) }
  }

  return (
    <div className="sa-page workers-page">
      <div className="workers-head">
        <h3>Workers</h3>
        <div className="workers-head-side">
          <span className="workers-count">{workers.length} total</span>
          <div className="workers-actions">
            <button className="btn workers-add" onClick={openNewNgo}>+ Add NGO</button>
            <button className="btn workers-add" onClick={openNewCause}>+ Add Cause</button>
          </div>
        </div>
      </div>
      {err && <div className="sa-err-card">{err}</div>}

      {showNgoForm && (
        <div className="sa-modal-overlay" onClick={() => setShowNgoForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>NGOs</h3>
            <div style={{ maxHeight: 190, overflowY: 'auto', marginBottom: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
              {ngos.length === 0 ? (
                <div className="sa-muted sa-center" style={{ padding: 14 }}>No NGOs yet</div>
              ) : ngos.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line, #f3f4f6)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                    {n.name?.charAt(0)?.toUpperCase() || 'N'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                      {n.code ? <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>{n.code}</code> : null}
                      {n.registration_no ? <> · {n.registration_no}</> : null}
                    </div>
                  </div>
                  <span className={`sa-badge ${n.is_active !== false ? 'active' : 'inactive'}`} style={{ fontSize: 9, flexShrink: 0 }}>
                    {n.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, paddingTop: 2, borderTop: '1px solid var(--border)' }}>Add new NGO</div>
            <label className="field">Name <input value={ngoForm.name} onChange={e => setNgoForm({...ngoForm, name: e.target.value})} /></label>
            <label className="field">Code <input value={ngoForm.code} onChange={e => setNgoForm({...ngoForm, code: e.target.value})} /></label>
            <label className="field">Registration No. <input value={ngoForm.registration_no} onChange={e => setNgoForm({...ngoForm, registration_no: e.target.value})} /></label>
            <label className="field">Address <textarea value={ngoForm.address} onChange={e => setNgoForm({...ngoForm, address: e.target.value})} /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowNgoForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveNgo}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showCauseForm && (
        <div className="sa-modal-overlay" onClick={() => setShowCauseForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>Causes</h3>
            <div style={{ maxHeight: 190, overflowY: 'auto', marginBottom: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
              {causes.length === 0 ? (
                <div className="sa-muted sa-center" style={{ padding: 14 }}>No causes yet</div>
              ) : causes.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line, #f3f4f6)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                    {c.name?.charAt(0)?.toUpperCase() || 'C'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{ngos.find(n => n.id === c.ngo_id)?.name || '—'}</div>
                  </div>
                  <span className={`sa-badge ${c.is_active !== false ? 'active' : 'inactive'}`} style={{ fontSize: 9, flexShrink: 0 }}>
                    {c.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, paddingTop: 2, borderTop: '1px solid var(--border)' }}>Add new cause</div>
            <label className="field">NGO
              <select value={causeForm.ngo_id} onChange={e => setCauseForm({...causeForm, ngo_id: e.target.value})}>
                <option value="">— Select NGO —</option>
                {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
            <label className="field">Cause Name <input value={causeForm.name} onChange={e => setCauseForm({...causeForm, name: e.target.value})} /></label>
            <label className="field">Description <textarea value={causeForm.description} onChange={e => setCauseForm({...causeForm, description: e.target.value})} /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowCauseForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCause}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="workers-filters">
        <div className="workers-search">
          <span className="workers-search-icon" aria-hidden="true"><MagnifyingGlass size={18} weight="bold" /></span>
          <input placeholder="Search name / login_id…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="workers-select" value={filterNgo} onChange={e => { setFilterNgo(e.target.value); setPage(1) }}>
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <select className="workers-select" value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1) }}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d} value={d}>{deptLabel(d)}</option>)}
        </select>
      </div>

      <div className="workers-table-wrap">
        <table className="workers-table">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '26%' }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Login ID</th>
              <th scope="col">Department</th>
              <th scope="col">NGO</th>
              <th scope="col">Salary</th>
              <th scope="col">Status</th>
              <th scope="col" className="workers-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="workers-empty">Loading workers…</td></tr>
            )}
            {!loading && paginated.map(w => {
              const ngo = ngos.find(n => n.id === w.ngo_id)
              const active = w.is_active !== false
              return (
                <tr key={w.id}>
                  <td>
                    <a
                      className="worker-name"
                      role="button"
                      tabIndex={0}
                      onClick={() => onViewWorker(w.id)}
                      onKeyDown={(e) => nameKeyDown(e, w.id)}
                    >{w.name}</a>
                  </td>
                  <td><code className="worker-login">{w.login_id}</code></td>
                  <td>{deptLabel(w.department) || '—'}</td>
                  <td className="workers-ngo">{ngo?.name || '—'}</td>
                  <td className="workers-salary">{w.salary ? formatSalary(w.salary) : '—'}</td>
                  <td>
                    <span className={`workers-status ${active ? 'active' : 'inactive'}`}>
                      <i className="workers-status-dot" aria-hidden="true" />
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="workers-row-actions">
                      <button className="btn workers-act" onClick={() => onViewWorker(w.id)}>
                        <Eye size={16} weight="bold" /> View
                      </button>
                      <button className="btn workers-act" onClick={() => setResetWorker(w)}>
                        <LockKey size={16} weight="bold" /> Reset Pwd
                      </button>
                      <button className="btn workers-act workers-act-danger" onClick={() => remove(w.id)}>
                        <Trash size={16} weight="bold" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="workers-empty">No workers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="workers-pager">
          <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              className={`btn btn-sm${p === page ? ' is-current' : ''}`}
              onClick={() => setPage(p)}
            >{p}</button>
          ))}
          <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="workers-pager-size"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>
      )}

      {resetWorker && <ResetPasswordModal worker={resetWorker} onClose={() => setResetWorker(null)} />}
    </div>
  )
}

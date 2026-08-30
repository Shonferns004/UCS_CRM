import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { fetchActivities, fetchSectors, fetchWorkspaceNgos, createActivity, updateActivity, setActivityStatus, importActivitiesSheet, exportActivitiesSheet } from '../store'
import { EnhancedTable } from '../components/Table'

const emptyForm = { name: '', ngo_id: '', sector_id: '', description: '', banner: '' }

export default function Activities() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activities, setActivities] = useState([])
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [ngoFilter, setNgoFilter] = useState('')
  const [sectorFilter, setSectorFilter] = useState(searchParams.get('sector') || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [importModal, setImportModal] = useState(false)
  const [importNgo, setImportNgo] = useState('')
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    Promise.all([fetchWorkspaceNgos().catch(() => []), fetchSectors().catch(() => [])])
      .then(([n, s]) => { setNgos(n || []); setSectors(s || []) })
  }, [])

  const loadActivities = () => {
    setLoading(true)
    fetchActivities({ ngo_id: ngoFilter || undefined, sector_id: sectorFilter || undefined })
      .then(data => setActivities(data || []))
      .catch(e => console.error('Activities fetchActivities:', e))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadActivities() }, [ngoFilter, sectorFilter])

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, sector_id: sectorFilter || '' }); setError(''); setModal(true) }
  const openEdit = (row) => {
    setEditing(row)
    setForm({ name: row.name || '', ngo_id: row.ngo_id ? String(row.ngo_id) : '', sector_id: row.sector_id ? String(row.sector_id) : '', description: row.description || '', banner: row.banner || '' })
    setError('')
    setModal(true)
  }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      ngo_id: form.ngo_id ? Number(form.ngo_id) : null,
      sector_id: Number(form.sector_id),
      description: form.description || null,
      banner: form.banner || null,
    }
    try {
      if (editing) {
        await updateActivity(editing.id, payload)
      } else {
        await createActivity(payload)
      }
      await loadActivities()
      setModal(false)
    } catch (err) {
      setError(err.message || 'Failed to save activity; check for duplicate name in this NGO + sector')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (row) => {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    const msg = next === 'Inactive'
      ? `Deactivate activity "${row.name}"? It will stay on record but won't appear as active.`
      : `Activate activity "${row.name}"?`
    if (!confirm(msg)) return
    try {
      await setActivityStatus(row.id, next)
      setActivities(activities.map(a => a.id === row.id ? { ...a, status: next } : a))
    } catch (err) { alert('Failed to update status: ' + (err.message || 'Unknown error')); console.error('Activities toggle status:', err) }
  }

  const openImport = () => {
    setImportNgo('')
    setImportFile(null)
    setImportResult(null)
    setImportError('')
    if (fileRef.current) fileRef.current.value = ''
    setImportModal(true)
  }

  const handleImportSubmit = async (e) => {
    e.preventDefault()
    if (!importNgo) { setImportError('Please select an NGO for this sheet'); return }
    if (!importFile) { setImportError('Please choose an Excel/CSV file'); return }
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const ngoCode = ngos.find(n => String(n.id) === String(importNgo))
      const result = await importActivitiesSheet((ngoCode && (ngoCode.code || ngoCode.name)) || importNgo, importFile)
      setImportResult(result)
      await loadActivities()
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setImportError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async () => {
    try {
      const sel = ngos.find(n => String(n.id) === String(ngoFilter))
      const name = 'activities' + (sel ? '_' + String(sel.code || sel.name).replace(/[^A-Za-z0-9_-]/g, '_') : '') + '.xlsx'
      await exportActivitiesSheet(ngoFilter || null, name)
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Unknown error')); console.error('Activities export:', err)
    }
  }

  const filtered = statusFilter ? activities.filter(a => a.status === statusFilter) : activities

  const columns = [
    {
      header: 'Activity', accessor: 'name',
      render: (row) => (
        <span style={{ fontWeight: 500 }}>
          <Link to={'/event-head/activities/' + row.id} style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 600 }}>{row.name}</Link>
          <span className={`pill ${row.status === 'Active' ? 'pill-green' : 'pill-gray'}`} style={{ marginLeft: 8 }}>{row.status}</span>
        </span>
      )
    },
    { header: 'NGO', accessor: 'ngo_name', render: (row) => row.ngo_name ? <span style={{ fontWeight: 500 }}>{row.ngo_name}</span> : '—' },
    { header: 'Sector', accessor: 'sector_name' },
    { header: 'Events', accessor: 'event_count', render: (row) => row.event_count || 0 },
    {
      header: 'Actions',
      render: (row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={() => navigate('/event-head/activities/' + row.id)}>View</button>
          <button className="btn btn-sm" onClick={() => openEdit(row)}>Edit</button>
          {row.status === 'Active'
            ? <button className="btn btn-sm" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={() => handleToggleStatus(row)}>Deactivate</button>
            : <button className="btn btn-sm" style={{ color: '#16a34a', borderColor: '#bbf7d0' }} onClick={() => handleToggleStatus(row)}>Activate</button>}
        </div>
      )
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Activities</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>Programs under each NGO and Sector</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={handleExport} disabled={loading}>Export Sheet</button>
          <button className="btn btn-sm" onClick={openImport}>Upload Sheet</button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Activity</button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={ngoFilter} onChange={e => setNgoFilter(e.target.value)}>
          <option value="">All NGOs</option>
          {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
        </select>
        <select value={sectorFilter} onChange={e => { const v = e.target.value; setSectorFilter(v); setSearchParams(v ? { sector: v } : {}, { replace: true }) }}>
          <option value="">All Sectors</option>
          {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card"><div className="stat-num" style={{ color: '#3485D4' }}>{filtered.length}</div><div className="stat-lbl">Activities</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#16a34a' }}>{filtered.filter(a => a.status === 'Active').length}</div><div className="stat-lbl">Active</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: '#B5603A' }}>{filtered.filter(a => a.status === 'Inactive').length}</div><div className="stat-lbl">Inactive</div></div>
      </div>

      {loading ? (
        <div className="loading">Loading activities...</div>
      ) : (
        <EnhancedTable columns={columns} data={filtered} searchPlaceholder="Search activities..." pageSize={10} groupBy="sector_name" groupLabel={(key, rows) => (rows[0] && rows[0].sector_name) || 'Unassigned'} />
      )}

      {importModal && (
        <div className="modal-overlay" onClick={() => { if (!importing) setImportModal(false) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Upload Activities Sheet</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => { if (!importing) setImportModal(false) }}>✕</button>
            </div>
            <form onSubmit={handleImportSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
                  Select the NGO this sheet belongs to and upload the Excel/CSV file. Rows from the sheet go straight into that NGO&apos;s activity catalog, matched to your sectors.
                </p>
                <div className="form-row" style={{ marginBottom: 12 }}>
                  <div className="field"><label>NGO *</label>
                    <select value={importNgo} onChange={e => { setImportNgo(e.target.value); setImportResult(null); setImportError('') }}>
                      <option value="">Select NGO</option>
                      {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="field"><label>Sheet (Excel / CSV) *</label>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); setImportError('') }} style={{ padding: '6px 0' }} />
                  </div>
                </div>
                {importResult && (
                  <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--panel)', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#16a34a' }}>Imported {importResult.inserted || 0} activities for {importResult.ngo?.name || importResult.ngo?.code}</div>
                    <div style={{ color: 'var(--ink-soft)' }}>Parsed rows: {importResult.rows_parsed || 0} · Already existing (skipped): {importResult.skipped_existing || 0}</div>
                    {Array.isArray(importResult.sectors) && importResult.sectors.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontWeight: 600 }}>Per sector:</div>
                        {importResult.sectors.map(s => <div key={s.sector_name}>{s.sector_name}: {s.count}</div>)}
                      </div>
                    )}
                    {Array.isArray(importResult.skipped_campaigns) && importResult.skipped_campaigns.length > 0 && (
                      <div style={{ marginTop: 6 }}><span style={{ fontWeight: 600 }}>Skipped event/campaign names:</span> {importResult.skipped_campaigns.join(', ')}</div>
                    )}
                    {Array.isArray(importResult.unknown_sectors) && importResult.unknown_sectors.length > 0 && (
                      <div style={{ marginTop: 6, color: '#B5603A' }}>
                        <span style={{ fontWeight: 600 }}>Unknown sector labels (not imported):</span> {importResult.unknown_sectors.map(u => `${u.sector} (${u.count})`).join(', ')}
                      </div>
                    )}
                  </div>
                )}
                {importError && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{importError}</div>}
              </div>
              <div className="modal-actions" style={{ padding: '0 18px 18px' }}>
                <button type="button" className="btn btn-sm" onClick={() => setImportModal(false)} disabled={importing}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={importing || !importFile || !importNgo}>{importing ? 'Uploading...' : 'Upload & Import'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing ? 'Edit Activity' : 'Add Activity'}</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row" style={{ marginBottom: 12 }}>
                  <div className="field"><label>Activity Name *</label><input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Computer Lab Training" /></div>
                </div>
                <div className="form-row" style={{ marginBottom: 12 }}>
                  <div className="field"><label>NGO</label><select name="ngo_id" value={form.ngo_id} onChange={handleChange}>
                    <option value="">All NGOs</option>
                    {ngos.map(n => <option key={n.id} value={n.id}>{n.name || n.code}</option>)}
                  </select></div>
                  <div className="field"><label>Sector *</label><select name="sector_id" value={form.sector_id} onChange={handleChange} required>
                    <option value="">Select sector</option>
                    {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                </div>
                <div className="form-row" style={{ marginBottom: 12 }}>
                  <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="What this activity involves..." style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} /></div>
                </div>
                <div className="form-row">
                  <div className="field"><label>Banner Image URL</label><input name="banner" value={form.banner} onChange={handleChange} placeholder="https://..." /></div>
                </div>
                {error && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{error}</div>}
              </div>
              <div className="modal-actions" style={{ padding: '0 18px 18px' }}>
                <button type="button" className="btn btn-sm" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Activity'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
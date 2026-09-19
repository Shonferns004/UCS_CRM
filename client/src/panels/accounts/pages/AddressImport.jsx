import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { apiGet, apiPost, apiPatch } from '../api/auth'

const COLUMNS = [
  { key: 'mobile_number', label: 'Mobile No.', required: true, aliases: ['mobile no', 'mobileno', 'mobile number', 'mobile', 'phone no', 'phone', 'contact no', 'contact number', 'contact', 'mob no', 'mo no'] },
  { key: 'name', label: 'Donor Name', required: false, aliases: ['donor name', 'donorname', 'name of donor', 'name', 'donor'] },
  { key: 'address_1', label: 'Address-1', required: false, aliases: ['address 1', 'address1', 'address-1', 'add 1', 'add1', 'add-1', 'address line 1', 'address'] },
  { key: 'address_2', label: 'Address-2', required: false, aliases: ['address 2', 'address2', 'address-2', 'add 2', 'add2', 'add-2', 'address line 2'] },
  { key: 'pan_number', label: 'PAN No.', required: false, aliases: ['pan no', 'panno', 'pan number', 'pancard no', 'pan card', 'pan'] },
  { key: 'email', label: 'Mail Id', required: false, aliases: ['mail id', 'mailid', 'email id', 'emailid', 'e mail', 'e-mail', 'email', 'mail'] },
]

const normHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const matchColumns = (headers) => {
  const map = {}
  const normalized = headers.map(h => ({ raw: h, n: normHeader(h) }))
  for (const col of COLUMNS) {
    let hit = normalized.find(h => col.aliases.includes(h.n))
    if (!hit) {
      const sorted = [...col.aliases].sort((a, b) => b.length - a.length)
      for (const alias of sorted) {
        hit = normalized.find(h => h.n.includes(alias))
        if (hit) break
      }
    }
    if (hit) map[col.key] = hit.raw
  }
  return map
}

const STATUS_LABELS = {
  updated: 'Updated',
  complete: 'Already Complete',
  created: 'New Donor Created',
  created_no_data: 'Created (Mobile Only)',
  not_found: 'Not Found in DB',
  no_mobile: 'Skipped - No Mobile',
  duplicate: 'Duplicate in File',
}

const STATUS_STYLES = {
  updated: { background: '#dcfce7', color: '#15803d' },
  complete: { background: '#e5e7eb', color: '#374151' },
  created: { background: '#dbeafe', color: '#1d4ed8' },
  created_no_data: { background: '#dbeafe', color: '#1d4ed8' },
  not_found: { background: '#fef3c7', color: '#b45309' },
  no_mobile: { background: '#fee2e2', color: '#b91c1c' },
  duplicate: { background: '#fee2e2', color: '#b91c1c' },
}

const Chip = ({ value, label, color }) => (
  <div className="stat-card" style={{ padding: '10px 14px' }}>
    <div className="stat-info">
      <div className="stat-num" style={{ color, fontSize: 20 }}>{value}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  </div>
)

export default function AddressImport() {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [colMap, setColMap] = useState({})
  const [error, setError] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)
  const resultRef = useRef(null)

  // ── All-donors address list ──────────────────────────────────────
  const LIST_LIMIT = 50
  const [donors, setDonors] = useState([])
  const [donorTotal, setDonorTotal] = useState(0)
  const [donorPage, setDonorPage] = useState(1)
  const [donorSearchInput, setDonorSearchInput] = useState('')
  const [donorSearch, setDonorSearch] = useState('')
  const [donorsLoading, setDonorsLoading] = useState(true)
  const [listReload, setListReload] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [editError, setEditError] = useState('')

  const fullAddress = (d) => [d.address_1, d.address_2]
    .map(s => String(s || '').trim()).filter(Boolean).join(', ') || '—'
  const editInputStyle = { width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }

  useEffect(() => {
    const t = setTimeout(() => { setDonorSearch(donorSearchInput); setDonorPage(1) }, 400)
    return () => clearTimeout(t)
  }, [donorSearchInput])

  useEffect(() => {
    let cancelled = false
    setDonorsLoading(true)
    const params = new URLSearchParams({ page: String(donorPage), limit: String(LIST_LIMIT) })
    if (donorSearch.trim()) params.set('search', donorSearch.trim())
    apiGet(`/accounts/donors?${params.toString()}`)
      .then(res => {
        if (cancelled) return
        setDonors(Array.isArray(res?.data) ? res.data : [])
        setDonorTotal(Number(res?.total) || 0)
      })
      .catch(() => { if (!cancelled) { setDonors([]); setDonorTotal(0) } })
      .finally(() => { if (!cancelled) setDonorsLoading(false) })
    return () => { cancelled = true }
  }, [donorPage, donorSearch, listReload])

  const listFrom = donorTotal === 0 ? 0 : (donorPage - 1) * LIST_LIMIT + 1
  const listTo = Math.min(donorPage * LIST_LIMIT, donorTotal)
  const listPages = Math.max(1, Math.ceil(donorTotal / LIST_LIMIT))

  const startEdit = (donor) => {
    setEditingId(donor.id)
    setEditError('')
    setEditForm({
      name: donor.name || '',
      mobile_number: donor.mobile_number || '',
      pan_number: donor.pan_number || '',
      address_1: donor.address_1 || '',
      address_2: donor.address_2 || '',
      city: donor.city || '',
      state: donor.state || '',
      pin_code: donor.pin_code || '',
    })
  }

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError('') }

  const saveAddress = async (donor) => {
    if (savingId) return
    setSavingId(donor.id); setEditError('')
    try {
      await apiPatch(`/accounts/donors/${donor.id}`, editForm)
      cancelEdit()
      setListReload(c => c + 1)
    } catch (err) {
      setEditError(err.message || 'Unable to save address')
    } finally { setSavingId(null) }
  }

  useEffect(() => {
    if (result && resultRef.current) resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [result])

  const statusMap = useMemo(() => {
    const m = new Map()
    for (const r of (result?.results || [])) m.set(r.row, r.status)
    return m
  }, [result])

  const processFile = (file) => {
    setError(null); setResult(null); setRows([]); setFileName(''); setParsing(true)
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      setError('Please upload a valid file (.xlsx, .xls, or .csv)'); setParsing(false); return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
        if (!jsonData || jsonData.length === 0) { setError('File is empty'); setParsing(false); return }
        const headers = Object.keys(jsonData[0])
        const cm = matchColumns(headers)
        if (!cm.mobile_number) {
          setError(`Could not find a "Mobile No." column. Detected headers: ${headers.join(', ')}`)
          setParsing(false); return
        }
        const parsed = jsonData.map((r, i) => {
          const row = { _row: i + 2 }
          for (const col of COLUMNS) row[col.key] = String(cm[col.key] ? (r[cm[col.key]] ?? '') : '').trim()
          const digits = row.mobile_number.replace(/\D/g, '')
          row._valid = digits.length >= 10
          return row
        })
        setRows(parsed)
        setColMap(cm)
        setFileName(file.name)
      } catch { setError('Failed to parse file') }
      setParsing(false)
    }
    reader.onerror = () => { setError('Failed to read file'); setParsing(false) }
    reader.readAsArrayBuffer(file)
  }

  const handleImport = async () => {
    if (rows.length === 0 || importing) return
    setImporting(true); setError(null); setResult(null)
    try {
      const payload = rows.map(r => ({
        name: r.name, mobile_number: r.mobile_number,
        address_1: r.address_1, address_2: r.address_2,
        pan_number: r.pan_number, email: r.email,
      }))
      const res = await apiPost('/accounts/donors/address-import', { rows: payload })
      setResult({ ...res, fileName })
      setListReload(c => c + 1)
    } catch (err) {
      setError('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  const downloadReport = () => {
    if (!result?.results) return
    const report = result.results.map(r => ({
      'Excel Row': r.row,
      'Mobile': r.mobile,
      'Status': STATUS_LABELS[r.status] || r.status,
      ...(r.status === 'not_found' ? { Action: 'No matching donor — skipped' } : {}),
      ...(r.status === 'created' ? { Action: 'New donor profile created' } : {}),
      ...(r.status === 'created_no_data' ? { Action: 'New donor created — mobile only, no other details in file' } : {}),
    }))
    const ws = XLSX.utils.json_to_sheet(report)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Import Report')
    XLSX.writeFile(wb, `address_import_report_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const validCount = rows.filter(r => r._valid).length
  const invalidCount = rows.length - validCount
  const s = result?.summary

  return (
    <div>
      <div className="card">
        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ marginRight: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Donor Address Import</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
              Upload an Excel sheet with <strong>Mobile No.</strong> — donors are matched by mobile and only their <em>blank</em> fields (Name, Address-1, Address-2, PAN No., Mail Id) are filled. Existing values are never overwritten. Numbers not found in DB are added as new donors.
            </div>
          </div>
          {rows.length > 0 && !importing && (
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : `Import ${validCount} Rows`}
            </button>
          )}
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--sage)' : 'var(--line)'}`, borderRadius: 'var(--radius)',
            padding: 36, textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(91,107,78,.06)' : 'transparent',
            transition: 'all .15s ease', margin: '14px 16px',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: 'var(--ink-soft)', marginBottom: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{parsing ? 'Parsing...' : fileName || 'Drop Excel file here or click to browse'}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Supported columns: Mobile No. (required), Donor Name, Address-1, Address-2, PAN No., Mail Id &nbsp;&middot;&nbsp; .xlsx / .xls / .csv</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = '' }} style={{ display: 'none' }} />
        </div>

        {error && <div style={{ margin: '0 16px 14px', padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

        {rows.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '0 16px 14px' }}>
              <Chip value={rows.length} label="Total Rows" color="var(--ink)" />
              <Chip value={validCount} label="Valid Mobiles" color="#16a34a" />
              <Chip value={invalidCount} label="Missing / Bad Mobile" color="#dc2626" />
            </div>

            <div style={{ margin: '0 16px 6px', fontSize: 11, color: 'var(--ink-soft)' }}>
              Mapped columns: {COLUMNS.filter(c => colMap[c.key]).map(c => `${c.label} \u2190 "${colMap[c.key]}"`).join(' · ') || 'none'}
            </div>

            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="donors-table">
                <thead><tr><th>Row</th>{COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}<th>Status</th></tr></thead>
                <tbody>
                  {rows.slice(0, 50).map(r => {
                    const st = statusMap.get(r._row)
                    return (
                      <tr key={r._row} style={!r._valid ? { background: '#fef2f2' } : undefined}>
                        <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{r._row}</td>
                        {COLUMNS.map(c => <td key={c.key} style={{ fontFamily: c.key === 'mobile_number' || c.key === 'pan_number' ? 'monospace' : undefined }}>{r[c.key] || '\u2014'}{!r._valid && c.key === 'mobile_number' ? ' ⚠' : ''}</td>)}
                        <td>
                          {st ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', ...(STATUS_STYLES[st] || {}) }}>
                              {(STATUS_LABELS[st] || st).toUpperCase()}
                            </span>
                          ) : <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {rows.length > 50 && <tr><td colSpan={COLUMNS.length + 2} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>…and {rows.length - 50} more rows (see full report below)</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {result && (
          <div ref={resultRef} style={{ margin: 14 }}>
            <div style={{
              padding: '14px 18px', borderRadius: 10, marginBottom: 14,
              background: ((s.updated ?? 0) + (s.created ?? 0)) > 0 ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${((s.updated ?? 0) + (s.created ?? 0)) > 0 ? '#bbf7d0' : '#fde68a'}`,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: ((s.updated ?? 0) + (s.created ?? 0)) > 0 ? '#15803d' : '#b45309' }}>
                {((s.updated ?? 0) + (s.created ?? 0)) > 0
                  ? `\u2713 Import finished — ${s.updated ?? 0} donor${s.updated !== 1 ? 's' : ''} updated, ${s.created ?? 0} new donor${s.created !== 1 ? 's' : ''} created`
                  : 'Import finished — no donors needed changes'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                {s.matchedNoChange ?? 0} already had all details &middot; {(s.skippedNoMobile ?? 0) + (s.duplicatesInFile ?? 0)} invalid/duplicate row{(s.skippedNoMobile ?? 0) + (s.duplicatesInFile ?? 0) !== 1 ? 's' : ''} &middot; file: {result.fileName}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Chip value={s.updated ?? 0} label="Donors Updated" color="#16a34a" />
              <Chip value={s.created ?? 0} label="New Donors Created" color="#1d4ed8" />
              <Chip value={s.matchedNoChange ?? 0} label="Already Complete" color="var(--ink)" />
              <Chip value={(s.skippedNoMobile ?? 0) + (s.duplicatesInFile ?? 0)} label="Invalid / Duplicate" color="#dc2626" />
            </div>
            <button className="btn btn-sm" onClick={downloadReport}>Download Full Report (all rows)</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ marginRight: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>All Donors</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
              {donorTotal.toLocaleString('en-IN')} donor{donorTotal !== 1 ? 's' : ''} in database
            </div>
          </div>
          <input
            type="text"
            placeholder="Search name or mobile..."
            aria-label="Search donors by name or mobile"
            value={donorSearchInput}
            onChange={e => setDonorSearchInput(e.target.value)}
            style={{ width: 220, height: 34, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' }}
          />
        </div>

        <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="donors-table">
            <thead><tr><th>Donor Name</th><th>Mobile No.</th><th>Address</th><th>City</th><th>State</th><th>PIN</th><th>PAN No.</th><th></th></tr></thead>
            <tbody>
              {donorsLoading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', padding: 20 }}>Loading donors…</td></tr>
              ) : donors.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', padding: 20 }}>
                  {donorSearch ? 'No donors match your search.' : 'No donors found.'}
                </td></tr>
              ) : donors.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.name || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{d.mobile_number || '—'}</td>
                  <td style={{ maxWidth: 320 }}>{fullAddress(d)}</td>
                  <td>{d.city || '—'}</td>
                  <td>{d.state || '—'}</td>
                  <td>{d.pin_code || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{d.pan_number || '—'}</td>
                  <td><button className="btn btn-sm" onClick={() => startEdit(d)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', fontSize: 12, color: 'var(--ink-soft)' }}>
          <span>Showing {listFrom}–{listTo} of {donorTotal.toLocaleString('en-IN')}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" disabled={donorPage <= 1} onClick={() => setDonorPage(p => Math.max(1, p - 1))}>Prev</button>
            <span style={{ alignSelf: 'center' }}>Page {donorPage} / {listPages}</span>
            <button className="btn btn-sm" disabled={donorPage >= listPages} onClick={() => setDonorPage(p => p + 1)}>Next</button>
          </span>
        </div>
      </div>

      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onClick={cancelEdit}>
          <div className="card" style={{ width: 'min(520px, calc(100vw - 32px))', padding: 20, background: '#fff' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Edit donor details</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Donor name<input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ ...editInputStyle, marginTop: 4 }} /></label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Mobile no.<input value={editForm.mobile_number} onChange={e => setEditForm(f => ({ ...f, mobile_number: e.target.value }))} style={{ ...editInputStyle, marginTop: 4, fontFamily: 'monospace' }} /></label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>PAN no.<input value={editForm.pan_number} onChange={e => setEditForm(f => ({ ...f, pan_number: e.target.value }))} style={{ ...editInputStyle, marginTop: 4, fontFamily: 'monospace' }} /></label>
              </div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Address line 1<input value={editForm.address_1} onChange={e => setEditForm(f => ({ ...f, address_1: e.target.value }))} style={{ ...editInputStyle, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Address line 2<input value={editForm.address_2} onChange={e => setEditForm(f => ({ ...f, address_2: e.target.value }))} style={{ ...editInputStyle, marginTop: 4 }} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>City<input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} style={{ ...editInputStyle, marginTop: 4 }} /></label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>State<input value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} style={{ ...editInputStyle, marginTop: 4 }} /></label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>PIN<input value={editForm.pin_code} onChange={e => setEditForm(f => ({ ...f, pin_code: e.target.value }))} style={{ ...editInputStyle, marginTop: 4 }} /></label>
              </div>
            </div>
            {editError && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 10 }}>{editError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button className="btn btn-sm" onClick={cancelEdit} disabled={savingId}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => saveAddress(donors.find(d => d.id === editingId))} disabled={savingId}>{savingId ? 'Saving…' : 'Save details'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .donors-table th, .donors-table td { border-right: 1px solid var(--line); }
        .donors-table th:last-child, .donors-table td:last-child { border-right: none; }
      `}</style>
    </div>
  )
}

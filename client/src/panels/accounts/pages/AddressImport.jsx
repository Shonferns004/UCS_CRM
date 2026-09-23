import { useState, useRef, useEffect, useMemo, Fragment } from 'react'
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

  // ── Receipts list (search by mobile / receipt no. + date range) ──
  const RECEIPT_EDIT_FIELDS = [
    ['donor_name', 'Donor Name'],
    ['donor_mobile', 'Mobile No.'],
    ['mobile_2', 'Mobile 2'],
    ['email', 'Email'],
    ['pan_number', 'PAN No.'],
    ['address', 'Address'],
    ['address_2', 'Address 2'],
    ['station', 'Station'],
    ['account_of', 'Account Of'],
    ['mode', 'Mode'],
    ['bank_name', 'Bank Name'],
    ['payment_id', 'Payment ID'],
    ['caller_name', 'Caller Name'],
    ['agent_name', 'Agent Name'],
    ['project_id', 'Project'],
    ['receipt_time', 'Receipt Time'],
  ]
  const RECEIPT_MONO = ['donor_mobile', 'mobile_2', 'pan_number', 'payment_id']

  const LIST_LIMIT = 50
  const [receipts, setReceipts] = useState([])
  const [receiptTotal, setReceiptTotal] = useState(0)
  const [receiptPage, setReceiptPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [projectOptions, setProjectOptions] = useState([])
  const [receiptsLoading, setReceiptsLoading] = useState(true)
  const [listReload, setListReload] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [editError, setEditError] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [sortKey, setSortKey] = useState('')
  const [sortDir, setSortDir] = useState('')
  const MORE_FIELDS = RECEIPT_EDIT_FIELDS.filter(([key]) => !['donor_name', 'donor_mobile', 'email', 'pan_number', 'address', 'address_2'].includes(key))

  const fullAddress = (r) => [r.address, r.address_2]
    .map(s => String(s || '').trim()).filter(Boolean).join(', ') || '—'
  const sortAddress = (r) => [r.address, r.address_2]
    .map(s => String(s || '').trim()).filter(Boolean).join(' ')
  const editInputStyle = { width: '100%', padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, boxSizing: 'border-box', color: 'var(--ink)', background: '#fff' }
  const rv = (r, k) => { const v = r?.[k]; return v == null ? '' : String(v) }
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const SORT_COLS = [
    ['receipt_no', 'Receipt No.'],
    ['donor_name', 'Donor Name'],
    ['donor_mobile', 'Mobile'],
    ['address', 'Address'],
    ['pan_number', 'PAN'],
  ]

  const toggleSort = (key) => {
    setReceiptPage(1)
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortKey(''); setSortDir('') }
  }

  const sortedReceipts = useMemo(() => {
    if (!sortKey) return receipts
    const sign = sortDir === 'asc' ? 1 : -1
    return [...receipts].sort((a, b) => {
      let av, bv
      if (sortKey === 'receipt_no') {
        const an = parseInt(a.receipt_no, 10); const bn = parseInt(b.receipt_no, 10)
        av = Number.isFinite(an) ? an : null
        bv = Number.isFinite(bn) ? bn : null
      } else if (sortKey === 'address') {
        av = sortAddress(a); bv = sortAddress(b)
      } else {
        av = rv(a, sortKey).trim(); bv = rv(b, sortKey).trim()
      }
      const ae = av == null || av === ''
      const be = bv == null || bv === ''
      if (ae && be) return 0
      if (ae) return 1
      if (be) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
      return String(av).localeCompare(String(bv)) * sign
    })
  }, [receipts, sortKey, sortDir])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setReceiptPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    setReceiptsLoading(true)
    const params = new URLSearchParams({ limit: '0' })
    if (search.trim()) params.set('search', search.trim())
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    if (filterProject) params.set('project', filterProject)
    apiGet(`/accounts/receipts?${params.toString()}`)
      .then(res => {
        if (cancelled) return
        setReceipts(Array.isArray(res?.data) ? res.data : [])
        setReceiptTotal(Number(res?.total) || 0)
        if (Array.isArray(res?.projects)) setProjectOptions(res.projects)
      })
      .catch(() => { if (!cancelled) { setReceipts([]); setReceiptTotal(0) } })
      .finally(() => { if (!cancelled) setReceiptsLoading(false) })
    return () => { cancelled = true }
  }, [search, fromDate, toDate, filterProject, listReload])

  const listPages = Math.max(1, Math.ceil(receiptTotal / LIST_LIMIT))
  const safePage = Math.min(receiptPage, listPages)
  const listFrom = receiptTotal === 0 ? 0 : (safePage - 1) * LIST_LIMIT + 1
  const listTo = Math.min(safePage * LIST_LIMIT, receiptTotal)
  const visibleReceipts = sortedReceipts.slice((safePage - 1) * LIST_LIMIT, safePage * LIST_LIMIT)

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditError('')
    setMoreOpen(false)
    const f = {}
    for (const [key] of RECEIPT_EDIT_FIELDS) f[key] = rv(r, key)
    setEditForm(f)
  }

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(''); setMoreOpen(false) }

  const saveEdit = async (r) => {
    if (savingId) return
    const changes = {}
    for (const [key] of RECEIPT_EDIT_FIELDS) {
      if (String(editForm[key] ?? '').trim() !== rv(r, key).trim()) changes[key] = editForm[key]
    }
    if (Object.keys(changes).length === 0) { setEditingId(null); return }
    setSavingId(r.id); setEditError('')
    try {
      await apiPatch(`/accounts/receipts/${r.id}`, changes)
      setEditingId(null)
      setEditForm({})
      setMoreOpen(false)
      setListReload(c => c + 1)
    } catch (err) {
      setEditError(err.message || 'Unable to save receipt')
    } finally { setSavingId(null) }
  }

  const editInput = (key) => (
    <input
      type="text"
      value={editForm[key] ?? ''}
      onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
      style={{ ...editInputStyle, fontFamily: RECEIPT_MONO.includes(key) ? 'monospace' : undefined }}
    />
  )

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
        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ marginRight: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Receipts</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
              {receiptTotal.toLocaleString('en-IN')} receipt{receiptTotal !== 1 ? 's' : ''} · search by mobile no. or receipt no. · edit inline (amount, date &amp; receipt no. are locked)
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
              NGO
              <select value={filterProject} onChange={e => { setFilterProject(e.target.value); setReceiptPage(1) }} style={{ display: 'block', height: 32, maxWidth: 180, border: '1px solid var(--line)', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff', marginTop: 3 }}>
                <option value="">All NGOs</option>
                {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
              From
              <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setReceiptPage(1) }} style={{ display: 'block', height: 32, border: '1px solid var(--line)', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff', marginTop: 3 }} />
            </label>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
              To
              <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setReceiptPage(1) }} style={{ display: 'block', height: 32, border: '1px solid var(--line)', borderRadius: 8, padding: '0 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff', marginTop: 3 }} />
            </label>
            {(fromDate || toDate) && (
              <button className="btn btn-sm" onClick={() => { setFromDate(''); setToDate(''); setReceiptPage(1) }}>Clear dates</button>
            )}
            <input
              type="text"
              placeholder="Search mobile / receipt no. / name..."
              aria-label="Search receipts by mobile or receipt number"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              style={{ width: 230, height: 32, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="donors-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <tr>
                {SORT_COLS.map(([key, label]) => (
                  <th key={key} onClick={() => toggleSort(key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                      <span style={sortKey === key ? { fontWeight: 700, color: 'var(--sage)' } : undefined}>{label}</span>
                      <span style={{ fontSize: 10, lineHeight: 1, color: sortKey === key ? 'var(--sage)' : 'rgba(0,0,0,.25)' }}>
                        {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </div>
                  </th>
                ))}
                <th>Email</th>
                <th>Amount</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {receiptsLoading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', padding: 20 }}>Loading receipts…</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', padding: 20 }}>
                  {search || fromDate || toDate ? 'No receipts match your search / date range.' : 'No receipts found.'}
                </td></tr>
              ) : visibleReceipts.map(r => {
                const editing = editingId === r.id
                return (
                  <Fragment key={r.id}>
                  <tr className={editing ? 'receipt-editing' : ''} style={{ verticalAlign: 'top' }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.receipt_no || '—'}</td>
                    <td style={{ minWidth: 150 }}>{editing ? editInput('donor_name') : (r.donor_name || '—')}</td>
                    <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', minWidth: 110 }}>{editing ? editInput('donor_mobile') : (r.donor_mobile || '—')}</td>
                    <td style={{ maxWidth: 280, minWidth: 180 }}>
                      {editing
                        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{editInput('address')}{editInput('address_2')}</div>
                        : <span style={{ wordBreak: 'break-word' }}>{fullAddress(r)}</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', minWidth: 120 }}>{editing ? editInput('pan_number') : (r.pan_number || '—')}</td>
                    <td style={{ maxWidth: 160, minWidth: 140, wordBreak: 'break-word' }}>{editing ? editInput('email') : (r.email || '—')}</td>
                    <td style={{ fontWeight: 700, color: 'var(--sage)', whiteSpace: 'nowrap' }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.receipt_date)}{r.receipt_date && r.receipt_time ? ` ${r.receipt_time}` : ''}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {editing ? (
                          <>
                            {moreOpen
                              ? <button className="btn btn-sm" onClick={() => setMoreOpen(false)} disabled={!!savingId}>Less</button>
                              : <button className="btn btn-sm" onClick={() => setMoreOpen(true)} disabled={!!savingId}>More</button>}
                            <button className="btn btn-sm" onClick={cancelEdit} disabled={!!savingId}>Cancel</button>
                            <button className="btn btn-sm btn-primary" onClick={() => saveEdit(r)} disabled={!!savingId}>{savingId ? 'Saving…' : 'Save'}</button>
                          </>
                        ) : (
                          <button className="btn btn-sm" onClick={() => startEdit(r)}>Edit</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editing && moreOpen && (
                    <tr className="receipt-editing" style={{ verticalAlign: 'top' }}>
                      <td colSpan={9} style={{ borderTop: '1px dashed var(--line)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, padding: '4px 0' }}>
                          {MORE_FIELDS.map(([key, label]) => (
                            <label key={key} style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {label}
                              {editInput(key)}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {editError && <div style={{ fontSize: 12, color: '#b91c1c', padding: '8px 16px' }}>Save failed: {editError}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', fontSize: 12, color: 'var(--ink-soft)' }}>
          <span>Showing {listFrom}–{listTo} of {receiptTotal.toLocaleString('en-IN')}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" disabled={safePage <= 1} onClick={() => setReceiptPage(p => Math.max(1, p - 1))}>Prev</button>
            <span style={{ alignSelf: 'center' }}>Page {safePage} / {listPages}</span>
            <button className="btn btn-sm" disabled={safePage >= listPages} onClick={() => setReceiptPage(p => p + 1)}>Next</button>
          </span>
        </div>
      </div>

      <style>{`
        .donors-table th, .donors-table td { border-right: 1px solid var(--line); }
        .donors-table th:last-child, .donors-table td:last-child { border-right: none; }
        .receipt-editing { background: #f4f8f1; }
        .receipt-editing td { padding-top: 6px; padding-bottom: 6px; }
      `}</style>
    </div>
  )
}

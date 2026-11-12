import { useState, useRef, useEffect, useMemo, Fragment } from 'react'
import * as XLSX from 'xlsx'
import { X } from 'lucide-react'
import { apiGet, apiPost, apiPatch } from '../api/auth'
import DonorTabs from '../components/DonorTabs'

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
  const [uploadModal, setUploadModal] = useState(false)
  const fileRef = useRef(null)
  const resultRef = useRef(null)

  const openUploadModal = () => {
    setFileName(''); setRows([]); setColMap({}); setError(null); setResult(null); setParsing(false)
    setUploadModal(true)
  }

  useEffect(() => {
    const handler = () => openUploadModal()
    window.addEventListener('open-upload-sheet-modal', handler)
    return () => window.removeEventListener('open-upload-sheet-modal', handler)
  }, [])

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

  const LIST_LIMIT = 20
  const [receipts, setReceipts] = useState([])
  const [receiptTotal, setReceiptTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [projectOptions, setProjectOptions] = useState([])
  const [receiptsLoading, setReceiptsLoading] = useState(true)
  const [listReload, setListReload] = useState(0)
  // Excel-style single-cell editing: double-click a cell, type, Enter/blur
  // saves just that field. Nothing else on the row enters edit mode.
  const [cellEdit, setCellEdit] = useState(null) // { id, key }
  const [cellForm, setCellForm] = useState({})
  const [savingCell, setSavingCell] = useState(false)
  const [editError, setEditError] = useState('')
  const [sortKey, setSortKey] = useState('')
  const [sortDir, setSortDir] = useState('')

  const fullAddress = (r) => {
    const parts = [r.address, r.address_2].map(s => String(s || '').trim()).filter(s => s && s !== '-' && s !== '—')
    return parts.length ? parts.join(', ') : 'NA'
  }
  // Anything the table shows for a missing value reads "NA" — never a dash.
  const na = (v) => {
    const s = String(v ?? '').trim()
    return (!s || s === '-' || s === '—') ? 'NA' : s
  }
  const sortAddress = (r) => [r.address, r.address_2]
    .map(s => String(s || '').trim()).filter(Boolean).join(' ')
  const editInputStyle = { width: '100%', height: 18, padding: 0, margin: 0, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', font: 'inherit', lineHeight: '18px', boxSizing: 'border-box' }
  const rv = (r, k) => { const v = r?.[k]; return v == null ? '' : String(v) }
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'NA'

  const SORT_COLS = [
    ['receipt_no', 'Receipt No.'],
    ['donor_name', 'Donor Name'],
    ['donor_mobile', 'Mobile'],
    ['address', 'Address'],
    ['pan_number', 'PAN'],
  ]

  const toggleSort = (key) => {
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
    const t = setTimeout(() => { setSearch(searchInput) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    setReceiptsLoading(true)
    const params = new URLSearchParams({ limit: String(LIST_LIMIT), page: '1' })
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

  const [loadingMore, setLoadingMore] = useState(false)
  const hasMore = receipts.length < receiptTotal
  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = Math.floor(receipts.length / LIST_LIMIT) + 1
      const params = new URLSearchParams({ limit: String(LIST_LIMIT), page: String(nextPage) })
      if (search.trim()) params.set('search', search.trim())
      if (fromDate) params.set('from_date', fromDate)
      if (toDate) params.set('to_date', toDate)
      if (filterProject) params.set('project', filterProject)
      const res = await apiGet(`/accounts/receipts?${params.toString()}`)
      setReceipts(prev => [...prev, ...(Array.isArray(res?.data) ? res.data : [])])
    } catch { /* keep what we have */ }
    finally { setLoadingMore(false) }
  }

  const visibleReceipts = sortedReceipts

  const isEditableKey = (key) => RECEIPT_EDIT_FIELDS.some(([k]) => k === key)

  const beginCellEdit = (r, key) => {
    if (!isEditableKey(key)) return
    setEditError('')
    setCellEdit({ id: r.id, key })
    if (key === 'address') setCellForm({ address: rv(r, 'address'), address_2: rv(r, 'address_2') })
    else setCellForm({ [key]: rv(r, key) })
  }

  const cancelCellEdit = () => { setCellEdit(null); setCellForm({}) }

  const commitCellEdit = async (r) => {
    if (!cellEdit || savingCell) return
    const changes = {}
    for (const [k, v] of Object.entries(cellForm)) {
      if (String(v ?? '').trim() !== rv(r, k).trim()) changes[k] = v
    }
    if (Object.keys(changes).length === 0) { cancelCellEdit(); return }
    setSavingCell(true); setEditError('')
    try {
      await apiPatch(`/accounts/receipts/${r.id}`, changes)
      cancelCellEdit()
      setListReload(c => c + 1)
    } catch (err) {
      setEditError(err.message || 'Unable to save receipt')
    } finally {
      setSavingCell(false)
    }
  }

  // In-cell editor. Blur only commits when focus leaves the whole cell, so the
  // address cell can hold two inputs without saving between them. The input has
  // no box and a fixed line box so entering edit mode never changes row height.
  const cellEditor = (r, keys) => (
    <div
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) commitCellEdit(r) }}
      style={{ display: 'flex', flexDirection: keys.length > 1 ? 'row' : 'column', gap: 4 }}
    >
      {keys.map(key => (
        <input
          key={key}
          autoFocus={key === keys[0]}
          value={cellForm[key] ?? ''}
          onChange={e => setCellForm(p => ({ ...p, [key]: e.target.value }))}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitCellEdit(r) }
            if (e.key === 'Escape') { e.preventDefault(); cancelCellEdit() }
          }}
          style={{ ...editInputStyle, flex: keys.length > 1 ? 1 : undefined, fontFamily: RECEIPT_MONO.includes(key) ? 'monospace' : undefined }}
        />
      ))}
    </div>
  )

  const editableCell = (r, key, display, tdStyle) => {
    const active = cellEdit && cellEdit.id === r.id && cellEdit.key === key
    return (
      <td
        style={{ ...tdStyle, cursor: isEditableKey(key) ? 'text' : 'default', ...(active ? { boxShadow: 'inset 0 0 0 2px var(--sage)', background: '#fff' } : null) }}
        title={isEditableKey(key) ? 'Double-click to edit' : undefined}
        onDoubleClick={e => { if (!active) { e.preventDefault(); beginCellEdit(r, key) } }}
      >
        {active ? cellEditor(r, key === 'address' ? ['address', 'address_2'] : [key]) : display}
      </td>
    )
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
      <DonorTabs>
        {(() => {
          const activeFilterCount = (filterProject ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0)
          return (
            <>
              <input
                type="text"
                placeholder="Search mobile / receipt no. / name..."
                aria-label="Search receipts by mobile or receipt number"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                style={{ width: 260, maxWidth: '100%', height: 38, border: '1px solid #DCE6F1', borderRadius: 9, background: '#fff', padding: '0 12px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' }}
              />
              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                title="Filter receipts by NGO"
                style={{ height: 38, minWidth: 130, padding: '0 10px', borderRadius: 9, border: '1px solid #DCE6F1', background: '#fff', fontSize: 12.5, fontFamily: 'inherit', color: '#475569' }}
              >
                <option value="">All NGOs</option>
                {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                title="From date"
                style={{ height: 38, borderRadius: 9, border: '1px solid #DCE6F1', background: '#fff', fontSize: 12.5, fontFamily: 'inherit', padding: '0 8px', color: '#475569' }}
              />
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                title="To date"
                style={{ height: 38, borderRadius: 9, border: '1px solid #DCE6F1', background: '#fff', fontSize: 12.5, fontFamily: 'inherit', padding: '0 8px', color: '#475569' }}
              />
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setActionsOpen(v => !v)}
                  title="More actions"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={actionsOpen}
                  style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid #DCE6F1', background: '#fff', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1 }}
                >
                  ⋮
                </button>
                {actionsOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setActionsOpen(false)} />
                    <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50, width: 210, background: '#fff', border: '1px solid #DCE6F1', borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,.16)', padding: 5 }}>
                      <button
                        role="menuitem"
                        onClick={() => { setActionsOpen(false); window.dispatchEvent(new CustomEvent('open-upload-sheet-modal')) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, textAlign: 'left', cursor: 'pointer', color: '#2563eb' }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Upload Sheet
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )
        })()}
      </DonorTabs>
      {uploadModal && (
        <div className="modal-overlay" onClick={() => setUploadModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(15,23,42,.25)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Upload Address Sheet</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                  Matched by Mobile No. — only blank donor fields are filled; existing values are never overwritten.
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setUploadModal(false)} title="Close" style={{ padding: '6px 8px' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: 16 }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--sage)' : 'var(--line)'}`, borderRadius: 'var(--radius)',
                  padding: 36, textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(91,107,78,.06)' : 'transparent',
                  transition: 'all .15s ease',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: 'var(--ink-soft)', marginBottom: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{parsing ? 'Parsing...' : fileName || 'Drop Excel file here or click to browse'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Supported columns: Mobile No. (required), Donor Name, Address-1, Address-2, PAN No., Mail Id &nbsp;&middot;&nbsp; .xlsx / .xls / .csv</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = '' }} style={{ display: 'none' }} />
              </div>

              {error && <div style={{ margin: '14px 0 0', padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

              {rows.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '14px 0' }}>
                    <Chip value={rows.length} label="Total Rows" color="var(--ink)" />
                    <Chip value={validCount} label="Valid Mobiles" color="#16a34a" />
                    <Chip value={invalidCount} label="Missing / Bad Mobile" color="#dc2626" />
                  </div>

                  <div style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--ink-soft)' }}>
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
                <div ref={resultRef} style={{ marginTop: 16 }}>
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

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {rows.length > 0 && !importing && (
                <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? 'Importing...' : `Import ${validCount} Rows`}
                </button>
              )}
              <button className="btn" onClick={() => setUploadModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Receipts</div>
          <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Double-click a cell to edit</span>
          {savingCell && <span style={{ fontSize: 11.5, color: 'var(--sage)', fontWeight: 700, marginLeft: 'auto' }}>Saving…</span>}
        </div>

        <div className="table-wrap">
          <table className="donors-table receipts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
              </tr>
            </thead>
            <tbody>
              {receiptsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {[70, 130, 100, 170, 90, 140, 60, 70].map((w, j) => (
                      <td key={j} style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-block', width: w, height: 14, borderRadius: 4, background: 'linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : receipts.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', padding: 20 }}>
                  {search || fromDate || toDate ? 'No receipts match your search / date range.' : 'No receipts found.'}
                </td></tr>
              ) : visibleReceipts.map(r => {
                return (
                  <tr key={r.id} style={{ verticalAlign: 'top' }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.receipt_no || 'NA'}</td>
                    {editableCell(r, 'donor_name', na(r.donor_name), { minWidth: 150 })}
                    {editableCell(r, 'donor_mobile', na(r.donor_mobile), { fontFamily: 'monospace', whiteSpace: 'nowrap', minWidth: 110 })}
                    {editableCell(r, 'address', <span style={{ wordBreak: 'break-word' }}>{fullAddress(r)}</span>, { maxWidth: 280, minWidth: 180 })}
                    {editableCell(r, 'pan_number', na(r.pan_number), { fontFamily: 'monospace', minWidth: 120 })}
                    {editableCell(r, 'email', <span style={{ wordBreak: 'break-word' }}>{na(r.email)}</span>, { maxWidth: 160, minWidth: 140 })}
                    <td style={{ fontWeight: 700, color: 'var(--sage)', whiteSpace: 'nowrap' }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.receipt_date)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {editError && <div style={{ fontSize: 12, color: '#b91c1c', padding: '8px 16px' }}>Save failed: {editError}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 6px', fontSize: 12, color: 'var(--ink-soft)' }}>
          <span>
            {receiptsLoading
              ? 'Loading receipts…'
              : `Showing 1–${visibleReceipts.length.toLocaleString('en-IN')} of ${receiptTotal.toLocaleString('en-IN')}`}
          </span>
        </div>
        {!receiptsLoading && hasMore && (
          <div style={{ textAlign: 'center', paddingBottom: 8 }}>
            <button
              className="btn btn-outline"
              style={{ borderRadius: 8, padding: '9px 24px' }}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : `Load More (${(receiptTotal - receipts.length).toLocaleString('en-IN')} more)`}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .donors-table th, .donors-table td { border-right: 1px solid var(--line); }
        .donors-table th:last-child, .donors-table td:last-child { border-right: none; }
        /* Fixed cell box: entering edit mode must never change the row height. */
        .receipts-table td { padding: 10px 16px; line-height: 18px; height: 38px; vertical-align: middle; }
        .receipts-table td > div { line-height: 18px; }
        .receipts-table td input { height: 18px; line-height: 18px; }
        .receipt-editing { background: #f4f8f1; }
      `}</style>
    </div>
  )
}

import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../api/auth'

/* ============ MINT PALETTE (same as Dashboard) ============ */
const MINT = '#8CCDA4'
const MINT_DEEP = '#2A6B45'
const MINT_DARK = '#1E4D3B'
const MINT_LIGHT = '#EAF7EE'
const BLUSH = '#F7B2AD'
const RED_DEEP = '#C0473C'
const GOLD = '#E0A73C'
const GOLD_LIGHT = '#F6C979'
const SLATE = '#4C7C8C'
const PRIMARY = '#1F332B'

const CAT_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4']
const CATEGORIES = ['Desktop', 'Android Mobile', 'Nokia Mobile', 'Laptop']
const LOCATIONS = ['Balcony', 'AFLF Cabin', 'MANN Cabin', 'BPO Cabin', 'Library Cabin', "Vocational Cabin", "Director's Cabin", "Director's Washroom", 'Kitchen', 'Reception Cabin', 'AFLF Staircase', 'BSCT Staircase']
const CONDITIONS = ['New', 'Good', 'Average', 'Damaged']

/* Common item suggestions shown while entering a new asset */
const ITEM_SUGGESTIONS = {
  'Desktop': ['Desktop', 'Desktop Computer', 'Dell Desktop', 'HP Desktop', 'Lenovo Desktop', 'Acer Desktop'],
  'Laptop': ['Laptop', 'Dell Laptop', 'HP Laptop', 'Lenovo Laptop', 'Asus Laptop', 'MacBook'],
  'Android Mobile': ['Android Mobile', 'Smartphone', 'Samsung Galaxy', 'Redmi', 'Realme', 'Vivo', 'Oppo'],
  'Nokia Mobile': ['Nokia Mobile', 'Nokia 105', 'Nokia 110', 'Nokia 150', 'Keypad Phone'],
}

const STATUS_META = {
  available:   { label: 'Available',   bg: '#D6E4FB', text: '#2B5FB3' },
  assigned:    { label: 'Assigned',    bg: '#B9EFCE', text: '#1B7A3D' },
  repair:      { label: 'Repair',      bg: '#FDE0BC', text: '#B37122' },
  not_working: { label: 'Not Working', bg: '#FBDBD6', text: '#B3392B' },
  lost:        { label: 'Lost',        bg: '#F3D4D0', text: '#8E2C21' },
  scrapped:    { label: 'Scrapped',    bg: '#E5E7EB', text: '#4B5563' },
}

const money = v => `₹${Number(v || 0).toLocaleString('en-IN')}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const daysSince = d => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0
const daysUntil = d => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null

/* ================= CSV EXPORT ================= */
function exportAssets(assets) {
  const rows = [['ASSET REGISTER'], ['Generated', new Date().toLocaleString('en-IN')], []]
  rows.push(['Code', 'Name', 'Category', 'Location', 'Quantity', 'Team Leader', 'Brand', 'Model', 'Serial No', 'Condition', 'Status', 'Assigned To', 'Purchase Date', 'Price', 'Warranty Expiry', 'SIM Number', 'Remarks'])
  assets.forEach(a => rows.push([
    a.code, a.name, a.category, a.location || a.department || '', a.quantity || 1, a.team_leader || '',
    a.brand || '', a.model || '', a.serial_no || '',
    a.condition || '', STATUS_META[a.status]?.label || a.status, a.assigned_to_name || '',
    a.purchase_date || '', a.purchase_price || 0, a.warranty_expiry || '', a.sim_number || '', a.remarks || '',
  ]))
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `asset-register-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ================= SMALL PIECES ================= */
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.available
  return <span className="ar-badge" style={{ background: m.bg, color: m.text }}>{m.label}</span>
}

function Field({ label, children }) {
  return (
    <div className="ar-field">
      <span className="ar-field-label">{label}</span>
      <div className="ar-field-input">{children}</div>
    </div>
  )
}

/* ================= IMPORT EXCEL (Office Asset Register) ================= */
const SNAP_CODES = { 'Desktop': 1, 'Laptop': 1, 'Android Mobile': 1, 'Nokia Mobile': 1 }

function normalizeCode(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  return s.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ')
}

function ImportModal({ onClose, onImported }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  function handleFile(file) {
    if (!file) return
    setError(''); setResult(null); setFileName(file.name); setRows([])
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const out = []
        const sheets = [
          { name: 'Computer', dataFrom: 1, descCol: 4, qtyCol: 5, hasId: true },
          { name: 'Asset Register', dataFrom: 3, descCol: 3, qtyCol: 4, hasId: false },
        ]
        sheets.forEach(({ name, dataFrom, descCol, qtyCol, hasId }) => {
          const ws = wb.Sheets[name]
          if (!ws) return
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          data.forEach((r, i) => {
            if (i < dataFrom) return
            const loc = String(r[1] || '').trim().replace(/\s+$/, '')
            const cat = String(r[2] || '').trim()
            if (!SNAP_CODES[cat]) return
            const code = hasId ? normalizeCode(r[0]) : ''
            const desc = String(r[descCol] || '').trim()
            const qty = hasId ? 1 : (Number(r[qtyCol]) || 1)
            const name = hasId ? cat : (desc || cat)
            const dedupeKey = code || `${cat}||${loc}||${name}`
            out.push({
              _key: dedupeKey,
              include: true,
              code,
              name,
              category: cat,
              location: loc,
              team_leader: hasId ? String(r[3] || '').trim() : '',
              quantity: qty,
              remarks: hasId ? desc : '',
            })
          })
        })
        setRows(out)
      } catch (err) {
        setError('Could not parse the file: ' + err.message)
      }
    }
    reader.onerror = () => setError('Could not read the file. Please try again.')
    reader.readAsArrayBuffer(file)
  }

  const selected = rows.filter(r => r.include)
  const totalQty = selected.reduce((a, r) => a + (r.quantity || 1), 0)

  async function doImport() {
    if (selected.length === 0) return
    setImporting(true); setResult(null)
    try {
      const payload = selected.map(({ _key, include, ...row }) => ({ ...row, status: 'available' }))
      const res = await api('/assets/import', { method: 'POST', body: JSON.stringify({ rows: payload }) })
      setResult(res)
      onImported()
    } catch (err) {
      setError('Import API call failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="ar-overlay" onClick={onClose}>
      <div className="ar-modal" style={{ maxWidth: 860 }} onClick={e => e.stopPropagation()}>
        <div className="ar-modal-head">
          <h3 className="ar-modal-title">Import Assets from Excel</h3>
          <button className="ar-close" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="ar-modal-body">
          <p className="ar-muted" style={{ margin: '0 0 14px' }}>
            Imports <b>Desktop + Laptop</b> (Computer sheet, individual asset codes) and
            <b> Android / Nokia Mobile</b> (Asset Register sheet, quantity lines) from the Office Asset Register workbook.
            All other asset categories are skipped automatically.
          </p>

          <label className="ar-btn ar-btn-ghost" style={{ cursor: 'pointer', marginBottom: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 6, verticalAlign: 'text-bottom' }}>folder_open</span>
            {fileName || 'Choose Excel file…'}
            <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </label>

          {error && <div className="ar-inline-alert" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
          {result && (
            <div className="ar-inline-alert" style={{ background: 'rgba(196,213,240,0.25)', borderColor: SLATE, color: '#1e3a5f' }}>
              ✓ <b>{result.inserted}</b> imported, <b>{result.skipped?.length || 0}</b> skipped (already exist), <b>{result.errors?.length || 0}</b> errors.
              {result.skipped?.length > 0 && <span style={{ display: 'block', fontSize: 12, marginTop: 4 }}>Skipped: {result.skipped.slice(0, 6).map(s => s.code).join(', ')}{result.skipped.length > 6 ? '…' : ''}</span>}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="ar-table-wrap" style={{ maxHeight: 320, marginBottom: 10 }}>
                <table className="ar-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked={selected.length === rows.length} onChange={e => setRows(rows.map(r => ({ ...r, include: e.target.checked })))} /></th>
                      <th>Code</th><th>Name</th><th>Category</th><th>Location</th><th>Qty</th><th>Team Leader</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r._key || i}>
                        <td><input type="checkbox" checked={r.include} onChange={e => setRows(rows.map((x, xi) => xi === i ? { ...x, include: e.target.checked } : x))} /></td>
                        <td className="ar-code">{r.code || '—'}</td>
                        <td>{r.name}</td>
                        <td>{r.category}</td>
                        <td>{r.location || '—'}</td>
                        <td>{r.quantity}</td>
                        <td>{r.team_leader || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ar-muted" style={{ fontSize: 12 }}>{selected.length} rows · {totalQty} units selected</p>
            </>
          )}
        </div>
        <div className="ar-modal-foot">
          <button className="ar-btn ar-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ar-btn ar-btn-primary" disabled={importing || selected.length === 0} onClick={doImport}>
            {importing ? 'Importing…' : `Import ${selected.length} assets`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= ADD / EDIT ASSET MODAL ================= */
function AssetFormModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(() => {
    if (initial) return { ...initial, quantity: Number(initial.quantity || 1), location: initial.location || initial.department || '' }
    return {
      name: '', category: 'Desktop', brand: '', model: '', serial_no: '',
      location: '', quantity: 1, team_leader: '', condition: 'New', status: 'available',
      purchase_date: '', purchase_price: '', vendor: '', warranty_expiry: '',
      sim_number: '', sim_operator: '', sim_plan: '', remarks: '',
    }
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const isSim = f.category === 'Android Mobile' || f.category === 'Nokia Mobile'
  const isMachine = f.category === 'Desktop' || f.category === 'Laptop'

  return (
    <div className="ar-overlay" onClick={onClose}>
      <div className="ar-modal" onClick={e => e.stopPropagation()}>
        <div className="ar-modal-head">
          <h3 className="ar-modal-title">{initial ? 'Edit Asset' : 'Add New Asset'}</h3>
          <button className="ar-close" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="ar-modal-body">
          <div className="ar-form-grid">
            <Field label="Asset Name *">
              <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Dell Laptop" list="ar-item-suggestions" />
              <datalist id="ar-item-suggestions">
                {(ITEM_SUGGESTIONS[f.category] || []).map(item => <option key={item} value={item} />)}
              </datalist>
            </Field>
            <Field label="Category *">
              <select value={f.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Brand / Company"><input value={f.brand} onChange={e => set('brand', e.target.value)} placeholder="Dell, Samsung..." /></Field>
            <Field label="Model"><input value={f.model} onChange={e => set('model', e.target.value)} placeholder="Inspiron 15" /></Field>
            <Field label="Serial No / IMEI"><input value={f.serial_no} onChange={e => set('serial_no', e.target.value)} /></Field>
            <Field label="Location">
              <select value={f.location} onChange={e => set('location', e.target.value)}>
                <option value="">—</option>
                {LOCATIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </Field>
            {!isMachine && <Field label="Quantity"><input type="number" min="1" value={f.quantity} onChange={e => set('quantity', e.target.value)} /></Field>}
            {isMachine && <Field label="Team Leader (opt.)"><input value={f.team_leader} onChange={e => set('team_leader', e.target.value)} placeholder="e.g. Anjana Vyas" /></Field>}
            <Field label="Condition">
              <select value={f.condition} onChange={e => set('condition', e.target.value)}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Purchase Date"><input type="date" value={f.purchase_date} onChange={e => set('purchase_date', e.target.value)} /></Field>
            <Field label="Purchase Price (₹)"><input type="number" value={f.purchase_price} onChange={e => set('purchase_price', e.target.value)} /></Field>
            <Field label="Vendor / Shop"><input value={f.vendor} onChange={e => set('vendor', e.target.value)} /></Field>
            <Field label="Warranty Expiry"><input type="date" value={f.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)} /></Field>
            {isSim && <Field label="SIM Number (Mobile No.)"><input value={f.sim_number} onChange={e => set('sim_number', e.target.value)} placeholder="98XXXXXXXX" /></Field>}
            {isSim && <Field label="Operator">
              <select value={f.sim_operator} onChange={e => set('sim_operator', e.target.value)}>
                <option value="">—</option><option>Jio</option><option>Airtel</option><option>Vi</option><option>BSNL</option>
              </select>
            </Field>}
            {isSim && <Field label="Monthly Plan (₹)"><input type="number" value={f.sim_plan} onChange={e => set('sim_plan', e.target.value)} /></Field>}
            <Field label="Remarks"><input value={f.remarks} onChange={e => set('remarks', e.target.value)} /></Field>
          </div>
        </div>
        <div className="ar-modal-foot">
          <button className="ar-btn ar-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ar-btn ar-btn-primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>
            {initial ? 'Save Changes' : 'Add Asset'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= ACTION MODAL (assign / return / repair) ================= */
function ActionModal({ type, asset, workers, onClose, onDone }) {
  const [workerId, setWorkerId] = useState('')
  const [condition, setCondition] = useState(asset.condition || 'Good')
  const [shop, setShop] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')

  const titles = { assign: 'Assign Asset', return: 'Return Asset', repair: 'Send to Repair', repair_done: 'Repair Complete' }

  function submit() {
    if (type === 'assign') {
      const w = workers.find(x => String(x.id) === String(workerId))
      onDone({ status: 'assigned', assigned_to: workerId, assigned_to_name: w?.name || '', assigned_date: new Date().toISOString().slice(0, 10) },
        `Assigned to ${w?.name || 'worker'}${note ? ` — ${note}` : ''}`)
    } else if (type === 'return') {
      onDone({ status: 'available', assigned_to: null, assigned_to_name: '', condition },
        `Returned by ${asset.assigned_to_name || 'worker'} — condition: ${condition}${note ? ` — ${note}` : ''}`)
    } else if (type === 'repair') {
      onDone({ status: 'repair', repair_shop: shop, repair_cost: cost, repair_date: new Date().toISOString().slice(0, 10) },
        `Sent to repair — ${shop || 'shop'}${cost ? `, ${money(cost)}` : ''}${note ? ` — ${note}` : ''}`)
    } else if (type === 'repair_done') {
      onDone({ status: asset.assigned_to ? 'assigned' : 'available', condition, repair_shop: '', repair_date: null,
        total_repair_cost: Number(asset.total_repair_cost || 0) + Number(asset.repair_cost || 0) },
        `Repair complete — condition: ${condition}`)
    }
  }

  return (
    <div className="ar-overlay" onClick={onClose}>
      <div className="ar-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="ar-modal-head">
          <h3 className="ar-modal-title">{titles[type]} — {asset.code}</h3>
          <button className="ar-close" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="ar-modal-body">
          {type === 'assign' && (
            <Field label="Worker *">
              <select value={workerId} onChange={e => setWorkerId(e.target.value)}>
                <option value="">Select worker...</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name} {w.department ? `(${w.department})` : ''}</option>)}
              </select>
            </Field>
          )}
          {(type === 'return' || type === 'repair_done') && (
            <Field label="Condition Check">
              <select value={condition} onChange={e => setCondition(e.target.value)}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          )}
          {type === 'repair' && (
            <>
              <Field label="Repair Shop / Person"><input value={shop} onChange={e => setShop(e.target.value)} placeholder="e.g. Sharma Computers" /></Field>
              <Field label="Estimated Cost (₹)"><input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
            </>
          )}
          <Field label="Note (optional)"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
        </div>
        <div className="ar-modal-foot">
          <button className="ar-btn ar-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ar-btn ar-btn-primary" disabled={type === 'assign' && !workerId} onClick={submit}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

/* ================= ASSET DETAIL MODAL ================= */
function AssetDetailModal({ asset, onClose, onAction, onEdit, onScrap, onLost }) {
  const repairDays = asset.status === 'repair' ? daysSince(asset.repair_date) : 0
  const warrantyDays = daysUntil(asset.warranty_expiry)
  const totalRepair = Number(asset.total_repair_cost || 0) + (asset.status === 'repair' ? Number(asset.repair_cost || 0) : 0)
  const repairHeavy = asset.purchase_price && totalRepair > Number(asset.purchase_price) / 2

  return (
    <div className="ar-overlay" onClick={onClose}>
      <div className="ar-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="ar-modal-head">
          <div>
            <h3 className="ar-modal-title">{asset.name} <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 12 }}>({asset.code})</span></h3>
            <div style={{ marginTop: 4 }}><StatusBadge status={asset.status} /></div>
          </div>
          <button className="ar-close" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="ar-modal-body">
          {asset.status === 'repair' && repairDays > 30 && (
            <div className="ar-inline-alert">⚠ This asset has been in repair for {repairDays} days — please follow up!</div>
          )}
          {warrantyDays !== null && warrantyDays > 0 && warrantyDays <= 30 && (
            <div className="ar-inline-alert" style={{ background: 'rgba(246,201,121,0.25)', borderColor: GOLD_LIGHT, color: '#8a6210' }}>
              ⏰ Warranty expires in {warrantyDays} days
            </div>
          )}
          {repairHeavy && (
            <div className="ar-inline-alert">💡 Total repair cost ({money(totalRepair)}) exceeds half the purchase price — consider replacing this asset.</div>
          )}

          <table className="ar-info-table">
            <tbody>
              <tr><td>Category</td><td>{asset.category}</td></tr>
              <tr><td>Brand / Model</td><td>{[asset.brand, asset.model].filter(Boolean).join(' ') || '—'}</td></tr>
              <tr><td>Serial No / IMEI</td><td><code>{asset.serial_no || '—'}</code></td></tr>
              <tr><td>Location</td><td>{asset.location || '—'}</td></tr>
              {Number(asset.quantity || 1) > 1 && <tr><td>Quantity</td><td>{Number(asset.quantity)} pcs (grouped line item)</td></tr>}
              <tr><td>Team Leader</td><td>{asset.team_leader || '—'}</td></tr>
              <tr><td>Condition</td><td>{asset.condition || '—'}</td></tr>
              <tr><td>Assigned To</td><td>{asset.assigned_to_name ? `${asset.assigned_to_name} (${fmtDate(asset.assigned_date)} se)` : '—'}</td></tr>
              <tr><td>Purchase</td><td>{fmtDate(asset.purchase_date)} · {money(asset.purchase_price)} {asset.vendor ? `· ${asset.vendor}` : ''}</td></tr>
              <tr><td>Warranty</td><td>{fmtDate(asset.warranty_expiry)}</td></tr>
              {asset.sim_number && <tr><td>SIM Number</td><td><code>{asset.sim_number}</code> {asset.sim_operator ? `(${asset.sim_operator})` : ''} {asset.sim_plan ? `· ${money(asset.sim_plan)}/month` : ''}</td></tr>}
              {asset.status === 'repair' && <tr><td>Repair</td><td>{asset.repair_shop || '—'} · {money(asset.repair_cost)} · {repairDays} days</td></tr>}
              {totalRepair > 0 && <tr><td>Total Repair Cost</td><td>{money(totalRepair)}</td></tr>}
              {asset.remarks && <tr><td>Remarks</td><td>{asset.remarks}</td></tr>}
            </tbody>
          </table>

          {/* actions */}
          <div className="ar-actions">
            {(asset.status === 'available' || asset.status === 'not_working') && <button className="ar-btn ar-btn-primary" onClick={() => onAction('assign')}>Assign</button>}
            {asset.status === 'assigned' && <button className="ar-btn ar-btn-primary" onClick={() => onAction('return')}>Return</button>}
            {(asset.status === 'available' || asset.status === 'assigned' || asset.status === 'not_working') && <button className="ar-btn ar-btn-amber" onClick={() => onAction('repair')}>Send to Repair</button>}
            {asset.status === 'repair' && <button className="ar-btn ar-btn-primary" onClick={() => onAction('repair_done')}>Repair Done</button>}
            <button className="ar-btn ar-btn-ghost" onClick={onEdit}>Edit</button>
            {asset.status !== 'lost' && <button className="ar-btn ar-btn-red-ghost" onClick={onLost}>Mark Lost</button>}
            {asset.status !== 'scrapped' && <button className="ar-btn ar-btn-red-ghost" onClick={onScrap}>Scrap</button>}
          </div>

          {/* history */}
          <h4 className="ar-sub-title">History</h4>
          {(asset.history || []).length === 0 ? (
            <p className="ar-muted">No history yet.</p>
          ) : (
            <div className="ar-history">
              {[...asset.history].reverse().map((h, i) => (
                <div key={i} className="ar-history-row">
                  <span className="ar-history-dot" />
                  <div>
                    <span className="ar-history-text">{h.text}</span>
                    <span className="ar-history-date">{fmtDate(h.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ================= MAIN PAGE ================= */
export default function AssetRegister() {
  const [assets, setAssets] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false) // backend endpoints not ready yet
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fLoc, setFLoc] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editAsset, setEditAsset] = useState(null)
  const [action, setAction] = useState(null) // { type }
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    // Backend endpoint: GET /assets → [{ id, code, name, category, ... , history: [{date, text}] }]
    api('/assets')
      .then(list => setAssets(Array.isArray(list) ? list : list?.data || []))
      .catch(() => setOffline(true))
      .finally(() => setLoading(false))
    api('/workers')
      .then(list => setWorkers(Array.isArray(list) ? list : list?.data || []))
      .catch((err) => { console.error('Error:', err.message); })
  }, [])

  const selected = assets.find(a => a.id === selectedId) || null

  /* ---- summary ---- */
  const summary = useMemo(() => {
    const s = { total: assets.length, assigned: 0, available: 0, repair: 0, not_working: 0, value: 0, units: 0,
      Desktop: 0, Laptop: 0, 'Android Mobile': 0, 'Nokia Mobile': 0 }
    assets.forEach(a => {
      const qt = Number(a.quantity || 1) || 1
      if (s[a.status] !== undefined) s[a.status]++
      if (a.status !== 'scrapped' && a.status !== 'lost') {
        s.value += Number(a.purchase_price || 0) * qt
        s.units += qt
      }
      if (s[a.category] !== undefined) s[a.category] += qt
    })
    return s
  }, [assets])

  /* ---- alerts ---- */
  const warrantySoon = assets.filter(a => { const d = daysUntil(a.warranty_expiry); return d !== null && d > 0 && d <= 30 })
  const longRepair = assets.filter(a => a.status === 'repair' && daysSince(a.repair_date) > 30)

  /* ---- filtered list ---- */
  const filtered = assets.filter(a => {
    if (fCat !== 'all' && a.category !== fCat) return false
    if (fStatus !== 'all' && a.status !== fStatus) return false
    const loc = a.location || a.department || ''
    if (fLoc !== 'all' && loc !== fLoc) return false
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      return [a.code, a.name, a.brand, a.model, a.serial_no, a.assigned_to_name, a.sim_number, a.location, a.team_leader]
        .some(v => (v || '').toLowerCase().includes(s))
    }
    return true
  })

  const allLocations = useMemo(() => {
    const set = new Set(LOCATIONS)
    assets.forEach(a => { const l = a.location || a.department; if (l) set.add(l) })
    return [...set].sort()
  }, [assets])

  /* ---- category counts (mini chart, quantity-weighted) ---- */
  const catCounts = useMemo(() => {
    const m = {}
    assets.forEach(a => { m[a.category] = (m[a.category] || 0) + (Number(a.quantity || 1) || 1) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [assets])
  const maxCat = Math.max(1, ...catCounts.map(([, v]) => v))

  /* ---- helpers to update an asset (API + local fallback) ---- */
  function nextCode() {
    const max = assets.reduce((m, a) => {
      const n = parseInt(String(a.code || '').replace(/\D/g, ''), 10)
      return isNaN(n) ? m : Math.max(m, n)
    }, 0)
    return `AST-${String(max + 1).padStart(3, '0')}`
  }

  function addHistory(a, text) {
    return [...(a.history || []), { date: new Date().toISOString().slice(0, 10), text }]
  }

  function saveNew(form) {
    const asset = { ...form, id: `local-${Date.now()}`, code: nextCode(), status: form.status || 'available',
      history: [{ date: new Date().toISOString().slice(0, 10), text: 'Asset registered' }] }
    // Backend endpoint: POST /assets
    api('/assets', { method: 'POST', body: JSON.stringify(asset) })
      .then(saved => setAssets(p => [...p, saved?.id ? saved : asset]))
      .catch(() => setAssets(p => [...p, asset]))
    setShowAdd(false)
  }

  function saveEdit(form) {
    updateAsset(editAsset.id, form, 'Details updated')
    setEditAsset(null)
  }

  function updateAsset(id, changes, historyText) {
    const current = assets.find(a => a.id === id)
    const newHistory = historyText && current ? addHistory(current, historyText) : current?.history || []
    setAssets(p => p.map(a => a.id === id
      ? { ...a, ...changes, history: newHistory }
      : a))
    // Backend endpoint: PUT /assets/:id (sends history along with the changes)
    api(`/assets/${id}`, { method: 'PUT', body: JSON.stringify({ ...changes, history: newHistory }) }).catch(err => console.warn('Save failed (offline?):', err.message))
  }

  function doAction(changes, historyText) {
    updateAsset(selected.id, changes, historyText)
    setAction(null)
  }

  return (
    <div className="sa-page" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        .ar-card {
          background: #fff; border: 1px solid #f1f3f7; border-radius: 20px; padding: 24px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 6px 20px -8px rgba(0,0,0,0.06);
          transition: box-shadow .25s ease, transform .25s ease;
        }
        .ar-card:hover { box-shadow: 0 4px 16px -6px rgba(0,0,0,0.1); transform: translateY(-1px); }
        .ar-title { font-size: 12px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px; }
        .ar-muted { color: #94a3b8; font-size: 13px; line-height: 1.5; }
        .ar-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
        .ar-header h2 { margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px; }

        .ar-btn {
          border: none; border-radius: 12px; padding: 10px 20px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all .2s ease; display: inline-flex; align-items: center; gap: 7px;
        }
        .ar-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
        .ar-btn:active { transform: translateY(0); }
        .ar-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }
        .ar-btn-primary { background: linear-gradient(135deg,#1e293b,#0f172a); color: #fff; }
        .ar-btn-amber { background: linear-gradient(135deg,#f59e0b,#d97706); color: #fff; }
        .ar-btn-ghost { background: #f1f5f9; color: #334155; }
        .ar-btn-ghost:hover { background: #e2e8f0; }
        .ar-btn-red-ghost { background: #fef2f2; color: #dc2626; }
        .ar-btn-red-ghost:hover { background: #fee2e2; }

        .ar-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 20px; }
        .ar-stat {
          border-radius: 16px; padding: 18px 20px; transition: all .25s ease; cursor: default;
          position: relative; overflow: hidden;
        }
        .ar-stat::before { content: ''; position: absolute; inset: 0; opacity: .08; }
        .ar-stat:hover { transform: translateY(-3px); box-shadow: 0 10px 30px -8px rgba(0,0,0,0.15); }
        .ar-stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; display: block; margin-bottom: 4px; position: relative; z-index: 1; }
        .ar-stat-value { font-size: 28px; font-weight: 800; line-height: 1.2; letter-spacing: -0.5px; position: relative; z-index: 1; }

        .ar-alert {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          background: linear-gradient(135deg,#fef2f2,#fff1f1); border: 1px solid #fecaca; border-radius: 14px;
          padding: 10px 18px; margin-bottom: 18px; font-size: 13px; color: #7f1d1d; font-weight: 500;
        }
        .ar-inline-alert {
          background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;
          padding: 10px 14px; margin-bottom: 10px; font-size: 12.5px; color: #991b1b; font-weight: 500; line-height: 1.4;
        }

        .ar-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .ar-filters input, .ar-filters select {
          border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; font-size: 13px;
          font-family: inherit; color: #0f172a; background: #fff; outline: none; transition: all .2s ease;
        }
        .ar-filters input:focus, .ar-filters select:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99,102,241,0.12); }
        .ar-filters input { flex: 1; min-width: 200px; }

        .ar-table-wrap { overflow: auto; border-radius: 14px; border: 1px solid #e9edf2; }
        .ar-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ar-table thead { background: #f8fafc; }
        .ar-table th {
          text-align: left; padding: 13px 16px; font-size: 11px; font-weight: 700; color: #64748b;
          text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; border-bottom: 1px solid #e9edf2;
        }
        .ar-table td { padding: 13px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #1e293b; }
        .ar-table tbody tr { cursor: pointer; transition: all .15s ease; }
        .ar-table tbody tr:hover { background: #f1f5f9; transform: scale(1.002); }
        .ar-table tbody tr:active { background: #e9edf2; }
        .ar-table tbody tr:last-child td { border-bottom: none; }
        .ar-code { font-weight: 700; color: #475569; font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; font-size: 12px; }
        .ar-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; white-space: nowrap; letter-spacing: 0.2px; }

        /* donut + category bottom row */
        .ar-bottom { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 20px; margin-top: 20px; }
        @media (max-width: 960px) { .ar-bottom { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .ar-bottom { grid-template-columns: 1fr; } }

        .ar-cat-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
        .ar-cat-label { width: 110px; font-size: 12px; font-weight: 600; color: #475569; text-align: right;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ar-cat-track { flex: 1; height: 22px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
        .ar-cat-fill { height: 100%; border-radius: 99px; transition: width .7s cubic-bezier(.22,1,.36,1); }
        .ar-cat-count { width: 28px; font-size: 12px; font-weight: 700; color: #0f172a; text-align: right; }

        /* donut chart */
        .ar-donut-wrap { display: flex; align-items: center; gap: 20px; margin-top: 4px; }
        .ar-donut {
          width: 110px; height: 110px; border-radius: 50%; flex-shrink: 0;
          transition: transform .3s ease;
        }
        .ar-donut:hover { transform: scale(1.05) rotate(4deg); }
        .ar-donut-legend { display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .ar-donut-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569; font-weight: 500; }
        .ar-donut-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .ar-donut-count { margin-left: auto; font-weight: 700; color: #0f172a; }

        .ar-overlay {
          position: fixed; inset: 0; z-index: 1000; background: rgba(15,23,42,0.55);
          backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 20px;
          animation: arFadeIn .2s ease;
        }
        .ar-modal {
          background: #fff; border-radius: 20px; width: 100%; max-width: 640px; max-height: 85vh;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 30px 80px -16px rgba(15,23,42,0.4); animation: arSlideUp .25s cubic-bezier(.22,1,.36,1);
        }
        @keyframes arFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes arSlideUp { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .ar-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 22px 26px; border-bottom: 1px solid #f1f5f9; }
        .ar-modal-title { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
        .ar-close {
          border: none; background: #f1f5f9; border-radius: 10px; width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; flex-shrink: 0; transition: all .15s;
        }
        .ar-close:hover { background: #e2e8f0; color: #0f172a; transform: rotate(90deg); }
        .ar-modal-body { overflow-y: auto; padding: 22px 26px; }
        .ar-modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 18px 26px; border-top: 1px solid #f1f5f9; }

        .ar-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 560px) { .ar-form-grid { grid-template-columns: 1fr; } }
        .ar-field-label { display: block; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 6px; }
        .ar-field-input input, .ar-field-input select {
          width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 10px 14px; font-size: 13px; font-family: inherit; color: #0f172a; background: #fff; outline: none; transition: all .2s ease;
        }
        .ar-field-input input:focus, .ar-field-input select:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99,102,241,0.12); }
        .ar-field { margin-bottom: 4px; }

        .ar-info-table { width: 100%; font-size: 13px; border-collapse: collapse; margin: 8px 0 16px; }
        .ar-info-table td { padding: 9px 8px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
        .ar-info-table td:first-child { color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; width: 140px; }

        .ar-actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 20px; }
        .ar-sub-title { margin: 0 0 10px; font-size: 12px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; }
        .ar-history { display: flex; flex-direction: column; gap: 10px; }
        .ar-history-row { display: flex; gap: 10px; align-items: flex-start; }
        .ar-history-dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1; margin-top: 6px; flex-shrink: 0; }
        .ar-history-text { display: block; font-size: 13px; color: #1e293b; font-weight: 500; }
        .ar-history-date { display: block; font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .sk-ar { background: linear-gradient(90deg,#f1f5f9,#e9edf2,#f1f5f9); background-size: 200% 100%; border-radius: 12px; animation: skp 1.4s ease infinite; }
        @keyframes skp { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      {/* header */}
      <div className="ar-header">
        <div>
          <h2>Asset Register</h2>
          <p className="ar-muted" style={{ margin: '4px 0 0' }}>Accounts — complete company asset record, assignment & repair tracking.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="ar-btn ar-btn-ghost" onClick={() => exportAssets(filtered)}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'text-bottom', marginRight: 4 }}>download</span>
            Export
          </button>
          <button className="ar-btn ar-btn-amber" style={{ background: 'linear-gradient(135deg,#8CCDA4,#2A6B45)', color: '#fff' }} onClick={() => setShowImport(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'text-bottom', marginRight: 4 }}>upload_file</span>
            Import from Excel
          </button>
          <button className="ar-btn ar-btn-primary" onClick={() => setShowAdd(true)}>+ Add Asset</button>
        </div>
      </div>

      {offline && (
        <div className="ar-alert" style={{ background: 'rgba(246,201,121,0.22)', borderColor: GOLD_LIGHT }}>
          ⚙ Backend is not reachable — the page is currently running in local mode.
          <code style={{ background: '#fff', padding: '1px 8px', borderRadius: 6 }}>GET/POST /api/assets</code>
          <code style={{ background: '#fff', padding: '1px 8px', borderRadius: 6 }}>POST /api/assets/import</code>
        </div>
      )}

      {/* summary cards */}
      <div className="ar-stats">
        <div className="ar-stat" style={{ background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', color: '#4338ca' }}><span className="ar-stat-label" style={{ color: '#6366f1' }}>Total Records</span><div className="ar-stat-value">{summary.total}</div><span style={{ fontSize: 11, fontWeight: 600, opacity: .75 }}>{summary.units} units</span></div>
        <div className="ar-stat" style={{ background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', color: '#059669' }}><span className="ar-stat-label" style={{ color: '#10b981' }}>Desktop</span><div className="ar-stat-value">{summary.Desktop}</div></div>
        <div className="ar-stat" style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', color: '#0284c7' }}><span className="ar-stat-label" style={{ color: '#0ea5e9' }}>Laptop</span><div className="ar-stat-value">{summary.Laptop}</div></div>
        <div className="ar-stat" style={{ background: 'linear-gradient(135deg,#faf5ff,#f3e8ff)', color: '#7c3aed' }}><span className="ar-stat-label" style={{ color: '#a855f7' }}>Android Mobile</span><div className="ar-stat-value">{summary['Android Mobile']}</div></div>
        <div className="ar-stat" style={{ background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', color: '#d97706' }}><span className="ar-stat-label" style={{ color: '#f59e0b' }}>Nokia Mobile</span><div className="ar-stat-value">{summary['Nokia Mobile']}</div></div>
        <div className="ar-stat" style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', color: '#dc2626' }}><span className="ar-stat-label" style={{ color: '#ef4444' }}>Total Value</span><div className="ar-stat-value" style={{ fontSize: 20 }}>{money(summary.value)}</div></div>
      </div>

      {/* alerts */}
      {(warrantySoon.length > 0 || longRepair.length > 0) && (
        <div className="ar-alert">
          <span className="material-symbols-outlined" style={{ color: RED_DEEP, fontSize: 18 }}>warning</span>
          {warrantySoon.length > 0 && <span>{warrantySoon.length} asset warranty expiring within 30 days ({warrantySoon.map(a => a.code).join(', ')})</span>}
          {longRepair.length > 0 && <span>· {longRepair.length} assets in repair for 30+ days ({longRepair.map(a => a.code).join(', ')})</span>}
        </div>
      )}

      {/* filters + table */}
      <div className="ar-card">
        <div className="ar-filters">
          <input placeholder="Search: code, name, location, team leader, serial, SIM no, worker..." value={q} onChange={e => setQ(e.target.value)} />
          <select value={fCat} onChange={e => setFCat(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="all">All Status</option>
            {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <select value={fLoc} onChange={e => setFLoc(e.target.value)}>
            <option value="all">All Locations</option>
            {allLocations.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        {loading ? (
          <div>{[1, 2, 3, 4].map(i => <div key={i} className="sk-ar" style={{ height: 40, marginBottom: 8 }} />)}</div>
        ) : filtered.length === 0 ? (
          <p className="ar-muted" style={{ padding: '20px 4px' }}>
            {assets.length === 0 ? 'No assets have been added yet. Start with "+ Add Asset"!' : 'No assets match these filters.'}
          </p>
        ) : (
          <div className="ar-table-wrap">
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Category</th><th>Location</th><th>Qty</th>
                  <th>Team Leader</th><th>Assigned To</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} onClick={() => setSelectedId(a.id)}>
                    <td className="ar-code">{a.code}</td>
                    <td style={{ fontWeight: 700 }}>{a.name}</td>
                    <td>{a.category}</td>
                    <td>{a.location || a.department || '—'}</td>
                    <td>{Number(a.quantity || 1)}</td>
                    <td>{a.team_leader || '—'}</td>
                    <td>{a.assigned_to_name || '—'}</td>
                    <td><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* bottom: category chart + recent activity + donut */}
      <div className="ar-bottom">
        <div className="ar-card">
          <h3 className="ar-title">Category Wise Assets</h3>
          {catCounts.length === 0 ? <p className="ar-muted" style={{ marginTop: 10 }}>No data</p> : catCounts.map(([name, count], i) => (
            <div key={name} className="ar-cat-row">
              <span className="ar-cat-label" title={name}>{name}</span>
              <div className="ar-cat-track"><div className="ar-cat-fill" style={{ width: `${Math.round((count / maxCat) * 100)}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} /></div>
              <span className="ar-cat-count">{count}</span>
            </div>
          ))}
        </div>
        <div className="ar-card">
          <h3 className="ar-title">Status Overview</h3>
          {(() => {
            const total = summary.total || 1
            const statuses = [
              { key: 'available', label: 'Available', color: '#0ea5e9' },
              { key: 'assigned', label: 'Assigned', color: '#10b981' },
              { key: 'repair', label: 'In Repair', color: '#f59e0b' },
              { key: 'not_working', label: 'Not Working', color: '#ef4444' },
              { key: 'lost', label: 'Lost', color: '#8b5cf6' },
              { key: 'scrapped', label: 'Scrapped', color: '#6b7280' },
            ]
            const sorted = statuses.filter(s => summary[s.key] > 0).sort((a, b) => summary[b.key] - summary[a.key])
            const gradients = sorted.map((s, i) => {
              const pct = (summary[s.key] / total) * 100
              const prev = sorted.slice(0, i).reduce((sum, x) => sum + (summary[x.key] / total) * 100, 0)
              return `${s.color} ${prev}% ${prev + pct}%`
            }).join(', ')
            return (
              <div className="ar-donut-wrap">
                <div className="ar-donut" style={{ background: `conic-gradient(${gradients || '#e2e8f0'})` }} />
                <div className="ar-donut-legend">
                  {sorted.map(s => (
                    <div key={s.key} className="ar-donut-item">
                      <span className="ar-donut-dot" style={{ background: s.color }} />
                      <span>{s.label}</span>
                      <span className="ar-donut-count">{summary[s.key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
        <div className="ar-card">
          <h3 className="ar-title">Recent Activity</h3>
          <div className="ar-history" style={{ marginTop: 12 }}>
            {assets.flatMap(a => (a.history || []).map(h => ({ ...h, code: a.code, name: a.name })))
              .sort((x, y) => new Date(y.date) - new Date(x.date))
              .slice(0, 8)
              .map((h, i) => (
                <div key={i} className="ar-history-row">
                  <span className="ar-history-dot" />
                  <div>
                    <span className="ar-history-text">{h.code} ({h.name}) — {h.text}</span>
                    <span className="ar-history-date">{fmtDate(h.date)}</span>
                  </div>
                </div>
              ))}
            {assets.every(a => !(a.history || []).length) && <p className="ar-muted">No activity yet.</p>}
          </div>
        </div>
      </div>

      {/* modals */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            api('/assets')
              .then(list => setAssets(Array.isArray(list) ? list : list?.data || []))
              .catch(() => {})
          }}
        />
      )}
      {showAdd && <AssetFormModal onClose={() => setShowAdd(false)} onSave={saveNew} />}
      {editAsset && <AssetFormModal initial={editAsset} onClose={() => setEditAsset(null)} onSave={saveEdit} />}
      {selected && !action && !editAsset && (
        <AssetDetailModal
          asset={selected}
          onClose={() => setSelectedId(null)}
          onAction={type => setAction({ type })}
          onEdit={() => setEditAsset(selected)}
          onLost={() => updateAsset(selected.id, { status: 'lost' }, 'Marked as Lost')}
          onScrap={() => updateAsset(selected.id, { status: 'scrapped' }, 'Scrapped')}
        />
      )}
      {selected && action && (
        <ActionModal
          type={action.type}
          asset={selected}
          workers={workers}
          onClose={() => setAction(null)}
          onDone={doAction}
        />
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/auth'
import * as XLSX from 'xlsx'
import { isFreshStation } from '../../../lib/stations'

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function ProgressModal({ current, total, label }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="sa-modal-overlay" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div className="sa-modal" style={{maxWidth:460,textAlign:'center'}}>
        <h3 style={{marginBottom:12}}>Importing Data...</h3>
        <div style={{fontSize:13,color:'var(--ink-soft)',marginBottom:16}}>{label}</div>
        <div style={{width:'100%',height:10,background:'#e5e7eb',borderRadius:5,overflow:'hidden',marginBottom:8}}>
          <div style={{width:`${pct}%`,height:'100%',background:'#10b981',borderRadius:5,transition:'width .3s ease'}} />
        </div>
        <div style={{fontSize:12,color:'var(--ink-soft)'}}>{current} / {total} chunks</div>
      </div>
    </div>
  );
}

function ImportForm({ dataSources, onError, onBatchUpdate, endpoint, showSample, showTestSheet, ngos, selectedNgoIds, onNgoChange }) {
  const [date, setDate] = useState(todayStr)
  const [dataSourceId, setDataSourceId] = useState('')
  const [dataCategory, setDataCategory] = useState('')
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [sheets, setSheets] = useState([])
  const [selectedSheets, setSelectedSheets] = useState({})
  const [inspecting, setInspecting] = useState(false)
  const [progress, setProgress] = useState(null)

  const inspectFile = async (f) => {
    if (!f) return
    setInspecting(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await api('/data-import/inspect', { method: 'POST', body: fd })
      setSheets(res.sheets || [])
      const all = {}
      ;(res.sheets || []).forEach(s => { all[s] = true })
      setSelectedSheets(all)
    } catch {
      setSheets([])
      setSelectedSheets({})
    } finally { setInspecting(false) }
  }

  const handleFileChange = (e) => {
    const f = e.target.files[0]; setFile(f); setResult(null)
    inspectFile(f)
  }

  const toggleSheet = (name) => setSelectedSheets(prev => ({ ...prev, [name]: !prev[name] }))

  const handleImport = async () => {
    if (!file || !date || !dataSourceId) return
    if (endpoint === '/data-import/upload-old') {
      // Old data: use existing file upload flow
      setImporting(true); onError(''); setResult(null)
      try {
        const fd = new FormData()
        fd.append('file', file); fd.append('date', date); fd.append('data_source_id', dataSourceId)
        if (dataCategory) fd.append('data_category', dataCategory)
        const selected = Object.entries(selectedSheets).filter(([, v]) => v).map(([k]) => k)
        if (selected.length > 0 && selected.length < sheets.length) selected.forEach(s => fd.append('sheets', s))
        const res = await api(endpoint, { method: 'POST', body: fd })
        setResult(res)
        if (onBatchUpdate) onBatchUpdate()
      } catch (e) { onError(e.message) } finally { setImporting(false) }
      return
    }

    // New data: parse client-side, chunk, upload with progress
    setImporting(true); onError(''); setResult(null)
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: 'array' });
          const sheetNames = Object.entries(selectedSheets).filter(([, v]) => v).map(([k]) => k);
          const sheetsToRead = sheetNames.length > 0 ? sheetNames : wb.SheetNames;

          let allRows = [];
          for (const sn of sheetsToRead) {
            const ws = wb.Sheets[sn];
            if (!ws) continue;
            const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of json) {
              const norm = {};
              for (const [k, v] of Object.entries(row)) {
                const key = k.toString().toLowerCase().replace(/[\s_\-./]+/g, '').trim();
                norm[key] = v;
              }
              const name = norm.name || norm.fullname || norm['fullname'] || norm.donorname || norm['donorname'] || '';
              const mobile = norm.mobilenumber || norm['mobilenumber'] || norm.mobile || norm.mob || norm.moblie || norm.phone || norm.mobileno || norm['mobileno'] || '';
              const category = norm.category || norm.datacategory || norm['datacategory'] || norm.data || '';
              const rawAmt = (norm.amount || norm.amt || norm.dummyamount || '0').toString().replace(/,/g, '');
              const amount = parseFloat(rawAmt) || 0;
              if (name && mobile) {
                allRows.push({ name: String(name).trim(), mobile_number: String(mobile).trim(), category: String(category).trim(), amount });
              }
            }
          }

          // Dedup by mobile
          const seen = new Set();
          const deduped = allRows.filter(r => {
            if (seen.has(r.mobile_number)) return false;
            seen.add(r.mobile_number);
            return true;
          });

          if (deduped.length === 0) { onError('No valid rows found in file'); setImporting(false); return }

          const CHUNK_SIZE = 500;
          const chunks = [];
          for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
            chunks.push(deduped.slice(i, i + CHUNK_SIZE));
          }

          setProgress({ current: 0, total: chunks.length, label: `Parsing complete. Uploading ${deduped.length} donors in ${chunks.length} chunks...` });

          let totalInserted = 0;
          let totalUniqueDonors = 0;
          let totalInvalid = 0;
          let totalCrossDups = 0;
          let batchId = null;
          const ngoCounts = {};

          for (let i = 0; i < chunks.length; i++) {
            setProgress({ current: i + 1, total: chunks.length, label: `Uploading chunk ${i + 1}/${chunks.length} (${(i + 1) * CHUNK_SIZE} / ${deduped.length} donors)` });

            const body = { rows: chunks[i], ngo_ids: selectedNgoIds, data_source_id: dataSourceId, import_date: date, chunk_index: i, total_chunks: chunks.length, data_category: dataCategory || undefined };
            if (batchId) body.batch_id = batchId;
            const res = await api('/data-import/upload-chunk', { method: 'POST', body: JSON.stringify(body) });
            totalInserted += res.inserted;
            totalUniqueDonors += res.unique_donors || 0;
            totalInvalid += res.invalid_mobile_count || 0;
            totalCrossDups += res.cross_batch_duplicates || 0;
            if (res.batch_id) batchId = res.batch_id;
            if (res.ngo_counts) {
              for (const [n, c] of Object.entries(res.ngo_counts)) {
                ngoCounts[n] = (ngoCounts[n] || 0) + c;
              }
            }
          }

          setProgress(null);
          setResult({
            message: `Data imported for ${selectedNgoIds?.length || 3} NGO(s) successfully`,
            batch_id: batchId,
            total_in_file: allRows.length,
            duplicates_removed: allRows.length - deduped.length,
            cross_batch_duplicates: totalCrossDups,
            invalid_mobile_count: totalInvalid,
            imported: totalUniqueDonors,
            ngo_counts: ngoCounts,
            ngos_used: selectedNgoIds?.length || 3,
          });
          if (onBatchUpdate) onBatchUpdate();
        } catch (e) { onError(e.message); setProgress(null); setImporting(false) }
      };
      reader.onerror = () => { onError('Failed to read file'); setImporting(false) };
      reader.readAsArrayBuffer(file);
    } catch (e) { onError(e.message); setImporting(false) }
  }

  const downloadSample = async () => {
    try { const res = await api('/data-import/sample', { raw: true }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'data-import-sample.xlsx'; a.click() }
    catch (e) { onError(e.message) }
  }
  const downloadTestSheet = async () => {
    try { const res = await api('/data-import/test-sheet', { raw: true }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'data-import-test.xlsx'; a.click() }
    catch (e) { onError(e.message) }
  }

  return (
    <>
      <div className="sa-card">
        <h3 className="sa-card-title">{endpoint === '/data-import/upload-old' ? 'Upload Old Donor Data' : 'Upload Data'}</h3>
        {endpoint === '/data-import/upload-old' && (
          <p className="sa-muted" style={{marginBottom:12}}>Each row creates a new donor profile entry. Duplicate mobile numbers are allowed.</p>
        )}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <label className="field">Import Date <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="field">Data Source
            <select value={dataSourceId} onChange={e => setDataSourceId(e.target.value)}>
              <option value="">— Select —</option>
              {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </select>
          </label>
          <label className="field">Data Category
            <input type="text" value={dataCategory} onChange={e => setDataCategory(e.target.value)} placeholder="e.g. Naresh Data, IB FD Stations" />
          </label>
          <label className="field">Excel / CSV File <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} /></label>
          {inspecting && <p className="sa-muted" style={{fontSize:12}}>Inspecting file...</p>}
          {sheets.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:'var(--ink-soft)',fontWeight:500}}>Sheets:</span>
              {sheets.map(s => (
                <label key={s} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:13,
                  background:selectedSheets[s]?'var(--primary-light, #eef2ff)':'#f5f5f5',padding:'4px 10px',borderRadius:6,border:'1px solid var(--line, #e5e7eb)'}}>
                  <input type="checkbox" checked={!!selectedSheets[s]} onChange={() => toggleSheet(s)} />{s}
                </label>
              ))}
            </div>
          )}
          {ngos && ngos.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:'var(--ink-soft)',fontWeight:500}}>NGOs:</span>
              {ngos.map(ngo => (
                <label key={ngo.id} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:13,
                  background: (selectedNgoIds||[]).includes(ngo.id) ? '#eef2ff' : '#f5f5f5',
                  padding:'4px 10px', borderRadius:6, border:'1px solid var(--line, #e5e7eb)'}}>
                  <input type="checkbox" checked={(selectedNgoIds||[]).includes(ngo.id)}
                    onChange={() => onNgoChange && onNgoChange(ngo.id)} />
                  {ngo.name}
                </label>
              ))}
            </div>
          )}
          <div className="sa-filters" style={{marginTop:8}}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing || !file || !dataSourceId}>
              {importing ? 'Importing…' : 'Upload & Import'}
            </button>
            {showSample && <button className="btn" onClick={downloadSample}>Download Sample</button>}
            {showTestSheet && <button className="btn" onClick={downloadTestSheet}>Download Test Sheet</button>}
          </div>
        </div>
      </div>
      {progress && <ProgressModal current={progress.current} total={progress.total} label={progress.label} />}

      {result && (
        <div className="sa-card">
          <h3 className="sa-card-title" style={{color:'#10b981'}}>Import Complete</h3>
          <div className="sa-stat-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))'}}>
            <div className="sa-stat-card"><div className="sa-stat-label">Total in File</div><div className="sa-stat-value">{result.total_in_file}</div></div>
            <div className="sa-stat-card" style={{borderLeftColor:'#ef4444'}}><div className="sa-stat-label">Invalid Numbers</div><div className="sa-stat-value" style={{color:'#ef4444'}}>{result.invalid_mobile_count ?? 0}</div></div>
            {endpoint !== '/data-import/upload-old' && (
              <div className="sa-stat-card" style={{borderLeftColor:'#f59e0b'}}><div className="sa-stat-label">Within-File Dups Removed</div><div className="sa-stat-value" style={{color:'#f59e0b'}}>{result.duplicates_removed}</div></div>
            )}
            <div className="sa-stat-card" style={{borderLeftColor:'#eab308'}}><div className="sa-stat-label">Cross-Batch Dups Removed</div><div className="sa-stat-value" style={{color:'#eab308'}}>{result.cross_batch_duplicates ?? 0}</div></div>
            <div className="sa-stat-card" style={{borderLeftColor:'#10b981'}}><div className="sa-stat-label">{endpoint === '/data-import/upload-old' ? 'Imported to Donors' : 'Imported'}</div><div className="sa-stat-value" style={{color:'#10b981'}}>{result.imported}</div></div>
            {endpoint === '/data-import/upload-old' && (
              <div className="sa-stat-card" style={{borderLeftColor:'#8b5cf6'}}><div className="sa-stat-label">Profiles Created</div><div className="sa-stat-value" style={{color:'#8b5cf6'}}>{result.profiles_created || 0}</div></div>
            )}
            {endpoint !== '/data-import/upload-old' && (
              <div className="sa-stat-card" style={{borderLeftColor:'#3b82f6'}}><div className="sa-stat-label">NGOs Replicated To</div><div className="sa-stat-value" style={{color:'#3b82f6'}}>{result.ngos_used}</div></div>
            )}
          </div>
          {result.ngo_counts && Object.keys(result.ngo_counts).length > 0 && (
            <div style={{marginTop:10, display:'flex', gap:10, flexWrap:'wrap'}}>
              {Object.entries(result.ngo_counts).map(([name, count]) => (
                <span key={name} className="sa-badge" style={{background:'#eef2ff', color:'#4338ca', padding:'4px 10px', borderRadius:6, fontSize:12}}>
                  {count} → {name}
                </span>
              ))}
            </div>
          )}
          {result.station_breakdown && Object.keys(result.station_breakdown).length > 0 && (
            <div style={{marginTop:12, borderTop:'1px solid var(--line)', paddingTop:12}}>
              <div style={{fontSize:13, fontWeight:600, marginBottom:8, color:'var(--ink)'}}>Station-wise FRO Assignment</div>
              {Object.entries(result.station_breakdown).map(([ngo, stations]) => (
                <div key={ngo} style={{marginBottom:6, fontSize:12}}>
                  <span style={{fontWeight:600, color:'#4338ca'}}>{ngo}:</span>{' '}
                  {Object.entries(stations).map(([st, cnt]) => (
                    <span key={st} className="sa-badge" style={{background:'#f3e8ff', color:'#7c3aed', padding:'2px 8px', borderRadius:4, fontSize:11, marginLeft:4}}>
                      {cnt} → {st}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          {endpoint === '/data-import/upload-old' && result.errors?.length > 0 && (
            <div style={{marginTop:12}}><p className="sa-muted">{result.errors.length} rows failed</p></div>
          )}
        </div>
      )}
    </>
  )
}

function FreshDataImport({ dataSources, ngos, onError, onBatchUpdate, stationsByNgo, freshNgoStations, setFreshNgoStations }) {
  const [date, setDate] = useState(todayStr)
  const [dataSourceId, setDataSourceId] = useState('')
  const [dataCategory, setDataCategory] = useState('')
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(null)

  const toggleStation = (ngoName, station) => {
    setFreshNgoStations(prev => {
      const current = prev[ngoName] || []
      const next = current.includes(station)
        ? current.filter(s => s !== station)
        : [...current, station]
      return { ...prev, [ngoName]: next }
    })
  }

  const selectAllStations = (ngoName) => {
    setFreshNgoStations(prev => ({ ...prev, [ngoName]: [...(stationsByNgo[ngoName] || [])] }))
  }

  const clearStations = (ngoName) => {
    setFreshNgoStations(prev => ({ ...prev, [ngoName]: [] }))
  }

  const hasAnyStations = Object.values(freshNgoStations).some(arr => arr && arr.length > 0)

  const handleImport = async () => {
    if (!file || !date || !dataSourceId || !hasAnyStations) return
    setImporting(true); onError(''); setResult(null)
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: 'array' });
          let allRows = [];
          for (const sn of wb.SheetNames) {
            const ws = wb.Sheets[sn];
            if (!ws) continue;
            const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const row of json) {
              const norm = {};
              for (const [k, v] of Object.entries(row)) {
                const key = k.toString().toLowerCase().replace(/[\s_\-./]+/g, '').trim();
                norm[key] = v;
              }
              const name = norm.name || norm.fullname || norm.donorname || '';
              const mobile = norm.mobilenumber || norm.mobile || norm.mob || norm.moblie || norm.phone || norm.mobileno || '';
              const category = norm.category || norm.datacategory || norm.data || '';
              const rawAmt = (norm.amount || norm.amt || norm.dummyamount || '0').toString().replace(/,/g, '');
              const amount = parseFloat(rawAmt) || 0;
              if (name && mobile) {
                allRows.push({ name: String(name).trim(), mobile_number: String(mobile).trim(), category: String(category).trim(), amount });
              }
            }
          }
          const seen = new Set();
          const deduped = allRows.filter(r => { if (seen.has(r.mobile_number)) return false; seen.add(r.mobile_number); return true; });
          if (deduped.length === 0) { onError('No valid rows found in file'); setImporting(false); return }

          const CHUNK_SIZE = 500;
          const chunks = [];
          for (let i = 0; i < deduped.length; i += CHUNK_SIZE) chunks.push(deduped.slice(i, i + CHUNK_SIZE));

          setProgress({ current: 0, total: chunks.length, label: `Parsing complete. Uploading ${deduped.length} donors in ${chunks.length} chunks...` });

          let totalInserted = 0;
          let totalInvalid = 0;
          let totalCrossDups = 0;
          let batchId = null;
          const ngoResults = {};

          for (let i = 0; i < chunks.length; i++) {
            setProgress({ current: i + 1, total: chunks.length, label: `Uploading chunk ${i + 1}/${chunks.length}` });
            const body = {
              rows: chunks[i],
              data_source_id: dataSourceId,
              import_date: date,
              chunk_index: i,
              total_chunks: chunks.length,
              fresh_data: true,
              ngo_stations: freshNgoStations,
              data_category: dataCategory || undefined,
            };
            if (batchId) body.batch_id = batchId;
            const res = await api('/data-import/upload-chunk', { method: 'POST', body: JSON.stringify(body) });
            totalInserted += res.inserted;
            totalInvalid += res.invalid_mobile_count || 0;
            totalCrossDups += res.cross_batch_duplicates || 0;
            if (res.batch_id) batchId = res.batch_id;
            if (res.ngo_results) {
              for (const [n, r] of Object.entries(res.ngo_results)) {
                if (!ngoResults[n]) ngoResults[n] = { imported: 0, assigned: 0, station_breakdown: {} };
                ngoResults[n].imported += r.imported || 0;
                ngoResults[n].assigned += r.assigned || 0;
                if (r.station_breakdown) {
                  for (const [st, cnt] of Object.entries(r.station_breakdown)) {
                    ngoResults[n].station_breakdown[st] = (ngoResults[n].station_breakdown[st] || 0) + cnt;
                  }
                }
              }
            }
          }

          setProgress(null);
          const totalAssigned = Object.values(ngoResults).reduce((sum, r) => sum + (r.assigned || 0), 0);
          setResult({
            message: `Fresh data imported for ${Object.keys(freshNgoStations).filter(k => freshNgoStations[k]?.length > 0).length} NGO(s)`,
            batch_id: batchId,
            total_in_file: allRows.length,
            imported: totalInserted,
            assigned_donors: totalAssigned,
            invalid_mobile_count: totalInvalid,
            cross_batch_duplicates: totalCrossDups,
            ngo_results: ngoResults,
            fresh_data: true,
          });
          if (onBatchUpdate) onBatchUpdate();
        } catch (e) { onError(e.message); setProgress(null); setImporting(false) }
      };
      reader.onerror = () => { onError('Failed to read file'); setImporting(false) };
      reader.readAsArrayBuffer(file);
    } catch (e) { onError(e.message); setImporting(false) }
  }

  return (
    <>
      <div className="sa-card">
        <h3 className="sa-card-title">Upload Fresh New Data</h3>
        <p className="sa-muted" style={{marginBottom:12}}>
          Upload fresh donor data with NGO+Station selection. Donors are globally deduplicated and distributed round-robin across selected stations.
        </p>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <label className="field">Import Date <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="field">Data Source
            <select value={dataSourceId} onChange={e => setDataSourceId(e.target.value)}>
              <option value="">— Select —</option>
              {dataSources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </select>
          </label>
          <label className="field">Excel / CSV File <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { setFile(e.target.files[0]); setResult(null) }} /></label>
          <label className="field">Data Category
            <input type="text" value={dataCategory} onChange={e => setDataCategory(e.target.value)} placeholder="e.g. Naresh Data, IB FD Stations" />
          </label>

          <div style={{marginTop:8}}>
            <div style={{fontSize:13, fontWeight:600, marginBottom:8, color:'var(--ink)'}}>Select Stations per NGO</div>
            {ngos.map(ngo => (
              <div key={ngo.id} style={{marginBottom:12, padding:12, background:'#fafafa', borderRadius:8, border:'1px solid var(--line, #e5e7eb)'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                  <span style={{fontWeight:600, fontSize:13, color:'var(--ink)', minWidth:120}}>{ngo.name}</span>
                  <button className="btn btn-sm" onClick={() => selectAllStations(ngo.name)} style={{fontSize:11, padding:'2px 8px'}}>All</button>
                  <button className="btn btn-sm" onClick={() => clearStations(ngo.name)} style={{fontSize:11, padding:'2px 8px'}}>None</button>
                  {freshNgoStations[ngo.name]?.length > 0 && (
                    <span className="sa-badge" style={{background:'#eef2ff', color:'#4338ca', padding:'2px 8px', borderRadius:4, fontSize:11}}>
                      {freshNgoStations[ngo.name].length} selected
                    </span>
                  )}
                </div>
                <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
                  {(stationsByNgo[ngo.name] || []).map(st => (
                    <label key={st} style={{display:'flex', alignItems:'center', gap:3, cursor:'pointer', fontSize:11,
                      background: (freshNgoStations[ngo.name] || []).includes(st) ? '#eef2ff' : '#f5f5f5',
                      padding:'3px 8px', borderRadius:4, border:'1px solid var(--line, #e5e7eb)'}}>
                      <input type="checkbox" checked={(freshNgoStations[ngo.name] || []).includes(st)}
                        onChange={() => toggleStation(ngo.name, st)} />
                      {st}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="sa-filters" style={{marginTop:8}}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing || !file || !dataSourceId || !hasAnyStations}>
              {importing ? 'Importing…' : 'Upload Fresh Data'}
            </button>
          </div>
        </div>
      </div>
      {progress && <ProgressModal current={progress.current} total={progress.total} label={progress.label} />}
      {result && (
        <div className="sa-card">
          <h3 className="sa-card-title" style={{color:'#10b981'}}>Import Complete</h3>
          <div className="sa-stat-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))'}}>
            <div className="sa-stat-card"><div className="sa-stat-label">Total in File</div><div className="sa-stat-value">{result.total_in_file}</div></div>
            <div className="sa-stat-card" style={{borderLeftColor:'#ef4444'}}><div className="sa-stat-label">Invalid Numbers</div><div className="sa-stat-value" style={{color:'#ef4444'}}>{result.invalid_mobile_count ?? 0}</div></div>
            <div className="sa-stat-card" style={{borderLeftColor:'#eab308'}}><div className="sa-stat-label">Cross-Batch Dups Removed</div><div className="sa-stat-value" style={{color:'#eab308'}}>{result.cross_batch_duplicates ?? 0}</div></div>
            <div className="sa-stat-card" style={{borderLeftColor:'#10b981'}}><div className="sa-stat-label">Imported</div><div className="sa-stat-value" style={{color:'#10b981'}}>{result.imported}</div></div>
            <div className="sa-stat-card" style={{borderLeftColor:'#7c3aed'}}><div className="sa-stat-label">Assigned to FROs</div><div className="sa-stat-value" style={{color:'#7c3aed'}}>{result.assigned_donors || 0}</div></div>
          </div>
          {result.ngo_results && Object.keys(result.ngo_results).length > 0 && (
            <div style={{marginTop:12, borderTop:'1px solid var(--line)', paddingTop:12}}>
              <div style={{fontSize:13, fontWeight:600, marginBottom:8, color:'var(--ink)'}}>Per-NGO Breakdown</div>
              {Object.entries(result.ngo_results).map(([ngo, r]) => (
                <div key={ngo} style={{marginBottom:8, padding:8, background:'#fafafa', borderRadius:6}}>
                  <div style={{fontWeight:600, fontSize:13, color:'#4338ca', marginBottom:4}}>{ngo}: {r.imported} imported, {r.assigned} assigned</div>
                  {r.station_breakdown && Object.keys(r.station_breakdown).length > 0 && (
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      {Object.entries(r.station_breakdown).map(([st, cnt]) => (
                        <span key={st} className="sa-badge" style={{background:'#f3e8ff', color:'#7c3aed', padding:'2px 8px', borderRadius:4, fontSize:11}}>
                          {cnt} → {st}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default function DataManagement() {
  const [tab, setTab] = useState('import')
  const [sources, setSources] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ name: '' })
  const [err, setErr] = useState('')

  const [batches, setBatches] = useState([])
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [ngos, setNgos] = useState([])
  const [selectedNgoIds, setSelectedNgoIds] = useState([])

  const [copySourceNgo, setCopySourceNgo] = useState('')
  const [copyTargetNgoIds, setCopyTargetNgoIds] = useState([])
  const [copyFilter, setCopyFilter] = useState('all')
  const [copyMobileFile, setCopyMobileFile] = useState(null)
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState(null)

  const [stationsByNgo, setStationsByNgo] = useState({})
  const [freshNgoStations, setFreshNgoStations] = useState({})

  const loadSources = useCallback(() => {
    api('/data-sources').then(setSources).catch(e => setErr(e.message))
  }, [])
  useEffect(() => {
    loadSources();
    api('/data-import/batches').then(setBatches).catch((err) => { console.error('Error:', err.message); });
    api('/ngos').then(n => {
      const list = Array.isArray(n) ? n : [];
      setNgos(list);
      setSelectedNgoIds(list.map(ngo => ngo.id));
    }).catch((err) => { console.error('Error:', err.message); });
    api('/ngo-admin/stations').then(list => {
      const byNgo = {};
      for (const st of Array.isArray(list) ? list : []) {
        if (!isFreshStation(st.station)) continue;
        for (const n of st.ngos || []) {
          if (!n.ngo_name) continue;
          if (!byNgo[n.ngo_name]) byNgo[n.ngo_name] = [];
          if (!byNgo[n.ngo_name].includes(st.station)) byNgo[n.ngo_name].push(st.station);
        }
      }
      setStationsByNgo(byNgo);
    }).catch((err) => { console.error('Error:', err.message); });
  }, [loadSources])

  const loadBatches = useCallback(() => {
    api('/data-import/batches').then(setBatches).catch((err) => { console.error('Error:', err.message); })
  }, [])

  const openNew = () => { setEdit(null); setForm({ name: '' }); setShowForm(true) }
  const openEdit = (s) => { setEdit(s); setForm({ name: s.name }); setShowForm(true) }

  const save = async () => {
    setErr('')
    try {
      if (edit) { await api(`/data-sources/${edit.id}`, { method: 'PUT', body: JSON.stringify(form) }) }
      else { await api('/data-sources', { method: 'POST', body: JSON.stringify(form) }) }
      setShowForm(false); loadSources()
    } catch (e) { setErr(e.message) }
  }

  const toggleActive = async (id) => {
    try { await api(`/data-sources/${id}/toggle`, { method: 'PUT' }); loadSources() }
    catch (e) { setErr(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this data source?')) return
    try { await api(`/data-sources/${id}`, { method: 'DELETE' }); loadSources() }
    catch (e) { setErr(e.message) }
  }

  const viewBatch = async (id) => {
    try { const d = await api(`/data-import/batch/${id}`); setSelectedBatch(d) }
    catch (e) { setErr(e.message) }
  }

  const exportBatch = async (id) => {
    try { const res = await api(`/data-import/batch/${id}/export`, { raw: true }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `import-batch-${id}.xlsx`; a.click() }
    catch (e) { setErr(e.message) }
  }

  if (selectedBatch) {
    return (
      <div className="sa-page">
        <div className="sa-page-header">
          <button className="btn" onClick={() => setSelectedBatch(null)}>← Back to batches</button>
          <h3 style={{margin:'8px 0 0'}}>Batch: {selectedBatch.import_batch_id?.slice(0, 8)}…</h3>
        </div>
        <div className="sa-card">
          <p className="sa-muted">Source: {selectedBatch.data_source_name} | Date: {selectedBatch.import_date} | Records: {selectedBatch.records?.length || 0}</p>
        </div>
        <div className="sa-card" style={{overflowX:'auto'}}>
          <table className="sa-table" style={{fontSize:12}}>
            <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Category</th><th>Amount</th><th>Transaction Date</th><th>Bank Donor</th><th>City</th><th>PAN</th></tr></thead>
            <tbody>
              {(selectedBatch.records || []).map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td><td>{r.name || '—'}</td><td><code>{r.mobile_number}</code></td>
                  <td><span className="sa-badge">{r.category}</span></td>
                  <td>₹{Number(r.amount).toLocaleString()}</td>
                  <td className="sa-muted">{r.transaction_date || '—'}</td>
                  <td className="sa-muted">{r.bank_donor_name || '—'}</td>
                  <td className="sa-muted">{r.city || '—'}</td>
                  <td className="sa-muted">{r.pan_number || '—'}</td>
                </tr>
              ))}
              {(selectedBatch.records || []).length === 0 && <tr><td colSpan={9} className="sa-muted sa-center">No records</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="sa-page">
      <div className="sa-page-header"><h3>Data Management</h3></div>
      {err && <div className="sa-err-card">{err}</div>}

      <div className="sa-tabs">
        <button className={`sa-tab${tab === 'sources' ? ' active' : ''}`} onClick={() => setTab('sources')}>Data Sources</button>
        <button className={`sa-tab${tab === 'import' ? ' active' : ''}`} onClick={() => setTab('import')}>Import</button>
        <button className={`sa-tab${tab === 'fresh' ? ' active' : ''}`} onClick={() => setTab('fresh')}>Fresh New Data</button>
        <button className={`sa-tab${tab === 'history' ? ' active' : ''}`} onClick={() => { setTab('history'); loadBatches() }}>History ({batches.length})</button>
        <button className={`sa-tab${tab === 'old' ? ' active' : ''}`} onClick={() => setTab('old')}>Old Data</button>
        <button className={`sa-tab${tab === 'copy' ? ' active' : ''}`} onClick={() => setTab('copy')}>Copy to NGOs</button>
      </div>

      {tab === 'sources' && (
        <div className="sa-card" style={{overflowX:'auto'}}>
          <div className="sa-page-header" style={{marginBottom:12}}>
            <h3 className="sa-card-title">Data Source Management</h3>
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ New Data Source</button>
          </div>
          <table className="sa-table">
            <thead><tr><th>Name</th><th>Status</th><th>Created</th><th style={{width:200}}></th></tr></thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><span className={`sa-badge ${s.is_active !== false ? 'active' : 'inactive'}`}>{s.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                  <td className="sa-muted">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-sm" style={{marginLeft:4}} onClick={() => toggleActive(s.id)}>{s.is_active !== false ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)} style={{marginLeft:4}}>Del</button>
                  </td>
                </tr>
              ))}
              {sources.length === 0 && <tr><td colSpan={4} className="sa-muted sa-center">No data sources</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <h3>{edit ? 'Edit Data Source' : 'New Data Source'}</h3>
            <label className="field">Name <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
            <div className="sa-modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'import' && (
        <ImportForm
          dataSources={sources}
          onError={setErr}
          onBatchUpdate={loadBatches}
          endpoint="/data-import/upload"
          showSample
          showTestSheet
          ngos={ngos}
          selectedNgoIds={selectedNgoIds}
          onNgoChange={(id) => setSelectedNgoIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
          )}
        />
      )}

      {tab === 'fresh' && (
        <FreshDataImport
          dataSources={sources}
          ngos={ngos}
          onError={setErr}
          onBatchUpdate={loadBatches}
          stationsByNgo={stationsByNgo}
          freshNgoStations={freshNgoStations}
          setFreshNgoStations={setFreshNgoStations}
        />
      )}

      {tab === 'history' && (
        <div className="sa-card" style={{overflowX:'auto'}}>
          <table className="sa-table">
            <thead><tr><th>Date</th><th>Source</th><th>Records</th><th>Imported At</th><th style={{width:120}}></th></tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.import_batch_id}>
                  <td>{b.import_date}</td><td>{b.data_source_name}</td><td>{b.record_count}</td>
                  <td className="sa-muted">{b.created_at ? new Date(b.created_at).toLocaleString() : '—'}</td>
                  <td><button className="btn btn-sm" onClick={() => viewBatch(b.import_batch_id)}>View</button>
                  <button className="btn btn-sm" onClick={() => exportBatch(b.import_batch_id)} style={{marginLeft:4}}>Export</button></td>
                </tr>
              ))}
              {batches.length === 0 && <tr><td colSpan={5} className="sa-muted sa-center">No imports yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'old' && (
        <ImportForm
          dataSources={sources}
          onError={setErr}
          endpoint="/data-import/upload-old"
          showTestSheet
        />
      )}

      {tab === 'copy' && (
        <>
          <div className="sa-card">
            <h3 className="sa-card-title">Copy Donors to Other NGOs</h3>
            <p className="sa-muted" style={{marginBottom:12}}>
              Copy donor records from one NGO to another as <strong>new data</strong>. The copied donors will appear in the target NGO's "New Data" tab for distribution to stations.
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <label className="field">
                Source NGO
                <select value={copySourceNgo} onChange={e => setCopySourceNgo(e.target.value)}>
                  <option value="">— Select —</option>
                  {ngos.map(ngo => (
                    <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
                  ))}
                </select>
              </label>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
                <span style={{fontSize:12,color:'var(--ink-soft)',fontWeight:500}}>Target NGOs:</span>
                {ngos.filter(n => n.id !== Number(copySourceNgo)).map(ngo => (
                  <label key={ngo.id} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:13,
                    background: copyTargetNgoIds.includes(ngo.id) ? '#eef2ff' : '#f5f5f5',
                    padding:'4px 10px', borderRadius:6, border:'1px solid var(--line, #e5e7eb)'}}>
                    <input type="checkbox" checked={copyTargetNgoIds.includes(ngo.id)}
                      onChange={() => setCopyTargetNgoIds(prev =>
                        prev.includes(ngo.id) ? prev.filter(id => id !== ngo.id) : [...prev, ngo.id]
                      )} />
                    {ngo.name}
                  </label>
                ))}
              </div>
              <label className="field">
                Filter
                <select value={copyFilter} onChange={e => setCopyFilter(e.target.value)}>
                  <option value="all">All Donors</option>
                  <option value="assigned">Donors with donations only</option>
                  <option value="new">New/Unassigned only</option>
                </select>
              </label>
              <label className="field" style={{fontSize:12}}>
                Or upload a file with mobile numbers (one per row)
                <input type="file" accept=".txt,.csv,.xlsx" onChange={e => setCopyMobileFile(e.target.files[0])} />
              </label>
              <div className="sa-filters" style={{marginTop:8}}>
                <button className="btn btn-primary" onClick={async () => {
                  if (!copySourceNgo || copyTargetNgoIds.length === 0) return
                  setCopying(true)
                  setErr('')
                  setCopyResult(null)
                  try {
                    const body = {
                      source_ngo_id: Number(copySourceNgo),
                      target_ngo_ids: copyTargetNgoIds,
                      filter: copyFilter,
                    }
                    if (copyMobileFile) {
                      const text = await copyMobileFile.text()
                      body.mobile_numbers = text.split('\n').map(s => s.trim()).filter(Boolean)
                    }
                    const res = await api('/data-import/copy-to-ngos', { method: 'POST', body: JSON.stringify(body) })
                    setCopyResult(res)
                  } catch (e) {
                    setErr(e.message)
                  } finally {
                    setCopying(false)
                  }
                }} disabled={copying || !copySourceNgo || copyTargetNgoIds.length === 0}>
                  {copying ? 'Copying...' : 'Copy to Selected NGOs'}
                </button>
              </div>
            </div>
          </div>

          {copyResult && (
            <div className="sa-card">
              <h3 className="sa-card-title" style={{color:'#10b981'}}>Copy Complete</h3>
              <p style={{fontSize:13, marginBottom:8}}>{copyResult.message}</p>
              {copyResult.details && (
                <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                  {copyResult.details.map(d => (
                    <span key={d.ngo} className="sa-badge" style={{background:'#eef2ff', color:'#4338ca', padding:'4px 10px', borderRadius:6, fontSize:12}}>
                      {d.copied} → {d.ngo}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

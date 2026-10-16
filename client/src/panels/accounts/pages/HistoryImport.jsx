import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../api/auth'
import * as XLSX from 'xlsx'

// Accounts → Operations → History Import. Upload a multi-sheet workbook of
// past months, review the auto-mapping + skip reasons, and only then Confirm.
// Nothing is written until Confirm; re-uploading the same file is a no-op.

const STATUS = {
  preview: 'Awaiting confirm',
  confirmed: 'Imported',
}

const SKIP_FALLBACK = {
  MONTH_UNRECOGNISED: 'Could not read a month from the sheet name or Month column',
  NOTHING_TO_IMPORT: 'No collection or target value in this row',
}

export default function HistoryImport() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // parse result
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(null) // confirm result
  const [error, setError] = useState('')
  const [batches, setBatches] = useState([])
  const [dragOver, setDragOver] = useState(false)

  const loadBatches = useCallback(() => {
    api('/accounts/history-import/batches', { _prefix: 'ucs' })
      .then(setBatches)
      .catch(() => setBatches([]))
  }, [])

  useEffect(() => { loadBatches() }, [loadBatches])

  const upload = async (f) => {
    if (!f) return
    setFile(f); setResult(null); setDone(null); setError(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const json = await api('/accounts/history-import/preview', { method: 'POST', body: fd, _prefix: 'ucs' })
      setResult(json)
      if (json.duplicate) setError('This exact file was already imported — nothing to do.')
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!result?.batch?.id) return
    setConfirming(true); setError('')
    try {
      const res = await api(`/accounts/history-import/${result.batch.id}/confirm`, {
        method: 'POST', _prefix: 'ucs', body: JSON.stringify({}),
      })
      setDone(res)
      loadBatches()
    } catch (e) {
      setError(e.message || 'Import failed')
    } finally {
      setConfirming(false)
    }
  }

  const downloadSkipped = () => {
    if (!done?.skipped_rows?.length) return
    const rows = done.skipped_rows.map(r => ({
      'Excel Row': r.row,
      Sheet: r.sheet || (result?.sheets || []).find(s => s.preview?.some(p => p.row === r.row))?.name || '',
      Employee: r.employee,
      'Login ID': r.login_id,
      Month: r.month || '',
      Collection: r.collection ?? '',
      Target: r.target ?? '',
      Code: r.skip,
      Reason: r.reason,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Skipped Records')
    XLSX.writeFile(wb, 'Skipped Records.xlsx')
  }

  const summary = result?.summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>History Import</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 0' }}>
          Upload a multi-sheet Excel of past months — sheet names like Jan, Oct 25, July 2026, or a Month column.
          Columns are auto-mapped (including Salary); nothing is written until you confirm.
        </p>
      </div>

      {/* Drop zone */}
      <label
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files?.[0]) }}
        style={{
          display: 'block', border: `2px dashed ${dragOver ? 'var(--sage)' : 'var(--line)'}`,
          borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'var(--sage-soft)' : 'var(--paper)', transition: 'all .15s',
        }}
      >
        <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => upload(e.target.files?.[0])} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>{busy ? 'Reading workbook…' : file ? file.name : 'Drop workbook here or click to browse'}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>.xlsx / .xls · up to 50 MB</div>
      </label>

      {error && <div className="err-banner">{error}</div>}
      {busy && <div className="sk" style={{ height: 80, borderRadius: 10 }} />}

      {/* Preview summary */}
      {summary && !done && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Preview</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {summary.sheets} sheet{summary.sheets === 1 ? '' : 's'} · {summary.total_rows} rows · {summary.importable} importable · {summary.skipped} skipped
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={confirm} disabled={confirming || summary.importable === 0 || result?.duplicate}>
              {confirming ? 'Importing…' : `Confirm Import (${summary.importable})`}
            </button>
          </div>

          {summary.importable_months?.length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              <span style={{ fontWeight: 600 }}>Months: </span>
              {summary.importable_months.join(', ')}
            </div>
          )}

          {summary.skipped > 0 && (
            <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--danger-soft)', marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>Will skip {summary.skipped} rows:</span>{' '}
              {Object.entries(summary.skip_counts).map(([code, n]) => (
                <span key={code} style={{ marginRight: 12 }} title={summary.skip_reasons?.[code] || SKIP_FALLBACK[code]}>
                  {code} × {n}
                </span>
              ))}
            </div>
          )}

          {/* Per-sheet mapping table */}
          {(result?.sheets || []).map(s => (
            <div key={s.name} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                {s.month && <span className="pill" style={{ fontSize: 10 }}>month: {s.month}</span>}
                {s.saved && <span className="pill" style={{ fontSize: 10, background: 'var(--sage-soft)' }}>saved mapping used</span>}
                <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{s.row_count} rows · header row {s.header_row}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>
                Mapped: {Object.entries(s.map).map(([f, idx]) => `${f} ← "${s.headers[idx]}"`).join(' · ') || 'nothing detected'}
              </div>
              {s.ambiguous?.length > 0 && (
                <div style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, background: '#fff7e6', marginBottom: 6 }}>
                  {s.ambiguous.map(a => (
                    <div key={a.field}>
                      Ambiguous <b>{a.label}</b>: {a.options.map(o => `"${o.header}"`).join(' / ')} — rename the header to one of the known names if the mapping is wrong.
                    </div>
                  ))}
                </div>
              )}
              {s.preview?.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
                        <th style={{ padding: '4px 8px' }}>Row</th>
                        <th style={{ padding: '4px 8px' }}>Employee</th>
                        <th style={{ padding: '4px 8px' }}>Month</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>Collection</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>Target</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>Salary</th>
                        <th style={{ padding: '4px 8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.preview.map(r => (
                        <tr key={r.row} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '4px 8px' }}>{r.row}</td>
                          <td style={{ padding: '4px 8px' }}>{r.worker_name || r.employee || '—'}</td>
                          <td style={{ padding: '4px 8px' }}>{r.month || '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.collection ?? '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.target ?? '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.salary ?? '—'}</td>
                          <td style={{ padding: '4px 8px' }}>
                            {r.skip
                              ? <span style={{ color: 'var(--danger)' }}>{r.skip}</span>
                              : <span style={{ color: 'var(--sage)' }}>✓ {r.worker_name}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm result */}
      {done && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            {done.already_confirmed ? 'Already imported' : `Imported ${done.imported} rows`}
          </div>
          {done.skipped_rows?.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
                {done.skipped_rows.length} rows were skipped.
              </div>
              <button className="btn btn-sm" onClick={downloadSkipped}>Download Skipped Records (XLSX)</button>
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-sm" onClick={() => { setResult(null); setDone(null); setFile(null) }}>Import another file</button>
          </div>
        </div>
      )}

      {/* Batch history */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Recent Imports</div>
        {batches.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No imports yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
                <th style={{ padding: '5px 8px' }}>File</th>
                <th style={{ padding: '5px 8px' }}>Date</th>
                <th style={{ padding: '5px 8px' }}>Sheets</th>
                <th style={{ padding: '5px 8px', textAlign: 'right' }}>Imported</th>
                <th style={{ padding: '5px 8px', textAlign: 'right' }}>Skipped</th>
                <th style={{ padding: '5px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '5px 8px' }}>{b.file_name}</td>
                  <td style={{ padding: '5px 8px' }}>{new Date(b.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '5px 8px' }}>{b.sheet_count}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{b.imported_rows}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{b.skipped_rows}</td>
                  <td style={{ padding: '5px 8px' }}>{STATUS[b.status] || b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

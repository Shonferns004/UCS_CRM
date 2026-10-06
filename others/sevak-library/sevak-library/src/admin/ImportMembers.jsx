import { useRef, useState } from 'react'
import {
  UploadCloud, FileSpreadsheet, Loader2, X, AlertTriangle, CheckCircle2, Info, Trash2
} from 'lucide-react'
import { parseSpreadsheet } from '../importParser.js'
import { importMembers } from '../api.js'
import { useToast } from './toast.jsx'
import { formatINR, formatDate } from '../formUtils.js'

const ACCEPT = '.xlsx,.xls,.csv'

export default function ImportMembers({ onImported }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState(null)
  const [parseErr, setParseErr] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)

  const valid = rows ? rows.filter((r) => r.issues.length === 0) : []
  const invalid = rows ? rows.filter((r) => r.issues.length > 0) : []

  const handleFile = async (file) => {
    if (!file) return
    setParseErr('')
    setParsing(true)
    setFileName(file.name)
    try {
      const parsed = await parseSpreadsheet(file)
      setRows(parsed)
      if (parsed.length === 0) toast('No rows found in the file.', 'error')
    } catch (e) {
      setRows(null)
      setParseErr(e.message)
    } finally {
      setParsing(false)
    }
  }

  const reset = () => {
    setRows(null)
    setFileName('')
    setParseErr('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const doImport = async () => {
    if (valid.length === 0) return
    setImporting(true)
    try {
      const payload = valid.map((r) => r.payload)
      const res = await importMembers(payload)
      const msg = `Imported ${res.imported} member(s).`
      const note = res.skipped > 0 ? ` ${res.skipped} skipped (already exist).` : ''
      toast(msg + note)
      if (res.imported > 0 && onImported) onImported()
      reset()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const showNoFile = !rows && !parsing && !parseErr

  return (
    <div className="admin-view">
      <div className="admin-view-head">
        <div>
          <h2>Import Members</h2>
          <p className="admin-sub">
            Upload an Excel/CSV file to add existing members. They are imported as
            "awaiting verification" with auto-generated IDs (SL-YYYY-XXXX). Members whose
            mobile number already exists are skipped.
          </p>
        </div>
        <div className="admin-view-head-btns">
          <button className="btn-export" onClick={reset} disabled={!rows && !parseErr}>
            <Trash2 size={15} /> Clear
          </button>
        </div>
      </div>

      <div className="import-box">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="import-file-input"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {showNoFile && (
          <div
            className={`drop-zone ${dragging ? 'dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFile(e.dataTransfer.files[0])
            }}
          >
            <UploadCloud size={38} className="drop-zone-icon" />
            <strong>Drop your member file here</strong>
            <span className="drop-zone-hint">
              or click to browse · .xlsx, .xls or .csv
            </span>
            <span className="drop-zone-note">
              First row must be the column headings (Member Name, Mobile, Package, ...)
            </span>
          </div>
        )}

        {parsing && (
          <div className="drop-zone">
            <Loader2 size={26} className="spin" />
            <p className="admin-sub">Reading {fileName}...</p>
          </div>
        )}

        {parseErr && (
          <div className="import-parse-error">
            <AlertTriangle size={18} />
            <div>
              <strong>Could not read this file.</strong>
              <p>{parseErr}</p>
            </div>
            <button className="btn-act" onClick={reset}>Try another file</button>
          </div>
        )}

        {rows && (
          <>
            <div className="import-summary">
              <span className="import-summary-item ok">
                <CheckCircle2 size={15} /> {valid.length} ready to import
              </span>
              <span className={`import-summary-item ${invalid.length ? 'warn' : ''}`}>
                <Info size={15} /> {invalid.length} need attention
              </span>
              <span className="import-summary-note">
                Membership IDs are generated automatically (SL-YYYY-XXXX), continuing
                from the highest issued number. The Member ID column in your file is ignored.
              </span>
            </div>

            <div className="app-table-wrap import-table-wrap">
              <table className="app-table import-table">
                <thead>
                  <tr>
                    <th>Member Name</th>
                    <th>Mobile</th>
                    <th>Degree</th>
                    <th>Package</th>
                    <th>Fee</th>
                    <th>Received</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Remarks</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.issues.length ? 'import-row-err' : 'import-row-ok'}>
                      <td>
                        <strong>{r.payload.fullName || '—'}</strong>
                        {r.issues.length > 0 && (
                          <div className="import-issues">
                            {r.issues.map((iss, i) => (
                              <span key={i}>{iss}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="mono">{r.payload.mobile || '—'}</td>
                      <td>{r.payload.data.degree || '—'}</td>
                      <td>{r.payload.membershipType || '—'}</td>
                      <td>{r.payload.membershipFee != null ? formatINR(r.payload.membershipFee) : '—'}</td>
                      <td>{r.payload.data.amountReceived || '—'}</td>
                      <td>{r.payload.startDate ? formatDate(r.payload.startDate) : '—'}</td>
                      <td>{r.payload.endDate ? formatDate(r.payload.endDate) : '—'}</td>
                      <td className="muted-td">{r.payload.data.remarks || '—'}</td>
                      <td>
                        {r.issues.length ? (
                          <span className="admin-badge st-rejected">Check row</span>
                        ) : (
                          <span className="admin-badge st-payment">Awaiting verification</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-actions">
              <button className="btn-act" onClick={reset} disabled={importing}>
                <X size={15} /> Cancel
              </button>
              <button className="btn-export import-btn" onClick={doImport} disabled={importing || valid.length === 0}>
                {importing ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />}
                {importing ? 'Importing...' : `Import ${valid.length} member${valid.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

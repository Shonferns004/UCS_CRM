import { useState, useRef } from 'react';
import { apiPost } from '../api/auth';

export default function BankStatementImport() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [showSourceInput, setShowSourceInput] = useState(false);
  const fileRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(null);
      setResult(null);
      setError('');
      setShowSourceInput(false);
    }
  };

  const handlePreview = async () => {
    if (!file) { setError('Please select a file'); return; }
    setError('');
    setPreview(null);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);
    if (sourceName) formData.append('source_name', sourceName);
    try {
      const data = await apiPost('/accounts/bank-statement/preview', formData);
      setPreview(data);
      if (data.bank === 'Generic' && !sourceName) setShowSourceInput(true);
    } catch (err) { setError(err.message); }
  };

  const handleImport = async () => {
    if (!file) { setError('Please select a file'); return; }
    setError('');
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    if (sourceName) formData.append('source_name', sourceName);
    try {
      const data = await apiPost('/accounts/bank-statement/import', formData);
      setResult(data);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) { setError(err.message); }
    finally { setImporting(false); }
  };

  const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Upload Bank Statement</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Upload a CSV or Excel file downloaded from your bank's net banking portal.
          Supported banks: Axis Bank, HDFC, ICICI, SBI, and most Indian banks.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 4, flex: 1, minWidth: 200 }}
          />
          <button className="btn btn-sm" onClick={handlePreview} disabled={!file}
            style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>
            Preview
          </button>
        </div>

        {showSourceInput && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Bank name not auto-detected. Enter source:</span>
            <input value={sourceName} onChange={e => setSourceName(e.target.value)}
              placeholder="e.g. Axis Bank"
              style={{ fontSize: 13, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 4, width: 200 }} />
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#991b1b' }}>{error}</div>
        )}
      </div>

      {preview && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Detected Bank:</span>
              <span className="pill pill-gray" style={{ marginLeft: 6 }}>{preview.bank}</span>
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Source:</span>
              <span className="pill" style={{ marginLeft: 6, background: '#5B6B4E20', color: '#5B6B4E' }}>{preview.source_name}</span>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{preview.parsed_rows} of {preview.total_rows} rows parsed</div>
            {preview.error_rows > 0 && (
              <div style={{ fontSize: 13, color: '#dc2626' }}>{preview.error_rows} errors</div>
            )}
            <button className="btn btn-sm" onClick={handleImport} disabled={importing}
              style={{ marginLeft: 'auto', background: '#059669', color: '#fff', border: 'none' }}>
              {importing ? 'Importing...' : `Import ${preview.parsed_rows} Entries`}
            </button>
          </div>

          <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Ref No</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{row.date}</td>
                    <td style={{ fontSize: 12, maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.description}>{row.description || '\u2014'}</td>
                    <td style={{ fontSize: 11 }}>{row.ref_no || '\u2014'}</td>
                    <td style={{ fontSize: 12, color: row.debit > 0 ? '#dc2626' : '#6b7280' }}>{row.debit > 0 ? currency(row.debit) : '\u2014'}</td>
                    <td style={{ fontSize: 12, color: row.credit > 0 ? '#059669' : '#6b7280' }}>{row.credit > 0 ? currency(row.credit) : '\u2014'}</td>
                    <td style={{ fontSize: 12 }}>{row.balance ? currency(row.balance) : '\u2014'}</td>
                  </tr>
                ))}
                {preview.rows.length > 50 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', padding: 8 }}>... and {preview.rows.length - 50} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>Import Complete</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {result.imported} entries imported to {result.source_name}
                {result.errors > 0 && ` (${result.errors} errors)`}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

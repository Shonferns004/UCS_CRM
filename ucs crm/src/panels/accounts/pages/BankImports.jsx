import { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost } from '../api/auth';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

function Skeleton({ h = 14, w = '100%', mb = 0 }) {
  return <div style={{ height: h, width: typeof w === 'number' ? w : w, borderRadius: 6, marginBottom: mb, background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />;
}

function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-pad">
        <Skeleton h={18} w={180} mb={12} />
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={14} mb={8} />)}
      </div>
    </div>
  );
}

function SkeletonTable({ rows = 4, cols = 6 }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-pad">
        <Skeleton h={16} w={120} mb={12} />
        <table className="table-wrap" style={{ width: '100%', fontSize: 13 }}>
          <thead><tr>{Array.from({ length: cols }, (_, j) => <th key={j}><Skeleton h={12} w={60} /></th>)}</tr></thead>
          <tbody>{Array.from({ length: rows }, (_, i) => (
            <tr key={i}>{Array.from({ length: cols }, (_, j) => (
              <td key={j}><Skeleton h={12} w={j === 1 ? 180 : 70} /></td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab Components ──────────────────────────────────────────

function EmailImportTab() {
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggeringSeen, setTriggeringSeen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [importingFromDate, setImportingFromDate] = useState(false);
  const [filterAccount, setFilterAccount] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAccount) params.set('account_id', filterAccount);
      const [statusRes, logRes, accRes] = await Promise.allSettled([
        apiGet('/accounts/email-import/status'),
        apiGet('/accounts/email-import/log?' + params.toString()),
        apiGet('/accounts/email-import/accounts'),
      ]);
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value);
      if (logRes.status === 'fulfilled') setLog(logRes.value || []);
      if (accRes.status === 'fulfilled') setAccounts(accRes.value || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [filterAccount]);

  const counts = status?.counts || { imported: 0, failed: 0, skipped: 0, seen: 0 };
  const lastPoll = status?.lastPoll;
  const statusColor = lastPoll?.success === true ? '#059669' : lastPoll?.success === false ? '#dc2626' : '#6b7280';

  if (loading) return <SkeletonTable rows={4} cols={7} />;

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 12 }}>
        {[
          { label: 'Imported', value: counts.imported, color: '#059669', icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></> },
          { label: 'Skipped', value: counts.skipped, color: '#f59e0b', icon: <><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><polyline points="16 16 23 7 16 7"/></> },
          { label: 'Seen', value: counts.seen, color: '#8B5CF6', icon: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></> },
          { label: 'Failed', value: counts.failed, color: '#dc2626', icon: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></> },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.color + '18', color: s.color }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{s.icon}</svg>
            </div>
            <div className="stat-info">
              <div className="stat-num">{s.value}</div>
              <div className="stat-lbl">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
      {lastPoll && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 16px', borderLeft: `3px solid ${statusColor}`, background: statusColor + '08' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>Last Poll: {lastPoll.success === true ? 'Success' : 'Failed'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{lastPoll.message} — {lastPoll.timestamp ? new Date(lastPoll.timestamp).toLocaleString('en-IN') : 'N/A'}</div>
          {lastPoll.details?.map((d, i) => (
            <div key={i} style={{ fontSize: 11, color: d.result?.error ? '#dc2626' : '#059669', marginTop: 2 }}>{d.name}: {d.result?.error || d.result?.message || 'OK'}</div>
          ))}
        </div>
      )}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 6, padding: '8px 12px', marginBottom: 12 }}>
        <button className="btn btn-sm" onClick={loadData} style={{ display:'flex', alignItems:'center', gap:4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg> Refresh
        </button>
        <label style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
          <span>From</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid var(--line)', width:140 }} />
        </label>
        <button className="btn btn-sm" onClick={async () => { if (!fromDate) { alert('Select a date'); return }; setImportingFromDate(true); try { await apiPost('/accounts/email-import/trigger?fromDate=' + fromDate); await loadData() } catch (e) { alert(e.message) }; setImportingFromDate(false) }} disabled={importingFromDate || !fromDate}
          style={{ background:'#5B6B4E', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>
          {importingFromDate ? 'Importing...' : 'Import from Date'}
        </button>
        <button className="btn btn-sm" onClick={async () => { setTriggering(true); try { await apiPost('/accounts/email-import/trigger'); await loadData() } catch (e) { alert(e.message) }; setTriggering(false) }} disabled={triggering}
          style={{ background:'var(--sage)', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>
          {triggering ? 'Importing...' : 'Manual Import'}
        </button>
        <button className="btn btn-sm" onClick={async () => { setTriggeringSeen(true); try { await apiPost('/accounts/email-import/process-seen'); await loadData() } catch (e) { alert(e.message) }; setTriggeringSeen(false) }} disabled={triggeringSeen}
          style={{ background:'#8B5CF6', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>
          {triggeringSeen ? 'Importing...' : 'Process Seen'}
        </button>
        <button className="btn btn-sm" onClick={async () => { try { await apiPost('/accounts/email-import/test'); await loadData() } catch (e) { alert(e.message) } }}
          style={{ background:'#f59e0b', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>
          Test Email
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Subject</th><th>From</th><th>Amount</th><th>Payment ID</th><th>Source</th><th>Status</th></tr></thead>
          <tbody>
            {log.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:20, color:'var(--ink-soft)' }}>No imports yet</td></tr>
            ) : log.map(e => (
              <tr key={e.id}>
                <td style={{ whiteSpace:'nowrap', fontSize:12 }}>{e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : '\u2014'}</td>
                <td style={{ fontSize:12, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={e.email_subject}>{e.email_subject || '\u2014'}</td>
                <td style={{ fontSize:12 }}>{e.email_from ? e.email_from.split('<')[0].trim() : '\u2014'}</td>
                <td style={{ fontSize:12 }}>{e.parsed_amount ? currency(e.parsed_amount) : '\u2014'}</td>
                <td style={{ fontSize:11 }}>{e.parsed_payment_id || '\u2014'}</td>
                <td style={{ fontSize:12 }}>{e.parsed_source || '\u2014'}</td>
                <td><span className={`pill ${e.status === 'imported' ? 'pill-green' : e.status === 'failed' ? 'pill-red' : e.status === 'seen' ? 'pill-yellow' : 'pill-gray'}`} style={{ fontSize:11 }}>{e.status}{e.seen ? ' (read)' : ''}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {accounts.length > 0 && (
        <div style={{ display:'flex', gap:6, padding:'8px 0', flexWrap:'wrap', alignItems:'center', marginTop:8 }}>
          <span style={{ fontSize:11, fontWeight:600, color:'#6b7280', textTransform:'uppercase' }}>Filter by account:</span>
          <button onClick={() => setFilterAccount('')} className="btn btn-sm" style={{ background: !filterAccount ? 'var(--sage)' : 'transparent', color: !filterAccount ? '#fff' : 'var(--ink)', border:'1px solid var(--line)' }}>All</button>
          {accounts.map(acc => (
            <button key={acc.id} onClick={() => setFilterAccount(acc.id)}
              className="btn btn-sm" style={{ background: String(filterAccount) === String(acc.id) ? 'var(--sage)' : 'transparent', color: String(filterAccount) === String(acc.id) ? '#fff' : '#374151', border:'1px solid var(--line)', opacity: acc.is_active ? 1 : 0.55 }}>
              {acc.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentGatewaysTab() {
  const [log, setLog] = useState([]);
  const [counts, setCounts] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterGateway, setFilterGateway] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterGateway) params.set('gateway', filterGateway);
      if (filterAccount) params.set('account_id', filterAccount);
      const [logRes, statusRes, accRes] = await Promise.allSettled([
        apiGet('/webhooks/log?' + params.toString()),
        apiGet('/webhooks/status'),
        apiGet('/webhooks/razorpay/accounts'),
      ]);
      if (logRes.status === 'fulfilled') setLog(logRes.value || []);
      if (statusRes.status === 'fulfilled') setCounts(statusRes.value.counts || {});
      if (accRes.status === 'fulfilled') setAccounts(accRes.value || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [filterGateway, filterAccount]);

  const razorpayCount = (counts['razorpay_processed'] || 0) + (counts['razorpay_received'] || 0);
  const paytmCount = (counts['paytm_processed'] || 0) + (counts['paytm_received'] || 0);

  if (loading) return <SkeletonTable rows={4} cols={7} />;

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 12 }}>
        {[
          { label: 'Razorpay', value: razorpayCount, color: '#0d9488', icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/> },
          { label: 'Paytm', value: paytmCount, color: '#2563eb', icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/> },
          { label: 'Failed', value: (counts['razorpay_failed'] || 0) + (counts['paytm_failed'] || 0), color: '#dc2626', icon: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></> },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.color + '18', color: s.color }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{s.icon}</svg>
            </div>
            <div className="stat-info">
              <div className="stat-num">{s.value}</div>
              <div className="stat-lbl">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="filter-bar" style={{ flexWrap:'wrap', gap:6, padding:'8px 12px', marginBottom:12 }}>
        <select value={filterGateway} onChange={e => setFilterGateway(e.target.value)} style={{ fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid var(--line)' }}>
          <option value="">All Gateways</option>
          <option value="razorpay">Razorpay</option>
          <option value="paytm">Paytm</option>
        </select>
        <button className="btn btn-sm" onClick={loadData} style={{ display:'flex', alignItems:'center', gap:4 }}>Refresh</button>
        <button className="btn btn-sm" onClick={async () => { setSyncing(true); try { const r = await apiPost('/webhooks/razorpay/sync'); alert(r.message || 'Sync completed'); await loadData() } catch (e) { alert(e.message) }; setSyncing(false) }} disabled={syncing}
          style={{ marginLeft:'auto', background:'var(--sage)', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>
          {syncing ? 'Syncing...' : 'Sync Default'}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Gateway</th><th>Account</th><th>Event</th><th>Amount</th><th>Payment ID</th><th>Status</th></tr></thead>
          <tbody>
            {log.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:20, color:'var(--ink-soft)' }}>No webhook events yet</td></tr>
            ) : log.map(e => (
              <tr key={e.id}>
                <td style={{ whiteSpace:'nowrap', fontSize:12 }}>{e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : '\u2014'}</td>
                <td><span className="pill" style={{ background: e.gateway === 'razorpay' ? '#0d948818' : '#2563eb18', color: e.gateway === 'razorpay' ? '#0d9488' : '#2563eb', fontSize:11 }}>{e.gateway}</span></td>
                <td style={{ fontSize:11 }}>{e.account_name || '\u2014'}</td>
                <td style={{ fontSize:11 }}>{e.event_type || '\u2014'}</td>
                <td style={{ fontSize:12, fontWeight:600, color: e.amount != null && Number(e.amount) < 0 ? '#dc2626' : 'var(--sage)' }}>{e.amount ? currency(e.amount) : '\u2014'}</td>
                <td style={{ fontSize:11 }}>{e.payment_id || '\u2014'}</td>
                <td><span className={`pill ${e.status === 'processed' ? 'pill-green' : 'pill-red'}`} style={{ fontSize:11 }}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BankStatementTab() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [showSourceInput, setShowSourceInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const handlePreview = async () => {
    if (!file) { setError('Please select a file'); return }
    setError(''); setPreview(null); setResult(null); setLoading(true);
    const fd = new FormData(); fd.append('file', file);
    if (sourceName) fd.append('source_name', sourceName);
    try { const d = await apiPost('/accounts/bank-statement/preview', fd); setPreview(d); if (d.bank === 'Generic' && !sourceName) setShowSourceInput(true) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  };

  const handleImport = async () => {
    if (!file) { setError('Select a file'); return }
    setError(''); setImporting(true);
    const fd = new FormData(); fd.append('file', file);
    if (sourceName) fd.append('source_name', sourceName);
    try { const d = await apiPost('/accounts/bank-statement/import', fd); setResult(d); setPreview(null); setFile(null); if (fileRef.current) fileRef.current.value = '' }
    catch (e) { setError(e.message) }
    finally { setImporting(false) }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-pad" style={{ paddingBottom: 8 }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Upload a CSV or Excel bank statement. Supported: Axis, HDFC, ICICI, SBI, and most Indian banks.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(null); setResult(null); setError(''); setShowSourceInput(false) } }}
              style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 4, flex: 1, minWidth: 200 }} />
            <button className="btn btn-sm" onClick={handlePreview} disabled={!file || loading}
              style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>{loading ? 'Parsing...' : 'Preview'}</button>
          </div>
          {showSourceInput && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Enter bank name:</span>
              <input value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="e.g. Axis Bank"
                style={{ fontSize: 13, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 4, width: 200 }} />
            </div>
          )}
          {error && <div style={{ marginTop: 8, fontSize: 13, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        </div>
      </div>

      {preview && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-pad" style={{ paddingBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Bank: <span className="pill pill-gray">{preview.bank}</span></span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Source: <span className="pill" style={{ background: '#5B6B4E20', color: '#5B6B4E' }}>{preview.source_name}</span></span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{preview.parsed_rows} of {preview.total_rows} rows</span>
              <button className="btn btn-sm" onClick={handleImport} disabled={importing}
                style={{ marginLeft:'auto', background:'#059669', color:'#fff', border:'none' }}>
                {importing ? 'Importing...' : `Import ${preview.parsed_rows} Entries`}
              </button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 350, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Date</th><th>Description</th><th>Ref No</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace:'nowrap', fontSize:12 }}>{row.date}</td>
                      <td style={{ fontSize:12, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={row.description}>{row.description || '\u2014'}</td>
                      <td style={{ fontSize:11 }}>{row.ref_no || '\u2014'}</td>
                      <td style={{ fontSize:12, color: row.debit > 0 ? '#dc2626' : '#6b7280' }}>{row.debit > 0 ? currency(row.debit) : '\u2014'}</td>
                      <td style={{ fontSize:12, color: row.credit > 0 ? '#059669' : '#6b7280' }}>{row.credit > 0 ? currency(row.credit) : '\u2014'}</td>
                      <td style={{ fontSize:12 }}>{row.balance ? currency(row.balance) : '\u2014'}</td>
                    </tr>
                  ))}
                  {preview.rows.length > 50 && <tr><td colSpan={6} style={{ textAlign:'center', fontSize:12, color:'#6b7280', padding:8 }}>... and {preview.rows.length - 50} more rows</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <div className="card-pad" style={{ display:'flex', alignItems:'center', gap:12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#059669' }}>Import Complete</div>
              <div style={{ fontSize:13, color:'#6b7280' }}>{result.imported} entries imported to {result.source_name}{result.errors > 0 ? ` (${result.errors} errors)` : ''}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Combined Page ──────────────────────────────────────

const TABS = [
  { key: 'email', label: 'Email Import' },
  { key: 'gateways', label: 'Payment Gateways' },
  { key: 'statement', label: 'Bank Statement' },
];

export default function BankImports() {
  const [tab, setTab] = useState('email');

  const iconMap = {
    email: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    gateways: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    statement: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '12px 16px', border: 'none', background: tab === t.key ? 'var(--card-bg)' : 'var(--bg)',
                color: tab === t.key ? 'var(--sage)' : 'var(--ink-soft)', fontWeight: tab === t.key ? 700 : 500,
                fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                borderBottom: tab === t.key ? '2px solid var(--sage)' : '2px solid transparent',
                transition: 'all .15s',
              }}>
              {iconMap[t.key]}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'email' && <EmailImportTab />}
      {tab === 'gateways' && <PaymentGatewaysTab />}
      {tab === 'statement' && <BankStatementTab />}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const COLORS = ['#5B6B4E', '#B5603A', '#C08A2E', '#4F6472', '#7A5C7E', '#88693D', '#2E7D6F', '#9B59B6'];

function S({ h = 14, w = '100%', mb = 0 }) {
  return <div style={{ height: h, width: typeof w === 'number' ? w : w, borderRadius: 6, marginBottom: mb, background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />;
}

function SkeletonStat() {
  return (
    <div className="stat-card" style={{ opacity: 0.6 }}>
      <div className="stat-icon" style={{ background: '#e5e7eb' }}><div style={{ width: 18, height: 18, borderRadius: 4, background: '#d1d5db' }} /></div>
      <div className="stat-info">
        <div className="stat-num"><S h={22} w="60%" /></div>
        <div className="stat-lbl"><S h={12} w="40%" /></div>
      </div>
    </div>
  );
}

function SkeletonTable({ rows = 4, cols = 7 }) {
  return (
    <div className="card"><div className="card-pad">
      <table className="table-wrap" style={{ width:'100%', fontSize:13 }}>
        <thead><tr>{Array.from({length:cols}, (_,j) => <th key={j}><S h={12} w={j===1?160:60} /></th>)}</tr></thead>
        <tbody>{Array.from({length:rows}, (_,i) => <tr key={i}>{Array.from({length:cols}, (_,j) => <td key={j}><S h={12} w={j===1?180:70} /></td>)}</tr>)}</tbody>
      </table>
    </div></div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        padding:'10px 20px', fontSize:13, fontWeight:600, border:'none', background:'none', cursor:'pointer',
        color: active ? 'var(--sage)' : 'var(--ink-soft)',
        borderBottom: active ? '2px solid var(--sage)' : '2px solid transparent', marginBottom:-2,
        display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap',
      }}>
      {children}
    </button>
  );
}

function Toast({ msg, onClose }) {
  if (!msg) return null;
  const isError = msg.type === 'error';
  return (
    <div style={{
      position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:9999,
      background: isError ? '#dc2626' : '#059669', color:'#fff', padding:'10px 24px',
      borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,.15)', fontSize:13, fontWeight:500,
      display:'flex', alignItems:'center', gap:8,
    }}>
      {isError ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      )}
      {msg.message}
      <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', opacity:.7, padding:0, display:'flex' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

// ─── Email Import Tab ────────────────────────────────────────

function EmailImportSection() {
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggeringSeen, setTriggeringSeen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [importingFromDate, setImportingFromDate] = useState(false);
  const [filterAccount, setFilterAccount] = useState('');
  const [toast, setToast] = useState(null);

  function showToast(message, type) { setToast({ message, type }); setTimeout(() => setToast(null), 4000); }

  async function loadData() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterAccount) p.set('account_id', filterAccount);
      const [sr, lr, ar] = await Promise.allSettled([
        apiGet('/accounts/email-import/status'),
        apiGet('/accounts/email-import/log?' + p.toString()),
        apiGet('/accounts/email-import/accounts'),
      ]);
      if (sr.status === 'fulfilled') setStatus(sr.value);
      if (lr.status === 'fulfilled') setLog(lr.value || []);
      if (ar.status === 'fulfilled') setAccounts(ar.value || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [filterAccount]);

  const counts = status?.counts || { imported:0, failed:0, skipped:0, seen:0 };
  if (loading) return <SkeletonTable rows={4} cols={7} />;

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:12 }}>
        {[
          { label:'Imported', value:counts.imported, color:'#059669', icon:<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></> },
          { label:'Skipped', value:counts.skipped, color:'#f59e0b', icon:<><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><polyline points="16 16 23 7 16 7"/></> },
          { label:'Seen', value:counts.seen, color:'#8B5CF6', icon:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></> },
          { label:'Failed', value:counts.failed, color:'#dc2626', icon:<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></> },
        ].map((s,i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background:s.color+'18', color:s.color }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{s.icon}</svg>
            </div>
            <div className="stat-info"><div className="stat-num">{s.value}</div><div className="stat-lbl">{s.label}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginBottom:12 }}>
        <div className="filter-bar" style={{ flexWrap:'wrap', gap:6, padding:'8px 12px' }}>
          <button className="btn btn-sm" onClick={loadData} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg> Refresh
          </button>
          <label style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
            <span>From</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid var(--line)', width:140 }} />
          </label>
          <button className="btn btn-sm" onClick={async () => { if (!fromDate) { alert('Select date'); return }; setImportingFromDate(true); try { await apiPost('/accounts/email-import/trigger?fromDate='+fromDate); await loadData() } catch(e) { showToast(e.message,'error') }; setImportingFromDate(false) }} disabled={importingFromDate || !fromDate}
            style={{ background:'#5B6B4E', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>{importingFromDate ? 'Importing...' : 'Import from Date'}
          </button>
          <button className="btn btn-sm" onClick={async () => { setTriggering(true); try { const r = await apiPost('/accounts/email-import/trigger'); const err = r.details?.find(d=>d.result?.error)?.result?.error; showToast(err || r.message || 'Done', r.success===false?'error':'success'); await loadData() } catch(e) { showToast(e.message,'error') }; setTriggering(false) }} disabled={triggering}
            style={{ background:'var(--sage)', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>{triggering ? 'Importing...' : 'Manual Import'}
          </button>
          <button className="btn btn-sm" onClick={async () => { setTriggeringSeen(true); try { const r = await apiPost('/accounts/email-import/process-seen'); showToast(r.message||'Done', r.success===false?'error':'success'); await loadData() } catch(e) { showToast(e.message,'error') }; setTriggeringSeen(false) }} disabled={triggeringSeen}
            style={{ background:'#8B5CF6', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>{triggeringSeen ? 'Importing...' : 'Process Seen'}
          </button>
          <button className="btn btn-sm" onClick={async () => { try { await apiPost('/accounts/email-import/test'); await loadData() } catch(e) { showToast(e.message,'error') } }}
            style={{ background:'#f59e0b', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>Test Email
          </button>
        </div>
        {accounts.length > 0 && (
          <div style={{ display:'flex', gap:6, padding:'4px 12px 8px', flexWrap:'wrap', alignItems:'center', borderTop:'1px solid var(--line)' }}>
            <span style={{ fontSize:11, fontWeight:600, color:'#6b7280', textTransform:'uppercase' }}>Account:</span>
            {[{id:''},{id:'all'}].length && <button onClick={()=>setFilterAccount('')} className="btn btn-sm" style={{ background:!filterAccount?'var(--sage)':'transparent', color:!filterAccount?'#fff':'var(--ink)', border:'1px solid var(--line)' }}>All</button>}
            {accounts.map(acc => (
              <button key={acc.id} onClick={()=>setFilterAccount(acc.id)}
                className="btn btn-sm" style={{ background:String(filterAccount)===String(acc.id)?'var(--sage)':'transparent', color:String(filterAccount)===String(acc.id)?'#fff':'#374151', border:'1px solid var(--line)', opacity:acc.is_active?1:.55 }}>
                {acc.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Subject</th><th>From</th><th>Amount</th><th>Payment ID</th><th>Source</th><th>Status</th></tr></thead>
          <tbody>
            {log.length === 0 ? <tr><td colSpan={7} style={{ textAlign:'center', padding:20, color:'var(--ink-soft)' }}>No imports yet</td></tr>
            : log.map(e => (
              <tr key={e.id}>
                <td style={{ whiteSpace:'nowrap', fontSize:12 }}>{e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : '\u2014'}</td>
                <td style={{ fontSize:12, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={e.email_subject}>{e.email_subject || '\u2014'}</td>
                <td style={{ fontSize:12 }}>{e.email_from ? e.email_from.split('<')[0].trim() : '\u2014'}</td>
                <td style={{ fontSize:12 }}>{e.parsed_amount ? currency(e.parsed_amount) : '\u2014'}</td>
                <td style={{ fontSize:11 }}>{e.parsed_payment_id || '\u2014'}</td>
                <td style={{ fontSize:12 }}>{e.parsed_source || '\u2014'}</td>
                <td><span className={`pill ${e.status==='imported'?'pill-green':e.status==='failed'?'pill-red':e.status==='seen'?'pill-yellow':'pill-gray'}`} style={{ fontSize:11 }}>{e.status}{e.seen ? ' (read)' : ''}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast msg={toast} onClose={()=>setToast(null)} />
    </div>
  );
}

// ─── Payment Gateways Tab ────────────────────────────────────

function PaymentGatewaysSection() {
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
      const p = new URLSearchParams();
      if (filterGateway) p.set('gateway', filterGateway);
      if (filterAccount) p.set('account_id', filterAccount);
      const [lr, sr, ar] = await Promise.allSettled([
        apiGet('/webhooks/log?'+p.toString()),
        apiGet('/webhooks/status'),
        apiGet('/webhooks/razorpay/accounts'),
      ]);
      if (lr.status === 'fulfilled') setLog(lr.value || []);
      if (sr.status === 'fulfilled') setCounts(sr.value.counts || {});
      if (ar.status === 'fulfilled') setAccounts(ar.value || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [filterGateway, filterAccount]);

  const razorpayCount = (counts['razorpay_processed']||0)+(counts['razorpay_received']||0);
  const paytmCount = (counts['paytm_processed']||0)+(counts['paytm_received']||0);
  if (loading) return <SkeletonTable rows={4} cols={7} />;

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom:12 }}>
        {[
          { label:'Razorpay', value:razorpayCount, color:'#0d9488', icon:<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/> },
          { label:'Paytm', value:paytmCount, color:'#2563eb', icon:<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/> },
          { label:'Failed', value:(counts['razorpay_failed']||0)+(counts['paytm_failed']||0), color:'#dc2626', icon:<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></> },
        ].map((s,i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background:s.color+'18', color:s.color }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{s.icon}</svg>
            </div>
            <div className="stat-info"><div className="stat-num">{s.value}</div><div className="stat-lbl">{s.label}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginBottom:12 }}>
        <div className="filter-bar" style={{ flexWrap:'wrap', gap:6, padding:'8px 12px' }}>
          <select value={filterGateway} onChange={e=>setFilterGateway(e.target.value)} style={{ fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid var(--line)' }}>
            <option value="">All Gateways</option><option value="razorpay">Razorpay</option><option value="paytm">Paytm</option>
          </select>
          <button className="btn btn-sm" onClick={loadData} style={{ display:'flex', alignItems:'center', gap:4 }}>Refresh</button>
          <button className="btn btn-sm" onClick={async () => { setSyncing(true); try { const r = await apiPost('/webhooks/razorpay/sync'); alert(r.message||'Sync done'); await loadData() } catch(e) { alert(e.message) }; setSyncing(false) }} disabled={syncing}
            style={{ marginLeft:'auto', background:'var(--sage)', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>{syncing ? 'Syncing...' : 'Sync Default'}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Gateway</th><th>Account</th><th>Event</th><th>Amount</th><th>Payment ID</th><th>Status</th></tr></thead>
          <tbody>
            {log.length === 0 ? <tr><td colSpan={7} style={{ textAlign:'center', padding:20, color:'var(--ink-soft)' }}>No webhook events yet</td></tr>
            : log.map(e => (
              <tr key={e.id}>
                <td style={{ whiteSpace:'nowrap', fontSize:12 }}>{e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : '\u2014'}</td>
                <td><span className="pill" style={{ background:e.gateway==='razorpay'?'#0d948818':'#2563eb18', color:e.gateway==='razorpay'?'#0d9488':'#2563eb', fontSize:11 }}>{e.gateway}</span></td>
                <td style={{ fontSize:11 }}>{e.account_name || '\u2014'}</td>
                <td style={{ fontSize:11 }}>{e.event_type || '\u2014'}</td>
                <td style={{ fontSize:12, fontWeight:600, color:e.amount!=null&&Number(e.amount)<0?'#dc2626':'var(--sage)' }}>{e.amount ? currency(e.amount) : '\u2014'}</td>
                <td style={{ fontSize:11 }}>{e.payment_id || '\u2014'}</td>
                <td><span className={`pill ${e.status==='processed'?'pill-green':'pill-red'}`} style={{ fontSize:11 }}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Bank Statement Tab ──────────────────────────────────────

function BankStatementSection() {
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
    if (!file) { setError('Select a file'); return }
    setError(''); setPreview(null); setResult(null); setLoading(true);
    const fd = new FormData(); fd.append('file', file);
    if (sourceName) fd.append('source_name', sourceName);
    try { const d = await apiPost('/accounts/bank-statement/preview', fd); setPreview(d); if (d.bank==='Generic'&&!sourceName) setShowSourceInput(true) }
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
      <div className="card" style={{ marginBottom:12 }}>
        <div className="card-pad" style={{ paddingBottom:8 }}>
          <p style={{ fontSize:13, color:'#6b7280', marginBottom:12 }}>Upload a CSV or Excel bank statement. Supported: Axis, HDFC, ICICI, SBI, and most Indian banks.</p>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e=>{const f=e.target.files?.[0]; if(f){setFile(f); setPreview(null); setResult(null); setError(''); setShowSourceInput(false)}}}
              style={{ fontSize:13, padding:'6px 10px', border:'1px solid var(--line)', borderRadius:4, flex:1, minWidth:200 }} />
            <button className="btn btn-sm" onClick={handlePreview} disabled={!file||loading}
              style={{ background:'var(--sage)', color:'#fff', border:'none' }}>{loading ? 'Parsing...' : 'Preview'}</button>
          </div>
          {showSourceInput && (
            <div style={{ marginTop:8, display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ fontSize:13, color:'#6b7280' }}>Enter bank name:</span>
              <input value={sourceName} onChange={e=>setSourceName(e.target.value)} placeholder="e.g. Axis Bank"
                style={{ fontSize:13, padding:'4px 8px', border:'1px solid var(--line)', borderRadius:4, width:200 }} />
            </div>
          )}
          {error && <div style={{ marginTop:8, fontSize:13, color:'#dc2626', background:'#fef2f2', padding:'8px 12px', borderRadius:6 }}>{error}</div>}
        </div>
      </div>
      {preview && (
        <div className="card" style={{ marginBottom:12 }}>
          <div className="card-pad" style={{ paddingBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>Bank: <span className="pill pill-gray">{preview.bank}</span></span>
              <span style={{ fontSize:13, fontWeight:600 }}>Source: <span className="pill" style={{ background:'#5B6B4E20', color:'#5B6B4E' }}>{preview.source_name}</span></span>
              <span style={{ fontSize:13, color:'#6b7280' }}>{preview.parsed_rows} of {preview.total_rows} rows</span>
              <button className="btn btn-sm" onClick={handleImport} disabled={importing}
                style={{ marginLeft:'auto', background:'#059669', color:'#fff', border:'none' }}>
                {importing ? 'Importing...' : `Import ${preview.parsed_rows} Entries`}
              </button>
            </div>
            <div className="table-wrap" style={{ maxHeight:300, overflowY:'auto' }}>
              <table>
                <thead><tr><th>Date</th><th>Description</th><th>Ref No</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0,50).map((row,i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace:'nowrap', fontSize:12 }}>{row.date}</td>
                      <td style={{ fontSize:12, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={row.description}>{row.description||'\u2014'}</td>
                      <td style={{ fontSize:11 }}>{row.ref_no||'\u2014'}</td>
                      <td style={{ fontSize:12, color:row.debit>0?'#dc2626':'#6b7280' }}>{row.debit>0?currency(row.debit):'\u2014'}</td>
                      <td style={{ fontSize:12, color:row.credit>0?'#059669':'#6b7280' }}>{row.credit>0?currency(row.credit):'\u2014'}</td>
                      <td style={{ fontSize:12 }}>{row.balance?currency(row.balance):'\u2014'}</td>
                    </tr>
                  ))}
                  {preview.rows.length>50 && <tr><td colSpan={6} style={{ textAlign:'center', fontSize:12, color:'#6b7280', padding:8 }}>... and {preview.rows.length-50} more rows</td></tr>}
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
            <div><div style={{ fontSize:15, fontWeight:700, color:'#059669' }}>Import Complete</div><div style={{ fontSize:13, color:'#6b7280' }}>{result.imported} entries imported to {result.source_name}{result.errors>0?` (${result.errors} errors)`:''}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entries Tab (Original Bank Audit) ───────────────────────

function EntriesSection({ statusTab, setStatusTab, loading, entries, sources, summary, error, selectedDate, setSelectedDate, doLoad, ngoFilter, setNgoFilter, sourceFilter, setSourceFilter, showAddEntry, setShowAddEntry, showSources, setShowSources, entryForm, setEntryForm, showEditEntry, setShowEditEntry, saving, handleAddEntry, handleEditEntry, handleDeleteEntry, handleAddSource, handleDeleteSource, openEditEntry, sourceName, setSourceName, getSourceName, filteredEntries, SvgX, SvgBank }) {
  return (
    <div>
      <div className="stats-grid">
        {loading
          ? Array.from({ length: Math.max(sources.length||4,4) }, (_, i) => <SkeletonStat key={i} />)
          : sources.filter(s => s.is_active !== false).map((s,i) => (
              <div key={s.id} className="stat-card">
                <div className="stat-icon" style={{ background:COLORS[i%COLORS.length]+'18', color:COLORS[i%COLORS.length] }}>
                  <SvgBank />
                </div>
                <div className="stat-info">
                  <div className="stat-num">{currency(summary[s.name]||0)}</div>
                  <div className="stat-lbl">{s.name}</div>
                </div>
              </div>
            ))}
      </div>

      {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#991b1b' }}>{error}</div>}

      <div className="card" style={{ marginBottom:12 }}>
        <div className="filter-bar" style={{ flexWrap:'wrap', gap:8, padding:'8px 12px' }}>
          <label style={{ fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
            {selectedDate ? <span>Date</span> : <span style={{ color:'var(--sage)', fontWeight:600 }}>All Dates</span>}
            <input type="date" value={selectedDate} onChange={e=>{const v=e.target.value; setSelectedDate(v); doLoad(v, statusTab)}}
              style={{ fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid var(--line)', width:150 }} />
            {selectedDate && <button className="btn btn-sm" onClick={()=>{setSelectedDate(''); doLoad('', statusTab)}} style={{ fontSize:11, padding:'2px 6px' }}>Clear</button>}
          </label>
          <select value={ngoFilter} onChange={e=>setNgoFilter(e.target.value)} style={{ fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid var(--line)' }}>
            <option value="">All NGOs</option><option value="bsct">Being Sevak</option><option value="maan">Mann Care</option><option value="aflf">Ashray</option>
          </select>
          <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} style={{ fontSize:12, padding:'4px 6px', borderRadius:4, border:'1px solid var(--line)' }}>
            <option value="">All Sources</option>
            {sources.filter(s=>s.is_active!==false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-sm" onClick={()=>doLoad(selectedDate, statusTab)} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg> Refresh
          </button>
          <button className="btn btn-sm" onClick={()=>{setEntryForm({source_id:'',amount:'',payment_id:'',check_id:'',transaction_date:'',remarks:''}); setShowAddEntry(true)}}
            style={{ marginLeft:'auto', background:'var(--sage)', color:'#fff', border:'none', display:'flex', alignItems:'center', gap:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Entry
          </button>
          <button className="btn btn-sm" onClick={()=>{setSourceName(''); setShowSources(true)}} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Manage Sources
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Source</th><th>Amount</th><th>Payment ID</th><th>Check ID</th><th>Remarks</th><th style={{width:110}}></th></tr></thead>
          <tbody>
            {loading ? <SkeletonTable rows={5} cols={7} />
            : entries.length === 0 ? <tr><td colSpan={7} style={{ textAlign:'center', padding:20, color:'var(--ink-soft)' }}>No entries yet</td></tr>
            : (sourceFilter ? filteredEntries.filter(e=>e.source_id===Number(sourceFilter)) : filteredEntries).map(e => (
              <tr key={e.id}>
                <td style={{ whiteSpace:'nowrap' }}>{e.transaction_date}</td>
                <td><span className="pill pill-gray">{e.bank_audit_sources?.name || getSourceName(e.source_id)}</span></td>
                <td><strong style={{ color:'var(--sage)' }}>{currency(e.amount)}</strong></td>
                <td style={{ fontSize:12 }}>{e.payment_id || '\u2014'}</td>
                <td style={{ fontSize:12 }}>{e.check_id || '\u2014'}</td>
                <td style={{ fontSize:12, maxWidth:180, whiteSpace:'pre-wrap' }}>{e.remarks || '\u2014'}</td>
                <td>
                  <div style={{ display:'flex', gap:4 }}>
                    {statusTab === 'unverified' && (
                      <>
                        <button className="btn btn-sm" onClick={()=>openEditEntry(e)} style={{ fontSize:11, padding:'2px 8px' }}>Edit</button>
                        <button className="btn btn-sm" onClick={()=>handleDeleteEntry(e.id)} style={{ fontSize:11, padding:'2px 8px', color:'#dc2626' }}>Del</button>
                      </>
                    )}
                    <button className="btn btn-sm" onClick={async ()=>{if(confirm('Send to NGO Admin?')) try{await apiPut('/accounts/bank-audit/entries/'+e.id+'/assign-ngo',{}); doLoad(selectedDate, statusTab)}catch(err){alert(err.message)}}} style={{ fontSize:11, padding:'2px 8px', color:'#B5603A' }}>NGO</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function BankAudit() {
  const [entries, setEntries] = useState([]);
  const [sources, setSources] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('unverified');
  const [selectedDate, setSelectedDate] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [ngoFilter, setNgoFilter] = useState('');
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showEditEntry, setShowEditEntry] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const [entryForm, setEntryForm] = useState({ source_id:'', amount:'', payment_id:'', check_id:'', transaction_date:'', remarks:'' });
  const [saving, setSaving] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [error, setError] = useState('');
  const [mainTab, setMainTab] = useState('entries');

  const statusRef = useRef(statusTab);
  useEffect(() => { statusRef.current = statusTab; }, [statusTab]);

  async function doLoad(dt, st) {
    const sv = st || statusRef.current;
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams();
      if (dt) { p.set('date_from', dt); p.set('date_to', dt); }
      p.set('status', sv);
      const q = p.toString();
      const res = await Promise.allSettled([
        apiGet('/accounts/bank-audit/entries?'+q),
        apiGet('/accounts/bank-audit/sources'),
        apiGet('/accounts/bank-audit/summary?'+q),
      ]);
      if (res[0].status === 'fulfilled') setEntries(res[0].value);
      else { console.error(res[0].reason); setError('Failed: '+res[0].reason.message); }
      if (res[1].status === 'fulfilled') setSources(res[1].value);
      if (res[2].status === 'fulfilled') setSummary(res[2].value);
    } catch (err) { console.error(err); setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { doLoad(selectedDate, statusTab); }, [statusTab]);
  useEffect(() => { doLoad(selectedDate, statusTab); }, [selectedDate]);

  useRealtime('bank_audit_entries', {
    event:'*',
    onInsert: () => doLoad(selectedDate, statusRef.current),
    onUpdate: () => doLoad(selectedDate, statusRef.current),
    onDelete: () => doLoad(selectedDate, statusRef.current),
  });

  const ngoKeywords = { bsct:['beingsevak','being sevak','sevak'], maan:['mann','maan','manncar','mann care'], aflf:['ashray','aflf'] };
  const filteredEntries = ngoFilter ? entries.filter(e => {
    const src = (e.bank_audit_sources?.name||'').toLowerCase();
    const rem = (e.remarks||'').toLowerCase();
    const kw = ngoKeywords[ngoFilter] || [];
    return kw.some(k => src.includes(k) || rem.includes(k));
  }) : entries;

  const getSourceName = (id) => { const s = sources.find(s=>s.id===id); return s?s.name:'Unknown'; };

  const handleAddEntry = async () => {
    if (!entryForm.source_id||!entryForm.amount||!entryForm.transaction_date) { alert('Source, amount, and date required'); return; }
    setSaving(true);
    try { await apiPost('/accounts/bank-audit/entries', entryForm); setShowAddEntry(false); setEntryForm({source_id:'',amount:'',payment_id:'',check_id:'',transaction_date:'',remarks:''}); doLoad(selectedDate, statusTab); }
    catch (e) { alert(e.message) }
    finally { setSaving(false); }
  };

  const handleEditEntry = async () => {
    if (!showEditEntry) return; setSaving(true);
    try { await apiPut('/accounts/bank-audit/entries/'+showEditEntry.id, entryForm); setShowEditEntry(null); setEntryForm({source_id:'',amount:'',payment_id:'',check_id:'',transaction_date:'',remarks:''}); doLoad(selectedDate, statusTab); }
    catch (e) { alert(e.message) }
    finally { setSaving(false); }
  };

  const handleDeleteEntry = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try { await apiDelete('/accounts/bank-audit/entries/'+id); doLoad(selectedDate, statusTab); }
    catch (e) { alert(e.message); }
  };

  const handleAddSource = async () => {
    if (!sourceName) return;
    try { await apiPost('/accounts/bank-audit/sources', {name:sourceName}); setSourceName(''); setSources(await apiGet('/accounts/bank-audit/sources')); }
    catch (e) { alert(e.message); }
  };

  const handleDeleteSource = async (id) => {
    if (!confirm('Delete this source?')) return;
    try { await apiDelete('/accounts/bank-audit/sources/'+id); setSources(await apiGet('/accounts/bank-audit/sources')); }
    catch (e) { alert(e.message); }
  };

  const openEditEntry = (entry) => {
    setEntryForm({source_id:entry.source_id, amount:entry.amount, payment_id:entry.payment_id||'', check_id:entry.check_id||'', transaction_date:entry.transaction_date, remarks:entry.remarks||''});
    setShowEditEntry(entry);
  };

  const SvgX = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
  const SvgBank = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 2 7 2 9 22 9 22 7 12 2"/><rect x="4" y="11" width="3" height="7"/><rect x="10.5" y="11" width="3" height="7"/><rect x="17" y="11" width="3" height="7"/><line x1="2" y1="20" x2="22" y2="20"/></svg>);

  return (
    <div>
      {/* Main tabs */}
      <div className="card" style={{ marginBottom:16, padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--line)' }}>
          <TabBtn active={mainTab==='entries'} onClick={()=>setMainTab('entries')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12"/><path d="M9 9h5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H9"/></svg>
            Entries
          </TabBtn>
          <TabBtn active={mainTab==='email'} onClick={()=>setMainTab('email')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Email Import
          </TabBtn>
          <TabBtn active={mainTab==='gateways'} onClick={()=>setMainTab('gateways')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Payment Gateways
          </TabBtn>
          <TabBtn active={mainTab==='statement'} onClick={()=>setMainTab('statement')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Bank Statement
          </TabBtn>
        </div>
        {/* Sub-tabs for Entries */}
        {mainTab === 'entries' && (
          <div style={{ display:'flex', borderBottom:'1px solid #f3f4f6', background:'#f9fafb' }}>
            <TabBtn active={statusTab==='unverified'} onClick={()=>setStatusTab('unverified')}>Pending</TabBtn>
            <TabBtn active={statusTab==='verified'} onClick={()=>setStatusTab('verified')}>History</TabBtn>
          </div>
        )}
      </div>

      {mainTab === 'entries' && (
        <EntriesSection
          statusTab={statusTab} setStatusTab={setStatusTab}
          loading={loading} entries={entries} sources={sources} summary={summary} error={error}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          doLoad={doLoad} ngoFilter={ngoFilter} setNgoFilter={setNgoFilter}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          showAddEntry={showAddEntry} setShowAddEntry={setShowAddEntry}
          showSources={showSources} setShowSources={setShowSources}
          entryForm={entryForm} setEntryForm={setEntryForm}
          showEditEntry={showEditEntry} setShowEditEntry={setShowEditEntry}
          saving={saving} handleAddEntry={handleAddEntry} handleEditEntry={handleEditEntry}
          handleDeleteEntry={handleDeleteEntry} handleAddSource={handleAddSource}
          handleDeleteSource={handleDeleteSource} openEditEntry={openEditEntry}
          sourceName={sourceName} setSourceName={setSourceName}
          getSourceName={getSourceName} filteredEntries={filteredEntries}
          SvgX={SvgX} SvgBank={SvgBank}
        />
      )}
      {mainTab === 'email' && <EmailImportSection />}
      {mainTab === 'gateways' && <PaymentGatewaysSection />}
      {mainTab === 'statement' && <BankStatementSection />}

      {/* Add Entry Modal */}
      {showAddEntry && (
        <div className="modal-overlay" onClick={()=>setShowAddEntry(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:540 }}>
            <div className="modal-head"><h3 style={{fontSize:16,fontWeight:700}}>Add Bank Entry</h3><button className="btn btn-sm btn-icon" onClick={()=>setShowAddEntry(false)} style={{padding:4}}><SvgX /></button></div>
            <div className="modal-body" style={{padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <label style={{fontSize:12}}>Source<select className="field-input" value={entryForm.source_id} onChange={e=>setEntryForm(p=>({...p,source_id:e.target.value}))}>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label style={{fontSize:12}}>Amount<input className="field-input" type="number" value={entryForm.amount} onChange={e=>setEntryForm(p=>({...p,amount:e.target.value}))} /></label>
                <label style={{fontSize:12}}>Date<input className="field-input" type="date" value={entryForm.transaction_date} onChange={e=>setEntryForm(p=>({...p,transaction_date:e.target.value}))} /></label>
                <label style={{fontSize:12}}>Payment ID<input className="field-input" value={entryForm.payment_id} onChange={e=>setEntryForm(p=>({...p,payment_id:e.target.value}))} /></label>
                <label style={{fontSize:12}}>Check ID<input className="field-input" value={entryForm.check_id} onChange={e=>setEntryForm(p=>({...p,check_id:e.target.value}))} /></label>
                <label style={{fontSize:12,gridColumn:'1/-1'}}>Remarks<input className="field-input" value={entryForm.remarks} onChange={e=>setEntryForm(p=>({...p,remarks:e.target.value}))} /></label>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
                <button className="btn btn-sm" onClick={()=>setShowAddEntry(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleAddEntry} disabled={saving}>{saving?'Saving...':'Add Entry'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {showEditEntry && (
        <div className="modal-overlay" onClick={()=>setShowEditEntry(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:540}}>
            <div className="modal-head"><h3 style={{fontSize:16,fontWeight:700}}>Edit Entry</h3><button className="btn btn-sm btn-icon" onClick={()=>setShowEditEntry(null)} style={{padding:4}}><SvgX /></button></div>
            <div className="modal-body" style={{padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <label style={{fontSize:12}}>Source<select className="field-input" value={entryForm.source_id} onChange={e=>setEntryForm(p=>({...p,source_id:e.target.value}))}>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label style={{fontSize:12}}>Amount<input className="field-input" type="number" value={entryForm.amount} onChange={e=>setEntryForm(p=>({...p,amount:e.target.value}))} /></label>
                <label style={{fontSize:12}}>Date<input className="field-input" type="date" value={entryForm.transaction_date} onChange={e=>setEntryForm(p=>({...p,transaction_date:e.target.value}))} /></label>
                <label style={{fontSize:12}}>Payment ID<input className="field-input" value={entryForm.payment_id} onChange={e=>setEntryForm(p=>({...p,payment_id:e.target.value}))} /></label>
                <label style={{fontSize:12}}>Check ID<input className="field-input" value={entryForm.check_id} onChange={e=>setEntryForm(p=>({...p,check_id:e.target.value}))} /></label>
                <label style={{fontSize:12,gridColumn:'1/-1'}}>Remarks<input className="field-input" value={entryForm.remarks} onChange={e=>setEntryForm(p=>({...p,remarks:e.target.value}))} /></label>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
                <button className="btn btn-sm" onClick={()=>setShowEditEntry(null)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleEditEntry} disabled={saving}>{saving?'Saving...':'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sources Modal */}
      {showSources && (
        <div className="modal-overlay" onClick={()=>setShowSources(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
            <div className="modal-head"><h3 style={{fontSize:16,fontWeight:700}}>Manage Sources</h3><button className="btn btn-sm btn-icon" onClick={()=>setShowSources(false)} style={{padding:4}}><SvgX /></button></div>
            <div className="modal-body" style={{padding:20}}>
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <input className="field-input" value={sourceName} onChange={e=>setSourceName(e.target.value)} placeholder="New source name" onKeyDown={e=>e.key==='Enter'&&handleAddSource()} />
                <button className="btn btn-primary btn-sm" onClick={handleAddSource}>Add</button>
              </div>
              {sources.map(s => (
                <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #f3f4f6',fontSize:13}}>
                  <span>{s.name}</span>
                  <button className="btn btn-sm" onClick={()=>handleDeleteSource(s.id)} style={{fontSize:11,padding:'2px 8px',color:'#dc2626'}}>Delete</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

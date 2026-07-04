import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

const COLORS = ['#5B6B4E', '#B5603A', '#C08A2E', '#4F6472', '#7A5C7E', '#88693D', '#2E7D6F', '#9B59B6'];

export default function BankAudit() {
  const [entries, setEntries] = useState([]);
  const [sources, setSources] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showEditEntry, setShowEditEntry] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const [entryForm, setEntryForm] = useState({ source_id: '', amount: '', payment_id: '', check_id: '', transaction_date: '', remarks: '' });
  const [saving, setSaving] = useState(false);
  const [sourceName, setSourceName] = useState('');

  useEffect(() => {
    const d = new Date();
    setDateTo(d.toISOString().split('T')[0]);
    d.setDate(1);
    setDateFrom(d.toISOString().split('T')[0]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const q = params.toString();
      const [entriesData, sourcesData, summaryData] = await Promise.all([
        apiGet('/accounts/bank-audit/entries' + (q ? '?' + q : '')),
        apiGet('/accounts/bank-audit/sources'),
        apiGet('/accounts/bank-audit/summary' + (q ? '?' + q : '')),
      ]);
      setEntries(entriesData);
      setSources(sourcesData);
      setSummary(summaryData);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleAddEntry = async () => {
    if (!entryForm.source_id || !entryForm.amount || !entryForm.transaction_date) {
      alert('Source, amount, and transaction date are required');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/accounts/bank-audit/entries', entryForm);
      setShowAddEntry(false);
      setEntryForm({ source_id: '', amount: '', payment_id: '', check_id: '', transaction_date: '', remarks: '' });
      load();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleEditEntry = async () => {
    if (!showEditEntry) return;
    setSaving(true);
    try {
      await apiPut('/accounts/bank-audit/entries/' + showEditEntry.id, entryForm);
      setShowEditEntry(null);
      setEntryForm({ source_id: '', amount: '', payment_id: '', check_id: '', transaction_date: '', remarks: '' });
      load();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteEntry = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await apiDelete('/accounts/bank-audit/entries/' + id);
      load();
    } catch (err) { alert(err.message); }
  };

  const handleAddSource = async () => {
    if (!sourceName) return;
    try {
      await apiPost('/accounts/bank-audit/sources', { name: sourceName });
      setSourceName('');
      const s = await apiGet('/accounts/bank-audit/sources');
      setSources(s);
    } catch (err) { alert(err.message); }
  };

  const handleDeleteSource = async (id) => {
    if (!confirm('Delete this source?')) return;
    try {
      await apiDelete('/accounts/bank-audit/sources/' + id);
      const s = await apiGet('/accounts/bank-audit/sources');
      setSources(s);
    } catch (err) { alert(err.message); }
  };

  const openEditEntry = (entry) => {
    setEntryForm({
      source_id: entry.source_id,
      amount: entry.amount,
      payment_id: entry.payment_id || '',
      check_id: entry.check_id || '',
      transaction_date: entry.transaction_date,
      remarks: entry.remarks || '',
    });
    setShowEditEntry(entry);
  };

  const getSourceName = (id) => {
    const s = sources.find(s => s.id === id);
    return s ? s.name : 'Unknown';
  };

  const totalAmount = entries.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div>
      <div className="stats-grid">
        {sources.filter(s => s.is_active !== false).map((s, i) => (
          <div key={s.id} className="stat-card">
            <div className="stat-icon" style={{ background: COLORS[i % COLORS.length] + '18', color: COLORS[i % COLORS.length] }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div className="stat-info">
              <div className="stat-num">{currency(summary[s.name] || 0)}</div>
              <div className="stat-lbl">{s.name}</div>
            </div>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#5B6B4E18', color: '#5B6B4E' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div className="stat-info">
            <div className="stat-num">{currency(totalAmount)}</div>
            <div className="stat-lbl">Total</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            From
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--line)', width: 130 }} />
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            To
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--line)', width: 130 }} />
          </label>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--line)' }}>
            <option value="">All Sources</option>
            {sources.filter(s => s.is_active !== false).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg>
            Refresh
          </button>
          <button className="btn btn-sm" onClick={() => { setEntryForm({ source_id: '', amount: '', payment_id: '', check_id: '', transaction_date: '', remarks: '' }); setShowAddEntry(true); }}
            style={{ marginLeft: 'auto', background: 'var(--sage)', color: '#fff', border: 'none' }}>
            + Add Entry
          </button>
          <button className="btn btn-sm" onClick={() => { setSourceName(''); setShowSources(true); }}>
            Manage Sources
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Amount</th>
                <th>Payment ID</th>
                <th>Check ID</th>
                <th>Remarks</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No entries yet</td></tr>
              ) : (
                (sourceFilter ? entries.filter(e => e.source_id === Number(sourceFilter)) : entries).map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.transaction_date}</td>
                    <td><span className="pill pill-gray">{e.bank_audit_sources?.name || getSourceName(e.source_id)}</span></td>
                    <td><strong style={{ color: 'var(--sage)' }}>{currency(e.amount)}</strong></td>
                    <td style={{ fontSize: 12 }}>{e.payment_id || '\u2014'}</td>
                    <td style={{ fontSize: 12 }}>{e.check_id || '\u2014'}</td>
                    <td style={{ fontSize: 12, maxWidth: 180, whiteSpace: 'pre-wrap' }}>{e.remarks || '\u2014'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => openEditEntry(e)} style={{ fontSize: 11, padding: '2px 8px' }}>Edit</button>
                        <button className="btn btn-sm" onClick={() => handleDeleteEntry(e.id)} style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddEntry && (
        <div className="modal-overlay" onClick={() => setShowAddEntry(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Add Bank Entry</h3>
              <button className="btn btn-sm" onClick={() => setShowAddEntry(false)}>\u2715</button>
            </div>
            <div className="modal-body">
              <label className="field" style={{ marginBottom: 10 }}>
                Source *
                <select value={entryForm.source_id} onChange={e => setEntryForm(p => ({ ...p, source_id: e.target.value }))}>
                  <option value="">Select source...</option>
                  {sources.filter(s => s.is_active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Amount *
                <input type="number" step="0.01" value={entryForm.amount} onChange={e => setEntryForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 5000" />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Transaction Date *
                <input type="date" value={entryForm.transaction_date} onChange={e => setEntryForm(p => ({ ...p, transaction_date: e.target.value }))} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Payment ID
                <input value={entryForm.payment_id} onChange={e => setEntryForm(p => ({ ...p, payment_id: e.target.value }))} placeholder="UPI ref / transaction ID" />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Check ID
                <input value={entryForm.check_id} onChange={e => setEntryForm(p => ({ ...p, check_id: e.target.value }))} placeholder="Check number" />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Remarks
                <textarea value={entryForm.remarks} onChange={e => setEntryForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Any notes..." rows={2} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowAddEntry(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddEntry} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditEntry && (
        <div className="modal-overlay" onClick={() => setShowEditEntry(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Edit Entry</h3>
              <button className="btn btn-sm" onClick={() => setShowEditEntry(null)}>\u2715</button>
            </div>
            <div className="modal-body">
              <label className="field" style={{ marginBottom: 10 }}>
                Source *
                <select value={entryForm.source_id} onChange={e => setEntryForm(p => ({ ...p, source_id: e.target.value }))}>
                  <option value="">Select source...</option>
                  {sources.filter(s => s.is_active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Amount *
                <input type="number" step="0.01" value={entryForm.amount} onChange={e => setEntryForm(p => ({ ...p, amount: e.target.value }))} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Transaction Date *
                <input type="date" value={entryForm.transaction_date} onChange={e => setEntryForm(p => ({ ...p, transaction_date: e.target.value }))} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Payment ID
                <input value={entryForm.payment_id} onChange={e => setEntryForm(p => ({ ...p, payment_id: e.target.value }))} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Check ID
                <input value={entryForm.check_id} onChange={e => setEntryForm(p => ({ ...p, check_id: e.target.value }))} />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                Remarks
                <textarea value={entryForm.remarks} onChange={e => setEntryForm(p => ({ ...p, remarks: e.target.value }))} rows={2} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowEditEntry(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditEntry} disabled={saving}>
                {saving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSources && (
        <div className="modal-overlay" onClick={() => setShowSources(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <h3>Manage Sources</h3>
              <button className="btn btn-sm" onClick={() => setShowSources(false)}>\u2715</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input value={sourceName} onChange={e => setSourceName(e.target.value)}
                  placeholder="New source name..."
                  style={{ flex: 1, padding: '6px 8px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 4 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSource(); }} />
                <button className="btn btn-sm btn-primary" onClick={handleAddSource} disabled={!sourceName}>Add</button>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {sources.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 13 }}>{s.name}</span>
                    <button className="btn btn-sm" onClick={() => handleDeleteSource(s.id)} style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}>Delete</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowSources(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

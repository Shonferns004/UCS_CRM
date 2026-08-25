import { useState, useEffect } from 'react';
import { Link2, Loader2, X } from 'lucide-react';
import { apiGet, apiPost } from '../api/auth';
import Dashboard from './Dashboard';
import BankAudit, { AuditStatCards } from './BankAudit';

function SectionTitle({ children }) {
  return <div className="lead-audit-section-title"><span>{children}</span></div>;
}

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '';

const NGO_LABELS = { bsct: 'Being Sevak', mann: 'Mann Care', aflf: 'Ashray' };

export default function LeadAudit() {
  const [audit, setAudit] = useState({ sources: [], summary: {}, combo: null, loading: true });
  const [globalNgo, setGlobalNgo] = useState('');
  const [amountFilter, setAmountFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [suspenseCardNgo, setSuspenseCardNgo] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [detailView, setDetailView] = useState(null);
  const [entryDetailView, setEntryDetailView] = useState(null);
  const [matching, setMatching] = useState(false);
  const [receiptNums, setReceiptNums] = useState(null);

  // Last issued + next upcoming receipt number per NGO. Read-only; refetched
  // whenever the bank-audit data changes (e.g. after a new receipt is created).
  useEffect(() => {
    let cancelled = false;
    apiGet('/accounts/receipts/numbers')
      .then(d => { if (!cancelled) setReceiptNums(d || []); })
      .catch(() => { if (!cancelled) setReceiptNums([]); });
    return () => { cancelled = true; };
  }, [audit]);

  const handleMatch = async () => {
    if (!selectedLead || !selectedEntry || matching) return;
    setMatching(true);
    try {
      const res = await apiPost('/accounts/bank-audit/entries/' + selectedEntry.id + '/manual-match', { log_id: selectedLead.log_id });
      setSelectedLead(null);
      setSelectedEntry(null);
      alert(res?.match_no ? `Matched manually \u00B7 ${res.match_no}` : 'Matched manually');
    } catch (err) {
      alert(err.message);
    } finally {
      setMatching(false);
    }
  };

  const chip = (selected, onClear, main, sub, hint) => selected ? (
    <div className="match-chip" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f0f7ef', border: '1px solid #cfe3cb', fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: 'var(--sage)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{main}</span>
      <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{sub}</span>
      <button onClick={onClear} title="Clear" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 0, flexShrink: 0 }}><X size={14} strokeWidth={2.5} /></button>
    </div>
  ) : (
    <div className="match-hint" style={{ fontSize: 12, color: '#9ca3af', padding: '0 4px', whiteSpace: 'nowrap' }}>{hint}</div>
  );

  const ready = !!(selectedLead && selectedEntry && !matching);

  return (
    <div className="lead-audit-workspace" style={{ marginRight: (detailView || entryDetailView) ? 640 : 0, width: (detailView || entryDetailView) ? 'calc(100% - 640px)' : '100%', transition: 'width .25s ease, margin-right .25s ease' }}>
      <div className="lead-audit-summary">
        <AuditStatCards sources={audit.sources} summary={audit.summary} loading={audit.loading} suspenseNgo={suspenseCardNgo} setSuspenseNgo={setSuspenseCardNgo} combo={audit.combo} />
      </div>
      <div className="lead-audit-global-filter">
        <span className="lead-audit-filter-label">Workspace filter</span>
        <span className="lead-audit-filter-divider" />
        <span className="lead-audit-filter-key">NGO</span>
        <select value={globalNgo} onChange={e => setGlobalNgo(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontWeight: 600 }}>
          <option value="">All NGOs</option>
          <option value="bsct">Being Sevak</option>
          <option value="mann">Mann Care</option>
          <option value="aflf">Ashray</option>
        </select>
        <span className="lead-audit-filter-key">Date</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} aria-label="Filter by date" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontWeight: 600 }} />
          {dateFilter && <button onClick={() => setDateFilter('')} title="Clear date" aria-label="Clear date" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', padding: 0, flexShrink: 0 }}><X size={14} strokeWidth={2.5} /></button>}
        </div>
        <span className="lead-audit-filter-key">Amount</span>
        <input type="number" min="0" step="any" placeholder="All amounts" value={amountFilter} onChange={e => setAmountFilter(e.target.value)} aria-label="Filter by amount" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontWeight: 600, width: 96 }} />
        <span className="lead-audit-filter-help">Filters both Lead Verification and Bank Audit</span>
      </div>
      {receiptNums && receiptNums.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          {receiptNums.map(n => (
            <div key={n.project_id} className="card" style={{ flex: 1, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{NGO_LABELS[n.project_id] || n.project_id}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontWeight: 600 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#9ca3af', fontSize: 9, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>Last</div>
                  <div style={{ color: '#111827', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{n.last_no || '\u2014'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#9ca3af', fontSize: 9, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>Next</div>
                  <div style={{ color: 'var(--sage)', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 800 }}>{n.next_no || '\u2014'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="two-col lead-audit-columns" style={{ alignItems: 'flex-start' }}>
        <div style={{ alignSelf: 'flex-start' }}>
          <SectionTitle>Lead Verification</SectionTitle>
          <Dashboard embedded selectedLogId={selectedLead?.log_id} onSelectLead={l => { setSelectedLead(l); setSelectedEntry(null); }} onView={setDetailView} globalNgo={globalNgo} amountFilter={amountFilter} dateFilter={dateFilter} />
        </div>
        <div>
          <SectionTitle>Bank Audit</SectionTitle>
          <BankAudit embedded onSummary={setAudit} selectedEntryId={selectedEntry?.id} onSelectEntry={setSelectedEntry} selectionEnabled={!!selectedLead} onView={setEntryDetailView} globalNgo={globalNgo} suspenseNgo={suspenseCardNgo} amountFilter={amountFilter} dateFilter={dateFilter} leadFilter={selectedLead ? { log_id: selectedLead.log_id, amount: selectedLead.amount, ngo: selectedLead.donor_project || '' } : null} />
        </div>
      </div>

      {(selectedLead || selectedEntry) && (
        <div className="match-bar">
          {chip(selectedLead, () => { setSelectedLead(null); setSelectedEntry(null); }, selectedLead?.donor_name || 'Lead', currency(selectedLead?.amount), 'Double-click a lead to select · single-click to clear')}
          <span style={{ color: '#d1d5db', fontSize: 16, flexShrink: 0 }}>+</span>
          {chip(selectedEntry, () => setSelectedEntry(null), selectedEntry?.payment_id || selectedEntry?.check_id || 'No ref', currency(selectedEntry?.amount), 'Double-click a bank entry to select · single-click to open')}
          <button onClick={handleMatch} disabled={!ready}
            title={!selectedLead ? 'Select a lead first' : !selectedEntry ? 'Select a bank audit entry first' : 'Link entry to lead as manual match'}
            style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, borderRadius: 10, border: 'none', cursor: ready ? 'pointer' : 'not-allowed', background: ready ? 'var(--sage)' : '#d1d5db', color: ready ? '#fff' : '#9ca3af', opacity: matching ? .7 : 1, flexShrink: 0 }}>
            {matching ? <Loader2 size={17} style={{ animation: 'fb-spin 1s linear infinite' }} /> : <Link2 size={17} strokeWidth={2.5} />}
          </button>
        </div>
      )}
    </div>
  );
}

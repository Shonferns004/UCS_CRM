import { useState } from 'react';
import { apiPost } from '../api/auth';
import Dashboard from './Dashboard';
import BankAudit, { AuditStatCards } from './BankAudit';

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>{children}</div>;
}

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '';

export default function LeadAudit() {
  const [audit, setAudit] = useState({ sources: [], summary: {}, suspense: null, loading: true });
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [matching, setMatching] = useState(false);

  const handleMatch = async () => {
    if (!selectedLead || !selectedEntry || matching) return;
    setMatching(true);
    try {
      await apiPost('/accounts/bank-audit/entries/' + selectedEntry.id + '/manual-match', { log_id: selectedLead.log_id });
      setSelectedLead(null);
      setSelectedEntry(null);
      alert('Matched manually');
    } catch (err) {
      alert(err.message);
    } finally {
      setMatching(false);
    }
  };

  const chip = (selected, onClear, main, sub, hint) => selected ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f0f7ef', border: '1px solid #cfe3cb', fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: 'var(--sage)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{main}</span>
      <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{sub}</span>
      <button onClick={onClear} title="Clear" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0 }}>{'\u2715'}</button>
    </div>
  ) : (
    <div style={{ fontSize: 12, color: '#9ca3af', padding: '0 4px', whiteSpace: 'nowrap' }}>{hint}</div>
  );

  const ready = !!(selectedLead && selectedEntry && !matching);

  return (
    <div>
      <div style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
        <AuditStatCards sources={audit.sources} summary={audit.summary} loading={audit.loading} suspense={audit.suspense} suspenseNgo={audit.suspenseNgo} setSuspenseNgo={audit.setSuspenseNgo} />
      </div>
      <div className="two-col" style={{ alignItems: 'flex-start' }}>
        <div>
          <SectionTitle>Lead Verification</SectionTitle>
          <Dashboard embedded selectedLogId={selectedLead?.log_id} onSelectLead={setSelectedLead} />
        </div>
        <div>
          <SectionTitle>Bank Audit</SectionTitle>
          <BankAudit embedded onSummary={setAudit} selectedEntryId={selectedEntry?.id} onSelectEntry={setSelectedEntry} leadFilter={selectedLead ? { log_id: selectedLead.log_id, amount: selectedLead.amount } : null} />
        </div>
      </div>

      {(selectedLead || selectedEntry) && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: '#fff', borderRadius: 14, boxShadow: '0 8px 30px rgba(0,0,0,.18)', border: '1px solid #e5e7eb', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, maxWidth: '94vw', flexWrap: 'nowrap' }}>
          {chip(selectedLead, () => setSelectedLead(null), selectedLead?.donor_name || 'Lead', currency(selectedLead?.amount), 'Double-click a lead to select')}
          <span style={{ color: '#d1d5db', fontSize: 16, flexShrink: 0 }}>+</span>
          {chip(selectedEntry, () => setSelectedEntry(null), selectedEntry?.payment_id || selectedEntry?.check_id || 'No ref', currency(selectedEntry?.amount), 'Click a bank entry to select')}
          <button onClick={handleMatch} disabled={!ready}
            title={!selectedLead ? 'Select a lead first' : !selectedEntry ? 'Select a bank audit entry first' : 'Link entry to lead as manual match'}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: ready ? 'pointer' : 'not-allowed', background: ready ? 'var(--sage)' : '#d1d5db', color: ready ? '#fff' : '#9ca3af', opacity: matching ? .7 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {matching ? 'Matching...' : 'Match'}
          </button>
        </div>
      )}
    </div>
  );
}

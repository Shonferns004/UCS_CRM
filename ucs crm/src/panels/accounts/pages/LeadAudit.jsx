import { useState } from 'react';
import Dashboard from './Dashboard';
import BankAudit, { AuditStatCards } from './BankAudit';

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>{children}</div>;
}

export default function LeadAudit() {
  const [audit, setAudit] = useState({ sources: [], summary: {}, suspense: null, loading: true });

  return (
    <div>
      <div style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
        <AuditStatCards sources={audit.sources} summary={audit.summary} loading={audit.loading} suspense={audit.suspense} suspenseNgo={audit.suspenseNgo} setSuspenseNgo={audit.setSuspenseNgo} />
      </div>
      <div className="two-col" style={{ alignItems: 'flex-start' }}>
        <div>
          <SectionTitle>Lead Verification</SectionTitle>
          <Dashboard embedded />
        </div>
        <div>
          <SectionTitle>Bank Audit</SectionTitle>
          <BankAudit embedded onSummary={setAudit} />
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import Dashboard, { LeadStatCards } from './Dashboard';
import BankAudit, { AuditStatCards } from './BankAudit';

const EMPTY_STATS = { pending: [], verified: [], rejected: [], pendingAmount: 0, verifiedAmount: 0, totalAmount: 0, verifiedToday: [], verifiedTodayAmount: 0, totalLeads: 0 };

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>{children}</div>;
}

export default function LeadAudit() {
  const [leadStats, setLeadStats] = useState({ stats: EMPTY_STATS, loading: true });
  const [audit, setAudit] = useState({ sources: [], summary: {}, loading: true });

  return (
    <div>
      <div style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
        <LeadStatCards stats={leadStats.stats} loading={leadStats.loading} />
        <AuditStatCards sources={audit.sources} summary={audit.summary} loading={audit.loading} />
      </div>
      <div className="two-col" style={{ alignItems: 'flex-start' }}>
        <div>
          <SectionTitle>Lead Verification</SectionTitle>
          <Dashboard embedded onStats={setLeadStats} />
        </div>
        <div>
          <SectionTitle>Bank Audit</SectionTitle>
          <BankAudit embedded onSummary={setAudit} />
        </div>
      </div>
    </div>
  );
}

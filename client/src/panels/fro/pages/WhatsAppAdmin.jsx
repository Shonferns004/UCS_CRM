/**
 * WhatsApp Admin inside the FRO panel.
 *
 * The admin surface is already mounted under /accounts, which an agent login
 * cannot reach -- its CRM role is 'fro'. Rather than widening the agent's CRM
 * role to get at it, the same components are rendered here, and only to agents
 * whose crm_agents.whatsapp_admin is true.
 *
 * This is presentation only. Every route these screens call is guarded by
 * requireWhatsAppAdmin on the server, so hiding the entry here is a
 * convenience, not the control.
 */
import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/auth';
import WhatsAppAccountsManager from '../../accounts/components/WhatsAppAccountsManager';
import WhatsAppAgentPerformance from '../../accounts/components/WhatsAppAgentPerformance';
import WhatsAppAutomation from '../../accounts/pages/WhatsAppAutomation';

const TABS = [
  { key: 'accounts', label: 'Accounts & Agents' },
  { key: 'performance', label: 'Agent Performance' },
  { key: 'automation', label: 'Automations' },
];

// Rendered by key rather than by a chained ternary: a third tab is the point at
// which `tab === 'a' ? <A/> : tab === 'b' ? <B/> : <C/>` stops being readable,
// and the next tab would otherwise mean editing two places.
const TAB_VIEWS = {
  accounts: WhatsAppAccountsManager,
  performance: WhatsAppAgentPerformance,
  automation: WhatsAppAutomation,
};

export default function WhatsAppAdminPage() {
  const [tab, setTab] = useState('accounts');
  const [status, setStatus] = useState(null);

  const ActiveTab = TAB_VIEWS[tab] || WhatsAppAccountsManager;

  useEffect(() => {
    let alive = true;
    apiGet('/fro/whatsapp/admin-status')
      .then((s) => { if (alive) setStatus(s); })
      .catch(() => { if (alive) setStatus({ whatsapp_admin: false }); });
    return () => { alive = false; };
  }, []);

  if (!status) {
    return <div style={{ padding: 24, fontSize: 13, color: '#6b7280' }}>Checking access…</div>;
  }

  if (!status.whatsapp_admin) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
          WhatsApp admin access required
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, maxWidth: 380, margin: '0 auto' }}>
          This area manages WhatsApp accounts, agent assignments and automations.
          Ask an administrator to set the WhatsApp admin flag for your agent account.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>WhatsApp Admin</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
          Signed in as {status.label || 'WhatsApp admin'} · this access covers WhatsApp only
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              background: tab === t.key ? '#111827' : '#fff',
              color: tab === t.key ? '#fff' : '#374151',
              border: '1px solid ' + (tab === t.key ? '#111827' : '#d1d5db'),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <ActiveTab />
      </div>
    </div>
  );
}
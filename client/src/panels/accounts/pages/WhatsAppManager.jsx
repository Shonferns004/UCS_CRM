import { useState, useEffect } from 'react';
import ConversationViewer from '../components/ConversationViewer';
import { apiGet } from '../api/auth';
import WhatsAppBulk from './WhatsAppBulk';
import WhatsAppChatWindow from '../components/WhatsAppChatWindow';
import WhatsAppAccountsManager from '../components/WhatsAppAccountsManager';
import StatusBadge from '../components/StatusBadge';

const TABS = ['Chats', 'Accounts', 'Bulk send', 'Campaigns', 'Delivery log', 'Meta Ads'];

export default function WhatsAppManager() {
  const [tab, setTab] = useState('Chats');
  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignRecipientSearch, setCampaignRecipientSearch] = useState('');
  const [viewChatPhone, setViewChatPhone] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignRecipients, setCampaignRecipients] = useState([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [logAccount, setLogAccount] = useState('all');
  const [logTemplate, setLogTemplate] = useState('all');
  const [logTemplatesList, setLogTemplatesList] = useState([]);
  const [logFrom, setLogFrom] = useState('');
  const [logTo, setLogTo] = useState('');
  const [logPage, setLogPage] = useState(1);
  const LOG_PAGE_SIZE = 10;

  useEffect(() => {
    apiGet('/whatsapp/accounts').then(data => {
      const list = Array.isArray(data) ? data : [];
      setAccounts(list);
      const def = list.find(a => a.is_default) || list[0];
      if (def) setSelectedAccountId(def.id);
    }).catch(() => {});
    apiGet('/whatsapp/bulk/statuses?limit=100').then(data => {
      setStatuses(Array.isArray(data) ? data : []);
    }).catch(() => {});
    apiGet('/whatsapp/campaigns').then(data => {
      setCampaigns(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  const loadStatuses = async () => {
    try {
      const data = await apiGet('/whatsapp/bulk/statuses?limit=100');
      setStatuses(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    if (!selectedAccountId) return;
    apiGet(`/whatsapp/templates?accountId=${selectedAccountId}`).then(data => {
      setTemplates(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, [selectedAccountId]);

  useEffect(() => {
    if (logAccount === 'all') {
      setLogTemplatesList([]);
      return;
    }
    apiGet(`/whatsapp/templates?accountId=${logAccount}`).then(data => {
      setLogTemplatesList(Array.isArray(data) ? data : []);
    }).catch(() => setLogTemplatesList([]));
  }, [logAccount]);

  const filteredLogs = statuses.filter(r => {
    if (logAccount !== 'all' && String(r.account_id) !== String(logAccount)) return false;
    if (logTemplate !== 'all' && r.template_name !== logTemplate) return false;
    const d = r.created_at ? r.created_at.slice(0, 10) : '';
    if (logFrom && d < logFrom) return false;
    if (logTo && d > logTo) return false;
    return true;
  });
  const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const safePage = Math.min(logPage, logTotalPages);
  const pagedLogs = filteredLogs.slice((safePage - 1) * LOG_PAGE_SIZE, safePage * LOG_PAGE_SIZE);
  const logTemplates = logTemplatesList.length ? logTemplatesList.map(t => t.name) : [...new Set(statuses.filter(r => logAccount === 'all' || String(r.account_id) === String(logAccount)).map(r => r.template_name).filter(Boolean))];

  return (
    <div style={{ background: '#eef1f8', minHeight: '100vh', padding: 16, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: 'linear-gradient(120deg, #0866FF 0%, #6A4DF4 60%, #B13CE0 100%)', color: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>WhatsApp Center</div>
        <div style={{ fontSize: 13, opacity: .9 }}>Meta Business Platform Â· Accounts, templates, bulk sending and delivery</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #cbd0dc', background: tab === t ? '#0866FF' : '#fff', color: tab === t ? '#fff' : '#1C1E21', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t}
          </button>
        ))}
      </div>

{tab !== 'Chats' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ fontSize: 12, color: '#5B6070' }}>Accounts</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0866FF' }}>{accounts.length}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ fontSize: 12, color: '#5B6070' }}>Active</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0B6B3A' }}>{accounts.filter(a => a.is_active).length}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ fontSize: 12, color: '#5B6070' }}>Templates</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#7B5CFA' }}>{templates.length}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ fontSize: 12, color: '#5B6070' }}>Recent sends</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#F97316' }}>{statuses.length}</div>
        </div>
      </div>
      )}

      {tab === 'Chats' && <WhatsAppChatWindow />}

{tab === 'Accounts' && <WhatsAppAccountsManager />}

      {tab === 'Bulk send' && <WhatsAppBulk />}

      {tab === 'Campaigns' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <input placeholder="Search campaigns..." value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)} style={{ marginBottom: 12, width: '100%', maxWidth: 420, height: 36, padding: '0 10px', border: '1px solid #cbd0dc', borderRadius: 8, fontSize: 13 }} />
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f4f6fb' }}>
                <th style={{ textAlign: 'left', padding: 6 }}>Name</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Account</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Template</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Recipients</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.filter(c => {
                const q = campaignSearch.trim().toLowerCase();
                if (!q) return true;
                const acc = accounts.find(a => String(a.id) === String(c.account_id))?.name || '';
                return [c.name, acc, c.template_name, c.status].some(v => String(v || '').toLowerCase().includes(q));
              }).map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #EBEDF3', cursor: 'pointer' }} onClick={async () => {
                  setSelectedCampaign(c);
                  setCampaignLoading(true);
                  try {
                    const data = await apiGet(`/whatsapp/campaigns/${c.id}`);
                    setCampaignRecipients(Array.isArray(data?.recipients) ? data.recipients : []);
                  } catch {
                    setCampaignRecipients([]);
                  } finally {
                    setCampaignLoading(false);
                  }
                }}>
                  <td style={{ padding: 6 }}>{c.name}</td>
                  <td style={{ padding: 6 }}>{accounts.find(a => String(a.id) === String(c.account_id))?.name || c.account_id}</td>
                  <td style={{ padding: 6 }}>{c.template_name}</td>
                  <td style={{ padding: 6 }}>{c.status}</td>
                  <td style={{ padding: 6 }}>{c.recipient_count ?? 'â€”'}</td>
                  <td style={{ padding: 6 }}>{c.created_at ? new Date(c.created_at).toLocaleString() : 'â€”'}</td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr><td colSpan="5" style={{ padding: 12, textAlign: 'center', color: '#5B6070' }}>No campaigns yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Meta Ads' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ fontSize: 13, color: '#5B6070', marginBottom: 12 }}>Connect a Meta Ad Account to view campaigns and insights.</div>
          <button className="wa-btn wa-btn-primary" onClick={async () => {
            try {
              const data = await apiGet('/meta-ads/status');
              alert(data.message || 'Meta Ads not connected');
            } catch (e) {
              alert(e.message);
            }
          }}>Connect Meta Account</button>
          <div style={{ marginTop: 12, fontSize: 12, color: '#5B6070' }}>Status: Disconnected (credentials not configured)</div>
        </div>
      )}

      {tab === 'Delivery log' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <select className="wa-select" value={logAccount} onChange={e => { setLogAccount(e.target.value); setLogPage(1); }} style={{ width: 160 }}>
              <option value="all">All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="wa-select" value={logTemplate} onChange={e => { setLogTemplate(e.target.value); setLogPage(1); }} style={{ width: 180 }}>
              <option value="all">All Templates</option>
              {logTemplates.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" className="wa-input" value={logFrom} onChange={e => { setLogFrom(e.target.value); setLogPage(1); }} style={{ width: 150 }} />
            <input type="date" className="wa-input" value={logTo} onChange={e => { setLogTo(e.target.value); setLogPage(1); }} style={{ width: 150 }} />
            <button className="wa-btn wa-btn-outline" onClick={loadStatuses}>Refresh</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f4f6fb' }}>
                  <th style={{ textAlign: 'left', padding: 6 }}>Account</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Phone</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Template</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Sent At</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map(r => (
                  <tr key={r.wa_message_id} style={{ borderTop: '1px solid #EBEDF3' }}>
                    <td style={{ padding: 6 }}>{accounts.find(a => String(a.id) === String(r.account_id))?.name || r.account_id}</td>
                    <td style={{ padding: 6 }}>{r.phone}</td>
                    <td style={{ padding: 6 }}>{r.template_name}</td>
                    <td style={{ padding: 6 }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: 6 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : 'â€”'}</td>
                    <td style={{ padding: 6 }}>{r.failure_reason || 'â€”'}</td>
                  </tr>
                ))}
                {pagedLogs.length === 0 && (
                  <tr><td colSpan="6" style={{ padding: 12, textAlign: 'center', color: '#5B6070' }}>No records</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#5B6070' }}>Page {safePage} of {logTotalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="wa-btn wa-btn-outline" disabled={safePage <= 1} onClick={() => setLogPage(p => Math.max(1, p - 1))}>Prev</button>
              <button className="wa-btn wa-btn-outline" disabled={safePage >= logTotalPages} onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))}>Next</button>
            </div>
          </div>
        </div>
      )}

      {selectedCampaign && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setSelectedCampaign(null)}>
          <div className="modal" style={{ maxWidth: 720, width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Campaign Details</h3>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div style={{ marginBottom: 8 }}><strong>Name:</strong> {selectedCampaign.name}</div>
              <div style={{ marginBottom: 8 }}><strong>Account:</strong> {accounts.find(a => String(a.id) === String(selectedCampaign.account_id))?.name || selectedCampaign.account_id}</div>
              <div style={{ marginBottom: 8 }}><strong>Template:</strong> {selectedCampaign.template_name}</div>
              <div style={{ marginBottom: 8 }}><strong>Status:</strong> {selectedCampaign.status}</div>
               <div style={{ marginBottom: 8, display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                 <span><strong>Total:</strong> {campaignRecipients.length}</span>
                 <span style={{ color: '#059669' }}><strong>Accepted:</strong> {campaignRecipients.filter(r => String(r.status).toLowerCase() === 'accepted').length}</span>
                 <span style={{ color: '#dc2626' }}><strong>Failed:</strong> {campaignRecipients.filter(r => String(r.status).toLowerCase() === 'failed').length}</span>
                 <span style={{ color: '#d97706' }}><strong>Pending:</strong> {campaignRecipients.filter(r => !['accepted', 'failed', 'delivered', 'read'].includes(String(r.status).toLowerCase())).length}</span>
               </div>
              <div style={{ marginBottom: 12 }}>
                <button className="wa-btn wa-btn-outline" onClick={async () => {
                  const failed = campaignRecipients.filter(r => String(r.status).toLowerCase() === 'failed');
                  for (const r of failed) {
                    try {
                      await apiPost('/whatsapp/send-bulk-template', {
                        accountId: selectedCampaign.account_id,
                        to: r.phone,
                        templateName: selectedCampaign.template_name,
                        templateLang: 'en',
                        headerImageUrl: '',
                        headerFormat: 'IMAGE',
                        recipientName: r.recipient_name || 'Recipient',
                        campaignId: selectedCampaign.id,
                        parameters: [],
                      });
                    } catch (e) {
                      console.error('Retry failed:', e.message);
                    }
                    await new Promise(res => setTimeout(res, 2000));
                  }
                  const data = await apiGet(`/whatsapp/campaigns/${selectedCampaign.id}`);
                  setCampaignRecipients(Array.isArray(data?.recipients) ? data.recipients : []);
                }} disabled={campaignLoading || !campaignRecipients.some(r => String(r.status).toLowerCase() === 'failed')}>
                  Retry Failed
                </button>
              </div>
              {campaignLoading ? (
                <p>Loading recipients...</p>
              ) : (
                <>
                  <input placeholder="Search recipients by phone/name/status..." value={campaignRecipientSearch} onChange={e => setCampaignRecipientSearch(e.target.value)} style={{ marginBottom: 8, width: '100%', height: 32, padding: '0 8px', border: '1px solid #cbd0dc', borderRadius: 6, fontSize: 12 }} />
                  <div style={{ maxHeight: 260, overflow: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f4f6fb' }}>
                        <th style={{ textAlign: 'left', padding: 6 }}>Phone</th>
                        <th style={{ textAlign: 'left', padding: 6 }}>Status</th>
                        <th style={{ textAlign: 'left', padding: 6 }}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignRecipients.filter(r => { const q = campaignRecipientSearch.trim().toLowerCase(); if (!q) return true; return [r.phone, r.recipient_name, r.status, r.failure_reason].some(v => String(v || '').toLowerCase().includes(q)); }).map(r => (
                        <tr key={r.id} style={{ borderTop: '1px solid #EBEDF3' }}>
                          <td style={{ padding: 6 }}><button style={{ background: 'none', border: 'none', color: '#0866FF', cursor: 'pointer', textDecoration: 'underline', padding: 0 }} onClick={() => setViewChatPhone({ phone: r.phone, accountId: selectedCampaign?.account_id })}>{r.phone}</button></td>
                          <td style={{ padding: 6 }}>{r.status}</td>
                          <td style={{ padding: 6 }}>{r.failure_reason || 'â€”'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="wa-btn wa-btn-outline" onClick={() => setSelectedCampaign(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {viewChatPhone && <ConversationViewer phone={viewChatPhone.phone} accountId={viewChatPhone.accountId} onClose={() => setViewChatPhone(null)} />}
    </div>
  );
}

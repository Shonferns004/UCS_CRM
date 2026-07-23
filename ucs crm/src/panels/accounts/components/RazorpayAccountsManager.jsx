import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';

const emptyForm = { name: '', key_id: '', key_secret: '', webhook_secret: '', is_active: true, is_default: false };

export default function RazorpayAccountsManager({ onAccountsChange }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [justAdded, setJustAdded] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet('/webhooks/razorpay/accounts');
      setAccounts(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const data = await apiGet('/webhooks/razorpay/accounts');
        if (!cancelled) setAccounts(data || []);
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.key_id || (!form.key_secret && !editing)) {
      alert('Name, Key ID, and Key Secret are required');
      return;
    }
    if (!editing && !form.webhook_secret) {
      if (!confirm('Webhook Secret is empty. You can add it later after creating the webhook in Razorpay.\n\nContinue without it?')) return;
    }
    setSaving(true);
    try {
      if (editing) {
        const body = {
          name: form.name,
          key_id: form.key_id,
          is_active: form.is_active,
          is_default: form.is_default,
        };
        if (form.key_secret) body.key_secret = form.key_secret;
        if (form.webhook_secret) body.webhook_secret = form.webhook_secret;
        await apiPut(`/webhooks/razorpay/accounts/${editing.id}`, body);
        resetForm();
      } else {
        const created = await apiPost('/webhooks/razorpay/accounts', form);
        resetForm();
        if (created && created.id) {
          setJustAdded(created);
        }
      }
      await load();
      if (onAccountsChange) onAccountsChange();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete Razorpay account "${name}"? Webhook events for this account will stop being accepted.`)) return;
    try {
      await apiDelete(`/webhooks/razorpay/accounts/${id}`);
      await load();
      if (onAccountsChange) onAccountsChange();
    } catch (err) { alert(err.message); }
  };

  const openEdit = (acc) => {
    setForm({
      name: acc.name,
      key_id: acc.key_id,
      key_secret: '',
      webhook_secret: '',
      is_active: acc.is_active,
      is_default: acc.is_default,
    });
    setEditing(acc);
    setShowForm(true);
  };

  const handleSync = async (id) => {
    setSyncingId(id);
    try {
      const result = await apiPost(`/webhooks/razorpay/accounts/${id}/sync`);
      alert(result.message || 'Sync completed');
      await load();
    } catch (err) { alert(err.message); }
    finally { setSyncingId(null); }
  };

  const copyWebhookUrl = async (acc) => {
    const url = `${window.location.origin}/api/webhooks/razorpay/${acc.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(acc.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      prompt('Copy this URL:', url);
    }
  };

  const toggleField = (field) => setForm(p => ({ ...p, [field]: !p[field] }));

  const justAddedUrl = justAdded ? `${window.location.origin}/api/webhooks/razorpay/${justAdded.id}` : '';
  const copyJustAdded = async () => {
    try {
      await navigator.clipboard.writeText(justAddedUrl);
      setCopiedId('just');
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      prompt('Copy this URL:', justAddedUrl);
    }
  };

  return (
    <div>
      {justAdded && (
        <div style={{ border: '2px solid #0d9488', borderRadius: 10, padding: 14, marginBottom: 12, background: 'linear-gradient(135deg, #0d948808 0%, #0d948815 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0d9488' }}>Account "{justAdded.name}" added!</span>
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>
            Copy this webhook URL and paste it in your Razorpay Dashboard → Settings → Webhooks → Add New Webhook.
            {!justAdded.webhook_secret && ' After creating the webhook, come back and Edit this account to paste the Webhook Secret.'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ fontSize: 12, color: '#0d9488', background: '#0d948810', padding: '6px 10px', borderRadius: 6, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
              {justAddedUrl}
            </code>
            <button className="btn btn-sm" onClick={copyJustAdded} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#0d9488', color: '#fff', border: 'none', padding: '6px 12px' }}>
              {copiedId === 'just' ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg> Copied!</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy URL</>
              )}
            </button>
            <button className="btn btn-sm" onClick={() => setJustAdded(null)} style={{ padding: '6px 10px' }}>Dismiss</button>
          </div>
        </div>
      )}
      <div className="filter-bar" style={{ marginBottom: showForm || accounts.length > 0 ? 12 : 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>Razorpay Accounts</span>
        <button className="btn btn-sm" onClick={() => { resetForm(); setShowForm(!showForm); }}
          style={{ marginLeft: 'auto', background: 'var(--sage)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {showForm ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '10px 0', borderBottom: accounts.length > 0 ? '1px solid var(--line)' : 'none', marginBottom: accounts.length > 0 ? 10 : 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Name</span>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. UFS Donations" style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <label className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Key ID</span>
              <input value={form.key_id} onChange={e => setForm(p => ({ ...p, key_id: e.target.value }))} placeholder="rzp_live_..." style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <label className="field" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Key Secret</span>
              <input type="password" value={form.key_secret} onChange={e => setForm(p => ({ ...p, key_secret: e.target.value }))} placeholder={editing ? 'Leave blank to keep' : 'Key secret'} style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <label className="field" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Webhook Secret <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></span>
              <input type="password" value={form.webhook_secret} onChange={e => setForm(p => ({ ...p, webhook_secret: e.target.value }))} placeholder={editing ? 'Leave blank to keep' : 'Add after creating webhook'} style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={() => toggleField('is_active')} /> Active
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_default} onChange={() => toggleField('is_default')} /> Default
              </label>
            </div>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '6px 14px', marginBottom: 0 }}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
            </button>
          </div>
          {editing && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
              Leave secret fields blank to keep the existing values.
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>Loading...</div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>
          No Razorpay accounts yet. Add one above to get a per-account webhook URL. Until then, the <code>.env</code> fallback is used.
        </div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {accounts.map(acc => (
            <div key={acc.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: acc.is_active ? '#059669' : '#d1d5db', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{acc.name}</span>
                    {acc.is_default && (
                      <span className="pill" style={{ background: '#5B6B4E20', color: '#5B6B4E', fontSize: 10, padding: '1px 6px' }}>Default</span>
                    )}
                    {acc.webhook_secret === '••••••••' ? (
                      <span className="pill" style={{ background: '#0d948818', color: '#0d9488', fontSize: 10, padding: '1px 6px' }}>Webhook ready</span>
                    ) : (
                      <span className="pill" style={{ background: '#f59e0b18', color: '#d97706', fontSize: 10, padding: '1px 6px' }}>No secret - Edit to add</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{acc.key_id}</div>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                  {acc.last_synced_at ? `Synced ${new Date(acc.last_synced_at).toLocaleString('en-IN')}` : 'Never synced'}
                </div>
                <button className="btn btn-sm" onClick={() => handleSync(acc.id)} disabled={syncingId === acc.id}
                  style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {syncingId === acc.id ? 'Syncing...' : 'Sync'}
                </button>
                <button className="btn btn-sm" onClick={() => openEdit(acc)} style={{ fontSize: 11, padding: '2px 7px' }}>Edit</button>
                <button className="btn btn-sm" onClick={() => handleDelete(acc.id, acc.name)} style={{ fontSize: 11, padding: '2px 7px', color: '#dc2626' }}>Del</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 16 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>Webhook URL:</span>
                <code style={{ fontSize: 11, color: '#0d9488', background: '#0d948810', padding: '2px 6px', borderRadius: 4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {window.location.origin}/api/webhooks/razorpay/{acc.id}
                </code>
                <button className="btn btn-sm" onClick={() => copyWebhookUrl(acc)} style={{ fontSize: 10, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  {copiedId === acc.id ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg> Copied</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

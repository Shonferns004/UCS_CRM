import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';

const PROJECT_OPTIONS = [
  { value: 'bsct', label: 'Being Sevak' },
  { value: 'maan', label: 'Mann Care' },
  { value: 'aflf', label: 'Ashray' },
];

const emptyForm = {
  name: '', project: 'bsct', phone_number_id: '', access_token: '',
  waba_id: '', template_name: '', template_language: 'en',
  is_active: true, is_default: false,
};

export default function WhatsAppAccountsManager({ onAccountsChange }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fetchingTemplates, setFetchingTemplates] = useState(null);
  const [templateOptions, setTemplateOptions] = useState({});

  async function loadAccounts() {
    setLoading(true);
    try {
      const data = await apiGet('/whatsapp/accounts');
      setAccounts(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadAccounts(); }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone_number_id || !form.access_token || !form.waba_id) {
      alert('Name, Phone Number ID, Access Token, and WABA ID are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const body = {
          name: form.name,
          project: form.project,
          phone_number_id: form.phone_number_id,
          waba_id: form.waba_id,
          template_name: form.template_name || null,
          template_language: form.template_language,
          is_active: form.is_active,
          is_default: form.is_default,
        };
        if (form.access_token) body.access_token = form.access_token;
        await apiPut(`/whatsapp/accounts/${editing.id}`, body);
        resetForm();
      } else {
        await apiPost('/whatsapp/accounts', form);
        resetForm();
      }
      await loadAccounts();
      if (onAccountsChange) onAccountsChange();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete WhatsApp account "${name}"? This cannot be undone.`)) return;
    try {
      await apiDelete(`/whatsapp/accounts/${id}`);
      await loadAccounts();
      if (onAccountsChange) onAccountsChange();
    } catch (err) { alert(err.message); }
  };

  const openEdit = (acc) => {
    setForm({
      name: acc.name,
      project: acc.project,
      phone_number_id: acc.phone_number_id,
      access_token: '',
      waba_id: acc.waba_id,
      template_name: acc.template_name || '',
      template_language: acc.template_language || 'en',
      is_active: acc.is_active,
      is_default: acc.is_default,
    });
    setEditing(acc);
    setShowForm(true);
  };

  const fetchTemplates = async (account) => {
    setFetchingTemplates(account.id);
    try {
      const list = await apiGet(`/whatsapp/templates?accountId=${account.id}`);
      setTemplateOptions(prev => ({ ...prev, [account.id]: list }));
      if (list.length === 0) {
        alert('No approved templates found for this WABA.');
      }
    } catch (err) { alert(err.message); }
    finally { setFetchingTemplates(null); }
  };

  const setAccountTemplate = async (account, templateName) => {
    try {
      await apiPut(`/whatsapp/accounts/${account.id}`, { template_name: templateName || null });
      setForm(prev => ({ ...prev, template_name: templateName }));
      await loadAccounts();
    } catch (err) { alert(err.message); }
  };

  const toggleField = (field) => setForm(p => ({ ...p, [field]: !p[field] }));

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: showForm || accounts.length > 0 ? 12 : 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>WhatsApp Accounts</span>
        <button className="btn btn-sm" onClick={() => { resetForm(); setShowForm(!showForm); }}
          style={{ marginLeft: 'auto', background: 'var(--sage)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {showForm ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '10px 0', borderBottom: accounts.length > 0 ? '1px solid var(--line)' : 'none', marginBottom: accounts.length > 0 ? 10 : 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 130px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Name</span>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Being Sevak" style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <label className="field" style={{ flex: '1 1 100px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Project</span>
              <select value={form.project} onChange={e => setForm(p => ({ ...p, project: e.target.value }))} style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }}>
                {PROJECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Phone Number ID</span>
              <input value={form.phone_number_id} onChange={e => setForm(p => ({ ...p, phone_number_id: e.target.value }))} placeholder="Meta phone ID" style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <label className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Access Token</span>
              <input type="text" value={form.access_token} onChange={e => setForm(p => ({ ...p, access_token: e.target.value }))} placeholder={editing ? 'Leave blank to keep' : 'Meta token'} style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <label className="field" style={{ flex: '1 1 130px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>WABA ID</span>
              <input value={form.waba_id} onChange={e => setForm(p => ({ ...p, waba_id: e.target.value }))} placeholder="WABA ID" style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
            </label>
            <label className="field" style={{ flex: '1 1 100px', marginBottom: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Template Language</span>
              <input value={form.template_language} onChange={e => setForm(p => ({ ...p, template_language: e.target.value }))} placeholder="en" style={{ marginTop: 2, fontSize: 12, padding: '5px 8px' }} />
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
              Leave Access Token blank to keep the existing value.
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>Loading...</div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>
          No WhatsApp accounts yet. Add one above, or the system will auto-create one from the environment variables if configured.
        </div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {accounts.map(acc => {
            const templates = templateOptions[acc.id];
            return (
              <div key={acc.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: acc.is_active ? '#059669' : '#d1d5db', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{acc.name}</span>
                      <span className="pill" style={{ background: '#5B6B4E20', color: '#5B6B4E', fontSize: 10, padding: '1px 6px' }}>{acc.project}</span>
                      {acc.is_default && (
                        <span className="pill" style={{ background: '#0d948818', color: '#0d9488', fontSize: 10, padding: '1px 6px' }}>Default</span>
                      )}
                      {acc.template_name ? (
                        <span className="pill" style={{ background: '#25D36620', color: '#1d6f42', fontSize: 10, padding: '1px 6px' }}>{acc.template_name}</span>
                      ) : (
                        <span className="pill pill-red" style={{ fontSize: 10, padding: '1px 6px' }}>N/A</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                      Phone: {acc.phone_number_id} &middot; WABA: {acc.waba_id}
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={() => fetchTemplates(acc)} disabled={fetchingTemplates === acc.id}
                    style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
                    {fetchingTemplates === acc.id ? 'Loading...' : 'Templates'}
                  </button>
                  <button className="btn btn-sm" onClick={() => openEdit(acc)} style={{ fontSize: 11, padding: '2px 7px' }}>Edit</button>
                  <button className="btn btn-sm" onClick={() => handleDelete(acc.id, acc.name)} style={{ fontSize: 11, padding: '2px 7px', color: '#dc2626' }}>Del</button>
                </div>
                {templates && templates.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 16 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Template:</span>
                    <select
                      value={acc.template_name || ''}
                      onChange={e => setAccountTemplate(acc, e.target.value)}
                      style={{ fontSize: 11, padding: '2px 6px', maxWidth: 200 }}
                    >
                      <option value="">N/A</option>
                      {templates.map(t => (
                        <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

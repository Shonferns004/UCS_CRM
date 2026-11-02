import { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';
import { toast } from '../../../components/Toast';
import StatCard from './StatCard.jsx';
import AccountCard from './AccountCard.jsx';
import './whatsappAccounts.css';

const PROJECT_OPTIONS = [
  { value: 'bsct', label: 'Being Sevak' },
  { value: 'bsct2', label: 'Being Sevak 2' },
  { value: 'bsct3', label: 'Being Sevak 3' },
  { value: 'mann', label: 'Mann Care' },
  { value: 'aflf', label: 'Ashray' },
  { value: 'aflf2', label: 'Ashray 2' },
  { value: 'mann 2', label: 'Mann Care 2' },
];

const CUSTOM_PROJECTS_KEY = 'wa_custom_projects';

// Extra projects the user added from the "Add new project" option in the
// dropdown. Kept in localStorage so they survive reloads on this browser.
function loadCustomProjects() {
  try {
    const raw = localStorage.getItem(CUSTOM_PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(p => p && p.value) : [];
  } catch {
    return [];
  }
}

const emptyForm = {
  name: '', project: 'bsct', phone_number_id: '', access_token: '',
  waba_id: '', template_name: '',
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
  const [templateFormAccount, setTemplateFormAccount] = useState(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templatesModalAccount, setTemplatesModalAccount] = useState(null);
  const [accountTemplates, setAccountTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '', language: 'en', category: 'UTILITY', headerType: 'NONE', headerText: '', headerHandle: '', body: '', footer: '',
    buttons: [],
  });
  const [revealToken, setRevealToken] = useState({});
  const [showToken, setShowToken] = useState(false);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [customProjects, setCustomProjects] = useState(loadCustomProjects);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectLabel, setNewProjectLabel] = useState('');

  const projectOptions = [...PROJECT_OPTIONS, ...customProjects];
  // If an account was saved with a project code that isn't in the list (e.g.
  // entered directly in the DB), keep it selectable while editing.
  const selectOptions = form.project && !projectOptions.some(o => String(o.value).toLowerCase() === String(form.project).toLowerCase())
    ? [...projectOptions, { value: form.project, label: form.project }]
    : projectOptions;

  // `project` is UNIQUE in whatsapp_accounts (one number per project, and
  // send-time routing picks the number from the donor's project). So a project
  // that already has an account must not be selectable again — otherwise the
  // save fails with a bare "already exists" from the 23505 constraint.
  const occupiedProjects = new Set(accounts.map(a => String(a.project || '').toLowerCase()));
  const isTaken = (project) => {
    const code = String(project || '').toLowerCase();
    if (!occupiedProjects.has(code)) return false;
    // When editing, an account's own project is not "taken" by itself.
    return !editing || String(editing.project || '').toLowerCase() !== code;
  };
  const firstFreeProject = () => (PROJECT_OPTIONS.find(o => !occupiedProjects.has(o.value)) || PROJECT_OPTIONS[0]).value;
  // Allow adding more accounts with custom project codes when predefined ones are taken
  const allProjectsTaken = PROJECT_OPTIONS.every(o => occupiedProjects.has(o.value));

  const persistCustomProjects = (list) => {
    setCustomProjects(list);
    try { localStorage.setItem(CUSTOM_PROJECTS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  };

  const handleAddProject = () => {
    const code = newProjectCode.trim().toLowerCase().replace(/\s+/g, '-');
    const label = newProjectLabel.trim() || newProjectCode.trim();
    if (!code) { alert('Project code is required'); return; }
    if (projectOptions.some(o => String(o.value).toLowerCase() === code)) {
      alert(`Project "${code}" already exists in the list`);
      return;
    }
    const next = [...customProjects, { value: code, label }];
    persistCustomProjects(next);
    setForm(p => ({ ...p, project: code }));
    setAddingProject(false);
    setNewProjectCode('');
    setNewProjectLabel('');
  };

  const cancelAddProject = () => {
    setAddingProject(false);
    setNewProjectCode('');
    setNewProjectLabel('');
  };

  async function loadAccounts() {
    setLoading(true);
    try {
      const data = await apiGet('/whatsapp/accounts');
      setAccounts(data || []);
      setLoadError(null);
    } catch (err) { console.error(err); setLoadError('Could not load WhatsApp accounts. Please try again.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const data = await apiGet('/whatsapp/accounts');
        if (!cancelled) { setAccounts(data || []); setLoadError(null); }
      } catch (err) { console.error(err); if (!cancelled) setLoadError('Could not load WhatsApp accounts. Please try again.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
    setShowToken(false);
    cancelAddProject();
  };

  const handleSave = async () => {
    if (!form.name || !form.phone_number_id || !form.access_token || !form.waba_id) {
      alert('Name, Phone Number ID, Access Token, and WABA ID are required');
      return;
    }
    if (isTaken(form.project)) {
      const label = projectOptions.find(o => o.value === form.project)?.label || form.project;
      alert(`${label} already has a WhatsApp account. Each project can have only one number — edit the existing account or pick another project.`);
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
      access_token: acc.access_token || '',
      waba_id: acc.waba_id,
      template_name: acc.template_name || '',
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

  const openTemplateForm = (account) => {
    setTemplateForm({ name: '', language: 'en', category: 'UTILITY', headerType: 'NONE', headerText: '', body: '', footer: '', buttons: [] });
    setTemplateFormAccount(account);
  };

  const closeTemplateForm = () => {
    setTemplateFormAccount(null);
    setCreatingTemplate(false);
  };

  const handleCreateTemplate = async () => {
    if (!templateFormAccount) return;
    if (!templateForm.name.trim() || !templateForm.body.trim()) {
      alert('Template name and body are required');
      return;
    }
    setCreatingTemplate(true);
    try {
      const res = await apiPost(`/whatsapp/accounts/${templateFormAccount.id}/templates`, {
        name: templateForm.name.trim(),
        language: (templateForm.language || '').trim() || 'en',
        category: templateForm.category,
        headerType: templateForm.headerType,
        headerText: (templateForm.headerText || '').trim() || undefined,
        headerHandle: (templateForm.headerHandle || '').trim() || undefined,
        body: templateForm.body.trim(),
        footer: (templateForm.footer || '').trim() || undefined,
        buttons: (templateForm.buttons || [])
          .filter(b => String(b?.text || '').trim())
          .map(b => ({ type: b.type, text: String(b.text || '').trim(), url: b.url?.trim(), phone_number: b.phone?.trim() })),
      });
      toast(`Template submitted to Meta (${res?.status || 'PENDING'})`, 'success');
      await fetchTemplates(templateFormAccount);
      closeTemplateForm();
    } catch (err) {
      toast(err.message || 'Could not submit template', 'error');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const openTemplatesModal = async (account) => {
    setTemplatesModalAccount(account);
    setTemplatesLoading(true);
    try {
      const list = await apiGet(`/whatsapp/accounts/${account.id}/templates`);
      setAccountTemplates(Array.isArray(list) ? list : []);
    } catch (err) {
      toast(err.message || 'Could not load templates', 'error');
      setAccountTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleDeleteTemplate = async (name) => {
    if (!templatesModalAccount) return;
    if (!confirm(`Delete template "${name}" from Meta?`)) return;
    try {
      await apiDelete(`/whatsapp/accounts/${templatesModalAccount.id}/templates/${encodeURIComponent(name)}`);
      setAccountTemplates(prev => prev.filter(t => t.name !== name));
      toast('Template deleted', 'success');
      await fetchTemplates(templatesModalAccount);
    } catch (err) {
      toast(err.message || 'Could not delete template', 'error');
    }
  };

  const toggleField = (field) => setForm(p => ({ ...p, [field]: !p[field] }));

  const query = search.trim().toLowerCase();
  const visibleAccounts = query
    ? accounts.filter(acc =>
        String(acc.name || '').toLowerCase().includes(query) ||
        String(acc.project || '').toLowerCase().includes(query))
    : accounts;

  const totalAccounts = accounts.length;
  const connectedAccounts = accounts.filter(acc => acc.is_active).length;
  const defaultAccounts = accounts.filter(acc => acc.is_default).length;

  return (
    <div className="wa-page">
      <header className="wa-header">
        <div>
          <h1 className="wa-h1">WhatsApp Accounts</h1>
          <p className="wa-sub">Manage connected WhatsApp Business numbers, templates and agents.</p>
        </div>
        <div className="wa-header-actions">
          <label className="wa-search-wrap">
            <span className="wa-sr-only">Search accounts</span>
            <Search className="wa-search-ico" size={18} strokeWidth={1.8} aria-hidden="true" />
            <input
              type="search"
              className="wa-search"
              placeholder="Search accounts"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="wa-btn wa-btn-outline"
            onClick={() => { window.location.href = '/accounts/whatsapp/bulk'; }}
          >
            Bulk Send
          </button>
          <button
            type="button"
            className="wa-btn wa-btn-primary"
            disabled={false}
            title={undefined}
            onClick={() => {
              if (showForm) { resetForm(); return; }
              resetForm();
              setForm({ ...emptyForm, project: firstFreeProject() });
              setShowForm(true);
            }}
          >
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
            {showForm ? 'Cancel' : 'Add Account'}
          </button>
        </div>
        {allProjectsTaken && !showForm && (
          <p className="wa-form-hint">
            All predefined projects have accounts. You can still add another by using a custom project code (e.g., bsct3, custom1).
          </p>
        )}
      </header>

      <div className="wa-stats">
        <StatCard label="Total accounts" value={totalAccounts} />
        <StatCard label="Connected" value={connectedAccounts} />
        <StatCard label="Default accounts" value={defaultAccounts} />
      </div>

      {loadError && (
        <div className="wa-error" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            className="wa-btn-outline"
            onClick={() => { setLoadError(null); loadAccounts(); }}
          >
            Retry
          </button>
        </div>
      )}

      {showForm && (
        <section className="wa-form" aria-label={editing ? 'Edit account' : 'Add account'}>
          <div className="wa-form-grid">
            <label className="wa-f">
              <span className="wa-f-label">Name</span>
              <input className="wa-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Being Sevak" />
            </label>
            <label className="wa-f">
              <span className="wa-f-label">Project</span>
              <select
                className="wa-select"
                value={addingProject ? '__add__' : form.project}
                onChange={e => {
                  if (e.target.value === '__add__') {
                    setAddingProject(true);
                    setNewProjectLabel('');
                    setNewProjectCode('');
                    return;
                  }
                  setForm(p => ({ ...p, project: e.target.value }));
                }}
              >
                {selectOptions.map(o => {
                  const taken = isTaken(o.value);
                  return <option key={o.value} value={o.value} disabled={taken}>{taken ? `${o.label} (already added)` : o.label}</option>;
                })}
                <option value="__add__">+ Add new project…</option>
              </select>
              {addingProject && (
                <span className="wa-input-group" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  <input
                    className="wa-input"
                    value={newProjectLabel}
                    onChange={e => setNewProjectLabel(e.target.value)}
                    placeholder="Project name (e.g. Being Sevak 4)"
                  />
                  <input
                    className="wa-input"
                    value={newProjectCode}
                    onChange={e => setNewProjectCode(e.target.value)}
                    placeholder="code (e.g. bsct4)"
                  />
                  <button type="button" className="wa-ghost-btn" onClick={handleAddProject} title="Add project">Add</button>
                  <button type="button" className="wa-ghost-btn" onClick={cancelAddProject} title="Cancel">✕</button>
                </span>
              )}
            </label>
            <label className="wa-f">
              <span className="wa-f-label">Phone Number ID</span>
              <input className="wa-input" value={form.phone_number_id} onChange={e => setForm(p => ({ ...p, phone_number_id: e.target.value }))} placeholder="Meta phone ID" />
            </label>
            <label className="wa-f">
              <span className="wa-f-label">Access Token</span>
              <span className="wa-input-group">
                <input className="wa-input" type={showToken ? 'text' : 'password'} value={form.access_token} onChange={e => setForm(p => ({ ...p, access_token: e.target.value }))} placeholder={editing ? 'Leave blank to keep' : 'Meta token'} />
                <button
                  type="button"
                  className="wa-ghost-btn"
                  onClick={() => setShowToken(s => !s)}
                  title={showToken ? 'Hide access token' : 'Show access token'}
                  aria-label={showToken ? 'Hide access token' : 'Show access token'}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <label className="wa-f">
              <span className="wa-f-label">WABA ID</span>
              <input className="wa-input" value={form.waba_id} onChange={e => setForm(p => ({ ...p, waba_id: e.target.value }))} placeholder="WABA ID" />
            </label>
          </div>
          <div className="wa-form-foot">
            <div className="wa-form-checks">
              <label className="wa-check">
                <input type="checkbox" checked={form.is_active} onChange={() => toggleField('is_active')} /> Active
              </label>
              <label className="wa-check">
                <input type="checkbox" checked={form.is_default} onChange={() => toggleField('is_default')} /> Default
              </label>
            </div>
            <button type="button" className="wa-btn wa-btn-primary wa-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
            </button>
          </div>
          {editing && (
            <p className="wa-form-hint">
              Leave Access Token blank to keep the existing value.
            </p>
          )}
        </section>
      )}

      {loading ? (
        <>
          <p className="wa-sr-only" role="status">Loading accounts…</p>
          <div className="wa-grid" aria-hidden="true">
            {[0, 1].map(i => (
              <div key={i} className="wa-card wa-skeleton-card">
                <div className="wa-skel-top">
                  <span className="wa-skel-avatar" />
                  <span className="wa-skel-lines">
                    <span className="wa-skel-line" style={{ width: '55%' }} />
                    <span className="wa-skel-line" style={{ width: '35%' }} />
                  </span>
                </div>
                <span className="wa-skel-line" style={{ width: '100%' }} />
                <span className="wa-skel-line" style={{ width: '80%' }} />
                <span className="wa-skel-foot" />
              </div>
            ))}
          </div>
        </>
      ) : accounts.length === 0 ? (
        <div className="wa-empty">
          <p className="wa-empty-title">No accounts yet</p>
          <p className="wa-empty-text">
            Add one above, or the system will auto-create one from the environment variables if configured.
          </p>
          <button
            type="button"
            className="wa-btn wa-btn-primary"
            onClick={() => { resetForm(); setForm({ ...emptyForm, project: firstFreeProject() }); setShowForm(true); }}
          >
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
            Add Account
          </button>
        </div>
      ) : visibleAccounts.length === 0 ? (
        <div className="wa-empty">
          <p className="wa-empty-title">No accounts match “{search.trim()}”</p>
          <p className="wa-empty-text">Try a different name or project code.</p>
          <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setSearch('')}>
            Clear search
          </button>
        </div>
      ) : (
        <div className="wa-grid">
          {visibleAccounts.map(acc => (
            <AccountCard
              key={acc.id}
              account={acc}
              revealed={Boolean(revealToken[acc.id])}
              onToggleReveal={() => setRevealToken(prev => ({ ...prev, [acc.id]: !prev[acc.id] }))}
               fetchingTemplates={fetchingTemplates === acc.id}
               onFetchTemplates={() => fetchTemplates(acc)}
               onAddTemplate={() => openTemplateForm(acc)}
               onOpenTemplates={() => openTemplatesModal(acc)}
               templates={templateOptions[acc.id]}
               onSelectTemplate={(value) => setAccountTemplate(acc, value)}
               onEdit={() => openEdit(acc)}
              onDelete={() => handleDelete(acc.id, acc.name)}
            />
          ))}
        </div>
      )}

      {templateFormAccount && (
        <div className="wa-drawer-overlay" onClick={closeTemplateForm}>
          <div className="wa-form" style={{ maxWidth: 520, margin: '40px auto', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 className="wa-h1" style={{ fontSize: 18 }}>Add Template — {templateFormAccount.name}</h3>
            <p className="wa-sub">Submit a new template to Meta for approval.</p>
            <div className="wa-form-grid">
              <label className="wa-f">
                <span className="wa-f-label">Name</span>
                <input className="wa-input" value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. welcome_message" />
              </label>
              <label className="wa-f">
                <span className="wa-f-label">Language</span>
                <input className="wa-input" value={templateForm.language} onChange={e => setTemplateForm(p => ({ ...p, language: e.target.value }))} placeholder="en" />
              </label>
              <label className="wa-f">
                <span className="wa-f-label">Category</span>
                <select className="wa-select" value={templateForm.category} onChange={e => setTemplateForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="UTILITY">Utility</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </label>
              <label className="wa-f">
                <span className="wa-f-label">Header type</span>
                <select className="wa-select" value={templateForm.headerType} onChange={e => setTemplateForm(p => ({ ...p, headerType: e.target.value }))}>
                  <option value="NONE">None</option>
                  <option value="TEXT">Text</option>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </label>
               {templateForm.headerType === 'TEXT' && (
                 <label className="wa-f wa-field-wide">
                   <span className="wa-f-label">Header text</span>
                   <input className="wa-input" value={templateForm.headerText} onChange={e => setTemplateForm(p => ({ ...p, headerText: e.target.value }))} placeholder="Header text" />
                 </label>
               )}
               {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateForm.headerType) && (
                 <label className="wa-f wa-field-wide">
                   <span className="wa-f-label">Header media URL (public)</span>
                   <input className="wa-input" value={templateForm.headerHandle} onChange={e => setTemplateForm(p => ({ ...p, headerHandle: e.target.value }))} placeholder="https://example.com/image.jpg" />
                   <span style={{ fontSize: 11, color: '#6b7280' }}>Paste a publicly accessible media URL (Meta will fetch it).</span>
                 </label>
               )}
              <label className="wa-f wa-field-wide">
                <span className="wa-f-label">Body</span>
                <textarea className="wa-input" rows={4} value={templateForm.body} onChange={e => setTemplateForm(p => ({ ...p, body: e.target.value }))} placeholder="Hello {{1}}, welcome to {{2}}!" />
              </label>
              <label className="wa-f wa-field-wide">
                <span className="wa-f-label">Footer (optional)</span>
                <input className="wa-input" value={templateForm.footer} onChange={e => setTemplateForm(p => ({ ...p, footer: e.target.value }))} placeholder="Footer text" />
              </label>
            </div>
            <div className="wa-field-wide" style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="wa-f-label">Buttons (optional)</span>
                <button type="button" className="wa-btn-outline" onClick={() => setTemplateForm(p => ({ ...p, buttons: [...(p.buttons || []), { type: 'QUICK_REPLY', text: '', url: '', phone: '' }] }))}>
                  + Add button
                </button>
              </div>
              {(templateForm.buttons || []).map((btn, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <select className="wa-select" value={btn.type} onChange={e => setTemplateForm(p => {
                    const buttons = [...(p.buttons || [])];
                    buttons[idx] = { ...buttons[idx], type: e.target.value };
                    return { ...p, buttons };
                  })}>
                    <option value="QUICK_REPLY">Quick reply</option>
                    <option value="URL">URL</option>
                    <option value="PHONE_NUMBER">Phone</option>
                    <option value="COPY_CODE">Copy code</option>
                  </select>
                  <input className="wa-input" style={{ flex: 1, minWidth: 120 }} value={btn.text} onChange={e => setTemplateForm(p => {
                    const buttons = [...(p.buttons || [])];
                    buttons[idx] = { ...buttons[idx], text: e.target.value };
                    return { ...p, buttons };
                  })} placeholder="Button text" />
                  {btn.type === 'URL' && (
                    <input className="wa-input" style={{ flex: 2, minWidth: 160 }} value={btn.url || ''} onChange={e => setTemplateForm(p => {
                      const buttons = [...(p.buttons || [])];
                      buttons[idx] = { ...buttons[idx], url: e.target.value };
                      return { ...p, buttons };
                    })} placeholder="https://example.com/{{1}}" />
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <input className="wa-input" style={{ flex: 2, minWidth: 160 }} value={btn.phone || ''} onChange={e => setTemplateForm(p => {
                      const buttons = [...(p.buttons || [])];
                      buttons[idx] = { ...buttons[idx], phone: e.target.value };
                      return { ...p, buttons };
                    })} placeholder="+91..." />
                  )}
                  <button type="button" className="wa-btn-outline wa-btn-danger" onClick={() => setTemplateForm(p => {
                    const buttons = [...(p.buttons || [])];
                    buttons.splice(idx, 1);
                    return { ...p, buttons };
                  })}>Remove</button>
                </div>
              ))}
            </div>
            <div className="wa-form-foot">
              <button type="button" className="wa-btn wa-btn-ghost" onClick={closeTemplateForm} disabled={creatingTemplate}>Cancel</button>
              <button type="button" className="wa-btn wa-btn-primary" onClick={handleCreateTemplate} disabled={creatingTemplate}>
                {creatingTemplate ? 'Submitting...' : 'Submit to Meta'}
              </button>
            </div>
          </div>
        </div>
      )}
      {templatesModalAccount && (
        <div className="wa-drawer-overlay" onClick={() => setTemplatesModalAccount(null)}>
          <div className="wa-form" style={{ maxWidth: 560, margin: '40px auto', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 className="wa-h1" style={{ fontSize: 18 }}>Templates — {templatesModalAccount.name}</h3>
            {templatesLoading ? (
              <p>Loading...</p>
            ) : accountTemplates.length === 0 ? (
              <p>No templates found.</p>
            ) : (
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Name</th>
                    <th style={{ textAlign: 'left' }}>Language</th>
                    <th style={{ textAlign: 'left' }}>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {accountTemplates.map(t => (
                    <tr key={`${t.name}-${t.language}`}>
                      <td>{t.name}</td>
                      <td>{t.language}</td>
                      <td>{t.status}</td>
                      <td>
                        <button type="button" className="wa-btn wa-btn-danger wa-btn-sm" onClick={() => handleDeleteTemplate(t.name)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="wa-form-foot">
              <button type="button" className="wa-btn wa-btn-ghost" onClick={() => setTemplatesModalAccount(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

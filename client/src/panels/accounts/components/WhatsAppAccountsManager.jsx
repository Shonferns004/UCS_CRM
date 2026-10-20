import { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';
import { toast } from '../../../components/Toast';
import StatCard from './StatCard.jsx';
import AccountCard from './AccountCard.jsx';
import AgentsDrawer from './AgentsDrawer.jsx';
import './whatsappAccounts.css';

const PROJECT_OPTIONS = [
  { value: 'bsct', label: 'Being Sevak' },
  { value: 'bsct2', label: 'Being Sevak 2' },
  { value: 'mann', label: 'Mann Care' },
  { value: 'aflf', label: 'Ashray' },
  { value: 'aflf2', label: 'Ashray 2' },
];

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
  const [agents, setAgents] = useState({});
  const [agentsLoading, setAgentsLoading] = useState({});
  const [agentsError, setAgentsError] = useState({});
  const [drawerAccount, setDrawerAccount] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [revealToken, setRevealToken] = useState({});
  const [showToken, setShowToken] = useState(false);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState(null);

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
  // Every known project already has a number: adding is impossible until one
  // is deleted (the UNIQUE index on `project` allows exactly one row each).
  const allProjectsTaken = PROJECT_OPTIONS.every(o => occupiedProjects.has(o.value));

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
  };

  const handleSave = async () => {
    if (!form.name || !form.phone_number_id || !form.access_token || !form.waba_id) {
      alert('Name, Phone Number ID, Access Token, and WABA ID are required');
      return;
    }
    if (isTaken(form.project)) {
      const label = PROJECT_OPTIONS.find(o => o.value === form.project)?.label || form.project;
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

  const toggleField = (field) => setForm(p => ({ ...p, [field]: !p[field] }));

  const loadAgents = async (accountId) => {
    setAgentsLoading(prev => ({ ...prev, [accountId]: true }));
    setAgentsError(prev => ({ ...prev, [accountId]: null }));
    try {
      const data = await apiGet(`/whatsapp/accounts/${accountId}/agents`);
      setAgents(prev => ({ ...prev, [accountId]: data || [] }));
    } catch (err) {
      console.error(err);
      setAgentsError(prev => ({ ...prev, [accountId]: 'Could not load assigned agents. Please try again.' }));
    } finally {
      setAgentsLoading(prev => ({ ...prev, [accountId]: false }));
    }
  };

  const openAgents = (account) => {
    setDrawerAccount(account);
    if (!agents[account.id]) loadAgents(account.id);
  };

  // Assign runs as a sequential batch: one POST per worker, as the API
  // accepts a single froWorkerId per call.
  const assignAgents = async (accountId, workerIds) => {
    if (!workerIds.length) return false;
    setAssigning(true);
    let done = 0;
    try {
      for (const id of workerIds) {
        await apiPost(`/whatsapp/accounts/${accountId}/agents`, { froWorkerId: id });
        done += 1;
      }
      await loadAgents(accountId);
      toast(done === 1 ? '1 agent assigned' : `${done} agents assigned`, 'success');
      return true;
    } catch (err) {
      if (done > 0) {
        await loadAgents(accountId);
        toast(
          `Assigned ${done} of ${workerIds.length} agents. ${err.message || 'The rest failed.'}`,
          'error'
        );
      } else {
        toast(err.message || 'Could not assign agent', 'error');
      }
      return false;
    } finally {
      setAssigning(false);
    }
  };

  // Confirmation lives in the drawer row, so this only performs the call.
  const removeAgent = async (accountId, froId) => {
    try {
      await apiDelete(`/whatsapp/accounts/${accountId}/agents/${froId}`);
      await loadAgents(accountId);
      toast('Agent removed', 'success');
    } catch (err) { toast(err.message || 'Could not remove agent', 'error'); }
  };

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
            className="wa-btn wa-btn-primary"
            disabled={allProjectsTaken && !showForm}
            title={allProjectsTaken && !showForm ? 'All projects already have an account' : undefined}
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
            All five projects already have a WhatsApp account. Delete one to add another, or edit an existing account.
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
              <select className="wa-select" value={form.project} onChange={e => setForm(p => ({ ...p, project: e.target.value }))}>
                {PROJECT_OPTIONS.map(o => {
                  const taken = isTaken(o.value);
                  return <option key={o.value} value={o.value} disabled={taken}>{taken ? `${o.label} (already added)` : o.label}</option>;
                })}
              </select>
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
              templates={templateOptions[acc.id]}
              onSelectTemplate={(value) => setAccountTemplate(acc, value)}
              agentCount={agents[acc.id] ? agents[acc.id].length : null}
              onOpenAgents={() => openAgents(acc)}
              onEdit={() => openEdit(acc)}
              onDelete={() => handleDelete(acc.id, acc.name)}
            />
          ))}
        </div>
      )}

      {drawerAccount && (
        <AgentsDrawer
          account={drawerAccount}
          agents={agents[drawerAccount.id]}
          loading={Boolean(agentsLoading[drawerAccount.id])}
          loadError={agentsError[drawerAccount.id] || null}
          assigning={assigning}
          onClose={() => setDrawerAccount(null)}
          onReload={() => loadAgents(drawerAccount.id)}
          onRemove={(froId) => removeAgent(drawerAccount.id, froId)}
          onAssign={(workerIds) => assignAgents(drawerAccount.id, workerIds)}
        />
      )}
    </div>
  );
}

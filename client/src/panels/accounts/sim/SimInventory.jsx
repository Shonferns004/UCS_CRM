import { useMemo, useState, useEffect } from 'react';
import { useSim } from './store';
import { Icon } from './components';
import { daysLeft, formatDate, dayLabel, dayClass } from './helpers';
import { toast } from '../../../components/Toast';

export const INVENTORY_STATUSES = ['Available', 'Assigned', 'Expired', 'Lost', 'Damaged', 'Inactive'];
const SIM_TYPES = ['Standard', 'Micro', 'Nano', 'eSIM', 'Other'];

/* Copy for the three Locker tabs. Unassigned holds the spare SIMs waiting to be
   handed out, Assigned holds the ones already sitting in a phone, and
   Unavailable catches the rest (expired / lost / damaged / retired) so nothing
   becomes unreachable. */
const TABS = {
  unassigned: {
    title: 'Unassigned SIMs',
    hint: 'Spare SIMs not in any phone yet',
    emptyTitle: 'No spare SIMs',
    emptyHint: 'Every SIM here has gone out to a phone. Add one to start stocking again.',
  },
  assigned: {
    title: 'Assigned SIMs',
    hint: 'SIMs currently sitting in a phone',
    emptyTitle: 'No SIMs are out on phones',
    emptyHint: 'Assign a spare SIM to a phone and it will show up here.',
  },
  unavailable: {
    title: 'Unavailable SIMs',
    hint: 'Expired, lost, damaged or retired',
    emptyTitle: 'Nothing unavailable',
    emptyHint: 'No expired, lost, damaged or retired SIMs.',
  },
};

function pillForInv(status) {
  const map = {
    Available: 'pill-active',
    Assigned: 'pill-replaced',
    Expired: 'pill-expired',
    Lost: 'pill-expiring',
    Damaged: 'pill-inactive',
    Inactive: 'pill-inactive',
  };
  return map[status] || 'pill-neutral';
}

function daysFor(item) {
  if (item.days_left !== undefined && item.days_left !== null) return item.days_left;
  return daysLeft(item.expiry_date);
}

function AddSimModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ sim_name: '', sim_number: '', owner_name: '', sim_type: 'Standard', provider: '', location: '', expiry_date: '', status: 'Available' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.sim_name || !String(form.sim_name).trim()) {
      toast('SIM Name is required', 'error');
      return;
    }
    if (!form.sim_number || !String(form.sim_number).trim()) {
      toast('SIM Number is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSaved({
        ...form,
        sim_name: form.sim_name.trim(),
        sim_number: form.sim_number.trim(),
        assigned_to: String(form.owner_name || '').trim() || null,
      });
      toast('SIM added to inventory', 'success');
      onClose();
    } catch (e) {
      toast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>Add SIM to Inventory</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-row">
              <label>SIM Name *</label>
              <input value={form.sim_name} onChange={(e) => set('sim_name', e.target.value)} placeholder="e.g. Delhi Jio Spare" />
            </div>
            <div className="form-row">
              <label>SIM Number *</label>
              <input value={form.sim_number} onChange={(e) => set('sim_number', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Owner Name</label>
              <input value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} placeholder="e.g. Rakesh Kumar" />
            </div>
            <div className="form-row">
              <label>SIM Type</label>
              <select value={form.sim_type} onChange={(e) => set('sim_type', e.target.value)}>
                {SIM_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Provider / Network</label>
              <input value={form.provider} onChange={(e) => set('provider', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Location</label>
              <input value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {INVENTORY_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="sim-btn" onClick={onClose}>Cancel</button>
          <button className="sim-btn primary" onClick={handleSave} disabled={saving}>{saving ? 'Adding...' : 'Add SIM'}</button>
        </div>
      </div>
    </div>
  );
}

export function AssignSimModal({ open, item, onClose, onSaved }) {
  const { cards } = useSim();
  const [form, setForm] = useState(() => ({
    mobile_id: item?.mobile_id || '',
    device: item?.device || '',
    imei: item?.imei || '',
    team: item?.team || '',
    assignment_date: new Date().toISOString().slice(0, 10),
  }));
  const [phoneSearch, setPhoneSearch] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Real phones are the sim_cards rows already in the shared store. The server
     only checks that mobile_id is non-empty, so a typo would strand the SIM on a
     phone that does not exist; picking from this list is what prevents that. */
  const phones = useMemo(() => {
    const seen = new Set();
    return (cards || [])
      .map((c) => ({
        mobile_id: (c.mobile_id || '').trim(),
        device_model: c.device_model || '',
        imei: c.imei || '',
        team: c.team || '',
      }))
      .filter((p) => {
        if (!p.mobile_id || seen.has(p.mobile_id)) return false;
        seen.add(p.mobile_id);
        return true;
      })
      .sort((a, b) => a.mobile_id.localeCompare(b.mobile_id, undefined, { numeric: true }));
  }, [cards]);

  const phoneMatches = useMemo(() => {
    const s = phoneSearch.trim().toLowerCase();
    const pool = !s
      ? phones
      : phones.filter((p) => p.mobile_id.toLowerCase().includes(s) || (p.device_model || '').toLowerCase().includes(s));
    return pool.slice(0, 40);
  }, [phones, phoneSearch]);

  if (!open || !item) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function choosePhone(p) {
    setForm((prev) => ({
      ...prev,
      mobile_id: p.mobile_id,
      device: p.device_model || prev.device || '',
      imei: p.imei || prev.imei || '',
      team: p.team || prev.team || '',
    }));
    setPhoneOpen(false);
    setPhoneSearch('');
  }

  async function handleSave() {
    const mid = String(form.mobile_id || '').trim();
    if (!mid) {
      toast('Select the phone this SIM is going into', 'error');
      return;
    }
    if (phones.length > 0 && !phones.some((p) => p.mobile_id === mid)) {
      toast('That Mobile ID is not in your phone list. Please pick one from the list.', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSaved(item.id, { ...form, mobile_id: mid });
      toast('SIM assigned', 'success');
      onClose();
    } catch (e) {
      toast(e.message || 'Assign failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>Assign SIM Card</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-row locked">
              <label>SIM Name</label>
              <input value={item.sim_name || ''} disabled />
            </div>
            <div className="form-row locked">
              <label>SIM Number</label>
              <input value={item.sim_number} disabled />
            </div>
            <div className="form-row">
              <label>Mobile ID No. *</label>
              {phones.length === 0 ? (
                <input value={form.mobile_id} onChange={(e) => set('mobile_id', e.target.value)} placeholder="e.g. Android 1" />
              ) : (
                <div className="locker-picker">
                  <input
                    value={phoneOpen ? phoneSearch : form.mobile_id}
                    onChange={(e) => { setPhoneOpen(true); setPhoneSearch(e.target.value); }}
                    onFocus={() => { setPhoneOpen(true); setPhoneSearch(''); }}
                    onBlur={() => setTimeout(() => setPhoneOpen(false), 150)}
                    placeholder="Search phone by Mobile ID or model"
                  />
                  {phoneOpen && (
                    <div className="locker-picker-menu">
                      {phoneMatches.length === 0 ? (
                        <div className="locker-picker-none">No matching phone</div>
                      ) : (
                        phoneMatches.map((p) => (
                          <button
                            type="button"
                            key={p.mobile_id}
                            className={`locker-picker-opt${form.mobile_id === p.mobile_id ? ' is-on' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => choosePhone(p)}
                          >
                            <span className="lp-id">{p.mobile_id}</span>
                            <span className="lp-meta">
                              {p.device_model || '—'}{p.imei ? ` · IMEI ${p.imei}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="form-row">
              <label>Device</label>
              <input value={form.device} onChange={(e) => set('device', e.target.value)} />
            </div>
            <div className="form-row">
              <label>IMEI No.</label>
              <input value={form.imei} onChange={(e) => set('imei', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Team</label>
              <input value={form.team} onChange={(e) => set('team', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Assignment Date</label>
              <input type="date" value={form.assignment_date} onChange={(e) => set('assignment_date', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="sim-btn" onClick={onClose}>Cancel</button>
          <button className="sim-btn primary" onClick={handleSave} disabled={saving}>{saving ? 'Assigning...' : 'Assign SIM'}</button>
        </div>
      </div>
    </div>
  );
}

function InventoryDetails({ item, onClose }) {
  if (!item) return null;
  const dl = daysFor(item);
  const Item = ({ k, v }) => (
    <div className="detail-item">
      <div className="k">{k}</div>
      <div className="v">{v || '—'}</div>
    </div>
  );
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal drawer" style={{ borderRadius: 14, marginLeft: 'auto', marginRight: 0 }}>
        <div className="modal-head">
          <h3>SIM Inventory Details</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            <Item k="SIM Name" v={item.sim_name} />
            <Item k="SIM Number" v={item.sim_number} />
            <Item k="Owner Name" v={item.assigned_to} />
            <Item k="Provider / Network" v={item.provider} />
            <Item k="SIM Type" v={item.sim_type} />
            <Item k="Status" v={item.status} />
            <Item k="Location" v={item.location} />
          </div>
          {item.status === 'Assigned' && (
            <>
              <div className="section-title" style={{ margin: '18px 0 10px', fontSize: 13 }}>Assignment</div>
              <div className="detail-grid">
                <Item k="Mobile ID No." v={item.mobile_id} />
                <Item k="Device" v={item.device} />
                <Item k="IMEI No." v={item.imei} />
                <Item k="Team" v={item.team} />
                <Item k="Issue Date" v={formatDate(item.issue_date)} />
                <Item k="Expiry Date" v={formatDate(item.expiry_date)} />
                <Item k="Days Left" v={dayLabel(dl)} />
                <Item k="Assignment Date" v={formatDate(item.assignment_date)} />
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="sim-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function SimInventory() {
  const { inventory, refreshInventory, addInventoryItem, assignInventoryItem, releaseInventoryItem, deleteInventoryItem } = useSim();
  const [tab, setTab] = useState('unassigned');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('All');
  const [team, setTeam] = useState('All');
  const [simType, setSimType] = useState('All');
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [assignItem, setAssignItem] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const openAdd = () => { setAddKey((k) => k + 1); setAddOpen(true); };

  useEffect(() => { refreshInventory(); /* eslint-disable-next-line */ }, []);

  /* Whether a SIM is "in a phone" is read from the phone link itself (mobile_id),
     which is exactly what the assign endpoint writes and never changes meaning.
     The stored status is only trusted for the "this SIM is unusable" call. Using
     mobile_id rather than status === 'Available' keeps the Locker correct on
     older API builds too, where a spare with no expiry date comes back tagged
     with the sim_cards vocabulary instead of 'Available'. Every row lands in
     exactly one bucket. */
  const buckets = useMemo(() => {
    const unassigned = [];
    const assigned = [];
    const unavailable = [];
    for (const i of inventory) {
      const inPhone = String(i.mobile_id || '').trim() !== '';
      if (i.status === 'Lost' || i.status === 'Damaged') unavailable.push(i);
      else if (inPhone) assigned.push(i);
      else if (i.status === 'Expired') unavailable.push(i);
      else unassigned.push(i);
    }
    return { unassigned, assigned, unavailable };
  }, [inventory]);

  const total = inventory.length;
  const available = buckets.unassigned.length;
  const assigned = buckets.assigned.length;
  const expired = inventory.filter((i) => i.status === 'Expired').length;
  const lostDamaged = inventory.filter((i) => i.status === 'Lost' || i.status === 'Damaged').length;

  const providers = useMemo(() => [...new Set(inventory.map((i) => i.provider).filter(Boolean))].sort(), [inventory]);
  const teams = useMemo(() => [...new Set(inventory.map((i) => i.team).filter(Boolean))].sort(), [inventory]);

  const filtered = useMemo(() => {
    let list = buckets[tab] || [];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((i) =>
        (i.sim_name || '').toLowerCase().includes(s) ||
        (i.sim_number || '').toLowerCase().includes(s) ||
        (i.assigned_to || '').toLowerCase().includes(s) ||
        (i.mobile_id || '').toLowerCase().includes(s) ||
        (i.imei || '').toLowerCase().includes(s) ||
        (i.device || '').toLowerCase().includes(s)
      );
    }
    if (provider !== 'All') list = list.filter((i) => i.provider === provider);
    if (team !== 'All') list = list.filter((i) => i.team === team);
    if (simType !== 'All') list = list.filter((i) => i.sim_type === simType);
    return list;
  }, [buckets, tab, search, provider, team, simType]);

  const clearFilters = () => { setSearch(''); setProvider('All'); setTeam('All'); setSimType('All'); };

  async function handleRelease(item) {
    if (!window.confirm(`Release SIM ${item.sim_number || ''} back to the locker?`)) return;
    setBusyId(item.id);
    try {
      await releaseInventoryItem(item);
      toast('SIM released back to locker', 'success');
    } catch (e) {
      toast(e.message || 'Release failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAvailable(item) {
    setBusyId(item.id);
    try {
      await releaseInventoryItem(item);
      toast('SIM marked as Available', 'success');
    } catch (e) {
      toast(e.message || 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete SIM ${item.sim_number || ''} from inventory? This cannot be undone.`)) return;
    try {
      await deleteInventoryItem(item.id);
      toast('SIM removed from inventory', 'success');
    } catch (e) {
      toast(e.message || 'Delete failed', 'error');
    }
  }

  const summary = [
    { label: 'Total SIMs', val: total, icon: 'simcard', tint: { bg: '#eff6ff', color: '#2563eb' } },
    { label: 'Available', val: available, icon: 'sim', tint: { bg: '#f0fdf4', color: '#16a34a' } },
    { label: 'Assigned / In Use', val: assigned, icon: 'inventory', tint: { bg: '#f0f9ff', color: '#0284c7' } },
    { label: 'Expired', val: expired, icon: 'clock', tint: { bg: '#fef2f2', color: '#dc2626' } },
    { label: 'Lost / Damaged', val: lostDamaged, icon: 'replace', tint: { bg: '#fffbeb', color: '#d97706' } },
  ];

  return (
    <div>
      <div className="stock-banner">
        <div className="tb">
          <h3>SIM Stock Overview</h3>
          <span className="ln">{total} SIM{total !== 1 ? 's' : ''} in inventory</span>
        </div>
        <div className="stock-stats">
          {summary.map((s) => (
            <div className="stock-stat" key={s.label}>
              <div className="ss-top">
                <div className="ss-ic" style={{ background: s.tint.bg, color: s.tint.color }}><Icon name={s.icon} size={15} /></div>
                <span className="ss-lab">{s.label}</span>
              </div>
              <div className="ss-num">{s.val}</div>
              <span className="stock-bar-span" style={{ display: 'block', height: 4, borderRadius: 99, background: '#e8edf5', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', background: s.tint.color, width: `${total > 0 ? Math.round((s.val / total) * 100) : 0}%` }} />
              </span>
            </div>
          ))}
          <div className="stock-avail">
            <div className="sa-t">
              <div className="sa-num">{available}</div>
              <div className="sa-lab">Available in stock</div>
            </div>
            <div className="stock-bar"><span style={{ width: `${total > 0 ? Math.round((available / total) * 100) : 0}%` }} /></div>
            <span className="ln" style={{ fontSize: 12, color: 'var(--sim-blue-dark)' }}>{total > 0 ? Math.round((available / total) * 100) : 0}% available</span>
          </div>
        </div>
      </div>

      <div className="card-block">
        <div className="toolbar" style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 10, color: 'var(--sim-ink-soft)', display: 'flex' }}><Icon name="search" size={15} /></span>
            <input className="sim-input search-input" placeholder="Search SIM name, owner, number, Mobile ID, IMEI..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="sim-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="All">All Providers</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="sim-select" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="All">All Teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="sim-select" value={simType} onChange={(e) => setSimType(e.target.value)}>
            {['All', ...SIM_TYPES].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="sim-btn ghost" onClick={clearFilters}>Clear Filters</button>
          <button className="sim-btn primary" onClick={openAdd}>+ Add SIM</button>
        </div>

        {inventory.length === 0 ? (
          <div className="sim-box empty-state">
            <div className="big">No SIMs in the Locker yet</div>
            <div className="small">Add the spare SIMs you are holding, then hand one out to a phone whenever you need to.</div>
            <button className="sim-btn primary" onClick={openAdd}>+ Add SIM</button>
          </div>
        ) : (
          <>
            <div className="locker-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'unassigned'}
                className={`locker-tab${tab === 'unassigned' ? ' is-on' : ''}`}
                onClick={() => setTab('unassigned')}
              >
                Unassigned <span className="lt-n">{buckets.unassigned.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'assigned'}
                className={`locker-tab${tab === 'assigned' ? ' is-on' : ''}`}
                onClick={() => setTab('assigned')}
              >
                Assigned <span className="lt-n">{buckets.assigned.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'unavailable'}
                className={`locker-tab${tab === 'unavailable' ? ' is-on' : ''}`}
                onClick={() => setTab('unavailable')}
              >
                Unavailable <span className="lt-n">{buckets.unavailable.length}</span>
              </button>
            </div>

            <div className="tb">
              <h3>{TABS[tab].title}</h3>
              <span className="ln">{TABS[tab].hint}</span>
            </div>

            {filtered.length === 0 ? (
              <div className="sim-box empty-state" style={{ border: 'none', boxShadow: 'none' }}>
                <div className="big">{TABS[tab].emptyTitle}</div>
                <div className="small">{TABS[tab].emptyHint}</div>
                {tab === 'unassigned' && <button className="sim-btn primary" onClick={openAdd}>+ Add SIM</button>}
              </div>
            ) : (
              <div className="stock-cards">
                {filtered.map((item) => {
                  const dl = daysFor(item);
                  const busy = busyId === item.id;
                  return (
                    <div className="stock-card" key={item.id}>
                      <div className="sc-head">
                        <span className="sc-num">{item.sim_name || item.sim_number || '—'}</span>
                        <span className={`pill ${pillForInv(item.status)}`}>{item.status}</span>
                      </div>
                      <div className="sc-body">
                        {item.sim_name && item.sim_number && (
                          <div className="sc-field"><span className="sc-k">SIM Number</span><span className="sc-v">{item.sim_number}</span></div>
                        )}
                        <div className="sc-field">
                          <span className="sc-k">Owner Name</span>
                          <span className="sc-v">{item.assigned_to || '—'}</span>
                        </div>
                        <div className="sc-field">
                          <span className="sc-k">Phone</span>
                          <span className="sc-v">{item.mobile_id || '— not assigned —'}</span>
                        </div>
                        <div className="sc-field"><span className="sc-k">Device</span><span className="sc-v">{item.device || '—'}</span></div>
                        <div className="sc-field">
                          <span className="sc-k">Type</span>
                          <span className="sc-tag">{item.sim_type || '—'}</span>
                        </div>
                        <div className="sc-field"><span className="sc-k">Provider</span><span className="sc-v">{item.provider || '—'}</span></div>
                        <div className="sc-field"><span className="sc-k">Team</span><span className="sc-v">{item.team || '—'}</span></div>
                        <div className="sc-field"><span className="sc-k">Location</span><span className="sc-v">{item.location || '—'}</span></div>
                        <div className="sc-field"><span className="sc-k">Expiry</span><span className="sc-v">{formatDate(item.expiry_date)}</span></div>
                        <div className="sc-field"><span className="sc-k">Days Left</span><span className={`sc-v ${dayClass(dl)}`}>{dayLabel(dl)}</span></div>
                      </div>
                      <div className="sc-actions">
                        <button className="mini-btn" onClick={() => setViewItem(item)}>View</button>
                        {tab === 'unassigned' && (
                          <button className="mini-btn primary" onClick={() => setAssignItem(item)}>Assign</button>
                        )}
                        {tab === 'assigned' && (
                          <button className="mini-btn" onClick={() => handleRelease(item)} disabled={busy}>
                            {busy ? 'Releasing...' : 'Release'}
                          </button>
                        )}
                        {tab === 'unavailable' && (
                          <button className="mini-btn" onClick={() => handleMarkAvailable(item)} disabled={busy}>
                            {busy ? 'Saving...' : 'Mark Available'}
                          </button>
                        )}
                        <button className="mini-btn danger" onClick={() => handleDelete(item)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AddSimModal key={addKey} open={addOpen} onClose={() => setAddOpen(false)} onSaved={addInventoryItem} />
      <AssignSimModal open={!!assignItem} item={assignItem} onClose={() => setAssignItem(null)} onSaved={assignInventoryItem} />
      <InventoryDetails item={viewItem} onClose={() => setViewItem(null)} />
    </div>
  );
}

import { useMemo, useState, useEffect } from 'react';
import { useSim } from './store';
import { Icon } from './components';
import { daysLeft, formatDate, dayLabel, dayClass } from './helpers';
import { toast } from './Toast';

export const INVENTORY_STATUSES = ['Available', 'Assigned', 'Expired', 'Lost', 'Damaged', 'Inactive'];
const SIM_TYPES = ['Standard', 'Micro', 'Nano', 'eSIM', 'Other'];

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
  const [form, setForm] = useState({ sim_number: '', sim_type: 'Standard', provider: '', location: '', status: 'Available' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.sim_number || !String(form.sim_number).trim()) {
      toast('SIM Number is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSaved({ ...form, sim_number: form.sim_number.trim() });
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
              <label>SIM Number *</label>
              <input value={form.sim_number} onChange={(e) => set('sim_number', e.target.value)} />
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

function AssignSimModal({ open, item, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    mobile_id: item?.mobile_id || '',
    device: item?.device || '',
    imei: item?.imei || '',
    team: item?.team || '',
    assignment_date: new Date().toISOString().slice(0, 10),
  }));
  const [saving, setSaving] = useState(false);

  if (!open || !item) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.mobile_id || !String(form.mobile_id).trim()) {
      toast('Mobile ID No. is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSaved(item.id, form);
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
              <label>SIM Number</label>
              <input value={item.sim_number} disabled />
            </div>
            <div className="form-row">
              <label>Mobile ID No. *</label>
              <input value={form.mobile_id} onChange={(e) => set('mobile_id', e.target.value)} placeholder="e.g. Android 1" />
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
            <Item k="SIM Number" v={item.sim_number} />
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
  const { inventory, refreshInventory, addInventoryItem, assignInventoryItem, deleteInventoryItem } = useSim();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [provider, setProvider] = useState('All');
  const [team, setTeam] = useState('All');
  const [simType, setSimType] = useState('All');
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [assignItem, setAssignItem] = useState(null);
  const [viewItem, setViewItem] = useState(null);

  const openAdd = () => { setAddKey((k) => k + 1); setAddOpen(true); };

  useEffect(() => { refreshInventory(); /* eslint-disable-next-line */ }, []);

  const total = inventory.length;
  const available = inventory.filter((i) => i.status === 'Available').length;
  const assigned = inventory.filter((i) => i.status === 'Assigned').length;
  const expired = inventory.filter((i) => i.status === 'Expired').length;
  const lostDamaged = inventory.filter((i) => i.status === 'Lost' || i.status === 'Damaged').length;

  const providers = useMemo(() => [...new Set(inventory.map((i) => i.provider).filter(Boolean))].sort(), [inventory]);
  const teams = useMemo(() => [...new Set(inventory.map((i) => i.team).filter(Boolean))].sort(), [inventory]);

  const filtered = useMemo(() => {
    let list = inventory;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((i) =>
        (i.sim_number || '').toLowerCase().includes(s) ||
        (i.mobile_id || '').toLowerCase().includes(s) ||
        (i.imei || '').toLowerCase().includes(s) ||
        (i.device || '').toLowerCase().includes(s)
      );
    }
    if (status !== 'All') list = list.filter((i) => i.status === status);
    if (provider !== 'All') list = list.filter((i) => i.provider === provider);
    if (team !== 'All') list = list.filter((i) => i.team === team);
    if (simType !== 'All') list = list.filter((i) => i.sim_type === simType);
    return list;
  }, [inventory, search, status, provider, team, simType]);

  const availableList = useMemo(() => inventory.filter((i) => i.status === 'Available'), [inventory]);

  const clearFilters = () => { setSearch(''); setStatus('All'); setProvider('All'); setTeam('All'); setSimType('All'); };

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
            <input className="sim-input search-input" placeholder="Search SIM number, Mobile ID, IMEI..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="sim-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['All', ...INVENTORY_STATUSES].map((s) => <option key={s}>{s}</option>)}
          </select>
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
            <div className="big">No SIM Inventory Available</div>
            <div className="small">Add SIM cards to your inventory to track available, assigned and expired SIMs.</div>
            <button className="sim-btn primary" onClick={openAdd}>+ Add SIM</button>
          </div>
        ) : (
          <>
            <div className="tb">
              <h3>All Inventory SIMs</h3>
              <span className="ln">Showing {filtered.length} of {inventory.length}</span>
            </div>
            <div className="stock-cards">
              {filtered.map((item) => {
                const dl = daysFor(item);
                return (
                  <div className="stock-card" key={item.id}>
                    <div className="sc-head">
                      <span className="sc-num">{item.sim_number || '—'}</span>
                      <span className={`pill ${pillForInv(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="sc-body">
                      <div className="sc-field"><span className="sc-k">Mobile ID</span><span className="sc-v">{item.mobile_id || '—'}</span></div>
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
                      {item.status !== 'Available' && <button className="mini-btn" onClick={() => setAssignItem(item)}>Assign</button>}
                      <button className="mini-btn danger" onClick={() => handleDelete(item)}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="tb" style={{ borderTop: '1px solid var(--sim-line)' }}>
              <h3>Available in Stock</h3>
              <span className="ln">{availableList.length} ready to assign</span>
            </div>
            {availableList.length === 0 ? (
              <div className="sim-box empty-state" style={{ border: 'none', boxShadow: 'none' }}>
                <div className="big">No Available SIMs</div>
                <div className="small">All SIMs are assigned or unavailable.</div>
              </div>
            ) : (
              <div className="stock-cards">
                {availableList.map((item) => (
                  <div className="stock-card" key={item.id}>
                    <div className="sc-head">
                      <span className="sc-num">{item.sim_number || '—'}</span>
                      <span className={`pill ${pillForInv(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="sc-body">
                      <div className="sc-field"><span className="sc-k">Type</span><span className="sc-tag">{item.sim_type || '—'}</span></div>
                      <div className="sc-field"><span className="sc-k">Provider</span><span className="sc-v">{item.provider || '—'}</span></div>
                      <div className="sc-field"><span className="sc-k">Location</span><span className="sc-v">{item.location || '—'}</span></div>
                    </div>
                    <div className="sc-actions">
                      <button className="sim-btn primary" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} onClick={() => setAssignItem(item)}>Assign</button>
                    </div>
                  </div>
                ))}
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

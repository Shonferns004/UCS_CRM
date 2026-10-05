import { useMemo, useState, useEffect } from 'react';
import { useSim } from './store';
import { Icon } from './components';
import { daysLeft, formatDate, dayLabel, dayClass, autoExpiryDate, SIM_VALIDITY_DAYS, simBrandOf, pillForStatus, simNumbersOf } from './helpers';
import { toast } from '../../../components/Toast';
import { ConfirmDialog } from './ImportModal';

export const INVENTORY_STATUSES = ['Available', 'Assigned', 'Expired', 'Lost', 'Damaged', 'Inactive'];
const SIM_TYPES = ['Standard', 'Micro', 'Nano', 'eSIM', 'Other'];

/* Order the Mobile ID picker groups the phones in. Nokia first because a SIM
   going into a UFS handset is the common case in the Locker. */
const PHONE_SECTIONS = ['Nokia', 'Android', 'Other'];
const PHONE_SECTION_CAP = 40;

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

/* Days left for a Locker row. The expiry date is the fact, days_left only a
   snapshot taken when the row was last written - so a SIM whose date has passed
   still reads "8 days" until someone touches it. The date therefore wins, and
   the stored number is the fallback for rows that carry no date at all. */
function daysFor(item) {
  const d = daysLeft(item.expiry_date);
  if (d !== null) return d;
  return item.days_left !== undefined && item.days_left !== null ? item.days_left : null;
}

/* The expiry verdict for a Locker row, using the same thresholds as the
   backend's computeExpiry: more than 30 days is Active, 0-30 is Expiring
   Soon, a past date is Expired, no date at all gives nothing to show.
   Shown next to the Locker's own status word so an Assigned SIM also reads
   Active instead of leaving the reader to guess. */
function expiryStatusFor(item) {
  const dl = daysFor(item);
  if (dl === null || dl === undefined || Number.isNaN(dl)) return null;
  if (dl < 0) return 'Expired';
  if (dl <= 30) return 'Expiring Soon';
  return 'Active';
}

function AddSimModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ sim_name: '', sim_number: '', owner_name: '', sim_type: 'Standard', issue_date: '', status: 'Available' });
  const [customExpiry, setCustomExpiry] = useState(false);
  const [customExpiryDate, setCustomExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  /* Expiry is the issue date plus the SIM validity window by default, so the Add
     form and the server always agree on the same date. A SIM that does not follow
     the standard 28 day window (a custom recharge, a validity that was extended)
     needs its own date, which is what the manual option is for. Clearing the
     manual box falls back to the automatic date rather than leaving no expiry. */
  const autoExpiry = autoExpiryDate(form.issue_date);
  const expiry = customExpiry && customExpiryDate ? customExpiryDate : autoExpiry;
  const dl = daysLeft(expiry);

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
      /* Fields are listed explicitly rather than spread from `form`: the Owner
         Name input is called owner_name but is stored in the assigned_to column,
         and a `...form` spread sent owner_name as well, which the server passed
         straight to Postgres - so every Add failed with
         'column "owner_name" of relation "sim_inventory" does not exist'. */
      await onSaved({
        sim_name: form.sim_name.trim(),
        sim_number: form.sim_number.trim(),
        assigned_to: String(form.owner_name || '').trim() || null,
        sim_type: form.sim_type,
        status: form.status,
        issue_date: form.issue_date || null,
        expiry_date: expiry,
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
              <label>SIM Card Issue Date</label>
              <input type="date" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
            </div>
            <div className="sim-manual-toggle">
              <label>
                <input type="checkbox" checked={customExpiry} onChange={(e) => setCustomExpiry(e.target.checked)} />
                Enter expiry date manually
              </label>
            </div>
            <div className={`form-row${customExpiry ? '' : ' locked'}`}>
              <label>Auto Expiry Date {!customExpiry && <span className="auto-tag">auto</span>}</label>
              {customExpiry ? (
                <input type="date" value={customExpiryDate} onChange={(e) => setCustomExpiryDate(e.target.value)} />
              ) : (
                <input value={autoExpiry || '—'} disabled readOnly />
              )}
            </div>
            <div className="form-row locked">
              <label>SIM Expiry Days Left <span className="auto-tag">auto</span></label>
              <input value={dl === null ? '—' : dayLabel(dl)} disabled readOnly />
            </div>
            <div className="form-row">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {INVENTORY_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="ln" style={{ marginTop: 10, fontSize: 12 }}>
            Expiry is set automatically {SIM_VALIDITY_DAYS} days after the issue date, and the days left count down from it. Tick the box to use a different expiry date.
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

/* Warning text for handing a SIM to a phone that already carries one. The
   numbers come from the phone's own card plus, for Android, its
   "android whatsapp N" card (the row the table shows them on), plus any other
   Locker SIM already linked to the same phone - the SIM being assigned is
   excluded. Expiry is the earliest date among the rows that hold a number.
   Returns null when the phone is empty, so nothing is shown in that case. */
function existingSimNotice(cards, inventory, currentItemId, mobileId) {
  const mid = String(mobileId || '').trim().toLowerCase();
  if (!mid) return null;

  const rows = [];
  (cards || []).forEach((c) => {
    const id = String(c.mobile_id || '').trim().toLowerCase();
    if (!id) return;
    if (id === mid) { rows.push(c); return; }
    const wa = id.match(/^android whatsapp\s+(\d+)$/);
    if (wa && `android ${wa[1]}` === mid) rows.push(c);
  });

  const numbers = [];
  const seen = new Set();
  const add = (n) => { const v = String(n || '').trim(); if (v && !seen.has(v)) { seen.add(v); numbers.push(v); } };
  rows.forEach((r) => simNumbersOf(r).forEach((s) => add(s.number)));

  let dl = null;
  rows.forEach((r) => {
    if (!simNumbersOf(r).length) return;
    const d = r.expiry_date ? daysLeft(r.expiry_date) : (r.days_left !== undefined && r.days_left !== null ? r.days_left : null);
    if (d !== null && d !== undefined && (dl === null || d < dl)) dl = d;
  });

  (inventory || []).forEach((it) => {
    if (currentItemId && it.id === currentItemId) return;
    if (String(it.mobile_id || '').trim().toLowerCase() !== mid) return;
    const n = String(it.sim_number || '').trim();
    if (!n) return;
    add(n);
    const d = daysFor(it);
    if (d !== null && d !== undefined && (dl === null || d < dl)) dl = d;
  });

  if (numbers.length === 0) return null;

  const shown = numbers.slice(0, 2).join(', ') + (numbers.length > 2 ? ` +${numbers.length - 2} more` : '');
  const phone = String(mobileId).trim();
  const base = `Phone ${phone} already has a SIM (${shown})`;
  if (dl !== null && dl < 0) return `${base} that expired ${Math.abs(dl)} day(s) ago - the new SIM can be used now.`;
  if (dl === 0) return `${base} expiring today - this new SIM is for use after the current one expires.`;
  if (dl !== null) return `${base} - ${dl} day(s) left before expiry. This new SIM is for use after the current one expires.`;
  return `${base}. This new SIM is for use after the current one expires.`;
}

export function AssignSimModal({ open, item, onClose, onSaved }) {
  const { cards, inventory } = useSim();
  const [form, setForm] = useState(() => ({
    mobile_id: item?.mobile_id || '',
    device: item?.device || '',
    imei: item?.imei || '',
    team: item?.team || '',
    assignment_date: new Date().toISOString().slice(0, 10),
  }));
  const [phoneSearch, setPhoneSearch] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneBrand, setPhoneBrand] = useState('');
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

  /* Phones are split into Nokia and Android lists rather than left in one
     alphabetical run: "android 1" sorts before "UFS 1", so a single capped list
     filled up with Android phones and the Nokia ones never appeared at all.
     An empty phoneBrand means "show both", which is the default. */
  const brandCounts = useMemo(() => {
    const counts = { Nokia: 0, Android: 0, Other: 0 };
    phones.forEach((p) => { const b = simBrandOf(p.mobile_id); counts[b || 'Other'] += 1; });
    return counts;
  }, [phones]);

  const phoneSections = useMemo(() => {
    const s = phoneSearch.trim().toLowerCase();
    const matches = (p) => p.mobile_id.toLowerCase().includes(s) || (p.device_model || '').toLowerCase().includes(s);
    const inBrand = (p) => (phoneBrand === 'Other' ? !simBrandOf(p.mobile_id) : simBrandOf(p.mobile_id) === phoneBrand);
    const pool = phones.filter((p) => (!s || matches(p)) && (!phoneBrand || inBrand(p)));
    const groups = {
      Android: pool.filter((p) => simBrandOf(p.mobile_id) === 'Android'),
      Nokia: pool.filter((p) => simBrandOf(p.mobile_id) === 'Nokia'),
    };
    /* Anything that is neither pattern still has to be selectable, since
       handleSave only accepts a mobile_id that is in the full phone list. */
    groups.Other = pool.filter((p) => !simBrandOf(p.mobile_id));
    return groups;
  }, [phones, phoneSearch, phoneBrand]);

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
    setPhoneBrand(simBrandOf(p.mobile_id) || 'Other');
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
      /* A phone that already carries a SIM gets a heads-up before the save -
         it never blocks, the new SIM is simply meant for use after the
         current one ends. */
      const notice = existingSimNotice(cards, inventory, item.id, mid);
      if (notice) toast(notice, 'info', 9000);
      const res = await onSaved(item.id, { ...form, mobile_id: mid });
      /* The endpoint reports when the number could not be mirrored onto the
         mobile's row in All SIM Cards (no matching row / no free slot). */
      if (res && res.warning) toast(res.warning, 'error', 7000);
      else toast('SIM assigned', 'success');
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
                  <div className="locker-brand-toggle" role="group" aria-label="Phone brand">
                    {PHONE_SECTIONS.filter((n) => brandCounts[n] > 0).map((name) => (
                      <button
                        type="button"
                        key={name}
                        className={`lb-brand b-${name.toLowerCase()}${phoneBrand === name ? ' is-on' : ''}`}
                        onClick={() => setPhoneBrand((v) => (v === name ? '' : name))}
                      >
                        {name === 'Other' ? 'Other' : name}
                        <span className="lb-brand-n">{brandCounts[name]}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    value={phoneOpen ? phoneSearch : form.mobile_id}
                    onChange={(e) => { setPhoneOpen(true); setPhoneSearch(e.target.value); }}
                    onFocus={() => { setPhoneOpen(true); setPhoneSearch(''); }}
                    onBlur={() => setTimeout(() => setPhoneOpen(false), 150)}
                    placeholder={phoneBrand
                      ? `Search ${phoneBrand === 'Other' ? 'other' : phoneBrand} phones by Mobile ID or model`
                      : 'Pick a brand, then search by Mobile ID or model'}
                  />
                  {phoneOpen && (
                    <div className="locker-picker-menu">
                      {PHONE_SECTIONS.every((name) => phoneSections[name].length === 0) ? (
                        <div className="locker-picker-none">No matching phone</div>
                      ) : (
                        PHONE_SECTIONS.map((name) => {
                          const list = phoneSections[name];
                          if (list.length === 0) return null;
                          const shown = list.slice(0, PHONE_SECTION_CAP);
                          return (
                            <div className="locker-picker-sec" key={name}>
                              <div className={`locker-picker-sechead b-${name.toLowerCase()}`}>
                                <span>{name} Phones</span>
                                <span className="lp-count">{list.length}</span>
                              </div>
                              {shown.map((p) => (
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
                              ))}
                              {list.length > shown.length && (
                                <div className="locker-picker-none">
                                  Showing {shown.length} of {list.length} — search to narrow it down
                                </div>
                              )}
                            </div>
                          );
                        })
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
            <Item
              k="Status"
              v={(() => {
                const expiry = expiryStatusFor(item);
                return (
                  <>
                    <span className={`pill ${pillForInv(item.status)}`}>{item.status}</span>
                    {expiry && expiry !== item.status ? <span className={`pill ${pillForStatus(expiry)}`}>{expiry}</span> : null}
                  </>
                );
              })()}
            />
            <Item k="Location" v={item.location} />
            <Item k="SIM Card Issue Date" v={formatDate(item.issue_date)} />
            <Item k="Auto Expiry Date" v={formatDate(item.expiry_date)} />
            <Item k="SIM Expiry Days Left" v={dayLabel(dl)} />
          </div>
          {/* The tabs bucket a SIM by its mobile_id, not by the stored status
              word (see the note in the row loop above), so the Assignment block
              follows the same rule - a SIM linked to a phone must show its
              phone even when an older backend left the status as "Available". */}
          {(item.mobile_id || item.status === 'Assigned') && (
            <>
              <div className="section-title" style={{ margin: '18px 0 10px', fontSize: 13 }}>Assignment</div>
              <div className="detail-grid">
                <Item k="Mobile ID No." v={item.mobile_id} />
                <Item k="Device" v={item.device} />
                <Item k="IMEI No." v={item.imei} />
                <Item k="Team" v={item.team} />
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

  // Pending destructive action awaiting confirmation, replacing window.confirm():
  // { action: 'release' | 'delete', item, busy }
  const [pending, setPending] = useState(null);

  async function runPending() {
    if (!pending || pending.busy) return;
    const { action, item } = pending;
    setPending((p) => ({ ...p, busy: true }));
    try {
      if (action === 'release') {
        await releaseInventoryItem(item);
        toast('SIM released back to locker', 'success');
      } else {
        await deleteInventoryItem(item.id);
        toast('SIM removed from inventory', 'success');
      }
      setPending(null);
    } catch (e) {
      toast(e.message || (action === 'release' ? 'Release failed' : 'Delete failed'), 'error');
      setPending((p) => ({ ...p, busy: false }));
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

  const handleRelease = (item) => setPending({ action: 'release', item });

  const handleDelete = (item) => setPending({ action: 'delete', item });

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
                  /* The Locker word (Assigned / Available / ...) and the expiry
                     verdict are separate facts - show both, skipping the second
                     when it would just repeat the first. */
                  const expiry = expiryStatusFor(item);
                  const showExpiry = expiry && expiry !== item.status;
                  return (
                    <div className="stock-card" key={item.id}>
                      <div className="sc-head">
                        <span className="sc-num">{item.sim_name || item.sim_number || '—'}</span>
                        <span className={`pill ${pillForInv(item.status)}`}>{item.status}</span>
                        {showExpiry ? <span className={`pill ${pillForStatus(expiry)}`}>{expiry}</span> : null}
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
                        <div className="sc-field"><span className="sc-k">SIM Card Issue Date</span><span className="sc-v">{formatDate(item.issue_date)}</span></div>
                        <div className="sc-field"><span className="sc-k">Auto Expiry Date</span><span className="sc-v">{formatDate(item.expiry_date)}</span></div>
                        <div className="sc-field"><span className="sc-k">SIM Expiry Days Left</span><span className={`sc-v ${dayClass(dl)}`}>{dayLabel(dl)}</span></div>
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
      <InventoryDetails
        item={viewItem && (inventory.find((i) => i.id === viewItem.id) || viewItem)}
        onClose={() => setViewItem(null)}
      />

      <ConfirmDialog
        open={!!pending}
        busy={!!pending?.busy}
        variant={pending?.action === 'release' ? 'primary' : 'danger'}
        title={pending?.action === 'release' ? 'Release SIM?' : 'Delete SIM?'}
        message={pending?.action === 'release'
          ? <>Release <strong>&ldquo;{pending?.item?.sim_number || 'this SIM'}&rdquo;</strong> back to the locker? It becomes Available again for assignment.</>
          : <>Delete <strong>&ldquo;{pending?.item?.sim_number || 'this SIM'}&rdquo;</strong> from inventory? This action cannot be undone.</>}
        confirmLabel={pending?.action === 'release' ? 'Release' : 'Delete'}
        busyLabel={pending?.action === 'release' ? 'Releasing...' : 'Deleting...'}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

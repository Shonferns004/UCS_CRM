import { Fragment, useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { MoreHorizontal, Plus, Eye, PencilLine, RefreshCw, History, Trash2 } from 'lucide-react';
import { useSim } from './store';
import { Icon } from './components';
import { mobileExpiryStatus, dayClass, formatDate, pillForStatus, SIM_STATUSES, SIM_TYPES, liveDaysLeft, isPlaceholder } from './helpers';
import { bulkChangeStatus, bulkDelete } from './api';
import { toast } from '../../../components/Toast';
import { ConfirmDialog } from './ImportModal';

const STATUS_FILTERS = ['All', 'Assigned', 'Active', 'Expiring Soon', 'Expired', 'Replaced', 'Inactive', 'No Sim'];
const EXPIRY_FILTERS = ['All', 'Expired', 'Within 5 Days', 'Within 28 Days', 'More than 28 Days'];
const SIM_NAME_FILTERS = ['Android', 'Nokia'];
const WHATSAPP_NAME_FILTERS = ['All', 'BSCT', 'MANN', 'AFLF'];
const OWNER_UFS = ['UFS 1', 'UFS 2', 'UFS 3', 'UFS 4', 'UFS 5', 'Locker'];
const normOwner = (v) => String(v || '').toLowerCase().replace(/\s+/g, '');
const POSTPAID_SIMS = ['7039006200','7039006300','7039006400','7738901891','8828720806','8879034034','8879035035','8879136654','8879136934','8879136938','9820641314','9820644749','9820645607','9820646225','9820648405','9892268000','9892990029','9920893993','9930028200','9930028300','9930028400','9930064928','9930084397','9930852952','9967699295','9987344338'];
const PREPAID_SIMS = ['9321452580'];
const numTypeOf = (v) => { const n = String(v || '').trim(); if (POSTPAID_SIMS.includes(n)) return 'POSTPAID'; if (PREPAID_SIMS.includes(n)) return 'PREPAID'; return null; };
const rowSimType = (c) => { for (let i = 1; i <= 20; i++) { const t = numTypeOf(c[`sim_${i}`]); if (t) return t; } return null; };
const SORTABLE = ['mobile_id', 'calling_mobile', 'device_model', 'imei', 'status', 'use_for', 'team_leader_name', 'user_name', 'team', 'signature', 'remark', 'issue_date', 'expiry_date', 'days_left', 'sim_1', 'sim_2', 'replacement_count'];

const COLUMNS = [
  { key: 'mobile_id', label: 'Mobile ID No.' },
  { key: 'device_model', label: 'Device & Model Name' },
  { key: 'imei', label: 'IMEI No.' },
  { key: 'status', label: 'Status' },
  { key: 'team', label: 'Team' },
  { key: 'w1_name', label: 'NGO' },
  { key: 'sim_1', label: 'W1 Number' },
  { key: 'w2_name', label: 'NGO' },
  { key: 'sim_2', label: 'W2 Number' },
  { key: 'w3_name', label: 'NGO' },
  { key: 'sim_3', label: 'W3 Number' },
  { key: 'w4_name', label: 'NGO' },
  { key: 'sim_4', label: 'W4 Number' },
];

const NOKIA_COLUMNS = [
  { key: 'mobile_id', label: 'Mobile ID No.' },
  { key: 'calling_mobile', label: 'Calling Mobile' },
  { key: 'device_model', label: 'Device & Model Name' },
  { key: 'imei', label: 'IMEI No.' },
  { key: 'status', label: 'Sim Card Status' },
  { key: 'team', label: 'Team' },
  { key: 'owner', label: 'Owner' },
  { key: 'remark', label: 'Remark' },
  { key: 'issue_date', label: 'Sim Card Issue Date' },
  { key: 'expiry_date', label: 'Auto Expiry Date' },
  { key: 'days_left', label: 'Sim Expiry Days Left', num: true },
  { key: 'sim_1', label: 'Sim 1' },
  { key: 'sim_2', label: 'Sim 2' },
  { key: 'replacement_count', label: 'Sim Card Repla. Count', num: true },
];

export default function Inventory({ onAdd, onView, onEdit, onReplace, onDelete, onHistory, simName: simNameProp, onSimNameChange }) {
  const { cards, refresh, inventory, refreshInventory } = useSim();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [owner, setOwner] = useState('All');
  const [remark, setRemark] = useState('All');
  const [team, setTeam] = useState('All');
  const [simType, setSimType] = useState('All');
  const [device, setDevice] = useState('All');
  const [simNameLocal, setSimNameState] = useState('All');
const simName = simNameProp || simNameLocal;
const setSimName = (v) => { setSimNameState(v); if (onSimNameChange) onSimNameChange(v); };
useEffect(() => { if (simNameProp !== undefined) setSimNameState(simNameProp); }, [simNameProp]);
  /* The status verdict joins the Locker (an assigned SIM's own expiry decides
     whether the phone reads Active or Expired), so its list is loaded here even
     when the SIM Inventory page was never opened. */
  useEffect(() => { refreshInventory(); /* eslint-disable-next-line */ }, []);
  const [waName, setWaName] = useState('All');
  const [expiry, setExpiry] = useState('All');
  const [sortKey, setSortKey] = useState('mobile_id');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState({});
  const [showActions, setShowActions] = useState(null);
  const kebabRef = useRef(null);
  const menuRef = useRef(null);

  // The table sits inside overflow:auto / overflow:hidden boxes, so a normally
  // positioned menu gets clipped - on the lower rows it ran off the bottom of
  // the card and the last items were cut off. position:fixed escapes all of
  // them, which means the coordinates have to be worked out here: below the
  // button when there is room, above it when there is not, always inside the
  // viewport, and re-placed if the page scrolls while it is open.
  useLayoutEffect(() => {
    if (showActions === null) return undefined;
    const btn = kebabRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return undefined;
    const place = () => {
      const b = btn.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const GAP = 6;
      const PAD = 8;
      const roomBelow = window.innerHeight - b.bottom - GAP - PAD;
      const roomAbove = b.top - GAP - PAD;
      let top;
      if (m.height <= roomBelow) top = b.bottom + GAP;
      else if (m.height <= roomAbove) top = b.top - GAP - m.height;
      else top = Math.max(PAD, Math.min(b.bottom + GAP, window.innerHeight - PAD - m.height));
      // Right-aligned with the button, which keeps it on screen in the last column.
      const left = Math.max(PAD, Math.min(b.right - m.width, window.innerWidth - PAD - m.width));
      menu.style.top = `${Math.round(top)}px`;
      menu.style.left = `${Math.round(left)}px`;
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [showActions]);

  // The menu is no longer inside the cell, so clicking elsewhere has to close it.
  useEffect(() => {
    if (showActions === null) return undefined;
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (kebabRef.current && kebabRef.current.contains(e.target)) return;
      setShowActions(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setShowActions(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showActions]);

  const whatsappMerge = useMemo(() => {
    const map = {};
    cards.forEach((c) => {
      const m = String(c.mobile_id || '').match(/^android whatsapp\s+(\d+)/i);
      if (m) map[m[1]] = c;
    });
    return map;
  }, [cards]);

  /* A SIM assigned in the Locker lives in sim_inventory, while this table
     reads sim_cards - two different tables, so the mobile's own status word
     never changes when a SIM is handed to it. The two are joined on
     mobile_id here, which is the same rule the Locker tabs use, so All SIM
     Cards can show "Assigned" for a mobile that currently carries a locker
     SIM. The WhatsApp alias matters because the backend links Android
     phones through their "android whatsapp N" card. */
  const lockerByMobile = useMemo(() => {
    const map = {};
    (inventory || []).forEach((it) => {
      const id = String(it.mobile_id || '').trim().toLowerCase();
      if (!id) return;
      map[id] = it;
      const wa = id.match(/^android whatsapp\s+(\d+)$/);
      if (wa) map[`android ${wa[1]}`] = it;
    });
    return map;
  }, [inventory]);

  const enriched = useMemo(() => cards.map((c) => {
    const merged = { ...c };
    const mm = String(c.mobile_id || '').match(/^android\s+(\d+)$/i);
      if (mm && (c.mobile_id || '').toLowerCase().startsWith('android ') && !(c.mobile_id || '').toLowerCase().startsWith('android whatsapp')) {
        const w = whatsappMerge[mm[1]];
        if (w) {
          /* The WhatsApp card carries the real numbers for slots 1-4, but a
             SIM assigned from the Locker can land in the phone's own row - so
             the phone's value shows whenever WhatsApp has nothing there,
             instead of being hidden behind a placeholder. */
          for (let n = 1; n <= 4; n++) {
            const fromW = w[`sim_${n}`];
            const own = c[`sim_${n}`];
            merged[`w${n}_name`] = w[`w${n}_name`];
            merged[`sim_${n}`] = isPlaceholder(fromW) && !isPlaceholder(own) ? own : fromW;
          }
          /* Slots past W4 carry SIMs assigned from the Locker, which the backend
             writes to the WhatsApp card for Android phones - without copying them
             here they would stay invisible on the phone's row. The phone's own
             value is the fallback for slots that were filled by hand. */
          for (let n = 5; n <= 8; n++) {
            merged[`sim_${n}`] = w[`sim_${n}`] ?? c[`sim_${n}`] ?? null;
          }
        }
      }
    const locker = lockerByMobile[String(c.mobile_id || '').trim().toLowerCase()] || null;
    return {
      ...merged,
      days_left: liveDaysLeft(merged),
      /* Verdict, not the stored status word: a phone whose SIMs have all run
         out reads Expired here even though the import still says "Active". */
      _status: mobileExpiryStatus(merged, inventory),
      _assigned: !!locker,
      _assignedLocker: locker,
    };
  }), [cards, whatsappMerge, lockerByMobile, inventory]);

  /* Two separate facts live side by side: whether a locker SIM sits in this
     mobile (Assigned) and whether the phone still carries a valid SIM
     (Active / Expiring Soon / Expired). The cell shows both, and the filter
     answers either question, so an assigned-but-active row appears under
     "Assigned" as well as under "Active". */
  const expiryStatusOf = (c) => c._status;
  const statusOf = (c) => (c._assigned ? 'Assigned' : expiryStatusOf(c));

  const teams = useMemo(() => [...new Set(enriched.map((c) => c.team).filter(Boolean))].sort(), [enriched]);
  const devices = useMemo(() => [...new Set(enriched.map((c) => c.device_model).filter(Boolean))].sort(), [enriched]);
  const remarkOf = (c) => (simName === 'Nokia' ? (c.remark ?? '') : (c.signature ?? '')).toString().trim();
  const remarks = useMemo(() => [...new Set(enriched.map(remarkOf).filter(Boolean))].sort(), [enriched, simName]);
  const nokiaStatuses = useMemo(() => {
    const set = new Set();
    enriched.forEach((c) => {
      if (!(c.mobile_id || '').toLowerCase().startsWith('ufrs')) return;
      /* The options are the verdicts the rows actually render - the stored
         word is what the import said, not what the phone still is. */
      if (c._status) set.add(c._status);
      /* "Assigned" comes from the Locker, so it has to be offered explicitly
         or the row could never be filtered by it. */
      if (c._assigned) set.add('Assigned');
    });
    return [...set].sort();
  }, [enriched]);

  useEffect(() => { setPage(1); }, [search, status, owner, remark, team, device, simName, waName, expiry]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((c) => {
        const simHit = Array.from({ length: 20 }, (_, i) => c[`sim_${i + 1}`]).some((v) => String(v || '').trim().toLowerCase().includes(s));
        return (c.mobile_id || '').toLowerCase().includes(s) ||
          (c.device_model || '').toLowerCase().includes(s) ||
          (c.imei || '').toLowerCase().includes(s) ||
          simHit;
      });
    }
    if (status !== 'All') {
      list = list.filter((c) => (status === 'Assigned' ? !!c._assigned : expiryStatusOf(c) === status));
    }
    if (owner !== 'All') list = list.filter((c) => normOwner(c.team) === normOwner(owner));
    if (remark !== 'All') list = list.filter((c) => remarkOf(c) === remark);
    if (team !== 'All') list = list.filter((c) => c.team === team);
    if (simType !== 'All') list = list.filter((c) => {
      const t = (c.sim_type || '').trim() || rowSimType(c) || '';
      return t.toLowerCase() === simType.toLowerCase();
    });
    if (device !== 'All') list = list.filter((c) => c.device_model === device);
    if (simName === 'Nokia') {
      list = list.filter((c) => (c.mobile_id || '').toLowerCase().startsWith('ufrs'));
    } else if (simName === 'Android') {
      list = list.filter((c) => {
        const id = (c.mobile_id || '').toLowerCase();
        return id.startsWith('android ') && !id.startsWith('android whatsapp');
      });
    } else if (simName === 'All') {
      list = list.filter((c) => !(c.mobile_id || '').toLowerCase().startsWith('android whatsapp'));
    } else {
      list = list.filter((c) => (c.mobile_id || '').toLowerCase().startsWith(simName.toLowerCase()));
    }
    if (simName === 'Android' && waName !== 'All') {
      list = list.filter((c) =>
        [c.w1_name, c.w2_name, c.w3_name, c.w4_name].some((n) => String(n || '').trim().toUpperCase() === waName)
      );
    }
    if (expiry !== 'All') {
      list = list.filter((c) => {
        const d = c.days_left;
        if (expiry === 'Expired') return c._status === 'Expired';
        if (expiry === 'Within 5 Days') return d !== null && d >= 0 && d <= 5;
        if (expiry === 'Within 28 Days') return d !== null && d >= 0 && d <= 28;
        if (expiry === 'More than 28 Days') return d !== null && d > 28;
        return true;
      });
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        if (sortKey === 'mobile_id') {
          const numOf = (x) => { const m = String(x ?? '').match(/(\d+)\s*$/); return m ? Number(m[1]) : Infinity; };
          const va = numOf(a.mobile_id), vb = numOf(b.mobile_id);
          return sortDir === 'asc' ? va - vb : vb - va;
        }
        let va = a[sortKey], vb = b[sortKey];
        if (sortKey === 'days_left') { va = va === null ? Infinity : va; vb = vb === null ? Infinity : vb; }
        if (sortKey === 'status') { va = statusOf(a); vb = statusOf(b); }
        if (sortKey === 'issue_date' || sortKey === 'expiry_date') { va = va || '9999-12-31'; vb = vb || '9999-12-31'; }
        if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
        va = String(va ?? '').toLowerCase(); vb = String(vb ?? '').toLowerCase();
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [enriched, search, status, owner, remark, team, simType, device, simName, waName, expiry, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * perPage;
  const pageRows = filtered.slice(start, start + perPage);
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const baseColumns = simName === 'Nokia' ? NOKIA_COLUMNS : COLUMNS;
  const baseMaxSlot = simName === 'Nokia' ? 2 : 4;
  /* Extra number columns: the fixed layouts stop at Sim 2 (Nokia) / W4
     (Android), so a SIM assigned from the Locker into sim_5..sim_8 would have
     nowhere to show up. A column is added only while some card actually uses
     that slot, which keeps the table exactly as it looks today until needed. */
  const extraColumns = useMemo(() => {
    const used = [];
    for (let n = baseMaxSlot + 1; n <= 8; n++) {
      if (enriched.some((c) => !isPlaceholder(c[`sim_${n}`]))) used.push(n);
    }
    return used.map((n) => ({ key: `sim_${n}`, label: `SIM ${n}` }));
  }, [enriched, baseMaxSlot]);
  const activeColumns = [...baseColumns, ...extraColumns];

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleSelect = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = () => {
    if (selectedCount === pageRows.length && selectedCount > 0) {
      const n = { ...selected }; pageRows.forEach((r) => delete n[r.id]); setSelected(n);
    } else {
      const n = { ...selected }; pageRows.forEach((r) => { n[r.id] = true; }); setSelected(n);
    }
  };
  const clearFilters = () => { setSearch(''); setStatus('All'); setOwner('All'); setRemark('All'); setTeam('All'); setSimType('All'); setDevice('All'); setSimName('All'); setWaName('All'); setExpiry('All'); setPage(1); };

  async function doBulkChange(statusVal) {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) return;
    try {
      await bulkChangeStatus(ids, statusVal);
      toast(`${ids.length} SIM card(s) updated`, 'success');
      setSelected({}); refresh();
    } catch (e) { toast(e.message || 'Failed', 'error'); }
  }

  // Pending bulk delete awaiting confirmation, replacing window.confirm():
  // { ids, busy }
  const [pending, setPending] = useState(null);

  const doBulkDelete = () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) return;
    setPending({ ids });
  };

  async function runPendingDelete() {
    if (!pending || pending.busy) return;
    setPending((p) => ({ ...p, busy: true }));
    try {
      await bulkDelete(pending.ids);
      toast(`${pending.ids.length} SIM card(s) deleted`, 'success');
      setSelected({});
      setPending(null);
      refresh();
    } catch (e) {
      toast(e.message || 'Failed to delete SIM cards', 'error');
      setPending((p) => ({ ...p, busy: false }));
    }
  }

  const handleDelete = (c) => {
    onDelete(c);
  };

  return (
    <div>
      <div className="toolbar">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 10, color: 'var(--sim-ink-soft)', display: 'flex' }}><Icon name="search" size={15} /></span>
          <input className="sim-input search-input" placeholder="Search Mobile ID, Device, IMEI..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        {simName === 'Android' && (
          <select className="sim-select" value={waName} onChange={(e) => setWaName(e.target.value)}>
            {WHATSAPP_NAME_FILTERS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        )}
        <select className="sim-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {(simName === 'Nokia' ? ['All', ...nokiaStatuses] : STATUS_FILTERS).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="sim-select" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="All">All Team</option>
          {OWNER_UFS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="sim-select" value={remark} onChange={(e) => setRemark(e.target.value)}>
          <option value="All">All Remarks</option>
          {remarks.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="sim-select" value={simType} onChange={(e) => setSimType(e.target.value)}>
          <option value="All">All SIM Types</option>
          {SIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="sim-select" value={device} onChange={(e) => setDevice(e.target.value)}>
          <option value="All">All Devices</option>
          {devices.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="sim-select" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
          {EXPIRY_FILTERS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="sim-btn ghost" onClick={clearFilters}>Clear Filters</button>
      </div>

      {selectedCount > 0 && (
        <div className="bulk-bar">
          <div style={{ fontSize: 13, fontWeight: 600 }}>Selected {selectedCount} SIM Cards</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="sim-btn" onClick={() => doBulkChange('Active')}>Mark Active</button>
            <button className="sim-btn" onClick={() => doBulkChange('Inactive')}>Mark Inactive</button>
            <button className="sim-btn danger" onClick={doBulkDelete}>Delete Selected</button>
            <button className="sim-btn ghost" onClick={() => setSelected({})}>Clear</button>
          </div>
        </div>
      )}

      <div className="sim-tabs" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {SIM_NAME_FILTERS.map((t) => (
          <button key={t} className={`sim-tab ${simName === t ? 'active' : ''}`} onClick={() => setSimName(t)}>{t}</button>
        ))}
      </div>

{filtered.length === 0 ? (
        <div className="sim-box empty-state">
          <div className="big">No SIM Cards Found</div>
          <div className="small">Adjust filters or add a new SIM card to get started.</div>
          <button className="sim-btn primary" onClick={onAdd}>+ Add SIM Card</button>
        </div>
      ) : (
        <div className="card-block">
          <div className="table-wrap">
            <table className="sim-table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <input type="checkbox" checked={selectedCount === pageRows.length && selectedCount > 0} onChange={toggleAll} />
                  </th>
                  {activeColumns.map((col) => {
                    const headN = simName === 'Android' && /^w[1-4]_name$/.test(col.key);
                    const headS = simName === 'Android' && /^sim_[1-4]$/.test(col.key);
                    const headPair = headN ? ' w-pair w-pair-n' : headS ? ' w-pair w-pair-s' : '';
                    return (
                      <Fragment key={col.key}>
                        <th className={(SORTABLE.includes(col.key) ? `sortable ${col.num ? 'num' : ''}` : (col.num ? 'num' : '')) + headPair} onClick={() => SORTABLE.includes(col.key) && toggleSort(col.key)}>
                          {col.label}
                          {col.key === sortKey && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                        </th>
                        {col.key === 'mobile_id' && simName === 'Android' && <th>GB</th>}
                      </Fragment>
                    );
                  })}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => (
                  <tr
                    key={c.id}
                    className={`clickable-row${selected[c.id] ? ' selected' : ''}`}
                    /* The whole row opens the detail drawer, so the mobile no
                       longer has to be hunted down through the kebab. Checkbox,
                       action buttons and the open kebab menu stay inert. */
                    onClick={(e) => {
                      if (e.target.closest('.check-cell, .actions-cell, .kebab-menu')) return
                      onView(c)
                    }}
                  >
                    <td className="check-cell"><input type="checkbox" checked={!!selected[c.id]} onChange={() => toggleSelect(c.id)} /></td>
                    {activeColumns.map((col) => {
                      const v = c[col.key];
                      switch (col.key) {
                        case 'mobile_id': {
                          // The id is what people click to see a mobile, so it
                          // gets its own hit area instead of only the kebab.
                          const idLink = c.mobile_id ? (
                            <button
                              type="button"
                              className="sim-id-link"
                              title={`View details of ${c.mobile_id}`}
                              onClick={() => onView(c)}
                            >{c.mobile_id}</button>
                          ) : '—';
                          return simName === 'Android' ? (
                            <Fragment key={col.key}>
                              <td style={{ fontWeight: 600 }}>{idLink}</td>
                              <td>{c.gb || '—'}</td>
                            </Fragment>
                          ) : <td key={col.key} style={{ fontWeight: 600 }}>{idLink}</td>;
                        }
                        case 'status': {
                          /* Assigned and the expiry verdict are shown together
                             (Nokia and Android alike) so an assigned SIM still
                             reads Active, Expiring Soon or Expired. */
                          const expiry = expiryStatusOf(c);
                          const assigned = !!c._assigned;
                          return (
                            <td key={col.key} className="status-cell">
                              {assigned && <span className="pill pill-assigned">Assigned</span>}
                              {expiry ? <span className={`pill ${pillForStatus(expiry)}`}>{expiry}</span> : null}
                            </td>
                          );
                        }
                        case 'issue_date':
                        case 'expiry_date':
                          return <td key={col.key}>{formatDate(v)}</td>;
                        case 'days_left':
                          return <td key={col.key} className={`days-cell num ${dayClass(c.days_left)}`}>{c.days_left === null || c.days_left === undefined || Number.isNaN(c.days_left) ? '—' : `${c.days_left} days`}</td>;
                        case 'replacement_count':
                          return <td key={col.key} className="num">{c.replacement_count || 0}</td>;
                        default:
                          const hl = simName === 'Android' && numTypeOf(v) === 'POSTPAID' ? ' postpaid-hl' : '';
                          let cellVal = v;
if (simName === 'Android' && waName !== 'All') {
                            const slotMatch = col.key.match(/^sim_(\d)$/);
                            const nameMatch = col.key.match(/^w(\d)_name$/);
                            const n = slotMatch ? slotMatch[1] : nameMatch ? nameMatch[1] : null;
                            if (n) {
                              const ngo = slotMatch ? String(c[`w${n}_name`] || '').trim().toUpperCase() : String(v || '').trim().toUpperCase();
                              if (ngo !== waName) cellVal = null;
                            }
                          }
                          const isNgoName = simName === 'Android' && /^w[1-4]_name$/.test(col.key);
                          const isSimSlot = simName === 'Android' && /^sim_[1-4]$/.test(col.key);
                          const pairCls = isNgoName ? ' w-pair w-pair-n' : isSimSlot ? ' w-pair w-pair-s' : '';
                          return <td key={col.key} className={hl + pairCls}>{cellVal || '—'}{isNgoName && cellVal ? ' →' : ''}</td>;
                      }
                    })}
                      <td className="actions-cell">
                        <div className="cell-actions">
                          <button className="mini-btn" onClick={() => { setShowActions(null); onEdit(c); }}>Edit</button>
                          <div className="kebab">
                            <button
                              className="mini-btn"
                              ref={showActions === c.id ? kebabRef : null}
                              aria-haspopup="true"
                              aria-expanded={showActions === c.id}
                              aria-label={`Actions for ${c.mobile_id || 'this SIM card'}`}
                              title="More actions"
                              onClick={() => setShowActions(showActions === c.id ? null : c.id)}
                            ><MoreHorizontal size={16} /></button>
                            {showActions === c.id && (
                              <div className="kebab-menu" ref={menuRef} style={{ top: 0, left: 0 }}>
                                {[
                                  ['Add', Plus, () => onAdd()],
                                  ['View', Eye, () => onView(c)],
                                  ['Edit', PencilLine, () => onEdit(c)],
                                  ['Replace', RefreshCw, () => onReplace(c)],
                                  ['History', History, () => onHistory && onHistory(c)],
                                  ['Delete', Trash2, () => handleDelete(c)],
                                ].map(([label, MenuIcon, fn]) => (
                                  <button key={label} className="kebab-item" style={{ color: label === 'Delete' ? 'var(--sim-red)' : 'inherit' }} onClick={() => { setShowActions(null); fn(); }}>
                                    <MenuIcon size={15} />
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--sim-ink-soft)' }}>
              <span>Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + perPage, filtered.length)} of {filtered.length} SIM Cards</span>
              <select className="sim-select" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} style={{ padding: '5px 8px' }}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} rows</option>)}
              </select>
            </div>
            <div className="pages">
              <button className="page-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
              {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
                let p = i + 1;
                if (pageCount > 7) {
                  const half = Math.floor(6 / 2);
                  const maxLeft = safePage - half;
                  const maxRight = safePage + half;
                  if (maxRight > pageCount) p = pageCount - 6 + i;
                  else if (maxLeft < 1) p = 1 + i;
                  else p = maxLeft + i;
                }
                return p >= 1 && p <= pageCount ? (
                  <button key={p} className={`page-btn ${p === safePage ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ) : null;
              })}
              <button className="page-btn" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>›</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        busy={!!pending?.busy}
        title="Delete SIM Cards?"
        message={<>Are you sure you want to delete <strong>{pending?.ids.length || 0} selected SIM card(s)</strong>? This action cannot be undone.</>}
        confirmLabel="Delete"
        busyLabel="Deleting..."
        onConfirm={runPendingDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { apiGet, getDataOverview } from '../api/auth';

const PER_STATION = 100;

const statusLabel = (s) => {
  const labels = {
    pending: 'Pending', contacted: 'Contacted', scheduled: 'Scheduled',
    callback: 'Callback', follow_up: 'Follow Up', busy: 'Busy',
    ringing: 'Ringing', call_waiting: 'Call Waiting', unreachable: 'Unreachable',
    switched_off: 'Switched Off', out_of_coverage: 'Out of Coverage',
    wrong_number: 'Wrong Number', invalid_number: 'Invalid', rejected: 'Rejected',
    temporary_network_issue: 'Temporary Network Issue', voicemail: 'Voicemail',
    lead_done: 'Lead Done', done: 'Done', visit_donate: 'Visit & Donate',
    will_donate_online: 'Will Donate Online', promise_to_pay: 'Promise to Pay',
    payment_pending: 'Payment Pending', already_donated: 'Already Donated',
    email_sent: 'Email Sent', whatsapp_sent: 'WhatsApp Sent', csr_inquiry: 'CSR Inquiry',
    wants_80g_details: 'Wants 80G Details', wants_trust_documents: 'Wants Trust Documents',
    not_interested: 'Not Interested', not_interested_now: 'Not Interested Now', dnd: 'DND',
    wrong_person: 'Wrong Person', call_disconnected: 'Call Disconnected',
    language_barrier: 'Language Barrier', transferred_senior: 'Transferred to Senior',
    query_complaint: 'Query/Complaint', receipt_request: 'Receipt Request',
    donation_collected: 'Donation Collected',
  };
  return labels[s] || s || '\u2014';
};

const statusPillClass = (s) => {
  if (!s) return 'pill pill-gray';
  if (['donation_collected', 'lead_done', 'done', 'already_donated', 'visit_donate', 'will_donate_online'].includes(s)) return 'pill pill-green';
  if (['pending', 'busy', 'ringing', 'call_waiting', 'unreachable', 'switched_off', 'out_of_coverage', 'wrong_number', 'invalid_number', 'rejected', 'temporary_network_issue', 'voicemail', 'not_interested', 'not_interested_now', 'dnd', 'wrong_person', 'call_disconnected', 'language_barrier'].includes(s)) return 'pill pill-red';
  if (['scheduled', 'callback', 'follow_up', 'promise_to_pay', 'payment_pending'].includes(s)) return 'pill pill-yellow';
  return 'pill pill-blue';
};

const fmtAmt = (n) => n != null && n !== '' ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '\u2014';

const sumSide = (side) => (side?.stations || []).reduce((a, s) => a + (s.count || 0), 0);
const sumFro = (fro) => sumSide(fro.new) + sumSide(fro.old);

function Chevron({ open }) {
  return <span style={{ display: 'inline-block', width: 14, textAlign: 'center', color: 'var(--ink-soft)', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>;
}

function DonorTable({ station }) {
  const rows = station.data || [];
  if (rows.length === 0) {
    return <div style={{ padding: '10px 14px', color: 'var(--ink-soft)', fontSize: 12 }}>No donor records.</div>;
  }
  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table style={{ fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg, #fff)', zIndex: 1 }}>
          <tr>
            <th>#</th>
            <th>Donor ID</th>
            <th>Name</th>
            <th>Mobile</th>
            <th>Amount</th>
            <th>City</th>
            <th>Status</th>
            <th>New?</th>
            <th>Assigned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={d.id || i}>
              <td style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{i + 1}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.donor_id ?? '\u2014'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.name || 'Unknown'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.mobile || '\u2014'}</td>
              <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmt(d.amount)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{d.city || '\u2014'}</td>
              <td><span className={statusPillClass(d.status)} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{statusLabel(d.status)}</span></td>
              <td style={{ textAlign: 'center' }}>{d.is_new ? <span style={{ color: '#16a34a', fontWeight: 700 }}>●</span> : <span style={{ color: 'var(--ink-soft)' }}>○</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.assigned_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {station.count > rows.length && (
        <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--ink-soft)', borderTop: '1px solid var(--line)' }}>
          Showing {rows.length} of {station.count} donors in this station.
        </div>
      )}
    </div>
  );
}

function StationRow({ station, open, onToggle }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: open ? 'var(--bg-soft, #f8fafc)' : 'transparent' }}>
        <Chevron open={open} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{station.stationName}</span>
        {station.stationId && <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>#{station.stationId}</span>}
        <span className="count" style={{ marginLeft: 'auto', fontSize: 11 }}>{station.count} donors</span>
      </div>
      {open && <DonorTable station={station} />}
    </div>
  );
}

function SideBlock({ title, side, accent }) {
  const [openStations, setOpenStations] = useState(new Set());
  const stations = side?.stations || [];
  const total = sumSide(side);
  const toggle = (name) => setOpenStations(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, background: accent, color: '#fff' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{total} donors · {stations.length} stations</span>
      </div>
      {stations.length === 0 ? (
        <div style={{ padding: '10px 12px', color: 'var(--ink-soft)', fontSize: 12, border: '1px dashed var(--line)', borderRadius: 8 }}>No {title.toLowerCase()} data.</div>
      ) : stations.map(st => (
        <StationRow key={st.stationName} station={st} open={openStations.has(st.stationName)} onToggle={() => toggle(st.stationName)} />
      ))}
    </div>
  );
}

function FroRow({ fro, open, onToggle }) {
  const [tab, setTab] = useState('new');
  const newCount = sumSide(fro.new);
  const oldCount = sumSide(fro.old);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', background: open ? 'var(--bg-soft, #f8fafc)' : 'transparent' }}>
        <Chevron open={open} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{fro.froName}</span>
        {fro.froId && <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>#{fro.froId}</span>}
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-soft)' }}>
          new {newCount} · old {oldCount}
        </span>
        <span className="count" style={{ marginLeft: 'auto', fontSize: 11 }}>{sumFro(fro)} donors</span>
      </div>
      {open && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'inline-flex', gap: 6, marginBottom: 12, padding: 3, background: 'var(--bg-soft, #eef2f7)', borderRadius: 8 }}>
            <button onClick={() => setTab('new')} className="btn btn-sm" style={{ background: tab === 'new' ? 'var(--sage)' : 'transparent', color: tab === 'new' ? '#fff' : 'var(--ink)', border: 'none', fontWeight: 600 }}>New ({newCount})</button>
            <button onClick={() => setTab('old')} className="btn btn-sm" style={{ background: tab === 'old' ? 'var(--sage)' : 'transparent', color: tab === 'old' ? '#fff' : 'var(--ink)', border: 'none', fontWeight: 600 }}>Old ({oldCount})</button>
          </div>
          <SideBlock title={tab === 'new' ? 'New' : 'Old'} side={tab === 'new' ? fro.new : fro.old} accent={tab === 'new' ? '#2563eb' : '#9333ea'} />
        </div>
      )}
    </div>
  );
}

function NgoBlock({ ngo }) {
  const [openFros, setOpenFros] = useState(new Set());
  const fros = ngo.froAssignments || [];
  const totalDonors = fros.reduce((a, f) => a + sumFro(f), 0);
  const toggle = (key) => setOpenFros(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{ngo.ngoName}</h3>
        {ngo.ngoId && <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>#{ngo.ngoId}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>{fros.length} FROs · {totalDonors} donors</span>
      </div>
      <div className="card-pad" style={{ paddingTop: 10 }}>
        {fros.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 12 }}>No assignments for this NGO.</div>
        ) : fros.map((f, i) => {
          const key = `${f.froId || 'UNASSIGNED'}-${i}`;
          return <FroRow key={key} fro={f} open={openFros.has(key)} onToggle={() => toggle(key)} />;
        })}
      </div>
    </div>
  );
}

export default function DataOverview() {
  const [ngos, setNgos] = useState([]);
  const [selNgo, setSelNgo] = useState('');
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet('/ngo-admin/ngos').then(r => {
      const list = Array.isArray(r) ? r : (r?.ngos || []);
      setNgos(list);
      if (list.length > 0 && !selNgo) setSelNgo(String(list[0].ngo_id || list[0].id || ''));
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selNgo) { setTree([]); return; }
    setLoading(true); setError('');
    getDataOverview({ ngo_id: selNgo, per_station: PER_STATION })
      .then(r => setTree(Array.isArray(r) ? r : []))
      .catch(e => { setError(e.message); setTree([]); })
      .finally(() => setLoading(false));
  }, [selNgo]);

  const totalDonors = useMemo(() => tree.reduce((a, n) => a + (n.froAssignments || []).reduce((b, f) => b + sumFro(f), 0), 0), [tree]);

  return (
    <div>
      <div className="card-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Data Overview</h3>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>
          {tree.length} NGO{tree.length !== 1 ? 's' : ''} · {totalDonors} donors
        </span>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12, gap: 10 }}>
        <select value={selNgo} onChange={e => setSelNgo(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', minWidth: 220 }}>
          <option value="">-- Select NGO --</option>
          {ngos.map(n => <option key={n.ngo_id || n.id} value={String(n.ngo_id || n.id || '')}>{n.ngo_name || n.name || ''}</option>)}
        </select>
        {loading && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Loading…</span>}
        {error && <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span>}
      </div>

      {!selNgo ? (
        <div className="card"><div style={{ textAlign: 'center', padding: 30, color: 'var(--ink-soft)', fontSize: 13 }}>Select an NGO to view its data overview.</div></div>
      ) : loading ? (
        <div className="card"><div style={{ textAlign: 'center', padding: 30, color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div></div>
      ) : tree.length === 0 ? (
        <div className="card"><div style={{ textAlign: 'center', padding: 30, color: 'var(--ink-soft)', fontSize: 13 }}>No data found for this NGO.</div></div>
      ) : (
        tree.map(ngo => <NgoBlock key={ngo.ngoId || ngo.ngoName} ngo={ngo} />)
      )}
    </div>
  );
}

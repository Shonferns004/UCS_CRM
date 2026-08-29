import { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Clock, AlarmClock, AlertTriangle, ChevronRight, Phone, Search, Inbox } from 'lucide-react';
import { getScheduled, getCallbacks, getPromises } from '../api/donors';
import DispositionModal from '../components/DispositionModal';
import { SkeletonTable } from '../../../components/Skeleton';
import { istDateString, formatIstTime } from '../utils/time';

const TABS = [
  { id: 'scheduled', label: 'Follow Up' },
  { id: 'callback', label: 'Callback' },
  { id: 'promise', label: 'Promise to Pay' },
];

const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function getTimeInfo(scheduledAt, now) {
  if (!scheduledAt) return { label: 'Un-scheduled', bg: '#eef2ff', color: '#4338ca', rel: '—' };
  const diff = new Date(scheduledAt).getTime() - now;
  const mins = diff / 60000;
  if (diff < 0) return { label: 'Overdue', bg: '#fee2e2', color: '#b91c1c', rel: `${fmtDur(-diff)} ago` };
  if (mins <= 2) return { label: 'Due now', bg: '#ffedd5', color: '#c2410c', rel: `in ${fmtDur(diff)}` };
  if (mins <= 15) return { label: 'Due soon', bg: '#fef3c7', color: '#b45309', rel: `in ${fmtDur(diff)}` };
  if (mins <= 60) return { label: 'Upcoming', bg: '#dcfce7', color: '#15803d', rel: `in ${fmtDur(diff)}` };
  return { label: 'Scheduled', bg: '#f0fdf4', color: '#166534', rel: `in ${fmtDur(diff)}` };
}

function fmtTime(scheduledAt) {
  try {
    return `${new Date(scheduledAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}, ${formatIstTime(scheduledAt)}`;
  } catch { return ''; }
}

export default function Scheduled() {
  const [tab, setTab] = useState('scheduled');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalDonor, setModalDonor] = useState(null);
  const [refetch, setRefetch] = useState(0);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const loadRows = () => {
    setLoading(true);
    Promise.all([getScheduled(), getCallbacks(), getPromises()]).then(([scheduled, callbacks, promises]) => {
      const todayStr = istDateString();
      const items = [];
      const seen = new Set();
      const k = (d) => `${d.id}`;
      (scheduled || []).forEach(d => {
        if (d.scheduled_at && istDateString(d.scheduled_at) !== todayStr && !seen.has(k(d))) {
          seen.add(k(d));
          items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at, type: 'scheduled' });
        }
      });
      (callbacks || []).forEach(d => {
        if (!seen.has(k(d))) {
          seen.add(k(d));
          items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at || null, type: 'callback' });
        }
      });
      (scheduled || []).forEach(d => {
        if (d.scheduled_at && istDateString(d.scheduled_at) === todayStr && !seen.has(k(d))) {
          seen.add(k(d));
          items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.scheduled_at, type: 'callback' });
        }
      });
      (promises || []).forEach(d => {
        if (!seen.has(k(d))) {
          seen.add(k(d));
          items.push({ id: d.id, ngo_id: d.ngo_id, donor_name: d.donor_name, donor_mobile: d.donor_mobile, scheduled_at: d.due_date || d.scheduled_at || null, due_date: d.due_date || null, type: 'promise' });
        }
      });
      setRows(items);
    }).catch((err) => { console.error('API error:', err.message); setRows([]); })
    .finally(() => setLoading(false));
  };

  useEffect(() => { loadRows(); }, [refetch]);

  const { scheduledRows, callbackRows, promiseRows } = useMemo(() => {
    const deduped = rows.filter((r, i, a) => i === a.findIndex(x => x.id === r.id));
    return {
      scheduledRows: deduped.filter(r => r.type === 'scheduled'),
      callbackRows: deduped.filter(r => r.type === 'callback'),
      promiseRows: deduped.filter(r => r.type === 'promise'),
    };
  }, [rows]);

  const list = useMemo(() => {
    const base = tab === 'scheduled' ? scheduledRows : tab === 'promise' ? promiseRows : callbackRows;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter(r => (r.donor_name || '').toLowerCase().includes(q) || (r.donor_mobile || '').includes(q))
      : base;
    return [...filtered].sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
      return ta - tb;
    });
  }, [tab, scheduledRows, callbackRows, promiseRows, query]);

  const stats = useMemo(() => {
    const base = tab === 'scheduled' ? scheduledRows : tab === 'promise' ? promiseRows : callbackRows;
    const s = { overdue: 0, soon: 0, upcoming: 0, none: 0 };
    for (const r of base) {
      if (!r.scheduled_at) { s.none++; continue; }
      const mins = (new Date(r.scheduled_at).getTime() - now) / 60000;
      if (mins < 0) s.overdue++;
      else if (mins <= 15) s.soon++;
      else s.upcoming++;
    }
    return s;
  }, [tab, scheduledRows, callbackRows, now]);

  const CHIPS = [
    { key: 'overdue', label: 'Overdue', value: stats.overdue, Icon: AlertTriangle, bg: '#fee2e2', color: '#b91c1c' },
    { key: 'soon', label: 'Due in 15 min', value: stats.soon, Icon: AlarmClock, bg: '#ffedd5', color: '#c2410c' },
    { key: 'upcoming', label: 'Upcoming', value: stats.upcoming, Icon: CalendarClock, bg: '#dcfce7', color: '#15803d' },
    { key: 'none', label: 'Un-scheduled', value: stats.none, Icon: Clock, bg: '#eef2ff', color: '#4338ca' },
  ];

  const openModal = (row) => setModalDonor(row);
  const handlePopDone = () => { setModalDonor(null); setRefetch(n => n + 1); };

  if (loading) return <div style={{ padding: 18 }}><SkeletonTable rows={8} /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '16px 18px 0', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Follow Ups</h2>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Scheduled · Callbacks · Promises</span>
      </div>
      {/* Stat chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, padding: '14px 18px 4px', flexShrink: 0 }}>
        {CHIPS.map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)', padding: '10px 14px' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <c.Icon size={15} />
            </span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar: segmented tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 18px', flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
          {TABS.map(t => {
            const count = t.id === 'scheduled' ? scheduledRows.length : t.id === 'promise' ? promiseRows.length : callbackRows.length;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  padding: '6px 16px', borderRadius: 999, border: 'none', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: active ? 'var(--sage)' : 'transparent', color: active ? '#fff' : 'var(--ink-soft)',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,.18)' : 'none', transition: 'all .15s',
                }}>
                {t.label}
                <span style={{
                  minWidth: 17, padding: '0 5px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                  background: active ? 'rgba(255,255,255,.22)' : 'var(--line)', color: active ? '#fff' : 'var(--ink-soft)',
                }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or mobile…"
            style={{
              padding: '7px 12px 7px 30px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--card-bg)',
              fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 210, color: 'var(--ink)',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 18px 18px' }}>
        {list.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 220, gap: 10, color: 'var(--ink-soft)' }}>
            <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Inbox size={24} />
            </span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{query ? 'No matching donors' : `No ${TABS.find(t => t.id === tab)?.label || ''} entries`}</div>
              <div style={{ fontSize: 11 }}>{query ? 'Try a different name or mobile number.' : 'No entries right now.'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(r => {
              const info = getTimeInfo(r.scheduled_at, now);
              const typePill = r.type === 'scheduled' ? { bg: '#dcfce7', color: '#166534' } : r.type === 'promise' ? { bg: '#ede9fe', color: '#6d28d9' } : { bg: '#dbeafe', color: '#1e40af' };
              return (
                <div key={r.id} onClick={() => openModal(r)}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--sage)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow)', cursor: 'pointer', transition: 'transform .12s, box-shadow .12s, border-color .12s',
                  }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#5B6B4E1A', color: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {initials(r.donor_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.donor_name || '—'}</span>
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: typePill.bg, color: typePill.color }}>
                        {TABS.find(t => t.id === r.type)?.label || r.type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                      <Phone size={11} />
                      <span>{r.donor_mobile || '—'}</span>
                      {r.scheduled_at && <span style={{ color: 'var(--line)', margin: '0 3px' }}>•</span>}
                      {r.scheduled_at && <span>{fmtTime(r.scheduled_at)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: info.bg, color: info.color }}>
                      {info.label}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 3 }}>{info.rel}</div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalDonor && (
        <DispositionModal
          donorId={modalDonor.id}
          ngoId={modalDonor.ngo_id}
          donorName={modalDonor.donor_name}
          donorMobile={modalDonor.donor_mobile}
          scheduledAt={modalDonor.scheduled_at}
          onClose={() => { setModalDonor(null); }}
          onDone={handlePopDone}
        />
      )}
    </div>
  );
}

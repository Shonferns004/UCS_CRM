import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSim } from './store';
import { Icon } from './components';
import { toast } from '../../../components/Toast';
import { fetchReplacements } from './api';
import { effectiveStatus, dayClass, formatDate, pillForStatus } from './helpers';

function Donut({ segments, total }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((s, x) => s + x.value, 0) || 0;
  let offset = 0;
  return (
    <div className="donut">
      <svg width="132" height="132" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e8edf5" strokeWidth="15" />
        <g transform="rotate(-90 60 60)">
          {segments.map((s) => {
            const len = sum > 0 ? (s.value / sum) * c : 0;
            const seg = (
              <circle
                key={s.label}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="15"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return seg;
          })}
        </g>
      </svg>
      <div className="donut-center">
        <div className="n">{total}</div>
        <div className="l">SIMs</div>
      </div>
    </div>
  );
}

export default function Dashboard({ onAdd, onView, onEdit, onReplace, base = '/accounts/sim' }) {
  const { cards, loading, inventory, refreshInventory } = useSim();
  const [activity, setActivity] = useState([]);

  const data = useMemo(() => {
    const enriched = cards.map((c) => ({ ...c, _status: effectiveStatus(c) }));
    const total = enriched.length;
    const active = enriched.filter((c) => c._status === 'Active').length;
    const expiring = enriched.filter((c) => c._status === 'Expiring Soon').length;
    const expired = enriched.filter((c) => c._status === 'Expired').length;
    const replaced = enriched.filter((c) => c._status === 'Replaced').length;
    const inactive = enriched.filter((c) => c._status === 'Inactive').length + replaced;

    const buckets = {
      expired,
      exp7: enriched.filter((c) => { const d = c.days_left; return c._status === 'Expiring Soon' && d !== null && d <= 7; }).length,
      exp30: enriched.filter((c) => { const d = c.days_left; return c._status === 'Expiring Soon' && d !== null && d > 7 && d <= 28; }).length,
      ok30: enriched.filter((c) => { const d = c.days_left; return d !== null && d > 28; }).length,
    };

    const urgent = enriched
      .filter((c) => c._status === 'Expiring Soon' || c._status === 'Expired')
      .sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999))
      .slice(0, 8);

    return { enriched, total, active, expiring, expired, replaced, inactive, buckets, urgent };
  }, [cards]);

  const inv = useMemo(() => {
    const available = inventory.filter((i) => i.status === 'Available').length;
    const assigned = inventory.filter((i) => i.status === 'Assigned').length;
    const expired = inventory.filter((i) => i.status === 'Expired').length;
    const lostDamaged = inventory.filter((i) => i.status === 'Lost' || i.status === 'Damaged').length;
    return { total: inventory.length, available, assigned, expired, lostDamaged };
  }, [inventory]);

  const recentActivity = useMemo(() => activity.slice(0, 5).map((r) => ({
    id: `${r.id}`,
    icon: 'replace',
    title: 'SIM replaced',
    detail: [
      r.old_sim ? `Old: ${r.old_sim}` : '',
      r.new_sim ? `New: ${r.new_sim}` : '',
    ].filter(Boolean).join(' · '),
    meta: [r.device, r.mobile_id, formatDate(r.replacement_date)].filter(Boolean).join('  ·  '),
  })), [activity]);

  const notifiedRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    if (data.expiring > 0 && notifiedRef.current !== data.expiring) {
      notifiedRef.current = data.expiring;
      toast(`${data.expiring} SIM card${data.expiring > 1 ? 's' : ''} expiring within 30 days`, 'info', 5000);
    }
  }, [data.expiring, loading]);

  useEffect(() => {
    refreshInventory();
    fetchReplacements()
      .then((list) => setActivity(Array.isArray(list) ? list : []))
      .catch(() => setActivity([]));
    /* eslint-disable-next-line */
  }, []);

  if (loading && cards.length === 0) {
    return <div className="empty-state"><div className="big">Loading SIM data...</div></div>;
  }

  const summary = [
    { label: 'Total Mobile', val: data.total, sub: 'All registered SIMs', icon: 'simcard', ic: { bg: 'var(--sim-blue-soft)', color: 'var(--sim-blue)' }, bar: '#2563eb' },
    { label: 'Active SIM Cards', val: data.active, sub: 'Currently active', icon: 'sim', ic: { bg: '#f0fdf4', color: '#16a34a' }, bar: '#16a34a' },
    { label: 'Expiring Soon', val: data.expiring, sub: 'Within 28 days', icon: 'clock', ic: { bg: 'var(--sim-amber-soft)', color: 'var(--sim-amber)' }, bar: '#d97706' },
    { label: 'Expired SIM Cards', val: data.expired, sub: 'Past expiry date', icon: 'inventory', ic: { bg: 'var(--sim-red-soft)', color: 'var(--sim-red)' }, bar: '#dc2626' },
    { label: 'Replaced SIM Cards', val: data.replaced, sub: 'Total replacements', icon: 'replace', ic: { bg: '#f0f9ff', color: '#0284c7' }, bar: '#0284c7' },
  ];

  const statusSegments = [
    { label: 'Active', value: data.active, color: '#16a34a' },
    { label: 'Expiring Soon', value: data.expiring, color: '#d97706' },
    { label: 'Expired', value: data.expired, color: '#dc2626' },
    { label: 'Inactive', value: data.inactive, color: '#94a3b8' },
  ];

  const invItems = [
    { label: 'Available', val: inv.available, color: '#16a34a' },
    { label: 'Assigned', val: inv.assigned, color: '#2563eb' },
    { label: 'Expired', val: inv.expired, color: '#dc2626' },
    { label: 'Lost / Damaged', val: inv.lostDamaged, color: '#d97706' },
  ];

  const statusSumAll = statusSegments.reduce((s, x) => s + x.value, 0) || 1;
  const expiryItems = [
    { label: 'Expired', val: data.buckets.expired, color: '#dc2626' },
    { label: 'Expiring in 7 Days', val: data.buckets.exp7, color: '#d97706' },
    { label: 'Expiring in 30 Days', val: data.buckets.exp30, color: '#f59e0b' },
    { label: 'Active for 30+ Days', val: data.buckets.ok30, color: '#16a34a' },
  ];
  const expiryMax = Math.max(...expiryItems.map((i) => i.val), 1);

  const quickActions = [
    { label: 'All SIM Cards', path: `${base}/inventory`, icon: 'simcard', color: '#2563eb', bg: '#eff6ff' },
    { label: 'SIM Inventory', path: `${base}/cards`, icon: 'inventory', color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Expiring SIMs', path: `${base}/expiring`, icon: 'clock', color: '#d97706', bg: '#fffbeb' },
    { label: 'SIM Reports', path: `${base}/reports`, icon: 'report', color: '#7c3aed', bg: '#f5f3ff' },
  ];

  return (
    <div className="dash">
      {data.total === 0 && (
        <div className="dash-banner">
          <div>
            <div className="b-txt">No SIM Cards Found</div>
            <div className="b-sub">Add your first SIM card to start tracking devices and expiry dates.</div>
          </div>
          <button className="sim-btn primary" onClick={onAdd}>+ Add SIM Card</button>
        </div>
      )}

      <div className="dash-kpi-grid">
        {summary.map((s) => (
          <div className="dash-kpi" key={s.label}>
            <span className="kpi-accent" style={{ background: s.bar }} />
            <div className="kpi-top">
              <div className="kpi-ic" style={s.ic}><Icon name={s.icon} size={18} /></div>
              <div className="kpi-label">{s.label}</div>
            </div>
            <div className="kpi-num">{s.val}</div>
            <div className="kpi-sub">{s.sub}</div>
            <div className="kpi-foot"><span style={{ width: `${Math.min(100, data.total ? (s.val / data.total) * 100 : 0)}%`, background: s.bar }} /></div>
          </div>
        ))}
      </div>

      <div className="dash-row">
        <section className="dash-panel">
          <div className="panel-head"><h3>SIM Status Overview</h3><span className="ln">Live distribution</span></div>
          <div className="status-layout">
            <Donut segments={statusSegments} total={data.total} />
            <div className="legend">
              {statusSegments.map((s) => (
                <div className="legend-row" key={s.label}>
                  <span className="dot" style={{ background: s.color }} />
                  <span className="nm">{s.label}</span>
                  <span className="vl">{s.value}</span>
                  <span className="pc">{Math.round((s.value / statusSumAll) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="dash-panel">
          <div className="panel-head"><h3>SIM Inventory</h3><Link to={`${base}/cards`} className="panel-link">View Inventory →</Link></div>
          {inv.total === 0 ? (
            <div className="dash-empty">
              <div className="big">No SIM Inventory</div>
              <div className="small">No physical SIM stock yet.</div>
              <Link to={`${base}/cards`} className="panel-link" style={{ marginTop: 10, display: 'inline-flex' }}>Open SIM Inventory →</Link>
            </div>
          ) : (
            <div className="inv-body">
              <div className="inv-total">
                <div className="n">{inv.total}</div>
                <div className="l">Total SIMs in stock</div>
              </div>
              <div className="inv-grid">
                {invItems.map((it) => (
                  <div className="inv-item" key={it.label}>
                    <div className="t"><span className="d" style={{ background: it.color }} />{it.label}</div>
                    <div className="v">{it.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="dash-row">
        <section className="dash-panel">
          <div className="panel-head"><h3>SIM Expiry Overview</h3><span className="ln">Based on auto-expiry dates</span></div>
          <div className="expiry-grid">
            {expiryItems.map((e) => (
              <div className="expiry-item" key={e.label}>
                <div className="t"><span className="lab">{e.label}</span><span className="val">{e.val}</span></div>
                <div className="bar"><span style={{ width: `${(e.val / expiryMax) * 100}%`, background: e.color }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-panel">
          <div className="panel-head"><h3>Quick Actions</h3></div>
          <div className="qa-grid">
            <button className="qa-item qa-add sim-btn primary" style={{ justifyContent: 'center', flexDirection: 'row' }} onClick={onAdd}>
              <Icon name="sim" size={16} /> + Add SIM Card
            </button>
            {quickActions.map((qa) => (
              <Link to={qa.path} className="qa-item" key={qa.label}>
                <span className="qic" style={{ background: qa.bg, color: qa.color }}><Icon name={qa.icon} size={15} /></span>
                {qa.label}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="dash-row">
        <section className="dash-panel">
          <div className="panel-head"><h3>SIMs Expiring Soon</h3><Link to={`${base}/expiring`} className="panel-link">View all →</Link></div>
          {data.urgent.length === 0 ? (
            <div className="dash-empty">
              <div className="check"><Icon name="check" size={20} /></div>
              <div className="big">No urgent expiries</div>
              <div className="small">All SIMs have more than 30 days remaining.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr><th>SIM / Mobile ID</th><th>Team</th><th>Expiry Date</th><th>Days Left</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {data.urgent.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.mobile_id}</td>
                      <td>{c.team || '—'}</td>
                      <td>{formatDate(c.expiry_date)}</td>
                      <td className={`days-cell num ${dayClass(c.days_left)}`}>{c.days_left === null || c.days_left === undefined || Number.isNaN(c.days_left) ? '—' : `${c.days_left} days`}</td>
                      <td><span className={`pill ${pillForStatus(c._status)}`}>{c._status}</span></td>
                      <td><button className="mini-btn" onClick={() => onView(c)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dash-panel">
          <div className="panel-head"><h3>Recent Activity</h3><span className="ln">SIM replacement history</span></div>
          {recentActivity.length === 0 ? (
            <div className="dash-empty">
              <div className="check" style={{ background: 'var(--sim-gray-soft)', color: 'var(--sim-gray)' }}><Icon name="history" size={20} /></div>
              <div className="big">No recent activity</div>
              <div className="small">Replacement activity will appear here.</div>
            </div>
          ) : (
            <div className="activity-list">
              {recentActivity.map((a) => (
                <div className="activity-item" key={a.id}>
                  <div className="aic"><Icon name={a.icon} size={15} /></div>
                  <div className="at">
                    <div className="tt">{a.title}</div>
                    <div className="dt">{a.detail}</div>
                    <div className="md">{a.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

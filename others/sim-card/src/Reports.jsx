import { useMemo, useState } from 'react';
import { useSim } from './store';
import { effectiveStatus, dayLabel, dayClass, formatDate, pillForStatus } from './helpers';

const STATUS_COLORS = {
  Active: '#16a34a',
  'Expiring Soon': '#d97706',
  Expired: '#dc2626',
  Replaced: '#0284c7',
  Inactive: '#94a3b8',
};

const SUMMARY_TINT = {
  'Total SIM Cards': { bg: 'var(--sim-blue-soft)', color: 'var(--sim-blue)' },
  'Active': { bg: '#f0fdf4', color: '#16a34a' },
  'Expiring Soon': { bg: 'var(--sim-amber-soft)', color: 'var(--sim-amber)' },
  'Expired': { bg: 'var(--sim-red-soft)', color: 'var(--sim-red)' },
  'Inactive / Replaced': { bg: '#f0f9ff', color: '#0284c7' },
};

const AVATAR_COLORS = {
  default: { bg: 'var(--sim-blue-soft)', color: 'var(--sim-blue-dark)' },
  JN: { bg: 'var(--sim-amber-soft)', color: 'var(--sim-amber)' },
  DK: { bg: '#fde68a', color: '#b45309' },
  DG: { bg: '#bbf7d0', color: '#15803d' },
  NS: { bg: '#fbcfe8', color: '#be185d' },
  AV: { bg: '#ddd6fe', color: '#6d28d9' },
  HW: { bg: '#fecdd3', color: '#be123c' },
  SS: { bg: '#bae6fd', color: '#0369a1' },
  KJ: { bg: '#fed7aa', color: '#c2410c' },
  MM: { bg: '#fef08a', color: '#a16207' },
  DS: { bg: '#c7d2fe', color: '#4338ca' },
  NV: { bg: '#a7f3d0', color: '#047857' },
  HR: { bg: '#e9d5ff', color: '#7e22ce' },
  AP: { bg: '#fecaca', color: '#b91c1c' },
  BV: { bg: '#a5f3fc', color: '#0e7490' },
};

export default function Reports({ cards }) {
  const { cards: ctxCards } = useSim();
  const list = cards || ctxCards;

  const data = useMemo(() => {
    const enriched = list.map((c) => ({ ...c, _status: effectiveStatus(c) }));
    const statusBreakdown = {};
    const teamBreakdown = {};
    enriched.forEach((c) => {
      statusBreakdown[c._status] = (statusBreakdown[c._status] || 0) + 1;
      const t = c.team || 'Unassigned';
      teamBreakdown[t] = (teamBreakdown[t] || 0) + 1;
    });

    const total = enriched.length;
    const active = statusBreakdown.Active || 0;
    const expired = statusBreakdown.Expired || 0;
    const expiring = statusBreakdown['Expiring Soon'] || 0;
    const replaced = statusBreakdown.Replaced || 0;
    const inactive = (statusBreakdown.Inactive || 0) + replaced;

    return {
      enriched,
      statusBreakdown,
      teamBreakdown,
      total,
      active,
      expired,
      expiring,
      replaced,
      inactive,
    };
  }, [list]);

  const summary = [
    { label: 'Total SIM Cards', val: data.total, icon: 'simcard' },
    { label: 'Active', val: data.active, icon: 'sim' },
    { label: 'Expiring Soon', val: data.expiring, icon: 'clock' },
    { label: 'Expired', val: data.expired, icon: 'inventory' },
    { label: 'Inactive / Replaced', val: data.inactive, icon: 'replace' },
  ];

  const statusRows = Object.entries(data.statusBreakdown)
    .sort((a, b) => b[1] - a[1]);

  const teamRows = Object.entries(data.teamBreakdown)
    .sort((a, b) => b[1] - a[1]);

  const PER_PAGE = 12;
  const [reportPage, setReportPage] = useState(1);
  const [teamFilter, setTeamFilter] = useState('All');

  const teamOptions = useMemo(() => {
    const set = new Set(data.enriched.map((c) => c.team).filter(Boolean));
    return ['All', ...set];
  }, [data.enriched]);

  const filteredReport = useMemo(
    () => teamFilter === 'All' ? data.enriched : data.enriched.filter((c) => c.team === teamFilter),
    [data.enriched, teamFilter]
  );

  const reportGroups = useMemo(() => {
    const groups = new Map();
    filteredReport.forEach((c) => {
      const key = c.mobile_id || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    });
    return [...groups.values()];
  }, [filteredReport]);

  const reportPagesArr = useMemo(() => {
    const pages = [];
    let page = [];
    for (const group of reportGroups) {
      if (page.length > 0 && page.length + group.length > PER_PAGE) {
        pages.push(page);
        page = [];
      }
      page.push(...group);
    }
    if (page.length > 0) pages.push(page);
    return pages;
  }, [reportGroups]);

  const reportPages = Math.max(1, reportPagesArr.length);
  const safeReportPage = Math.min(reportPage, reportPages);
  const reportRows = reportPagesArr[safeReportPage - 1] || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card-block summary-block">
        <div className="tb">
          <h3>SIM Summary</h3>
          <span className="ln">Total {data.total} SIM card{data.total !== 1 ? 's' : ''}</span>
        </div>
        <div className="sum-grid">
          {summary.map((s) => {
            const pct = data.total > 0 ? Math.round((s.val / data.total) * 100) : 0;
            const tint = SUMMARY_TINT[s.label] || {};
            return (
              <div className="sum-tile" key={s.label}>
                <div className="sum-n" style={{ color: tint.color || 'var(--sim-ink)' }}>{s.val}</div>
                <div className="sum-lab">{s.label}</div>
                <div className="sum-bar">
                  <span style={{ width: `${Math.min(pct, 100)}%`, background: tint.color || 'var(--sim-blue)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div className="card-block">
          <div className="tb">
            <h3>Status Breakdown</h3>
            <span className="ln">{data.total} total · {data.expired} expired · {data.expiring} expiring</span>
          </div>
          {statusRows.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--sim-ink-soft)', fontSize: 13 }}>No status data available.</div>
          ) : (
            <div className="status-graph">
              <div className="sg-line-wrap">
                <svg viewBox="0 0 260 120" width="100%" height="160" preserveAspectRatio="none">
                  {(() => {
                    const sum = statusRows.reduce((s, [, v]) => s + v, 0) || 1;
                    const maxV = Math.max(...statusRows.map(([, v]) => v), 1);
                    const W = 260, H = 120, padL = 6, padR = 6, padT = 10, padB = 26;
                    const plotW = W - padL - padR;
                    const plotH = H - padT - padB;
                    const n = statusRows.length;
                    const x = (i) => n > 1 ? padL + (i / (n - 1)) * plotW : padL + plotW / 2;
                    const y = (v) => padT + plotH - (v / maxV) * plotH;
                    const pts = statusRows.map(([, v], i) => [x(i), y(v)]);
                    const line = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px},${py}`).join(' ');
                    const area = `${line} L${pts[pts.length - 1][0]},${padT + plotH} L${pts[0][0]},${padT + plotH} Z`;
                    return (
                      <g>
                        {[0, 0.5, 1].map((f) => (
                          <line key={f} x1={padL} x2={W - padR} y1={padT + plotH * f} y2={padT + plotH * f} stroke="#eef2f7" strokeWidth="1" />
                        ))}
                        <path d={area} fill="url(#sgGrad)" />
                        <path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        {pts.map(([px, py], i) => (
                          <circle key={i} cx={px} cy={py} r="3.5" fill="#fff" stroke={STATUS_COLORS[statusRows[i][0]] || '#2563eb'} strokeWidth="2.5" />
                        ))}
                        <defs>
                          <linearGradient id="sgGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                      </g>
                    );
                  })()}
                </svg>
                <div className="sg-labels">
                  {statusRows.map(([k, v], i) => (
                    <div className="sg-xlab" key={k}>
                      <span className="sg-dot" style={{ background: STATUS_COLORS[k] || '#94a3b8' }} />
                      <span className="sg-name">{k}</span>
                      <span className="sg-count">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card-block">
          <div className="tb">
            <h3>SIMs by Team</h3>
            <span className="ln">{teamRows.length} team(s) · {data.total} total</span>
          </div>
          {teamRows.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--sim-ink-soft)', fontSize: 13 }}>No team data available.</div>
          ) : (
            <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {teamRows.map(([k, v]) => {
                const pct = Math.round((v / Math.max(data.total, 1)) * 100);
                const initials = k.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
                const { bg, fg } = AVATAR_COLORS[initials] || AVATAR_COLORS.default;
                return (
                  <div key={k} className="team-chip">
                    <div className="team-chip-top">
                      <span className="team-avatar" style={{ background: bg, color: fg }}>{initials || '?'}</span>
                      <div className="team-meta">
                        <div className="team-name">{k}</div>
                        <div className="team-count">{v} SIM{v !== 1 ? 's' : ''} · {pct}%</div>
                      </div>
                    </div>
                    <div className="team-progress"><span style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card-block">
        <div className="tb">
          <h3>Detailed SIM Report</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <select className="sim-select" value={teamFilter} onChange={(e) => { setTeamFilter(e.target.value); setReportPage(1); }}>
              {teamOptions.map((t) => <option key={t} value={t}>{t === 'All' ? 'All Owner' : t}</option>)}
            </select>
            <span className="ln">{filteredReport.length} record(s)</span>
          </div>
        </div>
        {filteredReport.length === 0 ? (
          <div className="sim-box empty-state" style={{ border: 'none', boxShadow: 'none' }}>
            <div className="big">No SIM Cards Found</div>
            <div className="small">Add SIM cards to generate a report.</div>
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {reportRows.map((c) => (
                <div className="sim-report-card" key={c.id}>
                  <div className="src-head">
                    <span className="src-id">{c.mobile_id || '—'}</span>
                    <span className={`pill ${pillForStatus(c._status)}`}>{c._status}</span>
                  </div>
                  <div className="src-body">
                    <div className="src-field"><span className="src-k">Device</span><span className="src-v">{c.device_model || '—'}</span></div>
                    <div className="src-field"><span className="src-k">Team</span><span className="src-v">{c.team || '—'}</span></div>
                    <div className="src-field"><span className="src-k">Issue Date</span><span className="src-v">{formatDate(c.issue_date)}</span></div>
                    <div className="src-field"><span className="src-k">Expiry Date</span><span className="src-v">{formatDate(c.expiry_date)}</span></div>
                    <div className="src-field"><span className="src-k">Days Left</span><span className={`src-v src-days ${dayClass(c.days_left)}`}>{dayLabel(c.days_left)}</span></div>
                  </div>
                </div>
              ))}
            </div>

            {filteredReport.length > PER_PAGE && (
              <div className="pagination" style={{ marginTop: 16, marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--sim-ink-soft)' }}>
                  <span>Showing page {safeReportPage} of {reportPages} · {reportRows.length} on this page</span>
                </div>
                <div className="pages">
                  <button className="page-btn" disabled={safeReportPage <= 1} onClick={() => setReportPage(safeReportPage - 1)}>‹</button>
                  {Array.from({ length: reportPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} className={`page-btn ${p === safeReportPage ? 'active' : ''}`} onClick={() => setReportPage(p)}>{p}</button>
                  ))}
                  <button className="page-btn" disabled={safeReportPage >= reportPages} onClick={() => setReportPage(safeReportPage + 1)}>›</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSim } from './store';
import { effectiveStatus, dayLabel, formatDate, pillForStatus } from './helpers';

const PER_PAGE = 15;

const TABS = [
  ['all', 'All'],
  ['7', 'Within 7 Days'],
  ['28', 'Within 28 Days'],
  ['expired', 'Expired'],
];

export default function Expiring({ onView, onEdit, onReplace }) {
  const { cards, loading } = useSim();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const enriched = useMemo(() => cards.map((c) => ({ ...c, _status: effectiveStatus(c) })), [cards]);

  const expiring = useMemo(
    () => enriched.filter((c) => c._status === 'Expiring Soon' || c._status === 'Expired'),
    [enriched]
  );

  const raw = useMemo(() => {
    let l = expiring;
    if (tab === '7') l = l.filter((c) => c.days_left !== null && c.days_left >= 1 && c.days_left <= 7);
    if (tab === '28') l = l.filter((c) => c.days_left !== null && c.days_left >= 1 && c.days_left <= 28);
    if (tab === 'expired') l = l.filter((c) => c._status === 'Expired');
    return l.sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999));
  }, [expiring, tab]);

  const summary = useMemo(() => ({
    expired: enriched.filter((c) => c._status === 'Expired').length,
    within7: expiring.filter((c) => c.days_left !== null && c.days_left >= 1 && c.days_left <= 7).length,
    within28: expiring.filter((c) => c.days_left !== null && c.days_left >= 1 && c.days_left <= 28).length,
  }), [enriched, expiring]);

  const pageCount = Math.max(1, Math.ceil(raw.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  useEffect(() => { if (safePage !== page) setPage(safePage); }, [safePage, page]);
  const start = (safePage - 1) * PER_PAGE;
  const pageRows = raw.slice(start, start + PER_PAGE);

  if (loading && cards.length === 0) return <div className="empty-state"><div className="big">Loading...</div></div>;

  return (
    <div>
      <div className="exp-chips">
        {TABS.map(([t, label]) => (
          <button key={t} className={`exp-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {pageRows.length === 0 ? (
        <div className="sim-box empty-state">
          <div className="big">No Expiring SIMs</div>
          <div className="small">No SIMs in this expiry range.</div>
        </div>
      ) : (
        <div className="exp-list">
          {pageRows.map((c) => {
            const dl = c.days_left;
            const expired = dl !== null && dl < 0;
            const urgent = dl !== null && dl >= 0 && dl <= 7;
            const tone = expired ? 'row-expired' : urgent ? 'row-urgent' : 'row-ok';
            return (
              <div className={`exp-row ${tone}`} key={c.id}>
                <span className="er-bar" />
                <span className={`pill er-status ${pillForStatus(c._status)}`}>{c._status}</span>
                <div className="er-id">
                  <span className="eri-top">{c.mobile_id || '—'}</span>
                  <span className="eri-sub">{c.device_model || '—'}</span>
                </div>
                <div className="er-meta">
                  <div className="er-cell"><span className="erk">IMEI</span><span className="erv">{c.imei || '—'}</span></div>
                  <div className="er-cell"><span className="erk">Team</span><span className="erv">{c.team || '—'}</span></div>
                  <div className="er-cell"><span className="erk">Expiry</span><span className="erv">{formatDate(c.expiry_date)}</span></div>
                </div>
                <span className="er-days">{dayLabel(dl)}</span>
                <div className="er-actions">
                  <button className="mini-btn" onClick={() => onView(c)}>View</button>
                  <button className="mini-btn" onClick={() => onEdit(c)}>Edit</button>
                  <button className="mini-btn" onClick={() => onReplace(c)}>Replace</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="pagination">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--sim-ink-soft)' }}>
            <span>Showing {raw.length === 0 ? 0 : start + 1}–{Math.min(start + PER_PAGE, raw.length)} of {raw.length} SIMs</span>
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
      )}
    </div>
  );
}

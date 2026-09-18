import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMyAllotmentSummary } from '../api/donors';
import { findDisp, CONNECTED_IDS } from '../dispositions';

// Data Usage modal — UI redesign only. All numbers come from the existing
// /fro/allotment-summary endpoint; Connects/Non-Connects classification reuses
// the existing CONNECTED_IDS set. No calculation, endpoint, or status-name
// changes versus the previous My Activity view.

const EMPTY_SUMMARY = { worked: 0, by_status: [], allotted_all_time: 0, used_all_time: 0 };

function toSafeCount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function statusLabel(status) {
  if (!status) return 'Unknown';
  return findDisp(status)?.label || String(status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(period, monthOptions) {
  if (period === 'today') {
    return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (period === 'all') return 'All Time';
  return monthOptions.find((m) => m.value === period)?.label || period;
}

function periodParam(period) {
  if (period === 'today') return 'today';
  if (period === 'all') return undefined;
  return period;
}

function StatusRow({ name, count, pct, accent, trackTestId }) {
  const safePct = clampPct(pct);
  return (
    <div className="du-status-row" data-testid={trackTestId}>
      <span className="du-status-name" title={name}>{name}</span>
      <span className="du-status-track" role="progressbar" aria-valuenow={Math.round(safePct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${name}: ${count} leads, ${Math.round(safePct)} percent`}>
        <span className="du-status-fill" style={{ width: `${safePct}%`, background: accent }} />
      </span>
      <span className="du-status-count">{count}</span>
      <span className="du-status-pct">{Math.round(safePct)}%</span>
    </div>
  );
}

function StatusList({ items, accent, emptyText }) {
  if (!items || items.length === 0) {
    return <div className="du-status-empty">{emptyText}</div>;
  }
  return (
    <div className="du-status-list">
      {items.map((s) => (
        <StatusRow key={s.status} name={statusLabel(s.status)} count={s.count} pct={s.pct} accent={accent} />
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="du-breakdown-panel" aria-hidden="true">
      <div className="du-breakdown-head">
        <div className="du-sk" style={{ width: 130, height: 18, borderRadius: 6 }} />
        <div className="du-sk" style={{ width: 60, height: 26, borderRadius: 999 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(70px,110px) 34px 44px', gap: 8, alignItems: 'center' }}>
            <div className="du-sk" style={{ height: 12, borderRadius: 6 }} />
            <div className="du-sk" style={{ height: 8, borderRadius: 999 }} />
            <div className="du-sk" style={{ height: 12, borderRadius: 6 }} />
            <div className="du-sk" style={{ height: 18, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataUsageModal({ onClose, onShowTarget }) {
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [period, setPeriod] = useState(() => currentMonthValue());
  const [filter, setFilter] = useState('all');
  const [allTime, setAllTime] = useState(null);
  const [loadingAll, setLoadingAll] = useState(true);
  const [periodData, setPeriodData] = useState(null);
  const [loadingPeriod, setLoadingPeriod] = useState(true);
  const closeRef = useRef(null);
  const prevFocusRef = useRef(null);

  // All-time pool for the two summary cards — fetched once.
  useEffect(() => {
    let cancelled = false;
    setLoadingAll(true);
    getMyAllotmentSummary()
      .then((d) => { if (!cancelled) setAllTime(d || EMPTY_SUMMARY); })
      .catch(() => { if (!cancelled) setAllTime(EMPTY_SUMMARY); })
      .finally(() => { if (!cancelled) setLoadingAll(false); });
    return () => { cancelled = true; };
  }, []);

  // Period breakdown — refetches only when the period changes.
  useEffect(() => {
    let cancelled = false;
    setLoadingPeriod(true);
    getMyAllotmentSummary(periodParam(period))
      .then((d) => { if (!cancelled) setPeriodData(d || EMPTY_SUMMARY); })
      .catch(() => { if (!cancelled) setPeriodData(EMPTY_SUMMARY); })
      .finally(() => { if (!cancelled) setLoadingPeriod(false); });
    return () => { cancelled = true; };
  }, [period]);

  // Latest onClose without re-subscribing: parent passes a new inline callback
  // every render, and re-running this effect would steal focus back to the
  // Close button (collapsing an open period/filter dropdown).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Escape closes; focus the Close control once on open, restore on unmount.
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    const t = setTimeout(() => { closeRef.current?.focus(); }, 0);
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') {
        prevFocusRef.current.focus();
      }
    };
    // Mount-only: focusing on later renders yanks focus out of open dropdowns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allotted = toSafeCount(allTime?.allotted_all_time);
  const used = toSafeCount(allTime?.used_all_time);
  const allottedPct = allotted > 0 ? clampPct((used / allotted) * 100) : 0;
  const usedDenom = allotted > 0 ? allotted : 0;

  const byStatus = useMemo(() => {
    const raw = Array.isArray(periodData?.by_status) ? periodData.by_status : [];
    return raw
      .filter((s) => s && typeof s.status === 'string')
      .map((s) => ({ status: s.status, count: toSafeCount(s.count) }))
      .filter((s) => s.count > 0);
  }, [periodData]);

  const worked = useMemo(() => byStatus.reduce((sum, s) => sum + s.count, 0), [byStatus]);

  const { connects, nonConnects } = useMemo(() => {
    const c = [];
    const n = [];
    for (const s of byStatus) {
      if (CONNECTED_IDS.has(s.status)) c.push(s);
      else n.push(s);
    }
    return { connects: c, nonConnects: n };
  }, [byStatus]);

  const connectCount = useMemo(() => connects.reduce((sum, s) => sum + s.count, 0), [connects]);
  const nonConnectCount = useMemo(() => nonConnects.reduce((sum, s) => sum + s.count, 0), [nonConnects]);

  const withPct = (list) => list.map((s) => ({ ...s, pct: worked > 0 ? clampPct((s.count / worked) * 100) : 0 }));

  const showConnects = filter === 'all' || filter === 'connects';
  const showNonConnects = filter === 'all' || filter === 'non';
  const panelTitle = period === 'today' ? 'Today Data Used' : `${periodLabel(period, monthOptions)} Data Used`;
  const isEmpty = !loadingPeriod && worked === 0;

  // Portal to document.body so ancestor transforms/stacking contexts and
  // full-screen app overlays can never trap or cover the period/filter
  // dropdowns.
  return createPortal(
    <div className="du-overlay" onClick={() => onClose?.()}>
      <div
        className="du-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Data Usage"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="du-header">
          <div className="du-header-text">
            <div className="du-title">Data Usage</div>
            <div className="du-subtitle">Your calling activity and data consumption</div>
          </div>
          <div className="du-header-controls">
            {onShowTarget && (
              <button type="button" className="du-target-link" onClick={onShowTarget}>
                Target →
              </button>
            )}
            <select
              className="du-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Select period"
            >
              <option value="today">Today</option>
              <option value={currentMonthValue()}>This Month</option>
              {monthOptions.slice(1).map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
              <option value="all">All Time</option>
            </select>
            <button ref={closeRef} type="button" className="du-close" onClick={() => onClose?.()} aria-label="Close data usage">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        <div className="du-content">
          <div className="du-summary-grid">
            <div className="du-card du-card-allotted">
              <div className="du-card-label">Total Data Allotted</div>
              <div className="du-card-value">{loadingAll ? '—' : allotted.toLocaleString('en-IN')}</div>
              <div className="du-track" role="progressbar" aria-valuenow={Math.round(allottedPct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Total data allotted: ${allotted} leads`}>
                <div className="du-fill du-fill-blue" style={{ width: `${usedDenom > 0 ? 100 : 0}%` }} />
              </div>
            </div>
            <div className="du-card du-card-used">
              <div className="du-card-label">Total Data Used</div>
              <div className="du-card-value">{loadingAll ? '—' : used.toLocaleString('en-IN')}</div>
              <div className="du-track" role="progressbar" aria-valuenow={Math.round(allottedPct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Total data used: ${used} of ${allotted} leads`}>
                <div className="du-fill du-fill-red" style={{ width: `${allottedPct}%` }} />
              </div>
            </div>
          </div>

          <div className="du-today">
            <div className="du-today-head">
              <div className="du-today-text">
                <div className="du-today-title">{panelTitle}</div>
                <div className="du-today-value">{loadingPeriod ? '—' : `${worked.toLocaleString('en-IN')} leads`}</div>
              </div>
              <select
                className="du-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter breakdown"
              >
                <option value="all">Filter: All</option>
                <option value="connects">Connects</option>
                <option value="non">Non Connects</option>
              </select>
            </div>

            <div className="du-today-body">
              {loadingPeriod ? (
                <div className="du-breakdown-grid">
                  <PanelSkeleton />
                  <PanelSkeleton />
                </div>
              ) : isEmpty ? (
                <div className="du-empty">
                  <div className="du-empty-title">No data usage for this period</div>
                  <div className="du-empty-sub">There is no activity to display.</div>
                </div>
              ) : (
                <div className="du-breakdown-grid">
                  {showConnects && (
                    <div className="du-breakdown-panel du-connects">
                      <div className="du-breakdown-head">
                        <span className="du-icon-circle du-icon-green" aria-hidden="true">☎</span>
                        <span className="du-breakdown-title">Connects</span>
                        <span className="du-breakdown-count du-text-green">{connectCount.toLocaleString('en-IN')}</span>
                      </div>
                      <StatusList items={withPct(connects)} accent="#13A66A" emptyText="No connects for this period" />
                    </div>
                  )}
                  {showNonConnects && (
                    <div className="du-breakdown-panel du-non">
                      <div className="du-breakdown-head">
                        <span className="du-icon-circle du-icon-orange" aria-hidden="true">☎</span>
                        <span className="du-breakdown-title">Non Connects</span>
                        <span className="du-breakdown-count du-text-orange">{nonConnectCount.toLocaleString('en-IN')}</span>
                      </div>
                      <StatusList items={withPct(nonConnects)} accent="#F07820" emptyText="No non connects for this period" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <style>{`
          .du-overlay { position: fixed; inset: 0; z-index: 99997; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15,30,50,.38); box-sizing: border-box; }
          .du-modal { display: flex; flex-direction: column; width: min(860px, calc(100vw - 48px)); max-width: calc(100vw - 20px); max-height: calc(100vh - 48px); background: #FFFFFF; border: 1px solid #DCE7F5; border-radius: 14px; box-shadow: 0 18px 50px rgba(25,55,90,.18); overflow: hidden; box-sizing: border-box; }
          .du-header { flex: 0 0 auto; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #E6EEF8; }
          .du-header-text { min-width: 0; }
          .du-title { font-size: 18px; font-weight: 700; color: #10213D; line-height: 1.2; }
          .du-subtitle { font-size: 12.5px; color: #607795; margin-top: 2px; }
          .du-header-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
          .du-target-link { height: 36px; padding: 0 12px; background: transparent; border: 1px solid #C9DAEE; border-radius: 10px; color: #2F7BFF; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
          .du-target-link:hover { background: #F1F6FF; }
          .du-target-link:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
          .du-period { height: 36px; width: 150px; max-width: 165px; min-width: 130px; background: #fff; border: 1px solid #C9DAEE; border-radius: 10px; color: #10213D; font-size: 13px; font-weight: 600; padding: 0 10px; outline: none; cursor: pointer; font-family: inherit; }
          .du-period:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
          .du-close { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: 10px; color: #6D7E95; cursor: pointer; }
          .du-close:hover { background: #F1F5FA; }
          .du-close:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
          .du-content { flex: 1 1 auto; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 12px 16px 14px; box-sizing: border-box; }
          .du-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
          .du-summary-grid > * { min-width: 0; }
          .du-card { border-radius: 10px; padding: 11px 13px; min-width: 0; box-sizing: border-box; }
          .du-card-allotted { background: #F1F6FF; border: 1px solid #CFE0FF; }
          .du-card-used { background: #FFF3F5; border: 1px solid #F5D5DC; }
          .du-card-label { font-size: 12.5px; color: #33475F; font-weight: 600; }
          .du-card-value { font-size: 20px; font-weight: 750; color: #10213D; margin-top: 3px; font-variant-numeric: tabular-nums; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; }
          .du-track { height: 6px; border-radius: 999px; background: #E3EAF3; overflow: hidden; margin-top: 7px; }
          .du-fill { height: 100%; border-radius: 999px; max-width: 100%; transition: width .4s ease; }
          .du-fill-blue { background: #2F7BFF; }
          .du-fill-red { background: #E5485D; }
          .du-today { margin-top: 10px; background: #F8FBFF; border: 1px solid #DCE7F5; border-radius: 12px; overflow: hidden; min-width: 0; }
          .du-today-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px; border-bottom: 1px solid #E6EEF8; }
          .du-today-text { min-width: 0; }
          .du-today-title { font-size: 14px; font-weight: 700; color: #10213D; }
          .du-today-value { font-size: 20px; font-weight: 750; color: #10213D; margin-top: 1px; font-variant-numeric: tabular-nums; line-height: 1.1; }
          .du-filter { height: 36px; background: #fff; border: 1px solid #C9DAEE; border-radius: 10px; color: #10213D; font-size: 13px; font-weight: 600; padding: 0 10px; outline: none; cursor: pointer; font-family: inherit; flex-shrink: 0; max-width: 100%; }
          .du-filter:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
          .du-today-body { padding: 10px 12px 12px; min-width: 0; }
          .du-breakdown-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; min-width: 0; }
          .du-breakdown-grid > * { min-width: 0; }
          .du-breakdown-panel { border-radius: 10px; padding: 8px 10px; background: #fff; border: 1px solid; min-width: 0; box-sizing: border-box; }
          .du-connects { background: #F1FBF7; border-color: #CFEFE1; }
          .du-non { background: #FFF8F0; border-color: #F3DEC8; }
          .du-breakdown-head { display: flex; align-items: center; gap: 7px; padding-bottom: 6px; border-bottom: 1px solid rgba(16,33,61,.08); margin-bottom: 6px; min-width: 0; }
          .du-icon-circle { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
          .du-icon-green { background: #D9F2E5; color: #13A66A; }
          .du-icon-orange { background: #FDEBD7; color: #F07820; }
          .du-breakdown-title { font-size: 13px; font-weight: 700; color: #10213D; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .du-breakdown-count { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
          .du-text-green { color: #13A66A; }
          .du-text-orange { color: #F07820; }
          .du-status-list { display: flex; flex-direction: column; gap: 6px; max-height: 210px; overflow-y: auto; overflow-x: hidden; padding-right: 2px; padding-bottom: 2px; min-width: 0; }
          .du-status-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(70px,110px) 34px 44px; gap: 8px; align-items: center; min-width: 0; }
          .du-status-row > * { min-width: 0; }
          .du-status-name { font-size: 12px; font-weight: 500; color: #1B2E49; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .du-status-track { height: 6px; border-radius: 999px; background: #E4EAF2; overflow: hidden; }
          .du-status-fill { display: block; height: 100%; border-radius: 999px; max-width: 100%; }
          .du-status-count { font-size: 12.5px; font-weight: 650; color: #10213D; text-align: right; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; }
          .du-status-pct { font-size: 10.5px; font-weight: 700; text-align: center; background: #EDF2F9; color: #40587A; border-radius: 999px; padding: 2px 4px; font-variant-numeric: tabular-nums; white-space: nowrap; }
          .du-status-empty { text-align: center; font-size: 12px; color: #607795; padding: 12px 8px; }
          .du-empty { text-align: center; padding: 16px 12px; }
          .du-empty-title { font-size: 14px; font-weight: 700; color: #10213D; }
          .du-empty-sub { font-size: 12.5px; color: #607795; margin-top: 4px; }
          .du-sk { background: linear-gradient(90deg, #E8EEF6 25%, #F4F7FB 50%, #E8EEF6 75%); background-size: 200% 100%; animation: du-shimmer 1.4s infinite; }
          @keyframes du-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          @media (max-width: 999px) and (min-width: 700px) {
            .du-modal { width: calc(100vw - 32px); }
            .du-breakdown-grid { grid-template-columns: 1fr; }
          }
          @media (max-width: 699px) {
            .du-overlay { padding: 10px; }
            .du-modal { width: calc(100vw - 20px); max-height: calc(100vh - 20px); border-radius: 14px; }
            .du-header { padding: 12px; flex-wrap: wrap; }
            .du-title { font-size: 18px; }
            .du-subtitle { font-size: 12px; }
            .du-header-controls { width: 100%; }
            .du-period { flex: 1; width: auto; min-width: 0; }
            .du-content { padding: 12px 12px 14px; }
            .du-summary-grid { grid-template-columns: 1fr; }
            .du-breakdown-grid { grid-template-columns: 1fr; }
            .du-card-value { font-size: 18px; }
            .du-today-value { font-size: 18px; }
            .du-status-row { grid-template-columns: minmax(0,1fr) 38px 46px; }
            .du-status-track { grid-column: 1 / -1; order: 2; }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}

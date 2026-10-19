import { useEffect, useMemo, useState } from 'react';
import { fetchMyMonthlyDailyReports, fetchBugActivity } from '../../../api/dailyReports';
import ReportView from '../../../components/DailyReport/ReportView';
import { collectTasks, perReporter, reportDay, textEntries } from '../../super-admin/components/devReportAgg';
import { bugWorkByPerson, totalsOf, personDayEvents, monthRange, KIND_LABELS } from '../../super-admin/components/bugWorkAgg';
import { toast } from '../components/Toast';

// A developer's own month: every daily report they filed for `month`, rolled up
// into day chips + totals. Read-only — clicking a day opens that day's report
// and hands the date back through onEditDay so the Daily tab opens straight on
// it (the shared DailyReport engine owns its own date state and is remounted
// with a key by the caller).

const font = "'Hanken Grotesk', sans-serif";

const IST_MS = 5.5 * 60 * 60 * 1000;
const dayOf = (ts) => {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : new Date(t + IST_MS).toISOString().slice(0, 10);
};
const todayIso = () => dayOf(Date.now());

const currentMonth = () => todayIso().slice(0, 7);
const daysInMonth = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
const isoOf = (m, d) => `${m}-${String(d).padStart(2, '0')}`;

const monthLabel = (m) => {
  const d = new Date(`${m}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const shortDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

const shiftMonth = (m, n) => {
  const t = new Date(`${m}-01T00:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() + n);
  return t.toISOString().slice(0, 7);
};

const glass = {
  background: 'rgba(255,255,255,0.5)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.7)',
  boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
};

const stat = (label, value, color) => (
  <div key={label} style={{ ...glass, borderRadius: 14, padding: '14px 16px', minWidth: 130, flex: '1 1 130px' }}>
    <div style={{ fontFamily: font, fontSize: 24, fontWeight: 600, color, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontFamily: font, fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
  </div>
);

const navBtn = {
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(226,232,240,0.9)',
  borderRadius: 9,
  background: '#fff',
  color: '#475569',
  cursor: 'pointer',
};

export default function DevMonthly({ month, onMonthChange, onEditDay }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(null);
  // My own bug-tracker actions for the month — reported / fixed / verified.
  // The feed is scoped server-side to the signed-in user.
  const [bugActivity, setBugActivity] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const { from, to } = monthRange(month);
    Promise.all([
      fetchMyMonthlyDailyReports('dev', month),
      fetchBugActivity(from, to).catch(() => null),
    ])
      .then(([res, bugRes]) => {
        if (!alive) return;
        setReports(Array.isArray(res?.reports) ? res.reports : []);
        setBugActivity(Array.isArray(bugRes?.activity) ? bugRes.activity : []);
      })
      .catch((err) => {
        if (!alive) return;
        setReports([]);
        setBugActivity([]);
        toast(err.message || 'Could not load your month', 'error');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month]);

  const today = todayIso();
  const total = daysInMonth(month);

  // The one developer row this endpoint can return (it is scoped to the signed
  // -in reporter), used for the day lookup below.
  const mine = useMemo(() => perReporter(reports, month < today.slice(0, 7) ? total : Number(today.slice(8, 10)))[0] || null, [reports, month, today, total]);
  const team = useMemo(() => collectTasks(reports), [reports]);
  const remarks = reports.filter((r) => r.remark).length;

  // My bug work this month: the tracker row for me (only my events come back
  // from the server) plus the slice for the day that is open below.
  const bug = useMemo(() => bugWorkByPerson(bugActivity)[0] || null, [bugActivity]);
  const bugTotals = useMemo(() => totalsOf(bug ? [bug] : []), [bug]);
  const dayBugs = useMemo(() => personDayEvents(bug, day), [bug, day]);

  const bugNotes = useMemo(() => {
    const entries = [];
    for (const r of reports) {
      const lines = textEntries([r], 'dev_notes', 'technical_issues')[0]?.lines || [];
      if (!lines.length) continue;
      const d = reportDay(r.report_date);
      entries.push({ reporter: d ? shortDay(d) : 'Report', lines });
    }
    return entries;
  }, [reports]);

  // Open the most recent filed day on load so the panel is never blank.
  useEffect(() => {
    if (!mine || mine.dayList.length === 0) { setDay(null); return; }
    setDay((d) => (d && mine.daySet.has(d) ? d : mine.dayList[mine.dayList.length - 1]));
  }, [mine]);

  const active = useMemo(() => reports.find((r) => reportDay(r.report_date) === day) || null, [reports, day]);

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ height: 96, borderRadius: 14, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 37%,#f1f5f9 63%)', backgroundSize: '400% 100%', animation: 'dev-month-shimmer 1.4s ease infinite' }} />
        ))}
        <style>{`@keyframes dev-month-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }`}</style>
      </div>
    );
  }

  const daysReported = mine?.daysReported || 0;
  const expected = mine?.expectedDays || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Month stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            style={{ ...navBtn, opacity: 0.6 }}
            aria-label="Previous month"
            title="Previous month"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span style={{ ...glass, borderRadius: 10, padding: '8px 14px', fontFamily: font, fontSize: 14, fontWeight: 600 }}>{monthLabel(month)}</span>
          <button
            type="button"
            style={{ ...navBtn, opacity: month >= currentMonth() ? 0.4 : 1, cursor: month >= currentMonth() ? 'not-allowed' : 'pointer' }}
            aria-label="Next month"
            title="Next month"
            disabled={month >= currentMonth()}
            onClick={() => onMonthChange(shiftMonth(month, 1))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Month totals */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {stat('Days reported', expected ? `${daysReported} / ${expected}` : daysReported, '#6366f1')}
        {stat('Tasks done', team.counts.done, '#16a34a')}
        {stat('In progress', team.counts.wip, '#d97706')}
        {stat('Pending', team.counts.pending, '#64748b')}
        {stat('Reports filed', reports.length, '#2563eb')}
        {stat('Remarks received', remarks, '#0ea5e9')}
        {/* Filing / fixing / verifying bugs is work too — a month of QA shows
            here even when the prose sections were never touched. */}
        {bugTotals.total > 0 && stat('Bugs reported', bugTotals.reported, '#dc2626')}
        {bugTotals.total > 0 && stat('Bugs fixed', bugTotals.fixed, '#d97706')}
        {bugTotals.total > 0 && stat('Bugs verified', bugTotals.verified, '#16a34a')}
      </div>

      {/* Day chips */}
      <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
        <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>
          Pick a day to read your report
        </div>
        {reports.length === 0 && bugActivity.length === 0 ? (
          <div style={{ fontFamily: font, fontSize: 13, color: '#94a3b8' }}>
            You have not filed a report in {monthLabel(month)} yet — open the Daily tab to write one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
              const iso = isoOf(month, n);
              const hasReport = mine?.daySet.has(iso) || false;
              // A day you only filed bugs on is still a day you worked — the
              // chip opens for bug activity even with no report written.
              const hasBug = bug?.byDay?.has(iso) || false;
              const has = hasReport || hasBug;
              const isFuture = iso > today;
              const on = iso === day;
              const note = hasReport && hasBug ? 'report + bug work' : hasReport ? 'report filed' : 'bug work only';
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!has}
                  title={has ? `${shortDay(iso)} — ${note}` : isFuture ? 'Not yet' : 'No report or bug activity'}
                  onClick={() => has && setDay(iso)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    border: has ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(226,232,240,0.9)',
                    background: on ? '#6366f1' : has ? 'rgba(34,197,94,0.10)' : '#fff',
                    color: on ? '#fff' : has ? '#334155' : '#cbd5e1',
                    fontFamily: font,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: has ? 'pointer' : 'not-allowed',
                    boxShadow: iso === today && !on ? 'inset 0 0 0 2px #6366f1' : undefined,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* The selected day's report, read-only */}
      {active && (
        <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              Report · {shortDay(day)}
            </div>
            <button
              type="button"
              onClick={() => onEditDay?.(day)}
              style={{
                marginLeft: 'auto',
                fontFamily: font,
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #c7d2fe',
                background: '#eef2ff',
                color: '#4338ca',
                cursor: 'pointer',
              }}
            >
              Edit this day
            </button>
          </div>
          {active.remark && (
            <div style={{ fontFamily: font, fontSize: 12.5, color: '#1d4ed8', background: 'rgba(37,99,235,0.08)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
              <b>HOD remark{active.remark_by ? ` · ${active.remark_by}` : ''}:</b> {active.remark}
            </div>
          )}
          <ReportView panel="dev" data={active.data || {}} />
        </div>
      )}

      {/* The selected day's bug-tracker work. Shown whether or not a report
          was written that day — filing bugs IS work, and a QA-only day still
          deserves a record here. */}
      {day && dayBugs.length > 0 && (
        <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
          <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>
            Bug work · {shortDay(day)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayBugs.map((ev) => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 10, background: 'rgba(148,163,184,0.10)' }}>
                <span style={{ flex: 'none', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: ev.kind === 'reported' ? '#991b1b' : ev.kind === 'fixed' ? '#92400e' : '#15803d', background: ev.kind === 'reported' ? 'rgba(220,38,38,.12)' : ev.kind === 'fixed' ? 'rgba(217,119,6,.14)' : 'rgba(22,163,74,.12)' }}>
                  {KIND_LABELS[ev.kind] || ev.kind}
                </span>
                <span style={{ flex: '1 1 200px', fontFamily: font, fontSize: 13, color: '#0f172a' }}>{ev.title}</span>
                <span style={{ fontFamily: font, fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  {[ev.module, ev.severity && ev.severity.toUpperCase()].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The month's bug notes, one block per day */}
      {bugNotes.length > 0 && (
        <div style={{ ...glass, borderRadius: 14, padding: 16 }}>
          <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>
            Bugs &amp; technical blocks this month
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bugNotes.map((e, i) => (
              <div key={i}>
                <div style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{e.reporter}</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {e.lines.map((l, j) => (
                    <li key={j} style={{ fontFamily: font, fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

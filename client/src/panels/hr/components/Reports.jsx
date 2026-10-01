import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useHR,
  fetchHrAttendanceSummary,
  fetchMyHrDailyReport,
  saveHrDailyReport,
  sendHrWhatsAppText,
} from '../store';
import { toast } from '../../../components/Toast';
import { Dropdown, DatePicker } from './ui';
import { Users, Clock, Check, X, Send, WhatsApp, ChartBar, Cal, Printer } from '../icons';

// HR > Reports — one screen, two sections, in this order everywhere (table, print
// sheet and the WhatsApp body alike): recruiter MIS first, attendance second.
//
// Which figures are derived and which are typed is a data decision, not a
// preference. Probing the live database showed:
//
//   derivable   leads.status / leads.notes meta (job_role, stage)
//   NOT derivable
//     * call_logs is empty — no call records exist at all, so "Calls Made" has
//       no source.
//     * lead interview entries only ever carry status 'Scheduled' or
//       'Cancelled'; nothing marks an interview as held, so "Interviews
//       Attended" has no source.
//     * no lead status or column represents a joining, so "Joining Confirmed"
//       has no source.
//
// Rather than print a confident-looking 0 for those three, they are typed by the
// reporter and saved per recruiter in hr_daily_reports.mis_manual.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The IST calendar day of a timestamp, as 'YYYY-MM-DD'.
//
// Deliberately NOT `iso.slice(0, 10)`: that buckets by UTC, so a lead created at
// 02:00 UTC lands on the previous day for a 5.5-hour stretch every evening and
// the recruiter table would silently disagree with the attendance figures next
// to it — the backend pins its sessions to Asia/Kolkata (config/db.js), so its
// dates are already IST. This matches istDateStr() in models/attendanceModel.js.
const istDateOf = (ts) => {
  if (!ts) return null;
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
};

const todayIst = () => istDateOf(Date.now());

// Someone who has left the company does not belong in today's report. The
// attendance roster already drops them (see the `roster` CTE in
// hrDailyReportController.ATTENDANCE_SUMMARY_SQL, which filters on is_active and
// employment_status), so leaving them in the recruiter dropdown made this screen
// contradict its own headcount: the total on the left excluded them while the
// table beside it still listed them.
//
// Deliberately NOT isActiveRecruiter() from ../recruiterFilters: that helper also
// requires department to match /recruit/i, which would drop a recruiter whose
// department is plain 'HR' — including whoever is filling in the report, since
// this is keyed on employment state alone, not on who ranks on the leaderboard.
//
// A missing employment_status is treated as still-employed rather than as a
// departure: a projected row that omits the column must not empty the dropdown.
const isStillEmployed = (r) => {
  if (!r) return false;
  if (r.is_active === false) return false;
  const status = r.employment_status;
  if (status != null && status !== '') {
    return String(status).toLowerCase() === 'active';
  }
  return true;
};

// Day arithmetic on bare 'YYYY-MM-DD' strings. Parsing them as UTC midnight and
// doing the maths in UTC is DST-proof, unlike new Date(y, m, d ± n).
const DAY_MS = 24 * 60 * 60 * 1000;
const shiftDay = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// The period cannot describe a day that has not happened yet: attendance has not
// happened and leads cannot have been created. So the picker is capped at today
// and pickDate() re-checks, because a stale bookmark/query param or a keyboard
// entry could still land outside that range.
const pickDate = (next) => {
  const value = typeof next === 'string' ? next : (next?.target?.value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  if (value > todayIst()) { toast('A daily report cannot be for a future date.', 'error'); return; }
  return value;
};

const relativeLabel = (iso) => {
  if (!iso) return '';
  const diff = Math.round((Date.parse(`${todayIst()}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  if (diff === 7) return 'Last week';
  return '';
};

// `leads.notes` is a TEXT column holding a JSON array. Alongside free-text notes
// written by HR it carries tagged entries: { __meta: true, type, value }. The
// `interviews` value is itself a JSON *string* (double-encoded), so it needs a
// second parse. Anything without __meta is human prose and is ignored here.
const parseLeadNotes = (raw) => {
  const meta = { jobRoles: [], stages: [] };
  if (!raw) return meta;
  let entries;
  try {
    entries = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return meta;
  }
  if (!Array.isArray(entries)) return meta;
  for (const entry of entries) {
    if (!entry || entry.__meta !== true) continue;
    if (entry.type === 'job_role' && entry.value) meta.jobRoles.push(String(entry.value));
    else if (entry.type === 'stage' && entry.value) meta.stages.push(String(entry.value));
  }
  return meta;
};

// A lead belongs to a report date if it was either created or last touched on
// that day — a candidate called back this evening belongs to today's MIS even
// though the row is weeks old.
const activeOn = (lead, date) => istDateOf(lead.created_at) === date || istDateOf(lead.updated_at) === date;

// Same rule the Recruiters leaderboard uses, plus the name columns: a good share
// of leads have recruiter_id NULL and only carry who entered them.
const belongsTo = (lead, recruiter) => {
  if (!recruiter) return false;
  if (lead.recruiter_id && String(lead.recruiter_id) === String(recruiter.id)) return true;
  if (lead.created_by && String(lead.created_by) === String(recruiter.id)) return true;
  const name = String(recruiter.name || '').trim().toLowerCase();
  if (!name) return false;
  return [lead.created_by_name, lead.scheduled_by_name].some(n => String(n || '').trim().toLowerCase() === name);
};

// 'rejected' alone reads as 2 leads while 'not_interested' reads as 67; both are
// the recruiter turning a candidate down, so Rejected counts the pair.
const isRejected = (status) => status === 'rejected' || status === 'not_interested';
const isPendingFollowUp = (status) => status === 'followed_up' || status === 'call_back';
const isScheduled = (lead, meta) => lead.status === 'scheduled' || meta.stages.includes('Interview Scheduled');

const MANUAL_FIELDS = [
  { key: 'interviews_attended', label: 'Interviews Attended', type: 'number' },
  { key: 'joining_confirmed', label: 'Joining Confirmed', type: 'number' },
  { key: 'calls_made', label: 'Calls Made', type: 'number' },
  { key: 'interested', label: 'Candidates Interested', type: 'text' },
];

const emptyManual = () => ({
  interviews_attended: '', joining_confirmed: '', calls_made: '', interested: '', remarks: '',
});

const splitNames = (value) => String(value || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);

const pad = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');

const manualNumber = (entry, key) => {
  const raw = entry?.[key];
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
};

const isBlank = (entry, key) => {
  const raw = entry?.[key];
  return raw === undefined || raw === null || String(raw).trim() === '';
};

// Plain JSON.stringify cannot be compared across reloads here: mis_manual comes
// back out of jsonb in whatever order Postgres stored it, and key order changes
// as soon as one field is edited, which would report a phantom unsaved change on
// every load. Sorting keys makes the comparison order-independent.
const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
};

const snapshotOf = (absences, manual) => stableStringify({
  absences: { wopi: absences.wopi, wpi: absences.wpi, terminations: absences.terminations },
  manual,
});

// One row of the comparison table. `typed: true` marks the three figures the
// reporter types; they are dotted-underlined and render as a dash when blank so
// they never read as a system count.
const COLUMNS = [
  { key: 'name', label: 'Recruiter' },
  { key: 'leads', label: 'Leads' },
  { key: 'scheduled', label: 'Int. Sched' },
  { key: 'selected', label: 'Selected' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'offers', label: 'Offers' },
  { key: 'attended', label: 'Int. Attended', typed: true, field: 'interviews_attended' },
  { key: 'joining', label: 'Joining', typed: true, field: 'joining_confirmed' },
  { key: 'pending', label: 'Follow-ups' },
  { key: 'calls', label: 'Calls', typed: true, field: 'calls_made' },
];

const sortValue = (row, key) => {
  switch (key) {
    case 'name': return String(row.recruiter.name || '').toLowerCase();
    case 'leads': return row.auto.leads;
    case 'scheduled': return row.auto.scheduled;
    case 'selected': return row.auto.selected;
    case 'rejected': return row.auto.rejected;
    case 'offers': return row.auto.offers;
    case 'pending': return row.auto.pending;
    case 'attended': return manualNumber(row.entry, 'interviews_attended');
    case 'joining': return manualNumber(row.entry, 'joining_confirmed');
    case 'calls': return manualNumber(row.entry, 'calls_made');
    default: return 0;
  }
};

const totalFor = (rows, key) => rows.reduce((sum, row) => sum + sortValue(row, key), 0);

function SortableHead({ column, sortKey, sortDir, onSort }) {
  const on = sortKey === column.key;
  return (
    <th className={column.key === 'name' ? undefined : 'hpr-num'}>
      <button
        type="button"
        className={`hpr-sort${on ? ' on' : ''}`}
        onClick={() => onSort(column.key)}
        title={on ? `Sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${column.label}`}
      >
        {column.label}{column.typed ? ' *' : ''}
        <span className="caret">{on ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

export default function Reports() {
  const { fetchLeads, fetchRecruiters, user } = useHR();

  const [date, setDate] = useState(todayIst);
  const [recruiterFilter, setRecruiterFilter] = useState('');

  const [recruiters, setRecruiters] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [absences, setAbsences] = useState({ wopi: '', wpi: '', terminations: '' });
  const [manual, setManual] = useState({});

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [sortKey, setSortKey] = useState('leads');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState({});
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // Snapshot of what is currently persisted, kept in a ref because it is only
  // ever read during render to derive the dirty flag.
  const savedSnapshot = useRef('');

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRecruiters(), fetchLeads()])
      .then(([rs, ls]) => {
        // Filtered on arrival so the dropdown and the MIS table are built from
        // the same list; see isStillEmployed for why.
        setRecruiters((Array.isArray(rs) ? rs : []).filter(isStillEmployed));
        setLeads(Array.isArray(ls) ? ls : []);
      })
      .catch(err => toast(err.message || 'Could not load recruiters and leads', 'error'))
      .finally(() => setLoading(false));
  }, [fetchRecruiters, fetchLeads]);

  // The derived attendance numbers are never stored, so they are refetched every
  // time the date moves. The typed half comes back with them in the same request.
  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setLoaded(false);
    Promise.all([fetchHrAttendanceSummary(date), fetchMyHrDailyReport(date)])
      .then(([sum, mine]) => {
        if (cancelled) return;
        setSummary(sum);
        const r = mine?.report || null;
        const nextAbs = {
          wopi: r?.absent_wopi || '',
          wpi: r?.absent_wpi || '',
          terminations: r?.terminations || '',
        };
        const next = {};
        for (const [id, entry] of Object.entries(r?.mis_manual || {})) {
          next[id] = { ...emptyManual(), ...entry };
        }
        setAbsences(nextAbs);
        setManual(next);
        // Whatever came back from the server IS the saved state, so seed the
        // snapshot here. Otherwise every fresh load would look unsaved.
        savedSnapshot.current = snapshotOf(nextAbs, next);
        setExpanded({});
        setLoaded(true);
      })
      .catch(err => { if (!cancelled) toast(err.message || 'Could not load the report', 'error'); })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  // Recruiter MIS, derived from the leads for this date only.
  const mis = useMemo(() => {
    const byRecruiter = new Map();
    // `recruiters` already excludes anyone who has left (see isStillEmployed), so
    // the same list drives the table, the totals and the WhatsApp body. Their rows
    // drop out of the report entirely rather than showing as a row of zeros, which
    // would read as a data-entry failure rather than an absence.
    for (const recruiter of recruiters) {
      const leadsForRecruiter = leads.filter(l => belongsTo(l, recruiter) && activeOn(l, date));
      const roles = new Set();
      const auto = {
        scheduled: 0, selected: 0, rejected: 0, offers: 0, pending: 0, leads: leadsForRecruiter.length,
      };
      for (const lead of leadsForRecruiter) {
        const meta = parseLeadNotes(lead.notes);
        if (isScheduled(lead, meta)) auto.scheduled += 1;
        if (lead.status === 'selected') auto.selected += 1;
        if (isRejected(lead.status)) auto.rejected += 1;
        if (meta.stages.includes('Offer Released')) auto.offers += 1;
        if (isPendingFollowUp(lead.status)) auto.pending += 1;
        for (const role of meta.jobRoles) roles.add(role);
      }
      byRecruiter.set(recruiter.id, {
        recruiter,
        auto,
        roles: [...roles].sort(),
        entry: manual[recruiter.id] || emptyManual(),
      });
    }
    return [...byRecruiter.values()];
  }, [recruiters, leads, date, manual]);

  const visibleMis = useMemo(
    () => (recruiterFilter ? mis.filter(m => String(m.recruiter.id) === String(recruiterFilter)) : mis),
    [mis, recruiterFilter],
  );

  // Busiest recruiter first is the useful default; re-clicking the active column
  // flips direction rather than resetting. Written as a plain branch rather
  // than setSortDir() inside the setSortKey updater, which must stay pure.
  const onSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' ? 'asc' : 'desc');
  }, [sortKey]);

  const sortedMis = useMemo(() => {
    const rows = [...visibleMis];
    rows.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av === bv) return String(a.recruiter.name || '').localeCompare(String(b.recruiter.name || ''));
      return (av < bv ? -1 : 1) * (sortDir === 'asc' ? 1 : -1);
    });
    return rows;
  }, [visibleMis, sortKey, sortDir]);

  const totals = useMemo(() => ({
    leads: totalFor(visibleMis, 'leads'),
    scheduled: totalFor(visibleMis, 'scheduled'),
    selected: totalFor(visibleMis, 'selected'),
    rejected: totalFor(visibleMis, 'rejected'),
    offers: totalFor(visibleMis, 'offers'),
    attended: totalFor(visibleMis, 'attended'),
    joining: totalFor(visibleMis, 'joining'),
    pending: totalFor(visibleMis, 'pending'),
    calls: totalFor(visibleMis, 'calls'),
  }), [visibleMis]);

  const setManualField = useCallback((recruiterId, key, value) => {
    setManual(prev => ({
      ...prev,
      [recruiterId]: { ...emptyManual(), ...(prev[recruiterId] || {}), [key]: value },
    }));
  }, []);

  const setAbsenceField = (key, value) => setAbsences(prev => ({ ...prev, [key]: value }));

  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const wopiList = splitNames(absences.wopi);
  const wpiList = splitNames(absences.wpi);
  const terminationList = splitNames(absences.terminations);

  const dirty = loaded && snapshotOf(absences, manual) !== savedSnapshot.current;

  const prettyDate = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveHrDailyReport({
        date,
        absent_wopi: absences.wopi,
        absent_wpi: absences.wpi,
        terminations: absences.terminations,
        mis_manual: manual,
      });
      // Only now is the in-editor state the persisted state.
      savedSnapshot.current = snapshotOf(absences, manual);
      setLastSavedAt(new Date());
      toast('Report saved', 'success');
    } catch (err) {
      toast(err.message || 'Could not save the report', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Recruiter MIS first, then attendance — the same order the screen shows.
  const buildMessage = useCallback(() => {
    const pretty = date
      ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    const lines = [`*HR DAILY REPORT*`, `${pretty}${user?.name ? `  ·  ${user.name}` : ''}`, ''];

    lines.push('*RECRUITER MIS*');
    if (visibleMis.length === 0) {
      lines.push('_No recruiter activity on this date._');
    } else {
      for (const m of visibleMis) {
        lines.push('', `*${m.recruiter.name}*  (${m.auto.leads} leads)`);
        lines.push(`Interviews Scheduled: ${pad(m.auto.scheduled)}`);
        lines.push(`Interviews Attended: ${pad(manualNumber(m.entry, 'interviews_attended'))}`);
        lines.push(`Selected: ${pad(m.auto.selected)}`);
        lines.push(`Rejected: ${pad(m.auto.rejected)}`);
        lines.push(`Offer Letters Released: ${pad(m.auto.offers)}`);
        lines.push(`Joining Confirmed: ${pad(manualNumber(m.entry, 'joining_confirmed'))}`);
        lines.push(`Follow-ups Pending: ${pad(m.auto.pending)}`);
        lines.push(`Handling Roles: ${m.roles.length ? `${m.roles.length} (${m.roles.join(', ')})` : '0'}`);
        const remarks = String(m.entry?.remarks || '').trim();
        if (remarks) lines.push(`Remarks: ${remarks}`);
      }
    }

    lines.push('', '*ATTENDANCE*');
    lines.push(`Present: ${pad(summary?.present)}`);
    lines.push(`Half Day: ${pad(summary?.half_day)}`);
    lines.push(`Absent (WO-PI): ${pad(wopiList.length)}`);
    lines.push(`Absent (WPI): ${pad(wpiList.length)}`);
    lines.push(`Terminations: ${pad(terminationList.length)}`);
    lines.push(`_Test members (excluded above): ${pad(summary?.test_members)}_`);

    return lines.join('\n');
  }, [date, user, visibleMis, summary, wopiList.length, wpiList.length, terminationList.length]);

  const sendReport = async () => {
    if (sending) return;
    const reporterName = (user?.name || '').trim();
    if (!reporterName) { toast('Your account has no name on record, so there is nobody to send this to.', 'error'); return; }
    setSending(true);
    try {
      // The recipient is resolved server-side from the reporter's own worker
      // record, so this can only ever go to HR's own number.
      const res = await sendHrWhatsAppText(undefined, reporterName, buildMessage(), 'hr_daily_report');
      toast(res?.send_mode === 'template'
        ? `Report sent to ${reporterName} (approved template)`
        : `Report sent to ${reporterName}`, 'success');
    } catch (err) {
      if (err.code === 'hr_worker_missing') {
        toast(`No volunteer record matches "${reporterName}", so there is no number to send to. Add one under Volunteers.`, 'error');
      } else if (err.code === 'hr_phone_missing') {
        toast(`${reporterName} has no usable phone number on record.`, 'error');
      } else if (err.code === 'hr_outside_window' || err.code === 'hr_template_missing') {
        toast(`${err.message} Copy the preview below and send it by hand.`, 'error');
      } else {
        toast(err.message || 'Could not send the report', 'error');
      }
    } finally {
      setSending(false);
    }
  };

  const relative = relativeLabel(date);
  const lastSavedLabel = lastSavedAt
    ? lastSavedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <>
      {/* Print-only masthead: the screen hides every heading, so the sheet needs
          its own title or it prints as an unlabelled block of numbers. */}
      <div className="hpr-print-only" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>HR DAILY REPORT</div>
        <div style={{ fontSize: 12 }}>{prettyDate}{user?.name ? `  ·  ${user.name}` : ''}</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <div className="hpr-bar">
            <div className="filter-group">
              <label>Report date</label>
              <DatePicker
                value={date}
                onChange={next => { const v = pickDate(next); if (v && v !== date) setDate(v); }}
                max={todayIst()}
              />
              <div className="hpr-rel">{relative ? <><b>{relative}</b> · {prettyDate}</> : prettyDate}</div>
            </div>

            <div className="filter-group">
              <label>Jump to</label>
              <div className="hpr-quick">
                <button type="button" className={relative === 'Today' ? 'active' : ''} onClick={() => setDate(todayIst())}>Today</button>
                <button type="button" className={relative === 'Yesterday' ? 'active' : ''} onClick={() => setDate(shiftDay(todayIst(), -1))}>Yesterday</button>
              </div>
            </div>

            <div className="filter-group" style={{ minWidth: 220 }}>
              <label>Recruiter</label>
              <Dropdown
                value={recruiterFilter}
                onChange={e => setRecruiterFilter(e?.target?.value ?? e)}
                searchable
                options={[{ value: '', label: 'All Recruiters' }, ...recruiters.map(r => ({ value: r.id, label: r.name }))]}
              />
            </div>

            <div className="hpr-actions">
              <span className={`hpr-dirty${dirty ? ' pending' : ''}`} title={dirty ? 'Unsaved changes on this date' : 'Everything typed here is saved'}>
                <span className="dot" />
                {dirty ? 'Unsaved changes' : (lastSavedLabel ? `Saved ${lastSavedLabel}` : 'No changes')}
              </span>
              <button type="button" className="btn btn-outline" onClick={() => window.print()} disabled={!loaded}>
                <Printer width={14} /> Print
              </button>
              <button type="button" className="btn" onClick={save} disabled={saving || !loaded}>
                {saving ? 'Saving…' : 'Save report'}
              </button>
              <button type="button" className="btn btn-primary" onClick={sendReport} disabled={sending || !loaded}>
                <WhatsApp width={15} /> {sending ? 'Sending…' : 'Send on WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Section 1: recruiter MIS ---------------- */}
      <div className="hpr-print-only print-section-title">Recruiter MIS</div>

      <div className="stats">
        <div className="stat"><ChartBar width={16} /> <div className="stat-label">Leads Touched</div><div className="stat-value">{totals.leads}</div></div>
        <div className="stat"><Cal width={16} /> <div className="stat-label">Interviews Scheduled</div><div className="stat-value" style={{ color: '#3b82f6' }}>{totals.scheduled}</div></div>
        <div className="stat"><Check width={16} /> <div className="stat-label">Selected</div><div className="stat-value" style={{ color: '#5B6B4E' }}>{totals.selected}</div></div>
        <div className="stat"><X width={16} /> <div className="stat-label">Rejected</div><div className="stat-value" style={{ color: '#c0392b' }}>{totals.rejected}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Recruiter MIS</h3>
          <span className="sub">Derived from leads created or updated on the report date</span>
        </div>
        <div className="card-pad">
          <div className="hpr-legend">
            <span><b>Counted from leads</b> — leads, scheduled, selected, rejected, offers, follow-ups</span>
            <span><b>Typed by you *</b> — attended, joining, calls have no source in the system</span>
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }} aria-hidden="true">
              {[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 190, borderRadius: 12 }} />)}
            </div>
          ) : sortedMis.length === 0 ? (
            <div className="empty">
              {recruiters.length === 0 ? 'No recruiters found.' : 'No recruiters match this filter.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {COLUMNS.map(c => <SortableHead key={c.key} column={c} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />)}
                    <th aria-label="Manual entry" />
                  </tr>
                </thead>
                <tbody>
                  {sortedMis.map(row => {
                    const open = !!expanded[row.recruiter.id];
                    return [
                      <tr key={row.recruiter.id} className={open ? 'hpr-open' : undefined}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Users width={14} />
                            <span>{row.recruiter.name}</span>
                          </div>
                          {row.roles.length > 0 && (
                            <div className="hpr-roles" title={row.roles.join(', ')}>{row.roles.join(', ')}</div>
                          )}
                        </td>
                        {COLUMNS.slice(1).map(c => {
                          if (c.typed) {
                            return (
                              <td key={c.key} className="hpr-num">
                                {isBlank(row.entry, c.field)
                                  ? <span className="hpr-blank">—</span>
                                  : <span className="hpr-typed">{manualNumber(row.entry, c.field)}</span>}
                              </td>
                            );
                          }
                          return <td key={c.key} className="hpr-num">{sortValue(row, c.key)}</td>;
                        })}
                        <td className="hpr-num">
                          <button type="button" className="hpr-btn-link" onClick={() => toggleExpanded(row.recruiter.id)}>
                            {open ? 'Close' : 'Edit typed'}
                          </button>
                        </td>
                      </tr>,
                      open && (
                        <tr key={`${row.recruiter.id}-edit`}>
                          <td colSpan={COLUMNS.length + 1} className="hpr-expander">
                            <div className="hpr-edit">
                              <div className="hpr-note">
                                There is no record of calls made, interviews held or joinings in the system, so
                                these are the reporter's own figures for {row.recruiter.name}. They are saved
                                against this date only.
                              </div>
                              <div className="hpr-edit-grid">
                                {MANUAL_FIELDS.map(f => (
                                  <label key={f.key} className="hpr-field">
                                    {f.label}
                                    <input
                                      type={f.type}
                                      min={f.type === 'number' ? 0 : undefined}
                                      value={row.entry[f.key] || ''}
                                      onChange={e => setManualField(row.recruiter.id, f.key, e.target.value)}
                                    />
                                  </label>
                                ))}
                              </div>
                              <label className="hpr-field">
                                Remarks
                                <textarea
                                  rows={2}
                                  placeholder="Anything worth carrying into tomorrow"
                                  value={row.entry.remarks || ''}
                                  onChange={e => setManualField(row.recruiter.id, 'remarks', e.target.value)}
                                />
                              </label>
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}

                  <tr className="hpr-total">
                    <td>Total ({visibleMis.length} {visibleMis.length === 1 ? 'recruiter' : 'recruiters'})</td>
                    <td className="hpr-num">{totals.leads}</td>
                    <td className="hpr-num">{totals.scheduled}</td>
                    <td className="hpr-num">{totals.selected}</td>
                    <td className="hpr-num">{totals.rejected}</td>
                    <td className="hpr-num">{totals.offers}</td>
                    <td className="hpr-num">{totals.attended}</td>
                    <td className="hpr-num">{totals.joining}</td>
                    <td className="hpr-num">{totals.pending}</td>
                    <td className="hpr-num">{totals.calls}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Section 2: attendance ---------------- */}
      <div className="hpr-print-only print-section-title">Attendance</div>

      <div className="stats">
        <div className="stat"><Clock width={16} /> <div className="stat-label">Present</div><div className="stat-value">{summaryLoading ? '—' : (summary?.present ?? 0)}</div></div>
        <div className="stat"><Clock width={16} /> <div className="stat-label">Half Day</div><div className="stat-value">{summaryLoading ? '—' : (summary?.half_day ?? 0)}</div></div>
        <div className="stat"><Users width={16} /> <div className="stat-label">Test Members</div><div className="stat-value" style={{ color: '#6b7280' }}>{summaryLoading ? '—' : (summary?.test_members ?? 0)}</div></div>
        <div className="stat"><X width={16} /> <div className="stat-label">Absent (WO-PI)</div><div className="stat-value" style={{ color: '#c0392b' }}>{wopiList.length}</div></div>
        <div className="stat"><X width={16} /> <div className="stat-label">Absent (WPI)</div><div className="stat-value" style={{ color: '#c0392b' }}>{wpiList.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Attendance Report</h3>
          <span className="sub">Present, half day and test members are derived; absences and terminations are typed</span>
        </div>
        <div className="card-pad">
          {summary && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--ink-soft)', marginBottom: 14 }}>
              <span>Total staff: <strong>{summary.total_staff}</strong></span>
              <span>On approved leave: <strong>{summary.on_leave}</strong></span>
              <span>Absent (derived, before typing): <strong>{summary.absent}</strong></span>
              <span>Test members excluded above: <strong>{summary.test_members}</strong></span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
            <label className="hpr-field">
              Absent (WO-PI) — paid absence
              <textarea
                rows={3}
                placeholder="One name per line, or separated by commas"
                value={absences.wopi}
                onChange={e => setAbsenceField('wopi', e.target.value)}
              />
              <div className="hpr-count">{wopiList.length} {wopiList.length === 1 ? 'person' : 'people'}</div>
            </label>

            <label className="hpr-field">
              Absent (WPI) — unpaid absence
              <textarea
                rows={3}
                placeholder="One name per line, or separated by commas"
                value={absences.wpi}
                onChange={e => setAbsenceField('wpi', e.target.value)}
              />
              <div className="hpr-count">{wpiList.length} {wpiList.length === 1 ? 'person' : 'people'}</div>
            </label>

            <label className="hpr-field">
              Terminations
              <textarea
                rows={3}
                placeholder="One name per line, or separated by commas"
                value={absences.terminations}
                onChange={e => setAbsenceField('terminations', e.target.value)}
              />
              <div className="hpr-count">{terminationList.length} {terminationList.length === 1 ? 'person' : 'people'}</div>
            </label>
          </div>
        </div>
      </div>

      <div className="card no-print">
        <div className="card-head">
          <h3><Send width={15} /> WhatsApp message</h3>
          <span className="sub">Goes to you, the reporter — recruiter MIS first, then attendance</span>
        </div>
        <div className="card-pad">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5, fontFamily: 'inherit', color: 'var(--ink)' }}>
            {buildMessage()}
          </pre>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={sendReport} disabled={sending || !loaded}>
              <WhatsApp width={15} /> {sending ? 'Sending…' : 'Send on WhatsApp'}
            </button>
          </div>
        </div>
      </div>

      <div className="hpr-print-only" style={{ marginTop: 22, paddingTop: 10, borderTop: '1px solid #000', fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26 }}>
          <div style={{ width: 180 }}>
            <div style={{ borderBottom: '1px solid #000', height: 1, marginTop: 26 }} />
            <div style={{ textAlign: 'center', marginTop: 4 }}>Prepared by</div>
          </div>
          <div style={{ width: 180 }}>
            <div style={{ borderBottom: '1px solid #000', height: 1, marginTop: 26 }} />
            <div style={{ textAlign: 'center', marginTop: 4 }}>Verified by</div>
          </div>
        </div>
      </div>
    </>
  );
}

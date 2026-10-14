import { useEffect, useMemo, useState } from 'react'
import { fetchRecruiterPerformance } from '../../../api/dailyReports'
import { toast } from '../../../components/Toast'
import { Block, Kpi, Empty, ReporterBar, TableWrap, NumberedList } from '../components/drShared'

// Recruitment summary inside Super-Admin Daily Reports → Recruiter tab.
//   Block 1 pulls the LIVE recruitment performance from the leads pipeline
//   (/recruiters/overview) — real numbers regardless of whether anyone has
//   filed a daily report yet.
//   Blocks 2–4 read the day's daily_reports rows (panel="recruiter"):
//   2. Vacancy-Wise Status     — Position / Required / Interviewed / Selected /
//      Joined / Pending rows from the column-table field.
//   3. Recruitment Challenges  — the reporters' challenge text (one per line).
//   4. Follow-Up Required      — Candidate / Follow-Up Date / Responsible
//      Recruiter rows.
// Values all live in report.data, so legacy plain-text reports still render.

const VACANCY_COLUMNS = [
  { key: 'position', label: 'Position' },
  { key: 'required', label: 'Required' },
  { key: 'interviewed', label: 'Interviewed' },
  { key: 'selected', label: 'Selected' },
  { key: 'joined', label: 'Joined' },
  { key: 'pending', label: 'Pending' },
]

const FOLLOWUP_COLUMNS = [
  { key: 'candidate', label: 'Candidate Name / Position' },
  { key: 'date', label: 'Follow-Up Date' },
  { key: 'recruiter', label: 'Responsible Recruiter' },
]

// Sum a numeric counter across reports; fall back to '—' when nobody reported it.
const pickText = (recReports, section, field) =>
  recReports.map((r) => r.data?.[section]?.[field]).find((v) => v != null && String(v).trim() !== '') ?? '—'

const asList = (value) => {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return String(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

// Collect table rows from every report's column-table field, deduped on the
// first column so repeat positions stay readable.
const collectRows = (recReports, section, field, columns) => {
  const out = []
  const seen = new Set()
  for (const r of recReports) {
    const raw = r.data?.[section]?.[field]
    const items = Array.isArray(raw) ? raw : asList(raw).map((s) => ({ [columns[0].key]: s }))
    for (const it of items) {
      if (!it || typeof it !== 'object') continue
      const first = String(it[columns[0].key] ?? '').trim()
      if (!first) continue
      const key = first.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ first, row: columns.map((c) => String(it[c.key] ?? '')) })
    }
  }
  return out
}

export default function RecruitmentDashboard({ date, recReports = [] }) {
  const [perf, setPerf] = useState(null)
  const [perfLoading, setPerfLoading] = useState(true)
  const summary = perf?.summary

  useEffect(() => {
    let alive = true
    setPerf(null)
    setPerfLoading(true)
    fetchRecruiterPerformance(date)
      .then((data) => { if (alive) setPerf(data || null) })
      .catch((err) => { if (alive && !err?.cancelled) toast(err.message || 'Could not load recruitment performance', 'error') })
      .finally(() => { if (alive) setPerfLoading(false) })
    return () => { alive = false }
  }, [date])

  const perfKpis = useMemo(() => {
    if (!summary) return []
    const todayLeads = (perf?.recruiterStats || []).reduce((s, r) => s + (Number(r.todayLeads) || 0), 0)
    return [
      { label: 'Active Recruiters', value: summary.activeRecruiters ?? summary.totalRecruiters ?? '—', accent: '#5B6B4E' },
      { label: 'Total Leads', value: summary.totalLeads ?? '—', accent: '#22c55e' },
      { label: "Today's Leads", value: todayLeads, accent: '#22c55e' },
      { label: 'Scheduled', value: summary.totalScheduled ?? '—' },
      { label: 'Interviewed', value: summary.totalInterviewed ?? '—' },
      { label: 'Joined', value: summary.totalJoined ?? '—', accent: '#22c55e' },
      { label: 'Rejected', value: summary.totalRejected ?? '—', accent: '#ef4444' },
      { label: 'Pending', value: summary.totalPending ?? '—', accent: '#f59e0b' },
      { label: 'Follow-Up Due', value: summary.totalFollowUp ?? '—', accent: '#f97316' },
      { label: 'Conversion Rate', value: summary.overallConversionRate != null ? `${summary.overallConversionRate}%` : '—', accent: '#5B6B4E' },
    ]
  }, [summary, perf])

  const recruiters = useMemo(() => perf?.recruiterStats || [], [perf])

  const challenges = useMemo(() => recReports.flatMap((r) => asList(r.data?.rec_challenges?.challenges)), [recReports])
  const vacancies = useMemo(() => collectRows(recReports, 'rec_vacancy_status', 'vacancy_status', VACANCY_COLUMNS), [recReports])
  const followups = useMemo(() => collectRows(recReports, 'rec_followup', 'followups', FOLLOWUP_COLUMNS), [recReports])
  const reporters = [...new Set(recReports.map((r) => r.reporter_name).filter(Boolean))]

  return (
    <div>
      <div data-date={date}><ReporterBar names={reporters} emptyText="No recruitment report submitted on this date." /></div>

      <Block title="1. Recruitment Performance (Live)">
        {perfLoading ? (
          <div className="drx-skel" style={{ height: 120 }} aria-label="Loading recruitment performance" />
        ) : perfKpis.length === 0 ? (
          <Empty>No recruitment data available.</Empty>
        ) : (
          <div className="dr-kpis">
            {perfKpis.map((f) => <Kpi key={f.label} label={f.label} value={f.value} accent={f.accent} />)}
          </div>
        )}
        {!perfLoading && recruiters.length > 0 && (
          <TableWrap>
              <thead>
                <tr>
                  <th>Recruiter</th>
                  <th>Leads</th>
                  <th>Today</th>
                  <th>Scheduled</th>
                  <th>Interviewed</th>
                  <th>Joined</th>
                  <th>Rejected</th>
                  <th>Conv %</th>
                </tr>
              </thead>
              <tbody>
                {recruiters.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.leadsCount ?? 0}</td>
                    <td>{r.todayLeads ?? 0}</td>
                    <td>{r.scheduled ?? 0}</td>
                    <td>{r.interviewed ?? 0}</td>
                    <td>{r.joined ?? 0}</td>
                    <td>{r.rejected ?? 0}</td>
                    <td>{r.conversionRate ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
        )}
      </Block>

      <Block title="2. Vacancy-Wise Status">
        {vacancies.length === 0 ? (
          <Empty>No vacancies reported.</Empty>
        ) : (
          <TableWrap>
              <thead>
                <tr>
                  {VACANCY_COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {vacancies.map((v, i) => (
                  <tr key={i}>
                    {v.row.map((cell, j) => (
                      <td key={j} style={j === 0 ? { fontWeight: 600 } : undefined}>{cell || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
        )}
      </Block>

      <Block title="3. Recruitment Challenges">
        {challenges.length === 0 ? <Empty>No challenges reported.</Empty> : <NumberedList lines={challenges} />}
      </Block>

      <Block title="4. Follow-Up Required">
        {followups.length === 0 ? (
          <Empty>No follow-ups reported.</Empty>
        ) : (
          <TableWrap>
              <thead>
                <tr>
                  {FOLLOWUP_COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {followups.map((f, i) => (
                  <tr key={i}>
                    {f.row.map((cell, j) => (
                      <td key={j} style={j === 0 ? { fontWeight: 600 } : undefined}>{cell || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
        )}
      </Block>
    </div>
  )
}
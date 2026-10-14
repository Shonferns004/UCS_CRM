import { useMemo } from 'react'
import { Block, Kpi, Empty, StatusBar, ReporterBar, TableWrap, ProseList } from '../components/drShared'

// Social Media summary inside Super-Admin Daily Reports → Social tab, built from
// the day's daily_reports rows (panel="social"). Mirrors DeveloperDashboard so
// the two tabs read the same way. Four blocks:
//   1. Today's Tasks   — task status counts (Done / WIP / Pending).
//   2. Content Created — posts / reels / platforms and the published prose, one
//      row per reporter.
//   3. Support Required from HOD — prose from each social report.
//   4. Next Working Day Plan     — the reporters' one-per-line plans.
// Values all live in report.data, so legacy plain-text reports still render.

const asList = (value) => {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return String(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

const asText = (value) => (value == null ? '' : String(value))

const taskStatusOf = (it) => {
  if (it && typeof it === 'object') {
    if (it.status === 'done' || it.done) return 'done'
    if (it.status === 'wip') return 'wip'
  }
  return 'pending'
}

// Count the reporters' own task-board items by column, then add every task a
// manager assigned to the team (any date) so the totals move as members update
// their status. Assigned tasks are counted in addition to the report tasks.
const countTasks = (socialReports, assignedTasks) => {
  const counts = { done: 0, wip: 0, pending: 0 }
  const seen = new Set()
  for (const r of socialReports) {
    const items = r.data?.social_tasks?.tasks
    if (!Array.isArray(items)) continue
    for (const it of items) {
      const text = String((it && typeof it === 'object' ? it.text : it) ?? '').trim()
      if (!text) continue
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      counts[taskStatusOf(it)] += 1
    }
  }
  for (const t of assignedTasks) {
    const text = String(t.title ?? '').trim()
    if (!text) continue
    counts[taskStatusOf({ status: t.status })] += 1
  }
  return counts
}

// One row per reporter for the content-created block.
const contentRows = (socialReports) => {
  const rows = []
  for (const r of socialReports) {
    const c = r.data?.social_content || {}
    const posts = asText(c.posts_created).trim()
    const reels = asText(c.reels_created).trim()
    const platforms = asText(c.platforms_managed).trim()
    const published = asText(c.content_published).trim()
    if (!posts && !reels && !platforms && !published) continue
    rows.push({ reporter: r.reporter_name, posts, reels, platforms, published })
  }
  return rows
}

// Group a text field by report so each contributor is credited.
const textEntries = (socialReports, section, field) => {
  const out = []
  for (const r of socialReports) {
    const lines = asList(r.data?.[section]?.[field])
    if (lines.length) out.push({ reporter: r.reporter_name, lines })
  }
  return out
}

export default function SocialDashboard({ socialReports = [], assignedTasks = [] }) {
  const counts = useMemo(() => countTasks(socialReports, assignedTasks), [socialReports, assignedTasks])
  const content = useMemo(() => contentRows(socialReports), [socialReports])
  const support = useMemo(() => textEntries(socialReports, 'support', 'support'), [socialReports])
  const plans = useMemo(() => textEntries(socialReports, 'nextday', 'nextday'), [socialReports])
  const reporters = [...new Set(socialReports.map((r) => r.reporter_name).filter(Boolean))]

  return (
    <div>
      <ReporterBar names={reporters} emptyText="No social media report submitted on this date." />

      <Block title="1. Today's Tasks">
        <div className="dr-kpis">
          <Kpi label="Done" value={counts.done} accent="#22c55e" />
          <Kpi label="WIP" value={counts.wip} accent="#f59e0b" />
          <Kpi label="Pending" value={counts.pending} accent="#64748b" />
        </div>
        <StatusBar done={counts.done} wip={counts.wip} pending={counts.pending} />
      </Block>

      {/* <Block title="2. Content Created">
        {content.length === 0 ? (
          <Empty>No content reported.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Reporter</th>
                <th>Posts</th>
                <th>Reels</th>
                <th>Platforms</th>
                <th>Published</th>
              </tr>
            </thead>
            <tbody>
              {content.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.reporter || '—'}</td>
                  <td>{r.posts || '—'}</td>
                  <td>{r.reels || '—'}</td>
                  <td>{r.platforms || '—'}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{r.published || '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Block> */}

      {/* <Block title="3. Support Required from HOD">
        <ProseList entries={support} />
      </Block> */}

      <Block title="4. Next Working Day Plan">
        <ProseList entries={plans} />
      </Block>
    </div>
  )
}

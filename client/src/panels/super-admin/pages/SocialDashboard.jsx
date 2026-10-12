import { useMemo } from 'react'

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

function Block({ title, children }) {
  return (
    <div className="sa-card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="sa-card-title" style={{ marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function ProseList({ entries }) {
  return (
    <div>
      {entries.map(({ reporter, lines }, i) => (
        <div key={`${reporter}-${i}`} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 10, marginTop: 10 }}>
          <div className="sa-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>{reporter || 'Reporter'}</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
            {lines.map((line, i) => <li key={i} style={{ whiteSpace: 'pre-wrap' }}>{line}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function SocialDashboard({ socialReports = [], assignedTasks = [] }) {
  const counts = useMemo(() => countTasks(socialReports, assignedTasks), [socialReports, assignedTasks])
  const content = useMemo(() => contentRows(socialReports), [socialReports])
  const support = useMemo(() => textEntries(socialReports, 'support', 'support'), [socialReports])
  const plans = useMemo(() => textEntries(socialReports, 'nextday', 'nextday'), [socialReports])

  return (
    <div>
      <Block title="1. Today's Tasks">
        <div className="dr-kpis">
          <div className="dr-kpi" style={{ borderTop: '3px solid #22c55e' }}>
            <div className="dr-kpi-value" style={{ fontSize: 20 }}>{counts.done}</div>
            <div className="dr-kpi-label">Done</div>
          </div>
          <div className="dr-kpi" style={{ borderTop: '3px solid #f59e0b' }}>
            <div className="dr-kpi-value" style={{ fontSize: 20 }}>{counts.wip}</div>
            <div className="dr-kpi-label">WIP</div>
          </div>
          <div className="dr-kpi" style={{ borderTop: '3px solid #6b7280' }}>
            <div className="dr-kpi-value" style={{ fontSize: 20 }}>{counts.pending}</div>
            <div className="dr-kpi-label">Pending</div>
          </div>
        </div>
      </Block>

      <Block title="2. Content Created">
        {content.length === 0 ? (
          <div className="sa-muted" style={{ fontSize: 13 }}>No content reported.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sa-table">
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
            </table>
          </div>
        )}
      </Block>

      <Block title="3. Support Required from HOD">
        {support.length === 0 ? (
          <div className="sa-muted" style={{ fontSize: 13 }}>Nothing reported.</div>
        ) : (
          <ProseList entries={support} />
        )}
      </Block>

      <Block title="4. Next Working Day Plan">
        {plans.length === 0 ? (
          <div className="sa-muted" style={{ fontSize: 13 }}>Nothing reported.</div>
        ) : (
          <ProseList entries={plans} />
        )}
      </Block>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../api/auth'
import { Dropdown, SkeletonRows } from './ui'
import { Search } from '../icons'

function fmtDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function VerdictBadge({ verdict }) {
  const eligible = verdict === 'eligible'
  return (
    <span className={`badge ${eligible ? 'badge-present' : 'badge-absent'}`}>
      {eligible ? 'Eligible' : 'Not Eligible'}
    </span>
  )
}

function ScorePill({ percentage }) {
  const tone = percentage >= 70 ? 'badge-present' : percentage >= 40 ? 'badge-pending2' : 'badge-absent'
  return <span className={`badge ${tone}`}>{percentage}%</span>
}

function DetailModal({ row, onClose }) {
  if (!row) return null
  let questions = []
  try { questions = Array.isArray(row.questions) ? row.questions : [] } catch { questions = [] }
  let answers = {}
  try { answers = row.answers && typeof row.answers === 'object' ? row.answers : {} } catch { answers = {} }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <h3>Candidate Result</h3>
          <button className="btn btn-icon" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
            <div className="detail-box">
              <div className="detail-label">Name</div>
              <div className="detail-value">{row.first_name} {row.surname}</div>
            </div>
            <div className="detail-box">
              <div className="detail-label">Role</div>
              <div className="detail-value">{row.role_label || row.role}</div>
            </div>
            <div className="detail-box">
              <div className="detail-label">Age / DOB</div>
              <div className="detail-value">{row.age || '\u2014'} / {row.dob || '\u2014'}</div>
            </div>
            <div className="detail-box">
              <div className="detail-label">Score</div>
              <div className="detail-value">{row.marks} / {row.max_marks} <ScorePill percentage={row.percentage} /></div>
            </div>
            <div className="detail-box">
              <div className="detail-label">Verdict</div>
              <div className="detail-value"><VerdictBadge verdict={row.verdict} /></div>
            </div>
            <div className="detail-box">
              <div className="detail-label">Submitted</div>
              <div className="detail-value">{fmtDate(row.created_at)}</div>
            </div>
          </div>

          {row.ai_feedback && (
            <div style={{ background: 'var(--sand)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 14, fontSize: 13, lineHeight: 1.55 }}>
              <strong>AI Feedback:</strong> {row.ai_feedback}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
            {questions.map((q, i) => {
              const userAns = String(answers[i] ?? '').trim()
              const isShort = q.type === 'short'
              const correct = !isShort && userAns && userAns === String(q.answer ?? '').trim()
              return (
                <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    Q{i + 1}. {q.question}
                    <span className="badge badge-pending2" style={{ marginLeft: 8, fontSize: 10 }}>{isShort ? 'Short Answer' : 'MCQ'}</span>
                  </div>
                  {!isShort && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 4 }}>
                      Correct answer: <strong>{q.answer}</strong>
                    </div>
                  )}
                  <div style={{ fontSize: 12.5 }}>
                    Candidate: <strong style={{ color: correct ? 'var(--success)' : 'var(--danger)' }}>{userAns || 'No answer'}</strong>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Quizzes() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [verdictFilter, setVerdictFilter] = useState('')
  const [detail, setDetail] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api('/quiz/results', { _prefix: 'ucs' })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => { console.error('Quiz results error:', err.message); setError(err.message) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const roles = [...new Set(rows.map((r) => r.role_label || r.role).filter(Boolean))].sort()

  const filtered = rows.filter((r) => {
    if (roleFilter && (r.role_label || r.role) !== roleFilter) return false
    if (verdictFilter && r.verdict !== verdictFilter) return false
    if (search) {
      const s = search.toLowerCase()
      const name = `${r.first_name || ''} ${r.surname || ''}`.toLowerCase()
      if (!name.includes(s)) return false
    }
    return true
  })

  const stats = {
    total: rows.length,
    eligible: rows.filter((r) => r.verdict === 'eligible').length,
    notEligible: rows.filter((r) => r.verdict === 'not-eligible').length,
    avg: rows.length ? Math.round(rows.reduce((s, r) => s + (Number(r.percentage) || 0), 0) / rows.length) : 0,
  }

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Total candidates</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Eligible</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.eligible}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Not eligible</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.notEligible}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg score</div>
          <div className="stat-value">{stats.avg}%</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>All quiz results</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Dropdown className="filter-select" value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value)}
              options={[{ value: '', label: 'All verdicts' }, { value: 'eligible', label: 'Eligible' }, { value: 'not-eligible', label: 'Not eligible' }]} />
            <Dropdown className="filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              options={[{ value: '', label: 'All roles' }, ...roles.map((r) => ({ value: r, label: r }))]} />
            <div style={{ position: 'relative' }}>
              <Search width={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--ink-soft)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate…"
                style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px 7px 32px', background: 'transparent', fontSize: 13, width: 180, outline: 'none' }} />
            </div>
            <button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
        </div>

        {error && <div className="empty-state"><p style={{ color: 'var(--danger)' }}>{error}</p></div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Candidate</th>
                <th>Role</th>
                <th>Age</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Verdict</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={6} widths={[28, 130, 110, 40, 60, 70, 100, 130, 60]} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9}><div className="empty">No quiz results yet. Candidates take the quiz at <code>/recruit-quizz</code>.</div></td></tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                    <td>{i + 1}</td>
                    <td><strong>{r.first_name} {r.surname}</strong></td>
                    <td>{r.role_label || r.role}</td>
                    <td>{r.age || '\u2014'}</td>
                    <td>{r.marks} / {r.max_marks}</td>
                    <td><ScorePill percentage={r.percentage} /></td>
                    <td><VerdictBadge verdict={r.verdict} /></td>
                    <td className="ink-soft">{fmtDate(r.created_at)}</td>
                    <td><button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setDetail(r) }}>View</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

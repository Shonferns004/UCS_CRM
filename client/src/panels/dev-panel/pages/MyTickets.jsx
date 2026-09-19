import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUcs } from '../../../store'
import { getMyUnifiedTickets, getTicketBySource, updateTicketBySource, replyToTicketBySource, resolveTicketBySource } from '../api/tickets'
import { SourceBadge, PriorityBadge } from '../components/Badge'
import { toast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'

const STATUS_OPTIONS = [
  { value: '', label: 'All Active' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]
const STATUS_DOT = {
  open: { bg: '#737686', label: 'Open' },
  in_progress: { bg: '#3e3fcc', label: 'In Progress' },
  under_review: { bg: '#7c3aed', label: 'Under Review' },
  resolved: { bg: '#16a34a', label: 'Resolved' },
  closed: { bg: '#22c55e', label: 'Closed' },
}
const PAGE = 10

const timeAgo = (d) => {
  if (!d) return '—'
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'Yesterday' : days < 7 ? `${days}d ago` : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const fmt = (d) => !d ? '—' : new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const sCard = { background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }
const sMuted = { color: 'var(--ink-soft)' }
const sInk = { color: 'var(--ink)' }

export default function MyTickets() {
  const navigate = useNavigate()
  const { user } = useUcs()

  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState(null)
  const [resolve, setResolve] = useState(null)
  const [note, setNote] = useState('')
  const [closeTicket, setCloseTicket] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTickets((await getMyUnifiedTickets()) || []) }
    catch (e) { toast(e.message || 'Failed to load tickets', 'error'); setTickets([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => setPage(1), [statusFilter, search])

  const filtered = useMemo(() => {
    let r = tickets
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(t => (t.subject || '').toLowerCase().includes(q) || String(t.reference_id || '').toLowerCase().includes(q))
    }
    if (statusFilter) r = r.filter(t => t.status === statusFilter)
    return r
  }, [tickets, search, statusFilter])

  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const paged = filtered.slice((page - 1) * PAGE, page * PAGE)
  const startIdx = total ? (page - 1) * PAGE + 1 : 0
  const endIdx = total ? Math.min(page * PAGE, total) : 0

  const active = tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved')
  const crit = active.filter(t => t.priority === 'critical').length
  const prog = tickets.filter(t => t.status === 'in_progress').length
  const high = active.filter(t => t.priority === 'critical' || t.priority === 'high').length

  const canTrans = (t) => t.status !== 'resolved' && t.status !== 'closed'
  const openDetail = async (t) => {
    setDetailLoading(true)
    try { setDetail({ ...(await getTicketBySource(t.id, t._source)), _source: t._source }) }
    catch (e) { toast(e.message || 'Could not load ticket', 'error'); setDetail(null) }
    finally { setDetailLoading(false) }
  }
  const doResolve = async () => {
    if (!resolve) return
    if (!note.trim()) { toast('Please provide a resolution note', 'warning'); return }
    try {
      await resolveTicketBySource(resolve.id, note.trim(), resolve._source);
      toast('Ticket marked as resolved', 'success'); setResolve(null); setNote(''); load()
    } catch (e) { toast(e.message || 'Failed to resolve ticket', 'error') }
  }
  const doClose = async () => {
    if (!closeTicket) return
    try { await updateTicketBySource(closeTicket.id, { status: 'closed' }, closeTicket._source); toast('Ticket closed', 'success'); setCloseTicket(null); load() }
    catch (e) { toast(e.message || 'Failed to close ticket', 'error') }
  }
  const doReview = async (t) => {
    if (t.status === 'resolved' || t.status === 'closed') return
    try { await updateTicketBySource(t.id, { status: 'under_review' }, t._source); toast('Ticket sent for review', 'success'); load() }
    catch (e) { toast(e.message || 'Action failed', 'error') }
  }

  return (
    <div>
      {/* ===== Summary Banner ===== */}
      <div style={{ ...sCard, padding: 24, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, ...sInk }}>Your Active Tasks</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, ...sMuted }}>You have {high} high priority items requiring attention.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ background: '#ffdad6', color: '#93000a', padding: '8px 16px', borderRadius: 8, display: 'flex', flexDirection: 'column', minWidth: 64, alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{crit}</span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Critical</span>
          </div>
          <div style={{ background: '#dbeafe', color: '#1e40af', padding: '8px 16px', borderRadius: 8, display: 'flex', flexDirection: 'column', minWidth: 64, alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{prog}</span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>In Progress</span>
          </div>
          <button
            onClick={() => navigate('/dev-panel/tickets/new')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <span className='material-symbols-outlined' style={{ fontSize: 18 }}>add</span>
            New Ticket
          </button>
        </div>
      </div>

      {/* ===== Filters & Pagination ===== */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span className='material-symbols-outlined' style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, ...sMuted }}>search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder='Search my tickets...'
              style={{ width: 260, padding: '7px 10px 7px 34px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card-bg)', ...sInk, outline: 'none' }}
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card-bg)', ...sInk, outline: 'none', minWidth: 150 }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, ...sMuted }}>
          <span>Showing {startIdx}-{endIdx} of {total}</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: 4, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card-bg)', fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.5 : 1, ...sMuted }}><span className='material-symbols-outlined' style={{ fontSize: 16 }}>chevron_left</span></button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ padding: 4, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card-bg)', fontSize: 12, cursor: page === pages ? 'default' : 'pointer', opacity: page === pages ? 0.5 : 1, ...sMuted }}><span className='material-symbols-outlined' style={{ fontSize: 16 }}>chevron_right</span></button>
          </div>
        </div>
      </div>

      {/* ===== Data Table ===== */}
      <div style={{ ...sCard, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 920 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-container-low)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: 80, fontWeight: 600, fontSize: 10, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>ID</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: 110, fontWeight: 600, fontSize: 10, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>SOURCE</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Title</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: 100, fontWeight: 600, fontSize: 10, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Priority</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: 140, fontWeight: 600, fontSize: 10, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: 120, fontWeight: 600, fontSize: 10, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Updated</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 150, fontWeight: 600, fontSize: 10, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--ink)' }}>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, ...sMuted }}>Loading tickets...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, ...sMuted }}>No tickets found</td></tr>
              ) : paged.map(t => {
                const dot = STATUS_DOT[t.status] || { bg: '#94a3b8', label: t.status }
                const closed = t.status === 'closed'
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--line)', opacity: closed ? 0.7 : 1 }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, ...sMuted, whiteSpace: 'nowrap' }}>{t._source === 'developer' ? '#DEV-' : '#SUP-'}{t.id}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}><SourceBadge source={t.raised_by_panel} size='sm' /></td>
                    <td style={{ padding: '8px 12px', maxWidth: 320 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(closed ? { textDecoration: 'line-through', color: 'var(--ink-soft)' } : {}) }}>{t.subject || 'Untitled ticket'}</div>
                      {t.reference_id && <div style={{ fontSize: 10, ...sMuted }}>Ref: {t.reference_id}</div>}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}><PriorityBadge priority={t.priority} size='sm' /></td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot.bg, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: dot.color || dot.bg, textTransform: 'capitalize' }}>{dot.label}</span>
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, ...sMuted, whiteSpace: 'nowrap' }}>{timeAgo(t.updated_at || t.created_at)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 2 }}>
                        <button onClick={() => openDetail(t)} title='View' style={{ width: 28, height: 28, border: 'none', background: 'transparent', ...sMuted, borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span className='material-symbols-outlined' style={{ fontSize: 18 }}>visibility</span></button>
                        {canTrans(t) && (
                          <button onClick={() => setResolve(t)} title='Resolve' style={{ width: 28, height: 28, border: 'none', background: '#dcfce7', color: '#16a34a', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span className='material-symbols-outlined' style={{ fontSize: 18 }}>check</span></button>
                        )}
                        {canTrans(t) && t.status !== 'under_review' && (
                          <button onClick={() => doReview(t)} title='Send for review' style={{ width: 28, height: 28, border: 'none', background: '#eef2ff', color: '#4338ca', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span className='material-symbols-outlined' style={{ fontSize: 18 }}>done_all</span></button>
                        )}
                        {!closed && (
                          <button onClick={() => setCloseTicket(t)} title='Close' style={{ width: 28, height: 28, border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span className='material-symbols-outlined' style={{ fontSize: 18 }}>close</span></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Detail Modal ===== */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ ...sCard, borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, ...sInk }}>Ticket Details</h3>
              <button onClick={() => setDetail(null)} style={{ border: 'none', background: 'transparent', ...sMuted, cursor: 'pointer' }}><span className='material-symbols-outlined'>close</span></button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto' }}>
              {detailLoading ? <div style={{ fontSize: 13, ...sMuted }}>Loading...</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 14, fontSize: 13 }}>
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>ID</div>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, ...sInk }}>{detail._source === 'developer' ? '#DEV-' : '#SUP-'}{detail.id}</div>
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Source</div>
                  <div><SourceBadge source={detail.raised_by_panel} /></div>
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Subject</div>
                  <div style={{ fontWeight: 600, fontSize: 14, ...sInk, marginTop: 4 }}>{detail.subject}</div>
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Priority</div>
                  <div style={{ marginTop: 4 }}><PriorityBadge priority={detail.priority} /></div>
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Status</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[detail.status]?.bg || '#94a3b8' }} />
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{STATUS_DOT[detail.status]?.label || detail.status}</span>
                    </span>
                  </div>
                  {detail.reference_id && (
                    <>
                      <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Reference ID</div>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, marginTop: 4 }}>{detail.reference_id}</div>
                    </>
                  )}
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4, gridColumn: '1 / -1' }}>Description</div>
                  <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 12, gridColumn: '2 / -1' }}>{detail.description || <span style={{ ...sMuted }}>No description provided.</span>}</div>
                  {detail.resolution && (
                    <>
                      <div style={{ color: '#16a34a', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4, gridColumn: '1 / -1' }}>Resolution</div>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 12, gridColumn: '2 / -1' }}>{detail.resolution}</div>
                    </>
                  )}
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Created</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>{fmt(detail.created_at)}</div>
                  <div style={{ ...sMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Updated</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>{fmt(detail.updated_at)}</div>
                </div>
              )}
            </div>
            <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDetail(null)} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card-bg)', ...sMuted, cursor: 'pointer' }}>Close</button>
              <button onClick={() => { setDetail(null); navigate(`/dev-panel/tickets/${detail.id}`, { state: { source: detail._source } }) }} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: 'var(--primary)', color: 'var(--on-primary)', cursor: 'pointer' }}>Edit Ticket</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Resolve Modal ===== */}
      {resolve && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ ...sCard, borderRadius: 12, width: '100%', maxWidth: 420, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, ...sInk }}>Mark as Resolved</h3>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, ...sMuted }}>Please provide a resolution note before closing this ticket.</p>
              <label style={{ fontSize: 11, fontWeight: 700, ...sMuted, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Resolution Note <span style={{ color: '#ba1a1a' }}>*</span></label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder='Describe how the issue was fixed...'
                rows={4}
                style={{ width: '100%', padding: 10, fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card-bg)', ...sInk, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setResolve(null); setNote('') }} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card-bg)', ...sMuted, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doResolve} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: 'var(--primary)', color: 'var(--on-primary)', cursor: 'pointer' }}>Confirm Resolution</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Close Confirmation ===== */}
      <ConfirmDialog
        isOpen={!!closeTicket}
        onClose={() => setCloseTicket(null)}
        title='Close ticket?'
        message='This will mark the ticket as closed. You can reopen it later if needed.'
        confirmText='Close Ticket'
        cancelText='Cancel'
        variant='danger'
        onConfirm={doClose}
      />
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { getHrVerifiedTickets, getAllTickets, getPendingCount, approveTicket, rejectTicketSA } from '../api/endpoints'

const IST_OFFSET = 5.5 * 60 * 60 * 1000

function fmtTime(iso) {
  if (!iso) return '\u2014'
  const d = new Date(new Date(iso).getTime() + IST_OFFSET)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const STATUS_MAP = {
  pending: { label: 'Pending', cls: 'pending' },
  hr_verified: { label: 'HR Verified', cls: 'active' },
  approved: { label: 'Approved', cls: 'approved' },
  rejected: { label: 'Rejected', cls: 'rejected' },
}

function ActionModal({ ticket, onClose, onUpdated }) {
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)
  const info = STATUS_MAP[ticket.status] || { label: ticket.status, cls: '' }
  const isReviewed = ticket.status === 'approved' || ticket.status === 'rejected'

  return (
    <div className="sa-modal-overlay" onClick={onClose}>
      <div className="sa-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Ticket Review</h3>
          <span className={`sa-badge ${info.cls}`}>{info.label}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 2 }}>Worker</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ticket.workers?.name || 'Unknown'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ticket.workers?.department || '\u2014'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 2 }}>Date & Field</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ticket.date}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ticket.field === 'punch_in' ? 'Punch In' : 'Punch Out'}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 10 }}>Time Details</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, padding: 10, borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-soft)', marginBottom: 2 }}>Current</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{fmtTime(ticket.field === 'punch_in' ? ticket.punch_in_time : ticket.punch_out_time)}</div>
            </div>
            <div style={{ flex: 1, padding: 10, borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-soft)', marginBottom: 2 }}>Claimed</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{fmtTime(ticket.requested_time)}</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>Reason</div>
          <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            {ticket.reason || '\u2014'}
          </div>
        </div>

        {ticket.hr_remark && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>HR Remark</div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
              {ticket.hr_remark}
            </div>
          </div>
        )}

        {ticket.admin_remark && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>SA Remark</div>
            <div style={{ background: '#f0f4ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
              {ticket.admin_remark}
            </div>
          </div>
        )}

        {!isReviewed && (
          <>
            <label className="field">
              <span>SA Remark <span className="sa-muted">(optional)</span></span>
              <textarea rows={3} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Any final notes..." />
            </label>

            <div className="sa-modal-actions">
              <button className="btn btn-danger" onClick={async () => {
                if (!confirm('Reject this ticket? The attendance will NOT be updated.')) return
                setLoading(true)
                try { await rejectTicketSA(ticket.id, remark); onUpdated() } catch (e) { alert(e.message) }
                setLoading(false)
              }} disabled={loading}>Reject</button>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={async () => {
                setLoading(true)
                try { await approveTicket(ticket.id, remark); onUpdated() } catch (e) { alert(e.message) }
                setLoading(false)
              }} disabled={loading}>{loading ? 'Approving...' : 'Approve'}</button>
            </div>
          </>
        )}

        {isReviewed && (
          <div className="sa-modal-actions">
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Tickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionTicketId, setActionTicketId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('hr_verified')
  const [search, setSearch] = useState('')
  const [pendingCount, setPendingCount] = useState(0)

  const loadTickets = useCallback(async (status) => {
    setLoading(true)
    try {
      if (status === 'all') {
        const data = await getAllTickets()
        setTickets(Array.isArray(data) ? data : [])
      } else {
        const data = await getHrVerifiedTickets()
        setTickets(Array.isArray(data) ? data : [])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  const load = useCallback(() => {
    loadTickets(statusFilter)
    getPendingCount().then(d => setPendingCount(d?.count ?? 0)).catch(() => {})
  }, [loadTickets, statusFilter])

  useEffect(() => { load() }, [load])

  const handleFilterChange = (status) => {
    setStatusFilter(status)
    loadTickets(status)
  }

  const filtered = tickets.filter(t => {
    if (search) {
      const q = search.toLowerCase()
      const name = (t.workers?.name || '').toLowerCase()
      if (!name.includes(q)) return false
    }
    return true
  })

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h3>Attendance Corrections</h3>
          <div className="sa-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {pendingCount > 0 && (
              <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 600 }}>
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="sa-filters">
        <select value={statusFilter} onChange={e => handleFilterChange(e.target.value)}>
          <option value="hr_verified">HR Verified</option>
          <option value="all">All Tickets</option>
        </select>
        <input
          placeholder="Search by worker name\u2026"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <span className="sa-muted" style={{ fontSize: 12, alignSelf: 'center' }}>
          {filtered.length} of {tickets.length}
        </span>
      </div>

      <div className="sa-card" style={{ padding: 0 }}>
        {loading ? (
          <div className="sa-page" style={{display:'flex',alignItems:'center',justifyContent:'center',padding:40}}>
            <div style={{textAlign:'center'}}>
              <div className="spinner" style={{margin:'0 auto 12px'}} />
              <div style={{fontSize:13,color:'var(--text-soft)'}}>Loading tickets...</div>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="sa-loading">No tickets found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sa-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Date</th>
                  <th>Worker</th>
                  <th>Department</th>
                  <th>Field</th>
                  <th>Current</th>
                  <th>Claimed</th>
                  <th>Status</th>
                  <th>HR Remark</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const info = STATUS_MAP[t.status] || { label: t.status, cls: '' }
                  return (
                    <tr key={t.id} style={{ cursor: 'default' }}>
                      <td className="sa-muted">{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{t.date}</td>
                      <td><strong>{t.workers?.name || 'Unknown'}</strong></td>
                      <td className="sa-muted">{t.workers?.department || '\u2014'}</td>
                      <td>{t.field === 'punch_in' ? 'Punch In' : 'Punch Out'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {fmtTime(t.field === 'punch_in' ? t.punch_in_time : t.punch_out_time)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                        {fmtTime(t.requested_time)}
                      </td>
                      <td><span className={`sa-badge ${info.cls}`}>{info.label}</span></td>
                      <td className="sa-muted" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.hr_remark || '\u2014'}
                      </td>
                      <td>
                        <button className="btn btn-sm" onClick={() => setActionTicketId(t.id)}>
                          Review
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionTicketId && (() => {
        const ticket = tickets.find(t => t.id === actionTicketId)
        if (!ticket) return null
        return <ActionModal ticket={ticket} onClose={() => setActionTicketId(null)} onUpdated={() => { setActionTicketId(null); load() }} />
      })()}
    </div>
  )
}

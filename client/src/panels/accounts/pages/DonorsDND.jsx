import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiDelete } from '../api/auth'
import { Search, UserX, ChevronDown, RefreshCw, Trash2, ShieldOff, UserRoundX } from 'lucide-react'

const PAGE_SIZE = 20

const BUCKETS = [
  { key: 'dnd', label: 'DND Donors', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', soft: '#fee2e2' },
  { key: 'unassigned', label: 'Unassigned Donors', color: '#b45309', bg: '#fff8e7', border: '#fde68a', soft: '#fef3c7' },
]

export default function DonorsDND() {
  const [bucket, setBucket] = useState('dnd')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [dndTotal, setDndTotal] = useState(0)
  const [unassignedTotal, setUnassignedTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async (pg, q, type, append = false) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      params.set('limit', String(PAGE_SIZE))
      params.set('type', type)
      if (q) params.set('search', q)
      const res = await apiGet('/accounts/donors/dnd?' + params.toString())
      const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
      setTotal(res?.total ?? data.length)
      setDndTotal(res?.dnd_total ?? 0)
      setUnassignedTotal(res?.unassigned_total ?? 0)
      setRows(prev => (append ? [...prev, ...data] : data))
    } catch (e) {
      console.error('DND load error:', e.message)
      if (!append) setRows([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { setPage(1); load(1, search, bucket) }, [search, bucket, load])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    load(next, search, bucket, true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this donor? This cannot be undone.')) return
    setDeleting(id)
    try {
      await apiDelete('/accounts/donors/' + id)
      setRows(prev => prev.filter(r => r.id !== id))
      setTotal(prev => Math.max(0, prev - 1))
      if (bucket === 'dnd') setDndTotal(prev => Math.max(0, prev - 1))
      else setUnassignedTotal(prev => Math.max(0, prev - 1))
    } catch (e) {
      alert('Delete failed: ' + (e?.message || e))
    } finally {
      setDeleting(null)
    }
  }

  const hasMore = rows.length < total
  const active = BUCKETS.find(b => b.key === bucket) || BUCKETS[0]

  return (
    <div className="panel-accounts">
      <div style={{ padding: '20px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserX size={18} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#17233C' }}>DND & Unassigned Donors</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                Donors marked DND, and donors with no agent assigned
              </div>
            </div>
          </div>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Search name / mobile / city..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, width: 240, background: '#f7fafc', color: '#17233C', outline: 'none' }}
            />
            <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2F80D9', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={13} /> Search
            </button>
            <button type="button" onClick={() => { setSearchInput(''); setSearch('') }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748B', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={13} />
            </button>
          </form>
        </div>

        {/* Sub-tabs: DND vs Unassigned */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {BUCKETS.map(b => {
            const isActive = bucket === b.key;
            const count = b.key === 'dnd' ? dndTotal : unassignedTotal;
            return (
              <button
                key={b.key}
                onClick={() => setBucket(b.key)}
                aria-pressed={isActive}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999,
                  border: `1.5px solid ${isActive ? b.color : '#e2e8f0'}`,
                  background: isActive ? b.bg : '#fff',
                  color: isActive ? b.color : '#64748B',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s ease',
                }}
              >
                {b.key === 'dnd' ? <ShieldOff size={13} /> : <UserRoundX size={13} />}
                {b.label}
                <span style={{
                  minWidth: 20, height: 18, padding: '0 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                  background: isActive ? b.color : '#eef1f6', color: isActive ? '#fff' : '#64748B',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eef2f6', overflow: 'hidden', boxShadow: '0 2px 8px rgba(15,23,42,.04)' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading donors…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {bucket === 'dnd' ? <ShieldOff size={32} style={{ margin: '0 auto 8px', opacity: .4 }} /> : <UserRoundX size={32} style={{ margin: '0 auto 8px', opacity: .4 }} />}
              <div>{bucket === 'dnd' ? 'No DND donors found.' : 'No unassigned donors found.'}</div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ background: '#f7fafc' }}>
                    <tr>
                      {['Name', 'Mobile', 'NGO', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, borderBottom: '1px solid #eef2f6' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#17233C' }}>{d.name || '-'}</td>
                        <td style={{ padding: '10px 14px', color: '#334155' }}>{d.mobile_number || '-'}</td>
                        <td style={{ padding: '10px 14px', color: '#334155' }}>{d.ngo || '-'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <button
                            onClick={() => handleDelete(d.id)}
                            disabled={deleting === d.id}
                            title="Delete donor"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11.5, fontWeight: 700, cursor: deleting === d.id ? 'default' : 'pointer', opacity: deleting === d.id ? 0.6 : 1 }}
                          >
                            <Trash2 size={12} />
                            {deleting === d.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer / Load more */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eef2f6', background: '#fafbfd' }}>
                <span style={{ fontSize: 11.5, color: '#64748B' }}>
                  Showing {rows.length} of {total} · <span style={{ color: active.color, fontWeight: 700 }}>{active.label}</span>
                </span>
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #dbe5f1', background: '#fff', color: '#2F80D9', fontSize: 12, fontWeight: 700, cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1 }}
                  >
                    <ChevronDown size={14} />
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
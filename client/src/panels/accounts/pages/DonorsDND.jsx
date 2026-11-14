import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { apiGet, apiDelete } from '../api/auth'
import { Search, UserX, ChevronDown, RefreshCw, Trash2, ShieldOff, UserRoundX, Download } from 'lucide-react'
import DonorTabs from '../components/DonorTabs'

const PAGE_SIZE = 20

const BUCKETS = [
  { key: 'dnd', label: 'DND Donors', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', soft: '#fee2e2' },
  { key: 'unassigned', label: 'Unassigned Donors', color: '#b45309', bg: '#fff8e7', border: '#fde68a', soft: '#fef3c7' },
]

export default function DonorsDND() {
  const [bucket, setBucket] = useState('all')
  const [ngoFilter, setNgoFilter] = useState('')
  const [ngoOptions, setNgoOptions] = useState([])
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState('grid')

  const load = useCallback(async (pg, q, type, ngo, append = false) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      params.set('limit', String(PAGE_SIZE))
      params.set('type', type)
      if (q) params.set('search', q)
      if (ngo) params.set('ngo', ngo)
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

  useEffect(() => { setPage(1); load(1, search, bucket, ngoFilter) }, [search, bucket, ngoFilter, load])

  useEffect(() => {
    apiGet('/accounts/ngos')
      .then(res => setNgoOptions(Array.isArray(res) ? res : []))
      .catch(() => setNgoOptions([]))
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    load(next, search, bucket, ngoFilter, true)
  }

  // Downloads every donor matching the current category/NGO/search filters,
  // not just the rows loaded so far.
  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('type', bucket)
      if (search) params.set('search', search)
      if (ngoFilter) params.set('ngo', ngoFilter)
      const res = await apiGet('/accounts/donors/dnd/export?' + params.toString())
      const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
      if (data.length === 0) {
        alert('No donors to export.')
        return
      }
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'DND Donors')
      const label = bucket === 'all' ? 'dnd-unassigned-donors' : `${bucket}-donors`
      XLSX.writeFile(wb, `${label}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      alert('Export failed: ' + (e?.message || e))
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this donor? This cannot be undone.')) return
    const removed = rows.find(r => r.id === id)
    setDeleting(id)
    try {
      await apiDelete('/accounts/donors/' + id)
      setRows(prev => prev.filter(r => r.id !== id))
      setTotal(prev => Math.max(0, prev - 1))
      if (removed?.is_dnd) setDndTotal(prev => Math.max(0, prev - 1))
      if (removed?.is_unassigned) setUnassignedTotal(prev => Math.max(0, prev - 1))
    } catch (e) {
      alert('Delete failed: ' + (e?.message || e))
    } finally {
      setDeleting(null)
    }
  }

  const hasMore = rows.length < total

  return (
    <div className="panel-accounts">
      <DonorTabs>
        <input
          type="text"
          placeholder="Search name / mobile / city..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(e) }}
          style={{ width: 240, maxWidth: '100%', height: 38, padding: '0 12px', borderRadius: 9, border: '1px solid #DCE6F1', fontSize: 12.5, background: '#fff', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setFiltersOpen(v => !v)}
            title={filtersOpen ? 'Hide filters' : 'Show filters'}
            aria-label="Filters"
            aria-expanded={filtersOpen}
            style={{
              width: 38, height: 38, borderRadius: 9, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${filtersOpen ? 'var(--sage)' : '#DCE6F1'}`,
              background: filtersOpen ? 'var(--sage)' : '#fff',
              color: filtersOpen ? '#fff' : '#64748b',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
            </svg>
          </button>
          {filtersOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setFiltersOpen(false)} />
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50, width: 460, maxWidth: '92vw', background: '#fff', border: '1px solid #DCE6F1', borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,.16)', padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <strong style={{ fontSize: 13, color: '#102544' }}>Filters</strong>
                  <button
                    type="button"
                    onClick={() => { setBucket('all'); setNgoFilter(''); setPage(1); setFiltersOpen(false) }}
                    style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  >Reset</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7c8aa0' }}>Category</span>
                    <select value={bucket} onChange={e => { setBucket(e.target.value); setFiltersOpen(false) }} style={{ width: '100%', height: 34, border: '1px solid #DCE6F1', borderRadius: 8, padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
                      <option value="all">All</option>
                      <option value="dnd">DND Donors ({dndTotal.toLocaleString('en-IN')})</option>
                      <option value="unassigned">Unassigned Donors ({unassignedTotal.toLocaleString('en-IN')})</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7c8aa0' }}>NGO</span>
                    <select value={ngoFilter} onChange={e => { setNgoFilter(e.target.value); setFiltersOpen(false) }} style={{ width: '100%', height: 34, border: '1px solid #DCE6F1', borderRadius: 8, padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
                      <option value="">All NGOs</option>
                      {ngoOptions.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 10, border: '1px solid #DCE6F1', background: '#fff' }}>
          {[{ k: 'grid', label: 'Grid view' }, { k: 'list', label: 'List view' }].map(v => (
            <button
              key={v.k}
              type="button"
              onClick={() => setView(v.k)}
              aria-label={v.label}
              aria-pressed={view === v.k}
              title={v.label}
              style={{
                width: 32, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: view === v.k ? 'var(--sage)' : 'transparent',
                color: view === v.k ? '#fff' : '#64748b',
              }}
            >
              {v.k === 'grid' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          title={exporting ? 'Preparing Excel…' : 'Download Excel'}
          aria-label="Download Excel"
          style={{
            width: 38, height: 38, borderRadius: 9,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #BBF7D0', background: exporting ? '#f0fdf4' : '#fff',
            color: '#15803d', cursor: exporting ? 'wait' : 'pointer',
            opacity: exporting ? 0.7 : 1,
          }}
        >
          <Download size={16} />
        </button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setActionsOpen(v => !v)}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid #DCE6F1', background: '#fff', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1 }}
          >
            ⋮
          </button>
          {actionsOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setActionsOpen(false)} />
              <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50, width: 210, background: '#fff', border: '1px solid #DCE6F1', borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,.16)', padding: 5 }}>
                <button
                  role="menuitem"
                  onClick={() => { setActionsOpen(false); handleExport() }}
                  disabled={exporting}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, textAlign: 'left', cursor: exporting ? 'wait' : 'pointer', color: '#15803d' }}
                >
                  <Download size={14} /> {exporting ? 'Exporting…' : 'Export Excel'}
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setActionsOpen(false); setSearchInput(''); setSearch(''); setPage(1); load(1, '', bucket, ngoFilter) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px', border: 'none', borderTop: '1px solid #eef2f6', borderRadius: 8, background: 'transparent', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, textAlign: 'left', cursor: 'pointer', color: '#475569' }}
                >
                  <RefreshCw size={14} /> Clear search & refresh
                </button>
              </div>
            </>
          )}
        </div>
      </DonorTabs>

      <div style={{ paddingBottom: 20 }}>
        {/* Table */}
        <div>
          {view === 'grid' ? (
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={`sk-${i}`} style={{ border: '1px solid #eef2f7', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(90deg,#eef2f7 25%,#f8fafc 50%,#eef2f7 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />
                      <span style={{ flex: 1, height: 14, borderRadius: 4, background: 'linear-gradient(90deg,#eef2f7 25%,#f8fafc 50%,#eef2f7 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />
                    </div>
                    <span style={{ display: 'block', marginTop: 12, width: '55%', height: 12, borderRadius: 4, background: 'linear-gradient(90deg,#eef2f7 25%,#f8fafc 50%,#eef2f7 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />
                  </div>
                ))
              ) : rows.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  {bucket === 'dnd' ? 'No DND donors found.' : bucket === 'unassigned' ? 'No unassigned donors found.' : 'No donors found.'}
                </div>
              ) : rows.map(d => (
                <div key={d.id} className="dnd-card" style={{ border: '1px solid #DCE6F1', borderRadius: 12, padding: '12px 14px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#eef2ff', color: '#4338ca', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                      {String(d.name || '?').trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#102544', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name || ''}>{d.name || 'NA'}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{d.mobile_number || 'NA'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#475569' }}>{d.ngo || 'NA'}</span>
                    <button
                      className="dnd-del"
                      onClick={() => handleDelete(d.id)}
                      disabled={deleting === d.id}
                      title="Delete donor"
                      aria-label="Delete donor"
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: deleting === d.id ? 'default' : 'pointer', opacity: deleting === d.id ? 0.6 : undefined }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  {['Name', 'Mobile', 'NGO', ''].map(h => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 800, color: '#7c8aa0', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.7px', borderBottom: '1px solid #e6ecf4', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      {[150, 110, 70, 70].map((w, j) => (
                        <td key={j} style={{ padding: '12px 20px' }}>
                          <span style={{ display: 'inline-block', width: w, height: 14, borderRadius: 4, background: 'linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      {bucket === 'dnd' ? 'No DND donors found.' : bucket === 'unassigned' ? 'No unassigned donors found.' : 'No donors found.'}
                    </td>
                  </tr>
                ) : rows.map((d) => (
                  <tr key={d.id} className="dnd-row" style={{ borderBottom: '1px solid #f0f4f9', transition: 'background .12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '12px 20px', fontWeight: 600, color: '#102544' }}>{d.name || 'NA'}</td>
                    <td style={{ padding: '12px 20px', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{d.mobile_number || 'NA'}</td>
                    <td style={{ padding: '12px 20px', color: '#334155' }}>{d.ngo || 'NA'}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <button
                        className="dnd-del"
                        onClick={() => handleDelete(d.id)}
                        disabled={deleting === d.id}
                        title="Delete donor"
                        aria-label="Delete donor"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: deleting === d.id ? 'default' : 'pointer', opacity: deleting === d.id ? 0.6 : undefined }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {!loading && (
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eef2f6', background: '#fafbfd' }}>
              <span style={{ fontSize: 11.5, color: '#64748B' }}>
                Showing {rows.length} of {total}
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
          )}
        </div>
      </div>
      <style>{`
        .dnd-del { opacity: 0; transition: opacity .12s ease; }
        .dnd-card:hover .dnd-del, .dnd-row:hover .dnd-del, .dnd-del:focus-visible { opacity: 1; }
        @media (hover: none) { .dnd-del { opacity: 1; } }
      `}</style>
    </div>
  )
}
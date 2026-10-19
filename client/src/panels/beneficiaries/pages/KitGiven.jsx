import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePdf, CircleNotch } from '@phosphor-icons/react'
import { useBnfBase } from '../bnfUi'
import { apiGet } from '../store'
import { downloadKitGivenPdf } from '../kitGivenPdf'

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  filterBar: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', minWidth: '160px' },
  btn: { padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  card: { background: 'var(--card-bg)', boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)', border: '1px solid var(--line)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--line)', fontWeight: 600, color: 'var(--ink-soft)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'var(--bg)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--bg)', color: 'var(--ink)' },
  pill: (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: bg, color: fg }),
  link: { color: 'var(--sage)', textDecoration: 'none', cursor: 'pointer', fontWeight: 500 },
  muted: { color: 'var(--ink-soft)' },
}

// Kit Given — every beneficiary whose kit has been handed out. The regular
// All Beneficiaries list already has these rows, but mixed in with everyone
// else and paginated by registration; this tab scopes the list to kit_given
// and orders by handout date (newest first) so the day's distributions and
// the "who gave it, at which event" detail sit together.
export default function KitGiven() {
  const navigate = useNavigate()
  const base = useBnfBase()
  const [data, setData] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [events, setEvents] = useState([])
  const [page, setPage] = useState(1)
  const [images, setImages] = useState({})
  const [preview, setPreview] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [hoverPdf, setHoverPdf] = useState(false)
  const pageSize = 25

  // Event filter options come from the Kit Given list itself — only the events
  // that actually have kit-given beneficiaries, not the full operator list.
  useEffect(() => {
    apiGet('/beneficiaries/kit-events')
      .then((list) => setEvents(Array.isArray(list) ? list : []))
      .catch((e) => console.error('Failed to load kit events:', e))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize, kit_given: 'true' })
      if (search) params.set('search', search)
      if (eventFilter) params.set('event_name', eventFilter)
      const result = await apiGet(`/beneficiaries?${params}`)
      setData(result)
    } catch (e) {
      console.error('Failed to load kit given list:', e)
    } finally {
      setLoading(false)
    }
  }, [page, search, eventFilter])

  useEffect(() => { loadData() }, [loadData])

  // One batch call covers every row on the page (the server returns each scan
  // as a PNG data URL), so a 25-row table does not fire 25 image requests.
  useEffect(() => {
    const rows = data.data || []
    if (rows.length === 0) { setImages({}); return }
    let cancelled = false
    apiGet(`/beneficiaries/fingerprint-images?ids=${rows.map((b) => b.id).join(',')}`)
      .then((res) => {
        if (cancelled) return
        const map = {}
        for (const b of rows) {
          const src = res?.images?.[b.id]?.image
          if (src) map[b.id] = src
        }
        setImages(map)
      })
      .catch((e) => { console.error('Failed to load fingerprint images:', e); if (!cancelled) setImages({}) })
    return () => { cancelled = true }
  }, [data])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    loadData()
  }

  // The PDF mirrors the CURRENT filters (search + event), not just the visible
  // page: it pulls every matching row, then the fingerprint images in chunks so
  // the URL never grows past a sane length.
  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams({ page: 1, pageSize: 5000, kit_given: 'true' })
      if (search) params.set('search', search)
      if (eventFilter) params.set('event_name', eventFilter)
      const res = await apiGet(`/beneficiaries?${params}`)
      const rows = res?.data || []
      if (rows.length === 0) { alert('No rows to export.'); return }

      const imgs = {}
      const ids = rows.map((r) => r.id)
      for (let i = 0; i < ids.length; i += 40) {
        const chunk = ids.slice(i, i + 40)
        try {
          const r = await apiGet(`/beneficiaries/fingerprint-images?ids=${chunk.join(',')}`)
          Object.assign(imgs, r?.images || {})
        } catch (e) { console.error('Fingerprint chunk failed:', e) }
      }

      await downloadKitGivenPdf({ rows, images: imgs, eventName: eventFilter })
    } catch (e) {
      console.error('PDF export failed:', e)
      alert('PDF export failed: ' + (e.message || 'unknown error'))
    } finally {
      setDownloading(false)
    }
  }

  const totalPages = Math.ceil((data.total || 0) / pageSize)

  return (
    <div>
      <style>{`@keyframes kgSpin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.header}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Kit Given</h2>
        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
          Beneficiaries whose kit has been handed out
        </span>
      </div>

      <div style={styles.filterBar}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Search by name, code, mobile or event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...styles.input, minWidth: '300px' }}
          />
          <button type="submit" style={{ ...styles.btn, background: 'var(--sage)', color: '#fff' }}>Search</button>
        </form>
        <select
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPage(1) }}
          style={styles.input}
        >
          <option value="">All Events</option>
          {events.map((ev) => (
            <option key={ev.name} value={ev.name}>
              {ev.name}{ev.count ? ` (${ev.count})` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          onMouseEnter={() => setHoverPdf(true)}
          onMouseLeave={() => setHoverPdf(false)}
          title="Download the filtered Kit Given list as a PDF"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            borderRadius: '999px',
            border: 'none',
            cursor: downloading ? 'wait' : 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            color: '#fff',
            background: downloading ? '#0f766e' : hoverPdf ? '#0d9488' : '#0f766e',
            boxShadow: !downloading && hoverPdf ? '0 6px 16px rgba(15,118,110,0.35)' : '0 1px 3px rgba(15,118,110,0.25)',
            transform: !downloading && hoverPdf ? 'translateY(-1px)' : 'none',
            transition: 'background .15s ease, box-shadow .15s ease, transform .15s ease',
            opacity: downloading ? 0.75 : 1,
          }}
        >
          {downloading
            ? <CircleNotch size={16} weight="bold" style={{ animation: 'kgSpin 0.9s linear infinite' }} />
            : <FilePdf size={16} weight="bold" />}
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{data.total || 0} given</span>
      </div>

      <div style={styles.card}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>Loading...</div>
        ) : data.data?.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>
            No kits given yet — mark a beneficiary's kit as given to see it here.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...styles.table, minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Mobile</th>
                  <th style={styles.th}>NGO</th>
                  <th style={styles.th}>Beneficiary Type</th>
                  {/* <th style={styles.th}>City</th> */}
                  {/* <th style={styles.th}>Given On</th> */}
                  {/* <th style={styles.th}>Given By</th> */}
                  <th style={styles.th}>Event</th>
                  <th style={styles.th}>Kit</th>
                  <th style={styles.th}>Fingerprint</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.map((b) => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => navigate(base + `/${b.id}`)}>
                    <td style={styles.td}><code style={{ fontSize: '12px', background: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>{b.beneficiary_code}</code></td>
                    <td style={styles.td}><span style={styles.link}>{b.full_name}</span></td>
                    <td style={styles.td}>{b.mobile || '-'}</td>
                    <td style={styles.td}>{b.ngos?.name || '-'}</td>
                    <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.beneficiary_type || <span style={styles.muted}>-</span>}</td>
                    {/* <td style={styles.td}>{b.city || '-'}</td> */}
                    {/* <td style={styles.td}>
                      {b.kit_given_at
                        ? new Date(b.kit_given_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                        : '-'}
                    </td> */}
                    {/* <td style={styles.td}>{b.kit_given_by || <span style={styles.muted}>-</span>}</td> */}
                    <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.kit_event_name || <span style={styles.muted}>-</span>}
                    </td>
                    <td style={{ ...styles.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.kit_name || <span style={styles.muted}>-</span>}
                    </td>
                    <td style={styles.td}>
                      {(() => {
                        const src = images[b.id]
                        if (!src) return <span style={styles.muted}>-</span>
                        return (
                          <img
                            src={src}
                            alt="fingerprint"
                            title="Click to enlarge"
                            onClick={(e) => { e.stopPropagation(); setPreview({ src, name: b.full_name, code: b.beneficiary_code }) }}
                            style={{ width: 46, height: 46, objectFit: 'contain', background: '#fff', borderRadius: 4, border: '1px solid var(--line)', cursor: 'zoom-in', display: 'block' }}
                          />
                        )
                      })()}
                    </td>
                    <td style={styles.td}>
                      <span onClick={(e) => { e.stopPropagation(); navigate(base + `/${b.id}`) }} style={styles.link}>View</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '16px' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ ...styles.btn, background: 'var(--bg)', opacity: page <= 1 ? 0.5 : 1 }}>Prev</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <button key={p} onClick={() => setPage(p)} style={{ ...styles.btn, background: p === page ? 'var(--sage)' : 'var(--bg)', color: p === page ? '#fff' : 'var(--ink)' }}>{p}</button>
            )
          })}
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ ...styles.btn, background: 'var(--bg)', opacity: page >= totalPages ? 0.5 : 1 }}>Next</button>
        </div>
      )}

      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius)', padding: 16, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 16 }}>
              <strong style={{ fontSize: 14, color: 'var(--ink)' }}>
                {preview.name} <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>{preview.code}</span>
              </strong>
              <button onClick={() => setPreview(null)} style={{ ...styles.btn, background: 'var(--bg)', color: 'var(--ink)' }}>Close</button>
            </div>
            <img src={preview.src} alt="fingerprint" style={{ maxWidth: '80vw', maxHeight: '75vh', display: 'block' }} />
          </div>
        </div>
      )}
    </div>
  )
}

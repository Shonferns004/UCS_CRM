import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBnfBase } from '../bnfUi'
import { apiGet } from '../store'

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
  otpChip: { fontSize: '13px', fontWeight: 700, letterSpacing: '3px', background: '#eef2ff', color: '#3730a3', padding: '3px 10px', borderRadius: 'var(--radius-sm)' },
}

// Collection OTPs — beneficiaries whose kit was re-issued after the operator
// accepted "Already collected" on the app. One 6-digit OTP per re-issue,
// stored on the row (collection_otp / collection_otp_at).
export default function CollectionOtps() {
  const navigate = useNavigate()
  const base = useBnfBase()
  const [data, setData] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 25

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize, has_otp: 'true' })
      if (search) params.set('search', search)
      const result = await apiGet(`/beneficiaries?${params}`)
      setData(result)
    } catch (e) {
      console.error('Failed to load collection OTPs:', e)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    loadData()
  }

  const totalPages = Math.ceil((data.total || 0) / pageSize)

  return (
    <div>
      <div style={styles.header}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Collection OTPs</h2>
        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
          6-digit OTP created when an operator accepts "Already collected"
        </span>
      </div>

      <div style={styles.filterBar}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Search by name, code, or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...styles.input, minWidth: '300px' }}
          />
          <button type="submit" style={{ ...styles.btn, background: 'var(--sage)', color: '#fff' }}>Search</button>
        </form>
        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{data.total || 0} OTP(s)</span>
      </div>

      <div style={styles.card}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>Loading...</div>
        ) : data.data?.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>
            No OTPs yet — one is created when an operator accepts "Already collected".
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...styles.table, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Mobile</th>
                  <th style={styles.th}>City</th>
                  <th style={styles.th}>OTP</th>
                  <th style={styles.th}>Sent At</th>
                  <th style={styles.th}>Kit</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.map((b) => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => navigate(base + `/${b.id}`)}>
                    <td style={styles.td}><code style={{ fontSize: '12px', background: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>{b.beneficiary_code}</code></td>
                    <td style={styles.td}><span style={styles.link}>{b.full_name}</span></td>
                    <td style={styles.td}>{b.mobile || '-'}</td>
                    <td style={styles.td}>{b.city || '-'}</td>
                    <td style={styles.td}><code style={styles.otpChip}>{b.collection_otp}</code></td>
                    <td style={styles.td}>
                      {b.collection_otp_at
                        ? new Date(b.collection_otp_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                        : '-'}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.pill(
                        b.kit_given ? '#dcfce7' : '#fef3c7',
                        b.kit_given ? '#166534' : '#92400e'
                      )}>
                        {b.kit_given ? 'Yes' : 'No'}
                      </span>
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
    </div>
  )
}

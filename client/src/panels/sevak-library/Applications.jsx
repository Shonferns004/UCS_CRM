import { useEffect, useMemo, useState } from 'react'
import { Search, Download, ChevronLeft, ChevronRight, ArrowUpDown, Inbox, FileText, Loader2, Timer } from 'lucide-react'
import { STATUS_ORDER, statusLabel, statusMeta, PLAN_COLORS, isRenewalDue } from './meta.js'
import { AppliedDate, RenewalDate } from './DateTags.jsx'
import { exportApplicationsCsv, getPhotoUrls } from './api.js'
import { pdfMemberDoc } from './MembershipFormDoc.jsx'
import { formatINR } from './formUtils.js'
import { useToast } from './toast.jsx'

const PAGE_SIZE = 10

export default function Applications({ rows, onOpen, initialFilters = {} }) {
  const toast = useToast()
  const [q, setQ] = useState(initialFilters.q || '')
  const [status, setStatus] = useState(initialFilters.status || 'ALL')
  const [plan, setPlan] = useState(initialFilters.plan || 'ALL')
  const [renewal, setRenewal] = useState(!!initialFilters.renewal)
  const [from, setFrom] = useState(initialFilters.from || '')
  const [to, setTo] = useState(initialFilters.to || '')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [pdfBusy, setPdfBusy] = useState(false)

  const counts = useMemo(() => {
    const c = { ALL: rows.length }
    STATUS_ORDER.forEach((s) => (c[s] = rows.filter((r) => r.status === s).length))
    return c
  }, [rows])

  const planCounts = useMemo(() => {
    const c = { ALL: rows.length }
    rows.forEach((r) => {
      const p = r.membership_type || 'Other'
      c[p] = (c[p] || 0) + 1
    })
    return c
  }, [rows])

  const planList = useMemo(
    () => Object.keys(planCounts).filter((p) => p !== 'ALL'),
    [planCounts]
  )

  const renewalCount = useMemo(() => rows.filter((r) => isRenewalDue(r)).length, [rows])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = rows
    if (term) {
      list = list.filter((r) =>
        [r.ref, r.full_name, r.email, r.mobile, r.transaction_id, r.membership_id, r.membership_type]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      )
    }
    if (status !== 'ALL') list = list.filter((r) => r.status === status)
    if (plan !== 'ALL') list = list.filter((r) => (r.membership_type || 'Other') === plan)
    if (renewal) list = list.filter((r) => isRenewalDue(r))
    if (from) list = list.filter((r) => (r.created_at || '').slice(0, 10) >= from)
    if (to) list = list.filter((r) => (r.created_at || '').slice(0, 10) <= to)

    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (sortKey === 'created_at') return (new Date(a.created_at) - new Date(b.created_at)) * dir
      if (sortKey === 'membership_fee') return ((Number(a.membership_fee) || 0) - (Number(b.membership_fee) || 0)) * dir
      return String(av || '').localeCompare(String(bv || '')) * dir
    })
  }, [rows, q, status, plan, renewal, from, to, sortKey, sortDir])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    if (page > pages) setPage(pages)
  }, [pages, page])

  useEffect(() => {
    setPage(1)
  }, [q, status, plan, renewal, from, to])

  const hasFilters = status !== 'ALL' || plan !== 'ALL' || renewal || !!from || !!to || !!q

  const clearFilters = () => {
    setQ('')
    setStatus('ALL')
    setPlan('ALL')
    setRenewal(false)
    setFrom('')
    setTo('')
  }

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const exportCsv = () => {
    const csv = exportApplicationsCsv(filtered)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sevak-applications-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Exported ${filtered.length} applications to CSV.`)
  }

  const printPdf = async () => {
    const approved = filtered.filter((r) => r.status === 'APPROVED')
    if (approved.length === 0) return
    setPdfBusy(true)
    try {
      const urls = await Promise.all(
        approved.map((r) => getPhotoUrls(r.id).then((u) => (u && u.passport) || null).catch(() => null))
      )
      await pdfMemberDoc(approved, urls)
      toast(`Downloaded ${approved.length} membership registration PDF(s).`)
    } catch (e) {
      toast(`Could not generate PDF: ${e.message}`, 'error')
    }
    setPdfBusy(false)
  }

  const SortBtn = ({ label, k }) => (
    <button className="sort-btn" onClick={() => toggleSort(k)}>
      {label}
      <ArrowUpDown size={12} className={sortKey === k ? `sort-active ${sortDir}` : ''} />
    </button>
  )

  return (
    <div className="admin-view">
      <div className="admin-view-head">
        <div>
          <h2>Applications</h2>
          <p className="admin-sub">{filtered.length} of {rows.length} applications</p>
        </div>
        <div className="admin-view-head-btns">
          <button className="btn-export btn-export-pdf" onClick={printPdf} disabled={pdfBusy || filtered.filter((r) => r.status === 'APPROVED').length === 0}>
            {pdfBusy ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} Print approved PDF
          </button>
          <button className="btn-export" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="app-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ref, email, mobile, txn..."
          />
        </div>
        <div className="date-fields">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
      </div>

      <div className="status-chips">
        <button
          className={`chip ${status === 'ALL' && !renewal ? 'active' : ''}`}
          onClick={() => { setStatus('ALL'); setRenewal(false) }}
        >
          All <span>{counts.ALL}</span>
        </button>
        {STATUS_ORDER.map((s) => {
          const m = statusMeta(s)
          const active = status === s
          return (
            <button
              key={s}
              className={`chip chip-status ${active ? 'active' : ''}`}
              style={{ '--cc': m.dot, '--csoft': m.soft, '--ctext': m.text }}
              onClick={() => { setStatus(s); setRenewal(false) }}
            >
              <i className="chip-dot" />
              {m.label} <span>{counts[s]}</span>
            </button>
          )
        })}
        <button
          className={`chip chip-renewal ${renewal ? 'active' : ''}`}
          onClick={() => { setRenewal((v) => !v); setStatus('ALL') }}
          title="Approved memberships expiring within 30 days (or already expired)"
        >
          <Timer size={13} /> Renewals due <span>{renewalCount}</span>
        </button>
        {hasFilters && (
          <button className="chip chip-clear" onClick={clearFilters}>
            ✕ Clear filters
          </button>
        )}
      </div>

      <div className="status-chips plan-chips">
        <button
          className={`chip ${plan === 'ALL' ? 'active' : ''}`}
          onClick={() => setPlan('ALL')}
        >
          All plans <span>{planCounts.ALL}</span>
        </button>
        {planList.map((p) => (
          <button
            key={p}
            className={`chip chip-plan ${plan === p ? 'active' : ''}`}
            style={{ '--pc': PLAN_COLORS[p] || '#9aa0a6' }}
            onClick={() => setPlan(plan === p ? 'ALL' : p)}
          >
            <i className="chip-dot" />
            {p} <span>{planCounts[p]}</span>
          </button>
        ))}
      </div>

      <div className="app-table-wrap">
        {pageRows.length === 0 ? (
          <div className="admin-empty-block">
            <Inbox size={34} />
            <p>No applications match the current filters.</p>
          </div>
        ) : (
          <table className="app-table">
            <thead>
              <tr>
                <th><SortBtn label="Ref" k="ref" /></th>
                <th><SortBtn label="Name" k="full_name" /></th>
                <th><SortBtn label="Plan" k="membership_type" /></th>
                <th><SortBtn label="Fee" k="membership_fee" /></th>
                <th>Status</th>
                <th><SortBtn label="Applied" k="created_at" /></th>
                <th><SortBtn label="Renewal" k="end_date" /></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="app-row">
                  <td className="mono">{r.ref}</td>
                  <td>
                    <div className="cell-name">
                      <span className="cell-avatar">{r.full_name ? r.full_name.charAt(0).toUpperCase() : '?'}</span>
                      <span>
                        <strong>{r.full_name}</strong>
                        <small>{r.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className="plan-tag"
                      style={{ '--pc': PLAN_COLORS[r.membership_type] || '#9aa0a6' }}
                    >
                      {r.membership_type || '—'}
                    </span>
                  </td>
                  <td>{formatINR(r.membership_fee)}</td>
                  <td>
                    <span className={`admin-badge ${r.status}`}>{statusLabel(r.status)}</span>
                    {r.membership_id && <div className="mid mono">{r.membership_id}</div>}
                  </td>
                  <td className="muted-td"><AppliedDate iso={r.created_at} /></td>
                  <td><RenewalDate row={r} /></td>
                  <td>
                    <button className="btn-view" onClick={() => onOpen(r)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination">
        <button className="page-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <span className="page-info">{safePage} / {pages}</span>
        <button className="page-btn" disabled={safePage === pages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}


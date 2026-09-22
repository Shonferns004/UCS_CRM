import { useState, useMemo, useEffect } from 'react'
import { useRem } from './store'
import { CATEGORIES, daysLeft, statusPillClass, categoryLabel, categoryIcon, normalizeCategory } from './helpers'
import { computeEffectiveDueDate } from './notifications'
import { Icon } from './components'
import { toast } from './Toast'
import './allreminders.css'


const STATUS_OPTIONS = ['Overdue', 'Due Today', 'Due Tomorrow', 'Due Soon', 'Upcoming', 'Completed', 'Snoozed']
const PAGE_SIZE = 20

const VIEW_FILTERS = {
  completed: 'completed',
  overdue: 'overdue',
  dueToday: 'dueToday',
  dueTomorrow: 'dueTomorrow',
  dueThisWeek: 'dueThisWeek',
  upcoming: 'upcoming',
  renewalsThisMonth: 'renewalsThisMonth',
  attention: 'attention',
}

function isCategoryKey(val) {
  return CATEGORIES.some(c => c.key === val)
}

function matchesView(r, viewKey) {
  if (r.completed_at) return viewKey === 'completed'
  const effectiveDate = computeEffectiveDueDate(r)
  const dl = effectiveDate ? daysLeft(effectiveDate) : daysLeft(r.due_date)
  switch (viewKey) {
    case 'completed': return !!r.completed_at
    case 'overdue': return dl !== null && dl < 0
    case 'dueToday': return dl === 0
    case 'dueTomorrow': return dl === 1
    case 'dueThisWeek': return dl !== null && dl > 1 && dl <= 7
    case 'upcoming': return dl === null || dl > 7
    case 'renewalsThisMonth': {
      if (!r.renewal_date) return false
      const renewal = new Date(String(r.renewal_date).slice(0, 10) + 'T00:00:00')
      const now = new Date()
      return renewal.getMonth() === now.getMonth() && renewal.getFullYear() === now.getFullYear()
    }
    case 'attention': return dl !== null && dl <= 7
    default: return true
  }
}

function itemStatus(it) {
  if (it._dbStatus) return it._dbStatus
  const due = it.due || ''
  if (/paid by tenant/i.test(due) || /paid by tenant/i.test(it.notes || '')) return 'Upcoming'
  const eff = computeEffectiveDueDate(it)
  if (!eff) return 'Upcoming'
  const dl = daysLeft(eff)
  if (dl === null) return 'Upcoming'
  if (dl < 0) return 'Overdue'
  if (dl === 0) return 'Due Today'
  if (dl === 1) return 'Due Tomorrow'
  if (dl <= 7) return 'Due Soon'
  return 'Upcoming'
}

export default function AllReminders({ onAdd, onEdit, onDelete, onHistory }) {
  const { reminders, activeFilter, setActiveFilter } = useRem()

  const sourceItems = useMemo(() => {
    const fmtDate = (d) => {
      if (!d) return ''
      const s = String(d).slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, day] = s.split('-')
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        return `${parseInt(day)} ${months[parseInt(m) - 1]}`
      }
      return String(d)
    }
    const activeReminders = reminders.filter(r => !r.is_deleted)
    const seenIds = new Set()
    const seenKeys = new Set()
    const uniqueReminders = activeReminders.filter(r => {
      if (seenIds.has(r.id)) return false
      seenIds.add(r.id)
      const normCat = normalizeCategory(r.category).toLowerCase()
      const normOwner = (r.owner || '').toLowerCase()
      const normTitle = (r.title || '').toLowerCase()
      const key = `${normTitle}||${normCat}||${normOwner}`
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })
    const dbItems = uniqueReminders.map(r => {
      const computed = (r.status === 'Completed' || r.status === 'Snoozed') ? r.status : (r.derivedStatus || r.status || 'Upcoming')
      const grp = normalizeCategory(r.category)
      return {
        category: grp,
        _group: grp,
        _sub: '',
        _dbId: r.id,
        _dbStatus: computed,
        title: r.title || '',
        owner: r.owner || '',
        due: fmtDate(r.due_date) || '',
        due_date: r.due_date || null,
        renewal: fmtDate(r.renewal_date) || '',
        renewal_date: r.renewal_date || null,
        lastPaid: r.paid_at ? fmtDate(r.paid_at) : '',
        paidAmount: r.amount ? `₹${r.amount}` : '',
        frequency: r.frequency_type || '',
        notes: r.notes || '',
        due_date_display: fmtDate(r.due_date) || '',
        display_frequency: r.frequency_type || '',
        amount: r.amount,
        transaction_id: r.transaction_id || '',
        paidBy: r.paid_by || '',
      }
    })
    return dbItems
  }, [reminders])

  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [activeFilter, search, ownerFilter, statusFilter])

  const owners = useMemo(() => {
    const set = new Set()
    sourceItems.forEach(it => { if (it.owner) set.add(it.owner) })
    return Array.from(set).sort()
  }, [sourceItems])

  const categories = useMemo(() => {
    const byLabel = new Map()
    sourceItems.forEach(it => {
      if (!it.category) return
      const label = normalizeCategory(it.category)
      if (!byLabel.has(label)) byLabel.set(label, it.category)
    })
    return Array.from(byLabel.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, key]) => key)
  }, [sourceItems])

  const catMatch = (itemCat, filterCat) => {
    if (!filterCat) return true
    const ic = normalizeCategory(itemCat).toLowerCase()
    const fc = normalizeCategory(filterCat).toLowerCase()
    return ic === fc
  }

  const filtered = useMemo(() => {
    let list = sourceItems.map((it, idx) => ({ ...it, _status: itemStatus(it), _seq: idx }))

    if (activeFilter) {
      if (VIEW_FILTERS[activeFilter]) {
        list = list.filter(it => matchesView(it, activeFilter))
      } else {
        const filterLabel = normalizeCategory(activeFilter).toLowerCase()
        list = list.filter(it => {
          const itemLabel = normalizeCategory(it.category).toLowerCase()
          return itemLabel === filterLabel
        })
      }
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(it =>
        it.title.toLowerCase().includes(q) ||
        (it.owner || '').toLowerCase().includes(q) ||
        normalizeCategory(it.category).toLowerCase().includes(q) ||
        (it._group || '').toLowerCase().includes(q) ||
        (it._sub || '').toLowerCase().includes(q) ||
        (it.frequency || '').toLowerCase().includes(q) ||
        (it.due || '').toLowerCase().includes(q) ||
        (it.renewal || '').toLowerCase().includes(q) ||
        (it.lastPaid || '').toLowerCase().includes(q) ||
        (it.paidAmount || '').toLowerCase().includes(q) ||
        (it.notes || '').toLowerCase().includes(q)
      )
    }

    if (ownerFilter) list = list.filter(it => it.owner === ownerFilter)

    if (statusFilter) list = list.filter(it => it._status === statusFilter)

    return list
  }, [sourceItems, activeFilter, search, ownerFilter, statusFilter])

  const itemCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, itemCount)

  const displayRows = useMemo(() => {
    const selectedGroup = activeFilter && !VIEW_FILTERS[activeFilter] ? normalizeCategory(activeFilter) : null
    const sorted = [...filtered].sort((a, b) => {
      const ga = (a._group || '').toLowerCase()
      const gb = (b._group || '').toLowerCase()
      if (selectedGroup) {
        const aMatch = ga === selectedGroup.toLowerCase()
        const bMatch = gb === selectedGroup.toLowerCase()
        if (aMatch && !bMatch) return -1
        if (!aMatch && bMatch) return 1
      }
      if (ga !== gb) return ga.localeCompare(gb)
      const sa = (a._sub || '').toLowerCase()
      const sb = (b._sub || '').toLowerCase()
      if (sa !== sb) return sa.localeCompare(sb)
      return (a.title || '').localeCompare(b.title || '')
    })
    const slice = sorted.slice(pageStart, pageEnd)
    const rows = []
    let i = 0
    while (i < slice.length) {
      const group = slice[i]._group
      let j = i
      let count = 0
      const block = []
      let lastSub = null
      while (j < slice.length && slice[j]._group === group) {
        const it = slice[j]
        if (it._sub && it._sub !== lastSub) {
          block.push({ kind: 'sub', label: it._sub })
          lastSub = it._sub
        }
        block.push({ kind: 'item', it })
        count++
        j++
      }
      rows.push({ kind: 'group', label: group, count })
      rows.push(...block)
      i = j
    }
    return rows
  }, [filtered, pageStart, pageEnd, activeFilter])

  const handleCategoryChange = (val) => {
    setActiveFilter(val || '')
    setPage(1)
  }

  const clearFilters = () => {
    setSearch('')
    setOwnerFilter('')
    setStatusFilter('')
    setActiveFilter('')
    setPage(1)
  }

  const resolveDbItem = (it) => {
    if (it._dbId) {
      const found = reminders.find(r => r.id === it._dbId)
      if (found) return found
    }
    return reminders.find(r =>
      normalizeCategory(r.category) === it.category &&
      String(r.title || '') === (it.title || '') &&
      String(r.owner || '') === (it.owner || '')
    ) || null
  }

  const handleAction = (it, kind) => {
    const dbItem = resolveDbItem(it)
    if (!dbItem) {
      toast('Could not find the matching saved reminder for this row', 'error')
      return
    }
    if (kind === 'edit') onEdit?.(dbItem)
    else if (kind === 'history') onHistory?.(dbItem.id, dbItem)
    else if (kind === 'delete') onDelete?.(dbItem)
  }

  const hasFilters = search || ownerFilter || statusFilter || activeFilter
  const isViewFilter = activeFilter && VIEW_FILTERS[activeFilter]
  const catDropdownVal = activeFilter && !isViewFilter ? activeFilter : ''

  const activeLabel = activeFilter ? (
    VIEW_FILTERS[activeFilter]
      ? ({ completed: 'Completed', overdue: 'Overdue', dueToday: 'Due Today', dueTomorrow: 'Due Tomorrow', dueThisWeek: 'Due This Week', upcoming: 'Upcoming', renewalsThisMonth: 'Renewals This Month', attention: 'Needs Attention' })[activeFilter]
      : normalizeCategory(activeFilter)
  ) : 'All Reminders'

  return (
    <>
      <div className="card-block ar-page" style={{ marginTop: 20 }}>
        <div className="tb">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ar-head-ic"><Icon name="bell" size={16} /></span>
            <h3>{activeLabel}</h3>
            <span className="pill pill-upcoming ar-count">{itemCount} reminder{itemCount !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {hasFilters && (
              <button className="rem-btn sm" onClick={clearFilters}>
                <Icon name="close" size={14} /> Clear Filters
              </button>
            )}
            <button className="rem-btn primary sm" onClick={onAdd}>
              <Icon name="plus" size={14} /> Add Reminder
            </button>
          </div>
        </div>

        <div className="toolbar">
          <div className="ar-search">
            <Icon name="search" size={14} />
            <input
              type="text"
              className="rem-input search-input"
              placeholder="Search reminders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="rem-select" value={catDropdownVal} onChange={e => handleCategoryChange(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{normalizeCategory(c)}</option>
            ))}
          </select>
          <select className="rem-select" value={ownerFilter} onChange={e => { setOwnerFilter(e.target.value); setPage(1) }}>
            <option value="">All Owners</option>
            {owners.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select className="rem-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {hasFilters && (
            <button className="rem-btn sm" onClick={clearFilters}>
              <Icon name="close" size={14} /> Clear
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="rem-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Reminder / Property / Item</th>
                <th>Owner</th>
                <th>Due Date</th>
                <th>Renewal Date</th>
                <th>Last Paid Date</th>
                <th>Paid Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr className="ar-empty-row">
                  <td colSpan={9}>
                    <div className="empty-state">
                      <Icon name="bell" size={40} color="var(--rem-ink-soft)" />
                      <div className="big">No reminders found</div>
                      <div className="small">Try adjusting your search or filters.</div>
                    </div>
                  </td>
                </tr>
              ) : displayRows.map((row, i) => {
                if (row.kind === 'group') {
                  return (
                    <tr className="rem-group-row" key={`g-${i}-${row.label}`}>
                      <td colSpan={9}>
                        <div className="ar-group-bar">
                          <span className="rem-heading-label">{row.label}</span>
                          {typeof row.count === 'number' && (
                            <span className="pill pill-upcoming">{row.count} reminder{row.count !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                }
                if (row.kind === 'sub') {
                  return (
                    <tr className="rem-subgroup-row" key={`s-${i}-${row.label}`}>
                      <td colSpan={9}>
                        <span className="rem-heading-label sub">{row.label}</span>
                      </td>
                    </tr>
                  )
                }
                const it = row.it
                const status = it._status
                return (
                  <tr key={`i-${it._seq}`}>
                    <td data-label="Category">
                      <span className="ar-cat">
                        <Icon name={categoryIcon(it.category)} size={14} />
                        <span>{normalizeCategory(it.category)}</span>
                      </span>
                    </td>
                    <td>
                      <div
                        className="ar-title"
                        title={it.title || ''}
                      >
                        {it.title || '—'}
                      </div>
                      {it.notes && (
                        <div className="ar-notes">{it.notes}</div>
                      )}
                      {it.transaction_id && (
                        <div className="ar-notes" style={{ color: '#16a34a' }}>
                          Txn {it.transaction_id}{it.paidBy ? ` · Paid by ${it.paidBy}` : ''}
                        </div>
                      )}
                    </td>
                    <td data-label="Owner"><span className="ar-val">{it.owner || '—'}</span></td>
                    <td data-label="Due Date"><span className="ar-val">{it.due || '—'}</span></td>
                    <td data-label="Renewal Date"><span className="ar-val">{it.renewal || '—'}</span></td>
                    <td data-label="Last Paid Date"><span className="ar-val">{it.lastPaid || '—'}</span></td>
                    <td data-label="Paid Amount"><span className="ar-val ar-val-amt">{it.paidAmount || '—'}</span></td>
                    <td data-label="Status">
                      <span className="status-badge">
                        <span className={`status-dot ${status === 'Overdue' ? 'dot-overdue' : status === 'Due Today' || status === 'Due Tomorrow' ? 'dot-due-today' : status === 'Due Soon' ? 'dot-due-soon' : status === 'Completed' ? 'dot-completed' : status === 'Snoozed' ? 'dot-snoozed' : 'dot-upcoming'}`} />
                        <span className={`pill ${statusPillClass(status)}`}>{status}</span>
                      </span>
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button className="ar-action" title="Edit reminder" onClick={() => handleAction(it, 'edit')}>
                          <Icon name="edit" size={14} />
                        </button>
                        <button className="ar-action" title="View history" onClick={() => handleAction(it, 'history')}>
                          <Icon name="history" size={14} />
                        </button>
                        <button className="ar-action danger" title="Delete reminder" onClick={() => handleAction(it, 'delete')}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {itemCount > 0 && (
          <div className="pagination">
            <span style={{ fontSize: 12, color: 'var(--rem-ink-soft)' }}>
              Showing {pageStart + 1}–{pageEnd} of {itemCount}
            </span>
            <div className="pages">
              <button className="page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>&laquo;</button>
              <button className="page-btn" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>&lsaquo;</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((item, i) => (
                  item === '...'
                    ? <span key={`e${i}`} style={{ padding: '0 4px', fontSize: 12, color: 'var(--rem-ink-soft)' }}>…</span>
                    : <button
                        key={item}
                        className={`page-btn ${item === safePage ? 'active' : ''}`}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </button>
                ))
              }
              <button className="page-btn" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>&rsaquo;</button>
              <button className="page-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>&raquo;</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
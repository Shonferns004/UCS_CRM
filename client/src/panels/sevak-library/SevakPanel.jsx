import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Tag, UploadCloud, AlertTriangle, Loader2, BookOpen, RefreshCw } from 'lucide-react'
import './admin.css'
import { ToastProvider } from './toast.jsx'
import { listApplications } from './api.js'
import Dashboard from './Dashboard.jsx'
import Applications from './Applications.jsx'
import Coupons from './Coupons.jsx'
import ImportMembers from './ImportMembers.jsx'
import ApplicationDetail from './ApplicationDetail.jsx'
import DrillListModal from './DrillListModal.jsx'

const TABS = [
  { key: 'applications', label: 'Applications', icon: <ClipboardList size={15} /> },
  { key: 'coupons', label: 'Coupons', icon: <Tag size={15} /> },
  { key: 'import', label: 'Import members', icon: <UploadCloud size={15} /> }
]

function SevakLibraryView() {
  const [tab, setTab] = useState('applications')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [drill, setDrill] = useState({ id: 0, filters: {} })
  const [drillFilters, setDrillFilters] = useState(null)
  const [editOnOpen, setEditOnOpen] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await listApplications({ limit: 200 })
      setRows(res.data || [])
      setUpdatedAt(new Date())
    } catch (e) {
      setRows([])
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openDetail = (row, opts = {}) => {
    setEditOnOpen(!!opts.edit)
    setSelected(row)
  }

  // Dashboard drill-through: show the filtered list in a modal overlay.
  const openDrill = useCallback((filters = {}) => {
    setDrillFilters(filters || {})
  }, [])

  // Modal footer action: close the modal and land on the full Applications tab.
  const goToApplications = useCallback((filters = {}) => {
    setDrillFilters(null)
    setDrill((d) => ({ id: d.id + 1, filters }))
    setTab('applications')
  }, [])

  // Clicking the Applications tab directly always starts from clean filters.
  const handleTab = (key) => {
    if (key === 'applications' && tab !== 'applications') {
      setDrill((d) => ({ id: d.id + 1, filters: {} }))
    }
    setTab(key)
  }

  const refresh = useCallback(async () => {
    setError('')
    try {
      const res = await listApplications({ limit: 200 })
      setRows(res.data || [])
      setUpdatedAt(new Date())
      setSelected((current) => {
        if (!current) return current
        const found = (res.data || []).find((r) => r.id === current.id)
        return found || current
      })
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  return (
    <div className="panel-sevak">
      <div className="sevak-panel-head">
        <div className="sevak-panel-brand">
          <strong><BookOpen size={15} style={{ verticalAlign: '-2px' }} /> Sevak Library</strong>
          <small>Membership applications · Being Sevak Charitable Trust</small>
        </div>
        <div className="sevak-panel-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`sevak-panel-tab ${tab === t.key ? 'active' : ''}`} onClick={() => handleTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="sevak-panel-meta">
          {rows && <span className="sevak-panel-count">{rows.length} applications</span>}
          {updatedAt && (
            <span className="sevak-panel-updated" title="Last updated">
              Updated {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            className="sevak-panel-refresh"
            onClick={refreshAll}
            disabled={refreshing}
            title="Refresh data"
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="sevak-panel-body">
        {error && (
          <div className="sevak-panel-err">
            <AlertTriangle size={16} />
            <span>Could not load Sevak Library data: {error}.</span>
            <button className="btn-act" onClick={load} style={{ marginLeft: 'auto' }}>
              <Loader2 size={13} /> Retry
            </button>
          </div>
        )}

        {!rows && !error && tab !== 'applications' && <div className="admin-loading"><Loader2 size={24} className="spin" /><p>Loading applications...</p></div>}

        {rows && tab === 'dashboard' && <Dashboard rows={rows} onOpen={openDetail} onDrill={openDrill} />}
        {tab === 'applications' && (
          <Applications
            key={drill.id}
            rows={rows || []}
            loading={!rows && !error}
            onOpen={openDetail}
            initialFilters={drill.filters}
            onRefresh={refreshAll}
            refreshing={refreshing}
            refresh={refresh}
          />
        )}
        {rows && tab === 'coupons' && <Coupons rows={rows} />}
        {rows && tab === 'import' && <ImportMembers onImported={load} />}
      </div>

      {rows && drillFilters && (
        <DrillListModal
          rows={rows}
          filters={drillFilters}
          onClose={() => setDrillFilters(null)}
          onOpen={openDetail}
          onOpenList={() => goToApplications(drillFilters)}
        />
      )}

      {selected && (
        <ApplicationDetail
          row={selected}
          startEditOnOpen={editOnOpen}
          onClose={() => {
            setEditOnOpen(false)
            setSelected(null)
          }}
          refresh={refresh}
        />
      )}
    </div>
  )
}

export default function SevakPanel() {
  return (
    <ToastProvider>
      <SevakLibraryView />
    </ToastProvider>
  )
}
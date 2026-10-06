import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard, ClipboardList, Tag, UploadCloud, AlertTriangle, Loader2, BookOpen } from 'lucide-react'
import './admin.css'
import { ToastProvider } from './toast.jsx'
import { listApplications } from './api.js'
import Dashboard from './Dashboard.jsx'
import Applications from './Applications.jsx'
import Coupons from './Coupons.jsx'
import ImportMembers from './ImportMembers.jsx'
import ApplicationDetail from './ApplicationDetail.jsx'

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
  { key: 'applications', label: 'Applications', icon: <ClipboardList size={15} /> },
  { key: 'coupons', label: 'Coupons', icon: <Tag size={15} /> },
  { key: 'import', label: 'Import members', icon: <UploadCloud size={15} /> }
]

function SevakLibraryView() {
  const [tab, setTab] = useState('dashboard')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await listApplications({ limit: 200 })
      setRows(res.data || [])
    } catch (e) {
      setRows([])
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openDetail = (row) => setSelected(row)

  const refresh = useCallback(async () => {
    setError('')
    try {
      const res = await listApplications({ limit: 200 })
      setRows(res.data || [])
      setSelected((current) => {
        if (!current) return current
        const found = (res.data || []).find((r) => r.id === current.id)
        return found || current
      })
    } catch (e) {
      setError(e.message)
    }
  }, [])

  return (
    <div className="panel-sevak">
      <div className="sevak-panel-head">
        <div className="sevak-panel-brand">
          <strong><BookOpen size={15} style={{ verticalAlign: '-2px' }} /> Sevak Library</strong>
          <small>Membership applications · Being Sevak Charitable Trust</small>
        </div>
        <div className="sevak-panel-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`sevak-panel-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {rows && <span className="sevak-panel-count">{rows.length} applications</span>}
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

        {!rows && !error && <div className="admin-loading"><Loader2 size={24} className="spin" /><p>Loading applications...</p></div>}

        {rows && tab === 'dashboard' && <Dashboard rows={rows} onOpen={openDetail} />}
        {rows && tab === 'applications' && <Applications rows={rows} onOpen={openDetail} />}
        {rows && tab === 'coupons' && <Coupons rows={rows} />}
        {rows && tab === 'import' && <ImportMembers onImported={load} />}
      </div>

      {selected && (
        <ApplicationDetail
          row={selected}
          onClose={() => setSelected(null)}
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
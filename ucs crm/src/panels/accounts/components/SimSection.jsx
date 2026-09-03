import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { SimProvider, useSim } from '../../sim-card/store'
import { SimFormModal, SimViewModal, ReplaceModal } from '../../sim-card/modals'
import { deleteSimCard } from '../../sim-card/api'
import { toast } from '../../../components/Toast'
import { exportToCSV, exportToExcel } from '../../sim-card/helpers'
import Dashboard from '../../sim-card/Dashboard'
import Inventory from '../../sim-card/Inventory'
import Expiring from '../../sim-card/Expiring'
import Replacements from '../../sim-card/Replacements'
import History from '../../sim-card/History'
import Reports from '../../sim-card/Reports'
import ImportExport from '../../sim-card/ImportExport'
import Settings from '../../sim-card/Settings'

function ExpiringRoute(props) {
  const { tab } = useParams()
  return <Expiring {...props} tab={tab || 'all'} />
}

function SectionInner() {
  const sim = useSim()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [viewCard, setViewCard] = useState(null)
  const [replaceCard, setReplaceCard] = useState(null)

  useEffect(() => { sim.refresh(); /* eslint-disable-next-line */ }, [])

  function openAdd() { setEditing(null); setFormKey((k) => k + 1); setFormOpen(true) }
  function openEdit(c) { setEditing(c); setFormKey((k) => k + 1); setFormOpen(true) }

  async function doDelete(c) {
    try { await deleteSimCard(c.id); sim.refresh(); toast('SIM card deleted', 'success') }
    catch (e) { toast(e.message || 'Delete failed', 'error') }
  }

  function handleSaved() { setFormOpen(false); setEditing(null); sim.refresh() }

  const invProps = { onAdd: openAdd, onView: setViewCard, onEdit: openEdit, onReplace: setReplaceCard, onDelete: doDelete }

  return (
    <div className="sim-scope">
      <div className="sim-toolbar">
        <button className="btn" onClick={() => exportToCSV(sim.cards)}>Export CSV</button>
        <button className="btn" onClick={() => exportToExcel(sim.cards)}>Export Excel</button>
        <button className="btn btn-primary" onClick={openAdd}>+ Add SIM Card</button>
      </div>
      <Routes>
        <Route index element={<Dashboard onAdd={openAdd} onView={setViewCard} onEdit={openEdit} onReplace={setReplaceCard} />} />
        <Route path="dashboard" element={<Dashboard onAdd={openAdd} onView={setViewCard} onEdit={openEdit} onReplace={setReplaceCard} />} />
        <Route path="inventory" element={<Inventory {...invProps} />} />
        <Route path="cards" element={<Inventory {...invProps} />} />
        <Route path="expiring" element={<ExpiringRoute onView={setViewCard} onEdit={openEdit} onReplace={setReplaceCard} />} />
        <Route path="expiring/:tab" element={<ExpiringRoute onView={setViewCard} onEdit={openEdit} onReplace={setReplaceCard} />} />
        <Route path="replacements" element={<Replacements onRefresh={sim.refresh} />} />
        <Route path="history" element={<History />} />
        <Route path="reports" element={<Reports />} />
        <Route path="import" element={<ImportExport />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>

      <SimFormModal key={formKey} open={formOpen} card={editing} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={handleSaved} />
      <SimViewModal card={viewCard} open={!!viewCard} onClose={() => setViewCard(null)} onEdit={() => { if (viewCard) openEdit(viewCard) }} onReplace={() => { if (viewCard) { setReplaceCard(viewCard); setViewCard(null) } }} />
      <ReplaceModal card={replaceCard} open={!!replaceCard} onClose={() => setReplaceCard(null)} onDone={() => sim.refresh()} />
    </div>
  )
}

export default function SimSection() {
  return (
    <SimProvider>
      <SectionInner />
    </SimProvider>
  )
}

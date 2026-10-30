import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import PageTabs from './PageTabs'
import Donors from '../pages/Donors'
import AddressImport from '../pages/AddressImport'
import DonorsDND from '../pages/DonorsDND'

/* Donor Management is one page with two tabs.

   Address used to be its own sidebar entry, which meant finding an address
   import meant leaving the donor list and coming back. They are the same
   subject -- the donor and the address on file -- so they are one page.

   The old /accounts/address URL is a redirect in AccountsPanel rather than a
   route here, so existing links land on the Address tab. */
const TABS = [
  { label: 'Master Data', path: '/accounts/donors' },
  { label: 'Donor Data Update', path: '/accounts/donors/address' },
  { label: 'DND', path: '/accounts/donors/dnd' },
]

export default function DonorSection() {
  const { pathname } = useLocation()
  const showUpload = pathname.startsWith('/accounts/donors/address')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <PageTabs tabs={TABS} ariaLabel="Master Data" />
        {showUpload && (
          <button
            className="btn btn-primary"
            style={{ marginLeft: 'auto', marginBottom: 16, flexShrink: 0 }}
            onClick={() => window.dispatchEvent(new CustomEvent('open-upload-sheet-modal'))}
          >
            Upload Sheet
          </button>
        )}
      </div>
      <Routes>
        <Route index element={<Donors />} />
        <Route path="address" element={<AddressImport />} />
        <Route path="dnd" element={<DonorsDND />} />
        <Route path="*" element={<Navigate to="/accounts/donors" replace />} />
      </Routes>
    </div>
  )
}
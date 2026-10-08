import { Routes, Route, Navigate } from 'react-router-dom'
import PageTabs from './PageTabs'
import Donors from '../pages/Donors'
import AddressImport from '../pages/AddressImport'

/* Donor Management is one page with two tabs.

   Address used to be its own sidebar entry, which meant finding an address
   import meant leaving the donor list and coming back. They are the same
   subject -- the donor and the address on file -- so they are one page.

   The old /accounts/address URL is a redirect in AccountsPanel rather than a
   route here, so existing links land on the Address tab. */
const TABS = [
  { label: 'Donors', path: '/accounts/donors' },
  { label: 'Address', path: '/accounts/donors/address' },
]

export default function DonorSection() {
  return (
    <div>
      <PageTabs tabs={TABS} ariaLabel="Donor Management" />
      <Routes>
        <Route index element={<Donors />} />
        <Route path="address" element={<AddressImport />} />
        <Route path="*" element={<Navigate to="/accounts/donors" replace />} />
      </Routes>
    </div>
  )
}
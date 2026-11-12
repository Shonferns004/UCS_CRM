import { Routes, Route, Navigate } from 'react-router-dom'
import Donors from '../pages/Donors'
import AddressImport from '../pages/AddressImport'
import DonorsDND from '../pages/DonorsDND'

/* Donor Management is one page with three tabs.

   The tab strip now lives inside each page (see components/DonorTabs) so that
   page can render its search / filter / action controls on the same line.
   Routes only select the page here. */
export default function DonorSection() {
  return (
    <Routes>
      <Route index element={<Donors />} />
      <Route path="address" element={<AddressImport />} />
      <Route path="dnd" element={<DonorsDND />} />
      <Route path="*" element={<Navigate to="/accounts/donors" replace />} />
    </Routes>
  )
}

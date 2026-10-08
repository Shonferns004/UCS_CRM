import { Routes, Route, Navigate } from 'react-router-dom'
import PageTabs from '../components/PageTabs'
import NewData from '../pages/NewData'
import OldData from '../pages/OldData'

/* Data is one page with two tabs, replacing the "Data" sidebar group.

   The old URLs /accounts/new-data and /accounts/old-data are kept as redirects
   in AccountsPanel rather than routes here, so an existing bookmark or a link
   someone already sent lands on the right tab instead of a dead end. */
const TABS = [
  { label: 'New Data', path: '/accounts/data' },
  { label: 'Old Data', path: '/accounts/data/old' },
]

export default function DataSection() {
  return (
    <div>
      <PageTabs tabs={TABS} ariaLabel="Data" />
      <Routes>
        <Route index element={<NewData />} />
        <Route path="old" element={<OldData />} />
        <Route path="*" element={<Navigate to="/accounts/data" replace />} />
      </Routes>
    </div>
  )
}
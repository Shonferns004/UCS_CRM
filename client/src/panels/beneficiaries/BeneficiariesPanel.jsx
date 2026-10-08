import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { BnfBaseProvider } from './bnfUi'
import PageTabs from '../accounts/components/PageTabs'
import Overview from './pages/Overview'
import AllBeneficiaries from './pages/AllBeneficiaries'
import CollectionOtps from './pages/CollectionOtps'
import ImportMembers from './pages/ImportMembers'
import BeneficiaryProfile from './pages/BeneficiaryProfile'
import Events from './pages/Events'

// The five sections used to be five sidebar entries, so reaching the second one
// meant going back out to the nav. They are one subject, so they are one page
// with a tab strip: the sidebar keeps a single "Beneficiaries" item and this
// switches between the sections.
//
// The ROUTES are unchanged on purpose. Each section still has its own URL, so a
// bookmarked or shared /accounts/beneficiaries/otps link keeps working and lands
// on the right tab, and switching tabs is a real navigation rather than local
// state that a refresh would throw away.
export default function BeneficiariesPanel({ base = '/beneficiaries' }) {
  const { pathname } = useLocation()
  const tabs = [
    { label: 'Overview', path: base },
    { label: 'All Beneficiaries', path: `${base}/all` },
    { label: 'Collection OTPs', path: `${base}/otps` },
    { label: 'Import Members', path: `${base}/import` },
    { label: 'Daily Events', path: `${base}/events` },
  ]

  // A single beneficiary's own profile is a detail view reached FROM one of the
  // sections, not a section of its own, so it gets no tab strip -- the strip
  // would imply a choice the page does not offer. Compared against the known
  // section paths rather than guessed from a segment count, because Overview is
  // the index route and counting would classify it as a profile.
  const here = pathname.replace(/\/$/, '') || base
  const onProfilePage = !tabs.some((t) => t.path === here)

  return (
    <BnfBaseProvider value={base}>
      <div style={{ padding: '2px 0 60px' }}>
        {!onProfilePage && <PageTabs tabs={tabs} ariaLabel="Beneficiaries" />}
        <Routes>
          <Route index element={<Overview />} />
          <Route path="all" element={<AllBeneficiaries />} />
          <Route path="otps" element={<CollectionOtps />} />
          <Route path="import" element={<ImportMembers />} />
          <Route path="events" element={<Events />} />
          <Route path=":id" element={<BeneficiaryProfile />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </div>
    </BnfBaseProvider>
  )
}
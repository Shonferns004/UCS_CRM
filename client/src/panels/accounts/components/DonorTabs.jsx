import PageTabs from './PageTabs'

// Donor Management tabs. Rendered by each page (instead of the section wrapper)
// so the page can put its own search / filter / action controls on the SAME
// line as the tabs.
const TABS = [
  { label: 'Master Data', path: '/accounts/donors' },
  { label: 'Donor Data Update', path: '/accounts/donors/address' },
  { label: 'DND', path: '/accounts/donors/dnd' },
]

export default function DonorTabs({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      {/* Cancel the strip's own bottom margin so it sits centred on this row. */}
      <div style={{ marginBottom: -16 }}>
        <PageTabs tabs={TABS} ariaLabel="Master Data" />
      </div>
      <div style={{ flex: 1 }} />
      {children}
    </div>
  )
}

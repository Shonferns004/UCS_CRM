import { Routes, Route, Navigate } from 'react-router-dom'
import PageTabs from './PageTabs'
import Teams from '../pages/Teams'
import FroTargets from '../../../components/FroTargets'

/* Teams is one page with two tabs: who is on which team, and the target each
   FRO on those teams is carrying.

   FRO Targets was a separate Workforce entry, but a target only means anything
   next to the team it is aimed at, and the two are read together. The old
   /accounts/fro-targets URL redirects here rather than 404ing, since it is a
   plain route that other parts of the app and old bookmarks may still use. */
const TABS = [
  { label: 'Teams', path: '/accounts/teams' },
  { label: 'FRO Targets', path: '/accounts/teams/targets' },
]

export default function TeamsSection() {
  return (
    <div>
      <PageTabs tabs={TABS} ariaLabel="Teams" />
      <Routes>
        <Route index element={<Teams />} />
        <Route path="targets" element={<FroTargets />} />
        <Route path="*" element={<Navigate to="/accounts/teams" replace />} />
      </Routes>
    </div>
  )
}
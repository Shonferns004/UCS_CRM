import LeadIncentive from '../../../components/LeadIncentive'

// Thin wrapper per the Lead Incentive UI redesign spec:
// the page must begin with the page header (rendered inside
// <LeadIncentive/>) and then immediately show the two-column
// content layout. No KPI/summary cards, no Campaign Controls,
// no global Win On / Start-End controls, no tabs, no hero area.
// All presentation lives in components/LeadIncentive.jsx;
// business logic and backend behavior are untouched.
export default function LeadIncentivePage() {
  return <LeadIncentive />
}

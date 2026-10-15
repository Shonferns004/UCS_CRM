import TechnicalTickets from './TechnicalTickets';

// Company-wide "To Super Admin" section. Every panel renders the same shared
// list of tickets raised to the Super Admin (department 'super_admin') and may
// view, reply and resolve them via the scoped /to-super-admin endpoint.
export default function SuperAdminTicketSection({ panel = 'event_head' }) {
  return <TechnicalTickets panel={panel} toSuperAdmin canResolve canRaise={false} />;
}
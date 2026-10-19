import TechnicalTickets from '../../components/TechnicalTickets';

export default function Tickets() {
  return (
    <div>
      <TechnicalTickets panel="hr" queueDepartment="hr" statusTabs={['open', 'resolved']} canRaise={true} />
    </div>
  );
}

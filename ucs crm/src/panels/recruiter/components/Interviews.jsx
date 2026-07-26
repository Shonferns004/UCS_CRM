import { useRec } from '../store';
import { Who } from './ui';
import { Cal } from '../icons';

const formatDT = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function Interviews() {
  const { leads } = useRec();
  const scheduled = leads.filter(l => l.scheduled_date);

  return (
    <div className="card">
      <div className="card-head"><h3><Cal width={18} style={{color:'var(--sage)',verticalAlign:-3,marginRight:6}}/>Upcoming interviews</h3><span className="sub">{scheduled.length} scheduled</span></div>
      {scheduled.length === 0 ? (
        <div className="empty">No upcoming interviews.</div>
      ) : (
        <table>
          <thead><tr><th>When</th><th>Candidate</th><th>Source</th><th>Phone</th></tr></thead>
          <tbody>
            {scheduled.map((l,i) => {
              const dt = formatDT(l.scheduled_date);
              return (
                <tr key={l.id || i}>
                  <td><div style={{fontWeight:600}}>{dt}</div></td>
                  <td><Who name={l.name} role={l.job_role || '—'} /></td>
                  <td>{l.source || '—'}</td>
                  <td style={{color:'var(--ink-soft)'}}>{l.phone || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

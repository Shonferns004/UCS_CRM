import { useMemo, useState } from 'react';
import { useSim } from './store';
import { effectiveStatus, formatDate, dayLabel, dayClass } from './helpers';
import { ReplaceModal } from './modals';

export default function Replacements({ onRefresh }) {
  const { cards, refresh } = useSim();
  const [replaceCard, setReplaceCard] = useState(null);

  const enriched = useMemo(() => cards.map((c) => ({ ...c, _status: effectiveStatus(c) })), [cards]);

  return (
    <div>
      <div className="grid-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))' }}>
        <div className="sim-card">
          <div className="title">Total Replaceable</div>
          <div className="num">{enriched.length}</div>
          <div className="sub">All SIM cards</div>
        </div>
        <div className="sim-card">
          <div className="title">Replacement Count</div>
          <div className="num">{enriched.reduce((s, c) => s + (c.replacement_count || 0), 0)}</div>
          <div className="sub">Total replacements</div>
        </div>
        <div className="sim-card">
          <div className="title">Replaced</div>
          <div className="num">{enriched.filter((c) => c._status === 'Replaced').length}</div>
          <div className="sub">Currently marked replaced</div>
        </div>
        <div className="sim-card">
          <div className="title">Never Replaced</div>
          <div className="num">{enriched.filter((c) => !c.replacement_count).length}</div>
          <div className="sub">First-time SIMs</div>
        </div>
      </div>

      <div className="card-block">
        <div className="tb"><h3>SIM Replacements</h3><span className="ln">Select a SIM to initiate a replacement</span></div>
        <div className="table-wrap">
          <table className="sim-table">
            <thead>
              <tr><th>Mobile ID</th><th>Device</th><th>Current SIM</th><th>Issue Date</th><th>Expiry Date</th><th>Days Left</th><th>Replacement Count</th><th>Action</th></tr>
            </thead>
            <tbody>
              {enriched.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.mobile_id}</td>
                  <td>{c.device_model}</td>
                  <td>{c.sim_1 || c.mobile_id || '—'}</td>
                  <td>{formatDate(c.issue_date)}</td>
                  <td>{formatDate(c.expiry_date)}</td>
                  <td className={`days-cell ${dayClass(c.days_left)}`}>{dayLabel(c.days_left)}</td>
                  <td>{c.replacement_count || 0}</td>
                  <td><button className="mini-btn" style={{ color: 'var(--sim-blue-dark)', borderColor: 'var(--sim-blue)' }} onClick={() => setReplaceCard(c)}>Replace</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ReplaceModal card={replaceCard} open={!!replaceCard} onClose={() => setReplaceCard(null)} onDone={() => { refresh(); onRefresh && onRefresh(); }} />
    </div>
  );
}

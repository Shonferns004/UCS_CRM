import { useCallback, useState } from 'react';
import { X } from 'lucide-react';

import TeamWiseCollection from '../../ngo-admin/components/TeamWiseCollection';
import { getFroTeamCollection } from '../api/donors';

// Collection Race popup for the FRO panel: the NGO-admin team board, opened from the
// medal icon beside the AKI coin in the topbar.
//
// The card itself is the NGO-admin component, unmodified apart from its fetcher, and
// both panels hit the same backend service - so this is the same board, not a
// reimplementation of it.
//
// The filters live here rather than in TeamWiseCollection because the admin card is
// driven by that panel's global filter and must not own one; the popup has no global
// filter, so it needs its own.

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

export default function FroTeamRacePopup({ open, onClose }) {
  const [period, setPeriod] = useState('today');

  // Memoised on `period` specifically because TeamWiseCollection refetches whenever
  // its fetcher identity changes - an inline arrow would re-run the effect on every
  // render and the card would never stop loading.
  const fetcher = useCallback(() => getFroTeamCollection(period), [period]);

  if (!open) return null;

  const label = PERIODS.find((p) => p.id === period)?.label || 'Today';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: '92%', borderRadius: 'var(--radius)', overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--card-bg)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Collection Race</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>
              Team-wise collection, same board as the NGO admin panel
            </div>
          </div>
          <button className="btn btn-sm btn-icon" onClick={onClose} style={{ padding: 4 }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', background: 'var(--bg)', maxHeight: '80vh', overflowY: 'auto' }}>
          <div className="twc-periods" role="tablist" aria-label="Collection period">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={period === p.id}
                className={`twc-period${period === p.id ? ' is-active' : ''}`}
                onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          <TeamWiseCollection fetcher={fetcher} periodLabel={label} />
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import Letters from './Letters';
import HRForms from './HRForms';

/**
 * Letters + HR Forms live on a single page now (they were two sidebar
 * entries before). Both stay mounted so a half-filled letter or form
 * draft survives tab switches — the inactive one is just hidden.
 */
export default function LettersForms() {
  const [tab, setTab] = useState('letters');

  return (
    <div>
      <div className="tabs">
        <button className={'tab' + (tab === 'letters' ? ' active' : '')} onClick={() => setTab('letters')}>Letters</button>
        <button className={'tab' + (tab === 'forms' ? ' active' : '')} onClick={() => setTab('forms')}>HR Forms</button>
      </div>

      <div style={{ marginTop: 16, display: tab === 'letters' ? 'block' : 'none' }}>
        <Letters />
      </div>
      <div style={{ marginTop: 16, display: tab === 'forms' ? 'block' : 'none' }}>
        <HRForms />
      </div>
    </div>
  );
}

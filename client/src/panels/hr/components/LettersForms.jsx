import { useState } from 'react';
import Letters from './Letters';
import HRForms from './HRForms';

export default function LettersForms() {
  const [tab, setTab] = useState('letters');

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Documents</div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>Letters &amp; Forms</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>Generate professional letters and HR documents for your team.</div>
      </div>

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

import { useState, useEffect } from 'react';
import { useHR } from '../store';
import { Dropdown } from './ui';
import { FileTxt } from '../icons';

const TYPES = ['Offer letter','Experience letter','Promotion letter','Warning letter','Relieving letter'];

function build(type, w) {
  const today = new Date().toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
  const r = w.role || w.department || 'Team Member';
  const d = w.dept || w.department || 'General';
  const body = {
    'Offer letter': `Dear ${w.name},\n\nWe are delighted to offer you the position of ${r} on our ${d} team. We were impressed by your experience and believe you will be a wonderful addition. We look forward to welcoming you aboard.\n\nWarm regards,\nThe People Team`,
    'Experience letter': `To Whom It May Concern,\n\nThis is to certify that ${w.name} served as ${r} in our ${d} team. Throughout their time with us they were dependable, collaborative and consistently professional. We wish them every success ahead.\n\nWarm regards,\nThe People Team`,
    'Promotion letter': `Dear ${w.name},\n\nCongratulations. In recognition of your strong contribution to the ${d} team, we are pleased to confirm your promotion, effective immediately. Thank you for the energy you bring to your work.\n\nWarm regards,\nThe People Team`,
    'Warning letter': `Dear ${w.name},\n\nThis letter is a formal note regarding recent conduct in your role as ${r}. We value your contribution and trust this can be resolved. Please treat this as an opportunity to realign with our shared expectations.\n\nRegards,\nThe People Team`,
    'Relieving letter': `Dear ${w.name},\n\nThis confirms that you have been relieved of your duties as ${r}, ${d}, with all responsibilities duly handed over. Thank you for your contributions — we wish you the very best in what comes next.\n\nWarm regards,\nThe People Team`,
  }[type];
  return { today, body };
}

export default function Letters() {
  const { fetchWorkers } = useHR();
  const [workers, setWorkers] = useState([]);
  const [name, setName] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [out, setOut] = useState(null);

  useEffect(() => { fetchWorkers().then(setWorkers).catch(() => {}); }, []);

  const generate = () => {
    const w = workers.find(x => x.name === name);
    if (!w) return;
    setOut({ ...build(type, w), type });
  };

  const copy = () => out && navigator.clipboard?.writeText(`${out.body}`);

  useEffect(() => {
    if (workers.length && !name) setName(workers[0].name);
  }, [workers, name]);

  return (
    <div className="card">
      <div className="card-head"><h3>Generate a letter</h3><span className="sub">auto-fills name, role &amp; date</span></div>
      <div className="card-pad">
        <div className="form-row">
          <label className="field">Worker
            <Dropdown value={name} onChange={e=>setName(e.target.value)}
              options={workers.map(w => ({value: w.name, label: w.name}))} />
          </label>
          <label className="field">Letter type
            <Dropdown value={type} onChange={e=>setType(e.target.value)} options={TYPES} />
          </label>
          <button className="btn btn-primary" onClick={generate}><FileTxt width={16}/> Generate</button>
        </div>

        {out && (
          <div className="letter">
            <div className="lh" style={{ fontSize:18, marginBottom:4 }}>{out.type}</div>
            <div style={{ color:'var(--ink-soft)', fontSize:12, marginBottom:18 }}>{out.today}</div>
            {out.body}
            <div style={{ marginTop:18 }}>
              <button className="btn btn-sm" onClick={copy}>Copy text</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

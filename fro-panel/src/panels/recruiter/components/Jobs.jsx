import { useState } from 'react';
import { useRec } from '../store';
import { Dropdown, Pill } from './ui';
import { Plus } from '../icons';

export default function Jobs() {
  const { jobs, addJob } = useRec();
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState('Engineering');
  const [openings, setOpenings] = useState(1);

  const submit = () => { if(!title.trim()) return; addJob({ title:title.trim(), dept, openings:Number(openings)||1 }); setTitle(''); setOpenings(1); };

  return (
    <>
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head"><h3>Open a role</h3></div>
        <div className="card-pad">
          <div className="form-row">
            <label className="field" style={{flex:2}}>Job title
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Senior Frontend Engineer" onKeyDown={e=>e.key==='Enter'&&submit()} />
            </label>
            <label className="field">Department
              <Dropdown value={dept} onChange={e=>setDept(e.target.value)} options={['Engineering','Design','Sales','People','Operations']} />
            </label>
            <label className="field" style={{flex:'0 0 90px'}}>Openings
              <input type="number" min="1" value={openings} onChange={e=>setOpenings(e.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={submit}><Plus width={16}/> Open role</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Roles</h3><span className="sub">{jobs.filter(j=>j.status==='Open').length} open</span></div>
        <div className="card-pad" style={{paddingTop:4,paddingBottom:4}}>
          {jobs.map(j => (
            <div className="job-card" key={j.id}>
              <div>
                <div style={{fontWeight:600,fontSize:15}}>{j.title}</div>
                <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{j.dept} · {j.applicants} applicants</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:24}}>
                <div style={{textAlign:'center'}}><div className="openings">{j.openings}</div><div style={{fontSize:11,color:'var(--ink-soft)'}}>openings</div></div>
                <Pill status={j.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

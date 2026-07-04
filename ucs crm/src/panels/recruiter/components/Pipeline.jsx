import { useState } from 'react';
import { useRec } from '../store';
import { Score } from './ui';

export default function Pipeline() {
  const { candidates, STAGES, moveCandidate } = useRec();
  const [drag, setDrag] = useState(null);

  return (
    <>
      <p style={{color:'var(--ink-soft)',marginBottom:18,marginTop:-8}}>Drag a candidate card between columns to move them through the hiring stages.</p>
      <div className="pipeline">
        {STAGES.map((stage, i) => {
          const list = candidates.filter(c => c.stage === stage);
          return (
            <div className="pcol-wrap" key={stage}>
              <div className="pcol"
                onDragOver={e=>e.preventDefault()}
                onDrop={()=>{ if(drag!=null) moveCandidate(drag, stage); setDrag(null); }}>
                <div className="pcol-head"><span className="t">{stage}</span><span className="c">{list.length}</span></div>
                <div className="pcol-body">
                  {list.map(c => (
                    <div className="ccard" key={c.id} draggable
                      onDragStart={()=>setDrag(c.id)} onDragEnd={()=>setDrag(null)}>
                      <div className="nm">{c.name}</div>
                      <div className="ft"><Score value={c.score} /><span style={{fontSize:11,color:'var(--ink-soft)'}}>{c.source}</span></div>
                    </div>
                  ))}
                </div>
              </div>
              {i < STAGES.length - 1 && <div className="pipeline-arrow"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M15 6l6 6-6 6"/></svg></div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

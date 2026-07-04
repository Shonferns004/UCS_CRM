import { useState } from 'react';
import { useRec, initials, avatarColor, avatarTint, STAGES } from '../store';

const STAGE_META = {
  'Contacted': { color: '#4F6472', light: '#E8EDF0' },
  'Screening': { color: '#B5603A', light: '#F4E4DA' },
  'Interview Scheduled': { color: '#C08A2E', light: '#F6EAD0' },
  'Selected': { color: '#5B6B4E', light: '#E8EDE1' },
  'Offer Sent': { color: '#3B6B8A', light: '#E1EBF2' },
  'Rejected': { color: '#9E3B2E', light: '#F3DDD8' },
};

function StageIcon({ stage, color }) {
  let paths;
  switch (stage) {
    case 'Contacted':
      paths = <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>;
      break;
    case 'Screening':
      paths = <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>;
      break;
    case 'Interview Scheduled':
      paths = <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><rect x="6" y="9" width="12" height="12" rx="2"/><path d="M9 9V5"/><path d="M15 9V5"/><path d="M9 13h6"/><path d="M9 17h4"/></>;
      break;
    case 'Selected':
      paths = <polyline points="20 6 9 17 4 12"/>;
      break;
    case 'Offer Sent':
      paths = <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>;
      break;
    case 'Rejected':
      paths = <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>;
      break;
    default:
      paths = null;
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}

export default function Pipeline() {
  const { candidates, moveCandidate } = useRec();
  const [drag, setDrag] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <p style={{ color:'var(--ink-soft)', fontSize:13, margin:0, flex:1 }}>
          Drag cards between columns to move candidates through the hiring pipeline.
        </p>
        <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--ink-soft)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:8, height:8, borderRadius:4, background:'var(--sage)' }}/> {candidates.filter(c => c.stage !== 'Rejected').length} active
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:8, height:8, borderRadius:4, background:'var(--danger)' }}/> {candidates.filter(c => c.stage === 'Rejected').length} rejected
          </span>
        </div>
      </div>
      <div className="pipeline">
        {STAGES.flatMap((stage, i) => {
          const list = candidates.filter(c => c.stage === stage);
          const meta = STAGE_META[stage] || { color:'var(--ink-soft)', light:'var(--sand)' };
          const isDragOver = dragOver === stage;
          const items = [
            <div className="pcol-wrap" key={stage}>
              <div className={`pcol ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(stage); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => { if (drag != null) { moveCandidate(drag, stage); setDrag(null); setDragOver(null); } }}>
                <div className="pcol-head" style={{ background: meta.light, borderBottomColor: meta.color + '33' }}>
                  <div className="pcol-head-left">
                    <StageIcon stage={stage} color={meta.color} />
                    <span className="t" style={{ color: meta.color }}>{stage}</span>
                  </div>
                  <span className="c" style={{ background: meta.color, color: '#fff' }}>{list.length}</span>
                </div>
                <div className="pcol-body">
                  {list.length === 0 ? (
                    <div className="pcol-empty">No candidates</div>
                  ) : (
                    list.map(c => (
                      <PipelineCard key={c.id} candidate={c} onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag(null)} />
                    ))
                  )}
                </div>
              </div>
            </div>
          ];
          if (i < STAGES.length - 1) {
            items.push(
              <div className="pipeline-connector" key={`conn-${stage}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/>
                  <path d="m12 5 7 7-7 7"/>
                </svg>
              </div>
            );
          }
          return items;
        })}
      </div>
    </>
  );
}

function PipelineCard({ candidate, onDragStart, onDragEnd }) {
  const c = candidate;
  const init = initials(c.name);
  const col = avatarColor(c.name);
  const scoreCls = c.score >= 85 ? 'score-hi' : c.score >= 75 ? 'score-mid' : 'score-lo';

  return (
    <div className="pcard" draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}>
      <div className="pcard-top">
        <div className="pcard-avatar" style={{ background: avatarTint(col), color: col }}>
          {init}
        </div>
        <div className="pcard-info">
          <div className="pcard-name">{c.name}</div>
          <div className="pcard-role">{c.role}</div>
        </div>
        <span className={`pcard-score ${scoreCls}`}>{c.score}</span>
      </div>
      <div className="pcard-skills">
        {c.skills.slice(0, 3).map(s => (
          <span key={s} className="pcard-skill">{s}</span>
        ))}
      </div>
      <div className="pcard-meta">
        <span className="pcard-source">{c.source}</span>
        <span className="pcard-exp">{c.exp}</span>
        <span className="pcard-loc">{c.location}</span>
      </div>
    </div>
  );
}

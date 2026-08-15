import { useState } from 'react';
import { useRec, initials, avatarColor, avatarTint } from '../store';

const STAGES = ['Contacted','Screening','Interview Scheduled','Selected','Offer Sent','Rejected'];

const META = {
  'Contacted': { bg:'#4F6472', light:'#E8EDF0' },
  'Screening': { bg:'#B5603A', light:'#F4E4DA' },
  'Interview Scheduled': { bg:'#C08A2E', light:'#F6EAD0' },
  'Selected': { bg:'#5B6B4E', light:'#E8EDE1' },
  'Offer Sent': { bg:'#3B6B8A', light:'#E1EBF2' },
  'Rejected': { bg:'#9E3B2E', light:'#F3DDD8' },
};

function ArrowRight() {
  return (
    <svg className="infographic-arrow" width="48" height="16" viewBox="0 0 48 16" fill="none">
      <path d="M2 8h40" stroke="#7B8BA5" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M34 2l10 6-10 6" stroke="#7B8BA5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg className="infographic-arrow" width="48" height="16" viewBox="0 0 48 16" fill="none">
      <path d="M46 8H6" stroke="#7B8BA5" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 2L4 8l10 6" stroke="#7B8BA5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="18" height="44" viewBox="0 0 18 44" fill="none">
      <path d="M9 2v36" stroke="#7B8BA5" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M3 30l6 8 6-8" stroke="#7B8BA5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StageCard({ stage, meta, count, expanded, onToggle }) {
  return (
    <div className={`infocard ${expanded ? 'expanded' : ''}`} onClick={onToggle}>
      <div className="infocard-top" style={{ background: meta.bg }}>
        <span className="infocard-stage-name">{stage}</span>
        <span className="infocard-stage-count">{count}</span>
      </div>
    </div>
  );
}

function CandidateDetail({ candidate, onClose }) {
  if (!candidate) return null;
  const init = initials(candidate.name);
  const col = avatarColor(candidate.name);
  const scoreCls = candidate.score >= 85 ? 'score-hi' : candidate.score >= 75 ? 'score-mid' : 'score-lo';

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="candidate-modal">
        <button className="candidate-modal-close" onClick={onClose}>&times;</button>
        <div className="candidate-modal-header">
          <div className="candidate-modal-avatar" style={{ background: avatarTint(col), color: col }}>
            {init}
          </div>
          <div>
            <div className="candidate-modal-name">{candidate.name}</div>
            <div className="candidate-modal-role">{candidate.role}</div>
          </div>
          <div className={`candidate-modal-score ${scoreCls}`}>{candidate.score}</div>
        </div>
        <div className="candidate-modal-body">
          <div className="candidate-modal-field">
            <span className="candidate-modal-label">Skills</span>
            <div className="candidate-modal-skills">
              {candidate.skills.map(s => <span key={s} className="candidate-modal-skill">{s}</span>)}
            </div>
          </div>
          <div className="candidate-modal-field">
            <span className="candidate-modal-label">Experience</span>
            <span className="candidate-modal-value">{candidate.exp}</span>
          </div>
          <div className="candidate-modal-field">
            <span className="candidate-modal-label">Location</span>
            <span className="candidate-modal-value">{candidate.location}</span>
          </div>
          <div className="candidate-modal-field">
            <span className="candidate-modal-label">Source</span>
            <span className="candidate-modal-value">{candidate.source}</span>
          </div>
          <div className="candidate-modal-field">
            <span className="candidate-modal-label">Salary</span>
            <span className="candidate-modal-value">{candidate.salary}</span>
          </div>
          <div className="candidate-modal-field">
            <span className="candidate-modal-label">Stage</span>
            <span className="candidate-modal-stage" style={{ background: META[candidate.stage]?.bg }}>{candidate.stage}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Pipeline() {
  const { candidates } = useRec();
  const [expandedStage, setExpandedStage] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const row1 = STAGES.slice(0, 3);
  const row2 = STAGES.slice(3).reverse();

  const listForStage = (stage) => candidates.filter(c => c.stage === stage);

  const toggleStage = (stage) => {
    setExpandedStage(prev => prev === stage ? null : stage);
  };

  const openCandidate = (c) => {
    setSelectedCandidate(c);
  };

  const stageCandidates = expandedStage ? listForStage(expandedStage) : [];
  const totalActive = candidates.filter(c => c.stage !== 'Rejected').length;
  const totalRejected = candidates.filter(c => c.stage === 'Rejected').length;

  return (
    <>
      <div className="infographic">
        <div className="infographic-header">
          <h2 className="infographic-title">Hiring Pipeline</h2>
          <div className="infographic-stats">
            <span className="infographic-stat">
              <span className="infographic-stat-dot" style={{ background: '#5B6B4E' }} />
              {totalActive} active
            </span>
            <span className="infographic-stat">
              <span className="infographic-stat-dot" style={{ background: '#9E3B2E' }} />
              {totalRejected} rejected
            </span>
          </div>
        </div>
        <div className="infographic-body">
          <div className="infographic-row">
            {row1.map((s, i) => (
              <span className="infographic-row-item" key={s}>
                <StageCard stage={s} meta={META[s]} count={listForStage(s).length}
                  expanded={expandedStage === s} onToggle={() => toggleStage(s)} />
                {i < row1.length - 1 && <ArrowRight />}
              </span>
            ))}
          </div>
          <div className="infographic-down">
            <ArrowDown />
          </div>
          <div className="infographic-row">
            {row2.map((s, i) => (
              <span className="infographic-row-item" key={s}>
                {i > 0 && <ArrowLeft />}
                <StageCard stage={s} meta={META[s]} count={listForStage(s).length}
                  expanded={expandedStage === s} onToggle={() => toggleStage(s)} />
              </span>
            ))}
          </div>
        </div>
      </div>

      {expandedStage && (
        <>
          <div className="dropdown-overlay" onClick={() => setExpandedStage(null)} />
          <div className="infocard-dropdown global">
            <div className="infocard-dropdown-header">{expandedStage}</div>
            <div className="infocard-dropdown-list">
              {stageCandidates.length === 0 ? (
                <div className="infocard-dropdown-empty">No candidates</div>
              ) : (
                stageCandidates.map(c => {
                  const init = initials(c.name);
                  const col = avatarColor(c.name);
                  return (
                    <div key={c.id} className="infocard-dropdown-item" onClick={() => openCandidate(c)}>
                      <div className="infocard-dropdown-avatar" style={{ background: avatarTint(col), color: col }}>
                        {init}
                      </div>
                      <div className="infocard-dropdown-info">
                        <div className="infocard-dropdown-name">{c.name}</div>
                        <div className="infocard-dropdown-role">{c.role}</div>
                      </div>
                      <span className={`infocard-dropdown-score ${c.score >= 85 ? 'score-hi' : c.score >= 75 ? 'score-mid' : 'score-lo'}`}>{c.score}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {selectedCandidate && (
        <CandidateDetail candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />
      )}
    </>
  );
}

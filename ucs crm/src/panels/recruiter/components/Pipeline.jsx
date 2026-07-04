const STEPS = [
  { num: 1, text: 'Talent Sourcing' },
  { num: 2, text: 'Candidate Data Centralization' },
  { num: 3, text: 'Candidate Search' },
  { num: 4, text: 'Candidate Engagement' },
  { num: 5, text: 'Workflow Automation' },
  { num: 6, text: 'Hiring Team Collaboration' },
  { num: 7, text: 'Analytics and Reporting' },
  { num: 8, text: 'Ongoing Nurturing' },
];

const isBlue = n => n % 2 !== 0;

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

function StepCard({ step }) {
  const blue = isBlue(step.num);
  const bg = blue ? '#4F6EF7' : '#55D6E8';

  return (
    <div className="infocard">
      <div className="infocard-badge" style={{ background: bg }}>
        {step.num}
      </div>
      <div className="infocard-text">{step.text}</div>
    </div>
  );
}

export default function Pipeline() {
  const row1 = STEPS.slice(0, 4);
  const row2 = STEPS.slice(4).reverse();

  return (
    <div className="infographic">
      <h1 className="infographic-title">How Recruitment CRM Software Works</h1>
      <div className="infographic-body">
        <div className="infographic-row">
          {row1.map((s, i) => (
            <span className="infographic-row-item" key={s.num}>
              <StepCard step={s} />
              {i < row1.length - 1 && <ArrowRight />}
            </span>
          ))}
        </div>
        <div className="infographic-down">
          <ArrowDown />
        </div>
        <div className="infographic-row">
          {row2.map((s, i) => (
            <span className="infographic-row-item" key={s.num}>
              {i > 0 && <ArrowLeft />}
              <StepCard step={s} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

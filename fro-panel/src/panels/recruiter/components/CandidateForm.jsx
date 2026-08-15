import { useState } from 'react';
import { Plus, Users, Check, Trash } from '../icons';
import { Dropdown } from './ui';
import { CANDIDATE_STAGES, CANDIDATE_SOURCES } from '../store';

const SOURCE_OPTIONS = CANDIDATE_SOURCES.map(s => ({ value: s, label: s }));
const STAGE_OPTIONS = CANDIDATE_STAGES.map(s => ({ value: s, label: s }));
const GENDER_OPTIONS = ['Male', 'Female', 'Other'].map(g => ({ value: g, label: g }));

const toDateInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginTop: 12, border: '1.5px solid var(--line)', borderRadius: 'var(--radius)' }}>
      <div className="card-head"><h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</h4></div>
      <div className="card-pad">{children}</div>
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <label className="field">
      {label}{required ? ' *' : ''}
      {children}
      {error && <span style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>{error}</span>}
    </label>
  );
}

export default function CandidateForm({ candidate, user, jobRoleSuggestions, onSubmit, onCancel }) {
  const editing = !!candidate;
  const profile = candidate?.profile || {};
  const [form, setForm] = useState(() => ({
    name: editing ? (candidate.name === '—' ? '' : candidate.name) : '',
    phone: editing ? (candidate.phone === '—' ? '' : candidate.phone) : '',
    email: editing ? (candidate.email === '—' ? '' : candidate.email) : '',
    dob: editing ? (candidate.dob || '') : '',
    gender: profile.gender || '',
    location: profile.location || '',
    address: profile.address || '',
    appliedJob: editing ? (candidate.role || '') : '',
    department: profile.department || '',
    experience: profile.experience || '',
    currentCompany: profile.currentCompany || '',
    currentDesignation: profile.currentDesignation || '',
    currentSalary: profile.currentSalary || '',
    expectedSalary: profile.expectedSalary || '',
    noticePeriod: profile.noticePeriod || '',
    skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
    qualification: profile.qualification || '',
    candidateId: profile.candidateId || '',
    recruiter: profile.recruiter || (user?.name || ''),
    source: editing && candidate.source !== '—' ? candidate.source : 'Walk-in',
    customSource: profile.customSource || '',
    stage: editing ? candidate.stage : 'New',
    applicationDate: toDateInput(profile.applicationDate || (editing ? null : new Date())),
    nextFollowUpDate: toDateInput(profile.nextFollowUpDate || ''),
    resume: profile.resume || null,
    notes: profile.notes || '',
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const set = (key, value) => setForm(p => ({ ...p, [key]: value }));

  const onResumeChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setFormError('Resume must be under 2 MB.');
      setTimeout(() => setFormError(''), 3000);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('resume', { name: f.name, data: reader.result });
    reader.readAsDataURL(f);
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Candidate name is required';
    if (!form.phone.trim()) errs.phone = 'Phone is required';
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'A valid email is required';
    if (!form.appliedJob.trim()) errs.appliedJob = 'Applied job is required';
    if (!form.source.trim()) errs.source = 'Source is required';
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError('Please fill the required fields.');
      setTimeout(() => setFormError(''), 3000);
      return;
    }
    onSubmit({
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      appliedJob: form.appliedJob.trim(),
      source: form.source === 'Other' ? (form.customSource.trim() || 'Other') : form.source,
      skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
      resume: form.resume,
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3><Users width={18}/> {editing ? 'Edit candidate' : 'Add new candidate'}</h3>
      </div>
      <form className="card-pad" onSubmit={submit}>
        <Section title="PERSONAL INFORMATION">
          <div className="form-row">
            <Field label="Candidate Name" required error={errors.name}>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Arun Sharma" />
            </Field>
            <Field label="Phone" required error={errors.phone}>
              <input value={form.phone} onChange={e => set('phone', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} placeholder="e.g. 9876543210" />
            </Field>
            <Field label="Email" required error={errors.email}>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="e.g. arun@email.com" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Date of Birth">
              <input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} />
            </Field>
            <Field label="Gender">
              <Dropdown value={form.gender} onChange={e => set('gender', e.target.value)} options={GENDER_OPTIONS} placeholder="Select" />
            </Field>
            <Field label="Current Location">
              <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Pune" />
            </Field>
          </div>
          <Field label="Address">
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
          </Field>
        </Section>

        <Section title="PROFESSIONAL INFORMATION">
          <div className="form-row">
            <Field label="Applied Job" required error={errors.appliedJob}>
              <input list="candidate-job-roles" value={form.appliedJob} onChange={e => set('appliedJob', e.target.value)} placeholder="e.g. Web Developer" />
              <datalist id="candidate-job-roles">
                {(jobRoleSuggestions || []).map(r => <option key={r} value={r} />)}
              </datalist>
            </Field>
            <Field label="Department">
              <input value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. IT" />
            </Field>
            <Field label="Experience">
              <input value={form.experience} onChange={e => set('experience', e.target.value)} placeholder="e.g. 3 or 3 Years" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Current Company">
              <input value={form.currentCompany} onChange={e => set('currentCompany', e.target.value)} placeholder="e.g. Acme Pvt Ltd" />
            </Field>
            <Field label="Current Designation">
              <input value={form.currentDesignation} onChange={e => set('currentDesignation', e.target.value)} placeholder="e.g. Software Engineer" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Current Salary">
              <input value={form.currentSalary} onChange={e => set('currentSalary', e.target.value)} placeholder="e.g. 3,00,000" />
            </Field>
            <Field label="Expected Salary">
              <input value={form.expectedSalary} onChange={e => set('expectedSalary', e.target.value)} placeholder="e.g. 4,50,000" />
            </Field>
            <Field label="Notice Period">
              <input value={form.noticePeriod} onChange={e => set('noticePeriod', e.target.value)} placeholder="e.g. 30 days" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Skills">
              <input value={form.skills} onChange={e => set('skills', e.target.value)} placeholder="Comma separated, e.g. React, JavaScript" />
            </Field>
            <Field label="Qualification">
              <input value={form.qualification} onChange={e => set('qualification', e.target.value)} placeholder="e.g. B.E. Computer Science" />
            </Field>
          </div>
        </Section>

        <Section title="RECRUITMENT INFORMATION">
          <div className="form-row">
            <Field label="Candidate ID">
              <input value={form.candidateId} onChange={e => set('candidateId', e.target.value)} placeholder="Auto-generated if blank" />
            </Field>
            <Field label="Recruiter">
              <input value={form.recruiter} onChange={e => set('recruiter', e.target.value)} />
            </Field>
            <Field label="Source" required error={errors.source}>
              <Dropdown value={form.source} onChange={e => { set('source', e.target.value); if (e.target.value !== 'Other') set('customSource', ''); }} options={SOURCE_OPTIONS} customTrigger="Other" customValue={form.customSource} onCustomChange={v => set('customSource', v)} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Current Stage">
              <Dropdown value={form.stage} onChange={e => set('stage', e.target.value)} options={STAGE_OPTIONS} />
            </Field>
            <Field label="Application Date">
              <input type="date" value={form.applicationDate} onChange={e => set('applicationDate', e.target.value)} />
            </Field>
            <Field label="Next Follow-up Date">
              <input type="date" value={form.nextFollowUpDate} onChange={e => set('nextFollowUpDate', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="DOCUMENTS">
          <label className="field">Resume / CV upload
            <input type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" onChange={onResumeChange} />
            {form.resume ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--sage)' }}>
                <Check width={13}/> {form.resume.name}
                <button type="button" className="btn btn-sm" onClick={() => set('resume', null)} style={{ color: '#dc2626' }}><Trash width={12}/> Remove</button>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No file selected. Upload a PDF or document (max 2 MB).</span>
            )}
          </label>
        </Section>

        <Section title="ADDITIONAL">
          <label className="field">Notes
            <textarea className="textarea" style={{ minHeight: 90 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about the candidate…" />
          </label>
        </Section>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
          {formError && <span style={{ fontSize: 12, color: '#dc2626', marginRight: 'auto' }}>{formError}</span>}
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Plus width={15}/> {editing ? 'Save changes' : 'Create candidate'}</button>
        </div>
      </form>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useHR } from '../store';
import { initials as initialsFn } from '../store';
import PrintForms from './forms/PrintForms';

const titleCase = (s) => (s || '').replace(/\b\w/g, c => c.toUpperCase());

const PALETTE = ['#5B6B4E', '#B5603A', '#C08A2E', '#4F6472', '#7A5C7E', '#88693D'];
const avatarColorLocal = (name) => {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
};
const tint = (hex) => hex + '22';

function MiniFormPreview({ worker }) {
  const w = worker;
  const name = w.name || '';
  const dept = w.department || '';
  const phone = w.phone || '';
  const email = w.email || '';
  const gender = w.gender || '';
  const dob = w.dob ? new Date(w.dob).toLocaleDateString('en-IN') : '';
  const joinDate = w.date_of_joining ? new Date(w.date_of_joining).toLocaleDateString('en-IN') : '';
  const photo = w.photo_url || '';

  return (
    <div style={{
      width: '595px',
      height: '842px',
      background: '#fff',
      border: '6px double #000',
      padding: '10px 12px',
      fontFamily: 'Arial, Helvetica, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 2 }}>
        <div style={{ fontSize: 26, fontFamily: 'Georgia, serif', fontWeight: 700, margin: 0 }}>Being Sevak Charitable Trust</div>
        <div style={{ borderTop: '3px solid #7d1e1e', margin: '3px 0' }} />
        <div style={{ fontSize: 8 }}>Public Charitable Trust (Reg.) E-31948 No, Income Tax Exempted Under 80G</div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, textDecoration: 'underline', marginBottom: 8 }}>VOLUNTEER JOINING FORM</div>

      {/* Personal Details */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <tbody>
          <tr><td colSpan="3" style={{ background: '#d8d8d8', fontWeight: 700, fontSize: 13, border: '1px solid #666', padding: '6px 8px' }}>PERSONAL DETAILS</td></tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700, width: '25%', whiteSpace: 'nowrap' }}>Name :</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 600 }}>{titleCase(name)}</td>
            <td rowSpan="4" style={{ border: '1px solid #666', padding: 6, textAlign: 'center', verticalAlign: 'middle', width: 100, fontWeight: 700, fontSize: 20, height: 140 }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} /> : 'PHOTOGRAPH'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700 }}>Father's / Husband Name :</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}>{titleCase(w.father_husband_name || '')}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700 }}>Address :</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px', whiteSpace: 'pre-wrap' }}>{titleCase(w.address || '')}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700 }}>Permanent Address :</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px', whiteSpace: 'pre-wrap' }}>{titleCase(w.permanent_address || w.address || '')}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Mobile :</strong> {phone}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Email :</strong> {email}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Gender :</strong> {titleCase(gender)}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Date of Birth :</strong> {dob}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Marital Status :</strong> {titleCase(w.marital_status || '')}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Date of Joining :</strong> {joinDate}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>PAN :</strong> {w.pan_number || ''}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Aadhaar :</strong> {w.aadhar_number || ''}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}><strong>Dept :</strong> {dept}</td>
          </tr>
        </tbody>
      </table>

      {/* Education */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 4 }}>
        <tbody>
          <tr><td colSpan="5" style={{ background: '#d8d8d8', fontWeight: 700, fontSize: 13, border: '1px solid #666', padding: '6px 8px' }}>EDUCATIONAL DETAILS</td></tr>
          <tr>
            {[<th key="1" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Degree</th>, <th key="2" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>University / Institute</th>, <th key="3" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Year</th>, <th key="4" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>%</th>]}
          </tr>
          {[...Array(2)].map((_, i) => (
            <tr key={i}>
              <td style={{ border: '1px solid #666', padding: '4px 6px', height: 28 }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px' }}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Organizations */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 4 }}>
        <tbody>
          <tr><td colSpan="5" style={{ background: '#d8d8d8', fontWeight: 700, fontSize: 13, border: '1px solid #666', padding: '6px 8px' }}>PREVIOUS ORGANISATIONS</td></tr>
          <tr>
            {[<th key="1" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9, width: '6%' }}>Sr</th>, <th key="2" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Organisation</th>, <th key="3" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Role</th>, <th key="4" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9, width: '12%' }}>From</th>, <th key="5" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9, width: '12%' }}>To</th>]}
          </tr>
          {[...Array(2)].map((_, i) => (
            <tr key={i}>
              <td style={{ border: '1px solid #666', padding: '4px 6px', textAlign: 'center', height: 28 }}>{i + 1}</td>
              <td style={{ border: '1px solid #666', padding: '4px 6px' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px', textAlign: 'center' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px', textAlign: 'center' }}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Family */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 4 }}>
        <tbody>
          <tr><td colSpan="5" style={{ background: '#d8d8d8', fontWeight: 700, fontSize: 13, border: '1px solid #666', padding: '6px 8px' }}>FAMILY DETAILS</td></tr>
          <tr>
            {[<th key="1" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9, width: '6%' }}>S.No</th>, <th key="2" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Name</th>, <th key="3" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Relation</th>, <th key="4" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Occupation</th>, <th key="5" style={{ border: '1px solid #666', padding: '4px 6px', fontSize: 9 }}>Mobile</th>]}
          </tr>
          {[...Array(2)].map((_, i) => (
            <tr key={i}>
              <td style={{ border: '1px solid #666', padding: '4px 6px', textAlign: 'center', height: 28 }}>{i + 1}</td>
              <td style={{ border: '1px solid #666', padding: '4px 6px' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px', textAlign: 'center' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px', textAlign: 'center' }}></td>
              <td style={{ border: '1px solid #666', padding: '4px 6px', textAlign: 'center' }}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bank */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 4 }}>
        <tbody>
          <tr><td colSpan="4" style={{ background: '#d8d8d8', fontWeight: 700, fontSize: 13, border: '1px solid #666', padding: '6px 8px' }}>BANK DETAILS</td></tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700 }}>Bank Name</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}>{w.bank_name || ''}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700 }}>A/C No</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}>{w.account_number || ''}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700 }}>IFSC</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}>{w.ifsc_code || ''}</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px', fontWeight: 700 }}>Holder Name</td>
            <td style={{ border: '1px solid #666', padding: '6px 8px' }}>{w.account_holder_name || ''}</td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: 'auto', borderTop: '2px solid #7b2020', paddingTop: 4, textAlign: 'center', fontSize: 7, lineHeight: 1.3 }}>
        Reg. Add.: Office No. 402, 4th Floor, 'A' Wing, New Delite Apartment, Near Chandavarkar Lane, Borivali (West), Mumbai.<br />
        Contact: 8879035035 / 8879034034 | E-mail: being.sevak@gmail.com
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <label className="field" style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--ink)' }}>{value || '—'}</span>
    </label>
  );
}

const inputStyle = {
  padding: '8px 12px',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--paper)',
  color: 'var(--ink)',
  width: '100%',
  boxSizing: 'border-box',
};

function EditableField({ label, value, onChange, type = 'text', options, textarea, placeholder }) {
  return (
    <label className="field" style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500 }}>{label}</span>
      {options ? (
        <select style={inputStyle} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : textarea ? (
        <textarea
          rows={textarea}
          style={{ ...inputStyle, resize: 'vertical' }}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          type={type}
          style={inputStyle}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

function EditField({ editing, label, value, onChange, ...props }) {
  if (!editing) return <Field label={label} value={value} />;
  return <EditableField label={label} value={value} onChange={onChange} {...props} />;
}

export default function HRForms() {
  const { fetchWorkers, fetchWorkerById, updateWorker } = useHR();
  const [workers, setWorkers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetchWorkers().then(setWorkers).catch((err) => console.error('API error:', err.message)).finally(() => setLoading(false));
  }, []);

  const filtered = workers.filter((w) =>
    w.name?.toLowerCase().includes(search.toLowerCase()) ||
    w.email?.toLowerCase().includes(search.toLowerCase()) ||
    w.department?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCardClick = async (worker) => {
    setSelectedWorker(worker);
    setLoadingPreview(true);
    setSaveMsg('');
    try {
      const data = await fetchWorkerById(worker.id);
      setPreviewData(data);
      setForm(data ? JSON.parse(JSON.stringify(data)) : null);
    } catch (e) {
      console.error('Error fetching worker:', e.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleBack = () => {
    setSelectedWorker(null);
    setPreviewData(null);
    setForm(null);
    setSaveMsg('');
  };

  const cancelEdit = () => {
    setForm(previewData ? JSON.parse(JSON.stringify(previewData)) : null);
    setSaveMsg('');
  };

  const setField = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const setCorrField = (key) => (val) =>
    setForm((f) => ({ ...f, correspondence: { ...(f.correspondence || {}), [key]: val } }));

  const setArrayItem = (key) => (i, field, val) =>
    setForm((f) => {
      const arr = [...((f[key] || []))];
      if (!arr[i]) arr[i] = {};
      arr[i] = { ...arr[i], [field]: val };
      return { ...f, [key]: arr };
    });

  const removeArrayItem = (key) => (i) =>
    setForm((f) => ({ ...f, [key]: (f[key] || []).filter((_, idx) => idx !== i) }));

  const addArrayItem = (key) => () =>
    setForm((f) => ({ ...f, [key]: [...(f[key] || []), {}] }));

  const save = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const payload = { ...form };
      payload.education = (payload.education || []).filter((e) => e.degree || e.institution || e.university || e.year || e.year_of_passing || e.percentage || e.from_year || e.to_year);
      payload.previous_organizations = (payload.previous_organizations || []).filter((o) => o.name || o.organization_name || o.role || o.designation || o.from_year || o.to_year);
      payload.family = (payload.family || []).filter((f) => f.name || f.relationship || f.occupation || f.phone || f.dob);
      payload.references = (payload.references || []).filter((r) => r.name || r.designation || r.organization || r.phone);
      await updateWorker(previewData.id, payload);
      const fresh = await fetchWorkerById(previewData.id);
      setPreviewData(fresh);
      setForm(fresh ? JSON.parse(JSON.stringify(fresh)) : null);
      setSaveMsg('Changes saved successfully.');
    } catch (e) {
      console.error('Error saving worker:', e.message);
      setSaveMsg('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const d = previewData;
  const f = form || d;
  const isEditing = true;
  const GENDERS = ['Male', 'Female', 'Other'];
  const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];

  return (
    <>
      {/* ── BOX GRID VIEW ── */}
      {!selectedWorker && (
        <div className="card">
          <div className="card-head">
            <h3>HR Forms</h3>
            <span className="sub">Employee onboarding forms</span>
          </div>
          <div className="card-pad">
            <div style={{ marginBottom: 20 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or department..."
                style={{
                  padding: '8px 14px',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  background: 'var(--paper)',
                  color: 'var(--ink)',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 24,
              }}
            >
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} aria-hidden="true" style={{ borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
                    <div className="sk" style={{ height: 280, borderRadius: 0 }} />
                    <div style={{ padding: 20 }}>
                      <div className="sk" style={{ width: '60%', height: 20, marginBottom: 8, borderRadius: 4 }} />
                      <div className="sk" style={{ width: '40%', height: 14, borderRadius: 4 }} />
                    </div>
                  </div>
                ))
              ) : (
              filtered.map((w) => {
                const name = w.name || 'Unknown';
                const color = avatarColorLocal(name);
                const age = w.dob ? Math.floor((Date.now() - new Date(w.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
                return (
                  <div
                    key={w.id}
                    onClick={() => handleCardClick(w)}
                    style={{
                      borderRadius: 16,
                      overflow: 'hidden',
                      background: '#fff',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 14px 40px rgba(0,0,0,0.14)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.08)';
                    }}
                  >
                    {/* Form preview section */}
                    <div style={{ position: 'relative', height: 280, overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        transform: 'scale(0.42)',
                        transformOrigin: 'top left',
                        pointerEvents: 'none',
                      }}>
                        <MiniFormPreview worker={w} />
                      </div>
                      {/* Dark overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.38)',
                          backdropFilter: 'blur(0.5px)',
                        }}
                      />
                      {/* Status badge */}
                      <span
                        style={{
                          position: 'absolute',
                          top: 12,
                          right: 12,
                          padding: '3px 10px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          background: w.employment_status === 'active' || w.is_active ? 'rgba(22,101,52,0.85)' : w.employment_status === 'absconded' ? 'rgba(153,27,27,0.85)' : 'rgba(55,65,81,0.85)',
                          color: '#fff',
                          backdropFilter: 'blur(4px)',
                        }}
                      >
                        {w.employment_status || (w.is_active ? 'Active' : 'Inactive')}
                      </span>
                    </div>

                    {/* Bottom info section */}
                    <div style={{ padding: 20, borderTop: '1px solid #E5E7EB' }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1.2, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 500, color: '#6B7280' }}>
                        {age !== null ? `Age: ${age}` : w.department || ''}
                      </div>
                    </div>
                  </div>
                );
              })
              )}
              {!loading && filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 0', color: 'var(--ink-soft)' }}>
                  No employees found
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FORM PREVIEW VIEW ── */}
      {selectedWorker && (
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'flex-start', gap: 12 }}>
            <button className="btn" onClick={handleBack} style={{ fontSize: 13 }}>
              ← Back
            </button>
            <h3 style={{ margin: 0 }}>Employee Form Preview</h3>
            <button className="btn" onClick={save} disabled={saving} style={{ fontSize: 13, marginLeft: 'auto', background: 'var(--sage)', color: '#fff' }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button className="btn" onClick={cancelEdit} disabled={saving} style={{ fontSize: 13 }}>
              Cancel
            </button>
            <button
              className="btn"
              onClick={() => setShowPrint(true)}
              style={{ fontSize: 13, background: '#dc2626', color: '#fff' }}
            >
              Print All Forms
            </button>
          </div>
          <div className="card-pad" style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
            {saveMsg && (
              <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: saveMsg.startsWith('Error') ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.12)', color: saveMsg.startsWith('Error') ? '#b91c1c' : '#166534' }}>
                {saveMsg}
              </div>
            )}
            {loadingPreview ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-soft)' }}>Loading...</div>
            ) : d ? (
              <>
                {/* Header with photo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                  {d.photo_url ? (
                    <img
                      src={d.photo_url}
                      alt=""
                      style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 14,
                        background: tint(avatarColorLocal(d.name || '')),
                        color: avatarColorLocal(d.name || ''),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 24,
                        flexShrink: 0,
                      }}
                    >
                      {initialsFn(d.name || '')}
                    </div>
                  )}
                  <div>
                    <h3 style={{ margin: 0 }}>{f.name}</h3>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{f.department || '—'}</div>
                  </div>
                </div>

                {/* Personal Details */}
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Personal Details</h3>
                <div className="form-row">
                  <EditField editing={isEditing} label="Full Name" value={f.name} onChange={setField('name')} />
                  <EditField editing={isEditing} label="Email" value={f.email} onChange={setField('email')} />
                </div>
                <div className="form-row">
                  <EditField editing={isEditing} label="Phone" value={f.phone} onChange={setField('phone')} />
                  <EditField editing={isEditing} label="Alt. Phone" value={f.alternate_phone} onChange={setField('alternate_phone')} />
                </div>
                <EditField editing={isEditing} label="Father / Husband Name" value={f.father_husband_name} onChange={setField('father_husband_name')} />
                <div className="form-row">
                  <EditField editing={isEditing} label="Gender" value={f.gender} onChange={setField('gender')} options={GENDERS} />
                    <EditField editing={isEditing} label="Date of Birth" type="date" value={f.dob ? f.dob.slice(0, 10) : ''} onChange={setField('dob')} />
                </div>
                <EditField editing={isEditing} label="Marital Status" value={f.marital_status} onChange={setField('marital_status')} options={MARITAL} />
                <EditField editing={isEditing} label="Address" value={f.address} onChange={setField('address')} textarea={2} />
                <div className="form-row">
                  <EditField editing={isEditing} label="City" value={f.city} onChange={setField('city')} />
                  <EditField editing={isEditing} label="State" value={f.state} onChange={setField('state')} />
                </div>
                <EditField editing={isEditing} label="Pincode" value={f.pincode} onChange={setField('pincode')} />
                <div className="form-row">
                  <EditField editing={isEditing} label="PAN Number" value={f.pan_number} onChange={setField('pan_number')} />
                  <EditField editing={isEditing} label="Aadhaar Number" value={f.aadhar_number} onChange={setField('aadhar_number')} />
                </div>
                <EditField editing={isEditing} label="Permanent Address" value={f.permanent_address} onChange={setField('permanent_address')} textarea={2} />

                {d.correspondence && (
                  <>
                    <h3 style={{ marginTop: 24, marginBottom: 16 }}>Correspondence Address</h3>
                    <EditField editing={isEditing} label="Address" value={f.correspondence?.address} onChange={setCorrField('address')} textarea={2} />
                    <div className="form-row">
                      <EditField editing={isEditing} label="City" value={f.correspondence?.city} onChange={setCorrField('city')} />
                      <EditField editing={isEditing} label="State" value={f.correspondence?.state} onChange={setCorrField('state')} />
                    </div>
                    <EditField editing={isEditing} label="Pincode" value={f.correspondence?.pincode} onChange={setCorrField('pincode')} />
                  </>
                )}

                {/* Education */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>
                  Education
                  {(!f.education || f.education.length === 0) && (
                    <button className="btn" onClick={addArrayItem('education')} style={{ fontSize: 12, marginLeft: 12 }}>+ Add Education</button>
                  )}
                </h3>
                {!f.education || f.education.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No education entries</p>
                ) : f.education.map((e, i) => (
                  <div key={i} style={{ padding: 16, marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong>Entry {i + 1}</strong>
                      {isEditing && (
                        <button className="btn" onClick={() => removeArrayItem('education')(i)} style={{ fontSize: 12, color: '#dc2626', background: 'transparent', border: '1px solid #dc2626' }}>Remove</button>
                      )}
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <EditField editing={isEditing} label="Degree" value={e.degree} onChange={(v) => setArrayItem('education')(i, 'degree', v)} />
                      <EditField editing={isEditing} label="Institution" value={e.institution} onChange={(v) => setArrayItem('education')(i, 'institution', v)} />
                    </div>
                    <div className="form-row">
                      <EditField editing={isEditing} label="University" value={e.university} onChange={(v) => setArrayItem('education')(i, 'university', v)} />
                      <EditField editing={isEditing} label="Year" value={e.year_of_passing || e.year || ''} onChange={(v) => setArrayItem('education')(i, 'year_of_passing', v)} />
                    </div>
                    <div className="form-row">
                      <EditField editing={isEditing} label="From Year" value={e.from_year} onChange={(v) => setArrayItem('education')(i, 'from_year', v)} />
                      <EditField editing={isEditing} label="To Year" value={e.to_year} onChange={(v) => setArrayItem('education')(i, 'to_year', v)} />
                    </div>
                    <EditField editing={isEditing} label="Percentage / Grade" value={e.percentage} onChange={(v) => setArrayItem('education')(i, 'percentage', v)} />
                  </div>
                ))}

                {/* Previous Organizations */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Previous Organizations</h3>
                {!f.previous_organizations || f.previous_organizations.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No previous organizations</p>
                ) : f.previous_organizations.map((o, i) => (
                  <div key={i} style={{ padding: 16, marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong>Organization {i + 1}</strong>
                      {isEditing && (
                        <button className="btn" onClick={() => removeArrayItem('previous_organizations')(i)} style={{ fontSize: 12, color: '#dc2626', background: 'transparent', border: '1px solid #dc2626' }}>Remove</button>
                      )}
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <EditField editing={isEditing} label="Organization Name" value={o.organization_name || o.name} onChange={(v) => setArrayItem('previous_organizations')(i, 'organization_name', v)} />
                      <EditField editing={isEditing} label="Role / Designation" value={o.role || o.designation} onChange={(v) => setArrayItem('previous_organizations')(i, 'role', v)} />
                    </div>
                    <div className="form-row">
                      <EditField editing={isEditing} label="From Year" value={o.from_year} onChange={(v) => setArrayItem('previous_organizations')(i, 'from_year', v)} />
                      <EditField editing={isEditing} label="To Year" value={o.to_year} onChange={(v) => setArrayItem('previous_organizations')(i, 'to_year', v)} />
                    </div>
                  </div>
                ))}

                {/* Family */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Family</h3>
                {!f.family || f.family.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No family members</p>
                ) : f.family.map((fm, i) => (
                  <div key={i} style={{ padding: 16, marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong>Member {i + 1}</strong>
                      {isEditing && (
                        <button className="btn" onClick={() => removeArrayItem('family')(i)} style={{ fontSize: 12, color: '#dc2626', background: 'transparent', border: '1px solid #dc2626' }}>Remove</button>
                      )}
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <EditField editing={isEditing} label="Name" value={fm.name} onChange={(v) => setArrayItem('family')(i, 'name', v)} />
                      <EditField editing={isEditing} label="Relationship" value={fm.relationship} onChange={(v) => setArrayItem('family')(i, 'relationship', v)} />
                    </div>
                    <div className="form-row">
                      <EditField editing={isEditing} label="Occupation" value={fm.occupation} onChange={(v) => setArrayItem('family')(i, 'occupation', v)} />
                      <EditField editing={isEditing} label="Phone" value={fm.phone} onChange={(v) => setArrayItem('family')(i, 'phone', v)} />
                    </div>
                  </div>
                ))}

                {/* Bank Details */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Bank Details</h3>
                <div className="form-row">
                  <EditField editing={isEditing} label="Bank Name" value={f.bank_name} onChange={setField('bank_name')} />
                  <EditField editing={isEditing} label="Account Holder" value={f.account_holder_name} onChange={setField('account_holder_name')} />
                </div>
                <div className="form-row">
                  <EditField editing={isEditing} label="IFSC Code" value={f.ifsc_code} onChange={setField('ifsc_code')} />
                  <EditField editing={isEditing} label="Account Number" value={f.account_number} onChange={setField('account_number')} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ── PRINT OVERLAY ── */}
      {showPrint && previewData && (
        <PrintForms
          data={{
            personal: {
              fullName: previewData.name || '',
              email: previewData.email || '',
              phone: previewData.phone || '',
              altPhone: previewData.alternate_phone || '',
              fatherHusband: previewData.father_husband_name || '',
              gender: previewData.gender || '',
              dob: previewData.dob ? previewData.dob.slice(0, 10) : '',
              maritalStatus: previewData.marital_status || '',
              address: previewData.address || '',
              city: previewData.city || '',
              state: previewData.state || '',
              pincode: previewData.pincode || '',
              panNumber: previewData.pan_number || '',
              aadhaarNumber: previewData.aadhar_number || '',
              permanentAddress: previewData.permanent_address || '',
              corrAddress: previewData.correspondence?.address || '',
              corrCity: previewData.correspondence?.city || '',
              corrState: previewData.correspondence?.state || '',
              corrPincode: previewData.correspondence?.pincode || '',
            },
            education: (previewData.education || []).map((e) => ({
              degree: e.degree || '',
              institution: e.institution || '',
              university: e.university || '',
              year: (e.year_of_passing || e.year)?.toString() || '',
              percentage: e.percentage?.toString() || '',
            })),
            organizations: (previewData.previous_organizations || []).map((o) => ({
              name: o.organization_name || o.name || '',
              role: o.role || o.designation || '',
              fromYear: o.from_year?.toString() || '',
              toYear: o.to_year?.toString() || '',
            })),
            family: (previewData.family || []).map((f) => ({
              name: f.name || '',
              relationship: f.relationship || '',
              occupation: f.occupation || '',
              phone: f.phone || '',
              dob: f.dob ? f.dob.slice(0, 10) : '',
            })),
            references: (previewData.references || []).map((r) => ({
              name: r.name || '',
              designation: r.designation || '',
              organization: r.organization || '',
              phone: r.phone || '',
            })),
            bank: {
              bankName: previewData.bank_name || '',
              accountHolder: previewData.account_holder_name || '',
              ifsc: previewData.ifsc_code || '',
              accountNo: previewData.account_number || '',
            },
            declarationDate: previewData.declaration_date ? previewData.declaration_date.slice(0, 10) : previewData.created_at ? previewData.created_at.slice(0, 10) : '',
            place: previewData.declaration_place || 'Mumbai',
            photo_url: previewData.photo_url || '',
            signature_url: previewData.signature_url || '',
          }}
          onClose={() => setShowPrint(false)}
        />
      )}
    </>
  );
}

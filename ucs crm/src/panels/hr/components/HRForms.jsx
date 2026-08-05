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

export default function HRForms() {
  const { fetchWorkers, fetchWorkerById } = useHR();
  const [workers, setWorkers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [loading, setLoading] = useState(true);

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
    try {
      const data = await fetchWorkerById(worker.id);
      setPreviewData(data);
    } catch (e) {
      console.error('Error fetching worker:', e.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleBack = () => {
    setSelectedWorker(null);
    setPreviewData(null);
  };

  const d = previewData;

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
            <button
              className="btn"
              onClick={() => setShowPrint(true)}
              style={{ fontSize: 13, marginLeft: 'auto', background: '#dc2626', color: '#fff' }}
            >
              Print All Forms
            </button>
          </div>
          <div className="card-pad" style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
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
                    <h3 style={{ margin: 0 }}>{d.name}</h3>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{d.department || '—'}</div>
                  </div>
                </div>

                {/* Personal Details */}
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Personal Details</h3>
                <div className="form-row">
                  <Field label="Full Name" value={d.name} />
                  <Field label="Email" value={d.email} />
                </div>
                <div className="form-row">
                  <Field label="Phone" value={d.phone} />
                  <Field label="Alt. Phone" value={d.alternate_phone} />
                </div>
                <Field label="Father / Husband Name" value={d.father_husband_name} />
                <div className="form-row">
                  <Field label="Gender" value={d.gender} />
                  <Field label="Date of Birth" value={d.dob ? new Date(d.dob).toLocaleDateString('en-IN') : ''} />
                </div>
                <Field label="Marital Status" value={d.marital_status} />
                <Field label="Address" value={d.address} />
                <div className="form-row">
                  <Field label="City" value={d.city} />
                  <Field label="State" value={d.state} />
                </div>
                <Field label="Pincode" value={d.pincode} />
                <div className="form-row">
                  <Field label="PAN Number" value={d.pan_number} />
                  <Field label="Aadhaar Number" value={d.aadhar_number} />
                </div>
                <Field label="Permanent Address" value={d.permanent_address} />

                {d.correspondence && (
                  <>
                    <h3 style={{ marginTop: 24, marginBottom: 16 }}>Correspondence Address</h3>
                    <Field label="Address" value={d.correspondence.address} />
                    <div className="form-row">
                      <Field label="City" value={d.correspondence.city} />
                      <Field label="State" value={d.correspondence.state} />
                    </div>
                    <Field label="Pincode" value={d.correspondence.pincode} />
                  </>
                )}

                {/* Education */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Education</h3>
                {!d.education || d.education.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No education entries</p>
                ) : d.education.map((e, i) => (
                  <div key={i} style={{ padding: 16, marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                    <strong>Entry {i + 1}</strong>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <Field label="Degree" value={e.degree} />
                      <Field label="Institution" value={e.institution} />
                    </div>
                    <div className="form-row">
                      <Field label="University" value={e.university} />
                      <Field label="Year" value={e.year_of_passing || e.year} />
                    </div>
                    <div className="form-row">
                      <Field label="From Year" value={e.from_year} />
                      <Field label="To Year" value={e.to_year} />
                    </div>
                    <Field label="Percentage / Grade" value={e.percentage} />
                  </div>
                ))}

                {/* Previous Organizations */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Previous Organizations</h3>
                {!d.previous_organizations || d.previous_organizations.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No previous organizations</p>
                ) : d.previous_organizations.map((o, i) => (
                  <div key={i} style={{ padding: 16, marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                    <strong>Organization {i + 1}</strong>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <Field label="Organization Name" value={o.organization_name || o.name} />
                      <Field label="Role / Designation" value={o.role || o.designation} />
                    </div>
                    <div className="form-row">
                      <Field label="From Year" value={o.from_year} />
                      <Field label="To Year" value={o.to_year} />
                    </div>
                  </div>
                ))}

                {/* Family */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Family</h3>
                {!d.family || d.family.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No family members</p>
                ) : d.family.map((f, i) => (
                  <div key={i} style={{ padding: 16, marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                    <strong>Member {i + 1}</strong>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <Field label="Name" value={f.name} />
                      <Field label="Relationship" value={f.relationship} />
                    </div>
                    <div className="form-row">
                      <Field label="Occupation" value={f.occupation} />
                      <Field label="Phone" value={f.phone} />
                    </div>
                    <Field label="Date of Birth" value={f.dob ? new Date(f.dob).toLocaleDateString('en-IN') : ''} />
                  </div>
                ))}

                {/* References */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>References</h3>
                {!d.references || d.references.length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No references</p>
                ) : d.references.map((r, i) => (
                  <div key={i} style={{ padding: 16, marginBottom: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
                    <strong>Reference {i + 1}</strong>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <Field label="Name" value={r.name} />
                      <Field label="Designation" value={r.designation} />
                    </div>
                    <div className="form-row">
                      <Field label="Organization" value={r.organization} />
                      <Field label="Phone" value={r.phone} />
                    </div>
                  </div>
                ))}

                {/* Bank Details */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Bank Details</h3>
                <div className="form-row">
                  <Field label="Bank Name" value={d.bank_name} />
                  <Field label="Account Holder" value={d.account_holder_name} />
                </div>
                <div className="form-row">
                  <Field label="IFSC Code" value={d.ifsc_code} />
                  <Field label="Account Number" value={d.account_number} />
                </div>

                {/* Declaration */}
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>Declaration</h3>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.8, marginBottom: 16 }}>
                  <input type="checkbox" style={{ marginTop: 5, transform: 'scale(1.1)' }} readOnly />
                  <span>I hereby declare that the above statements made in my application form are true, complete, and correct to the best of my knowledge and belief.</span>
                </label>
                <div className="form-row">
                  <Field label="Date" value={d.declaration_date ? new Date(d.declaration_date).toLocaleDateString('en-IN') : d.created_at ? new Date(d.created_at).toLocaleDateString('en-IN') : ''} />
                  <Field label="Place" value={d.declaration_place || 'Mumbai'} />
                </div>
                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Sign</label>
                    {d.signature_url ? (
                      <img src={d.signature_url} alt="Signature" style={{ maxWidth: 300, maxHeight: 80, border: '1px solid #ccc', borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 200, height: 60, border: '1px solid #ccc', borderRadius: 4 }}></div>
                    )}
                  </div>
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

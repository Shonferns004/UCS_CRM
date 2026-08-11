import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPatch } from '../api/auth';

const curr = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

const SvgX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);

const FIELDS = [
  { key: 'name', label: 'Name', type: 'text', placeholder: 'Full name' },
  { key: 'mobile_number', label: 'Mobile', type: 'text', placeholder: '10-digit mobile' },
  { key: 'mobile_2', label: 'Alternate Mobile', type: 'text', placeholder: 'Alternate number' },
  { key: 'email', label: 'Email', type: 'text', placeholder: 'email@example.com' },
  { key: 'pan_number', label: 'PAN Number', type: 'text', placeholder: 'ABCDE1234F' },
  { key: 'birth_date', label: 'Birth Date', type: 'date' },
  { key: 'address_1', label: 'Address Line 1', type: 'text', placeholder: 'House / street' },
  { key: 'address_2', label: 'Address Line 2', type: 'text', placeholder: 'Area / landmark' },
  { key: 'city', label: 'City', type: 'text', placeholder: 'City' },
  { key: 'pin_code', label: 'PIN Code', type: 'text', placeholder: '6-digit PIN' },
  { key: 'project_supported', label: 'Project Supported', type: 'select', options: ['bsct', 'maan', 'aflf'] },
  { key: 'ngo', label: 'NGO', type: 'text', placeholder: 'e.g. Being Sevak' },
  { key: 'station', label: 'Station', type: 'text', placeholder: 'Station' },
  { key: 'mop', label: 'Mode of Payment', type: 'text', placeholder: 'UPI / Cash / Cheque' },
  { key: 'category', label: 'Category', type: 'text', placeholder: 'Category' },
  { key: 'data_category', label: 'Data Category', type: 'text', placeholder: 'Data category' },
  { key: 'team', label: 'Team', type: 'text', placeholder: 'Team' },
  { key: 'agent_name', label: 'Agent Name', type: 'text', placeholder: 'Agent name' },
  { key: 'bank_donor_name', label: 'Bank Donor Name', type: 'text', placeholder: 'Name on bank transfer' },
  { key: 'agent_donor_name', label: 'Agent Donor Name', type: 'text', placeholder: 'Agent donor name' },
  { key: 'donors_bank_name', label: "Donor's Bank", type: 'text', placeholder: "Donor's bank name" },
];

const fieldInputStyle = {
  padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13,
  background: '#fff', transition: 'border-color .15s', outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function DonorPicker({ onPick, prefill }) {
  const [q, setQ] = useState(prefill || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [detail, setDetail] = useState(null);
  const [assign, setAssign] = useState(null);
  const [form, setForm] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const inputRef = useRef(null);

  const runSearch = useCallback(async (value) => {
    const term = (value || '').trim();
    if (!term) { setResults([]); setSearched(false); return; }
    setSearching(true); setError('');
    try {
      const res = await apiGet('/accounts/donors?search=' + encodeURIComponent(term) + '&limit=20');
      setResults(res?.data || []);
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const openDonor = async (d) => {
    setLoadingDetail(true); setError('');
    try {
      const res = await apiGet('/accounts/donors/' + d.id);
      const donor = res?.donor || {};
      setDetail(donor);
      setAssign({
        agent: res?.assigned_agent || donor.agent_name || null,
        station: res?.assignment_station || null,
        ngo: res?.assignment_ngo || null,
      });
      setForm({
        name: donor.name || '',
        mobile_number: donor.mobile_number || '',
        mobile_2: donor.mobile_2 || '',
        email: donor.email || '',
        pan_number: donor.pan_number || '',
        birth_date: donor.birth_date ? String(donor.birth_date).slice(0, 10) : '',
        address_1: donor.address_1 || '',
        address_2: donor.address_2 || '',
        city: donor.city || '',
        pin_code: donor.pin_code || '',
        project_supported: donor.project_supported || '',
        ngo: donor.ngo || '',
        station: donor.station || '',
        mop: donor.mop || '',
        category: donor.category || '',
        data_category: donor.data_category || '',
        team: donor.team || '',
        agent_name: donor.agent_name || '',
        bank_donor_name: donor.bank_donor_name || '',
        agent_donor_name: donor.agent_donor_name || '',
        donors_bank_name: donor.donors_bank_name || '',
      });
      if (onPick) onPick(donor);
    } catch (e) { setError(e.message); }
    finally { setLoadingDetail(false); }
  };

  const clearSelection = () => {
    setDetail(null); setForm({}); setResults([]); setSearched(false); setQ(''); setAssign(null);
    if (inputRef.current) inputRef.current.focus();
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true); setError('');
    try {
      await apiPatch('/accounts/donors/' + detail.id, form);
      setToast('Donor details saved');
      const updated = { ...detail, ...form };
      setDetail(updated);
      if (onPick) onPick(updated);
      runSearch(q);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const changedCount = detail
    ? FIELDS.filter(f => String(form[f.key] ?? '') !== String(detail[f.key] ?? '')).length
    : 0;

  return (
    <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Search Donor</span>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>Search the donors table by name, mobile, or city</span>
      </div>

      <div style={{ padding: '10px 14px', background: '#fff' }}>
        {toast && (
          <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {toast}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {error}
          </div>
        )}

        {!detail && (
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              ref={inputRef}
              className="field-input"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search name, mobile, or city..."
              style={{ ...fieldInputStyle, paddingLeft: 32 }}
            />
            {searching && <div style={{ fontSize: 11, color: '#6b7280', padding: '8px 2px' }}>Searching...</div>}
            {!searching && searched && results.length === 0 && (
              <div style={{ padding: '10px 2px', color: '#9ca3af', fontSize: 12 }}>No donors found for "{q}"</div>
            )}
            {!searching && results.length > 0 && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 8, overflow: 'hidden' }}>
                {results.map((d, i) => (
                  <button
                    key={d.id}
                    onClick={() => openDonor(d)}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 12px',
                      border: 'none', borderBottom: i === results.length - 1 ? 'none' : '1px solid #f3f4f6',
                      background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer', textAlign: 'left', transition: 'background .15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#f0fdf4'; }}
                    onMouseOut={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'; }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--sage-light, #e8f0e4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)' }}>
                        {(d.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{d.name || 'Unknown'}</div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {d.mobile_number && <span>{d.mobile_number}</span>}
                        {d.city && <span>{d.city}</span>}
                        {d.assigned_to && <span style={{ color: '#B5603A', fontWeight: 600 }}>Agent: {d.assigned_to}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sage)' }}>{curr(d.total_amount)}</div>
                      {d.donation_count != null && <div style={{ fontSize: 9, color: '#9ca3af' }}>{d.donation_count} donations</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {detail && loadingDetail && (
          <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>Loading donor details...</div>
        )}

        {detail && !loadingDetail && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{form.name || 'Unknown Donor'}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>
                  {[form.mobile_number, form.email, form.city].filter(Boolean).join(' \u00B7 ') || '\u2014'}
                </div>
                {(assign?.agent || form.agent_name) && (
                  <div style={{ fontSize: 10, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#B5603A', fontWeight: 700 }}>Agent: {assign?.agent || form.agent_name}</span>
                    {assign?.station && <span style={{ color: '#6b7280' }}>{assign.station}</span>}
                    {assign?.ngo && <span style={{ color: '#6b7280' }}>{assign.ngo}</span>}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sage)' }}>{curr(detail.total_amount)}</div>
                <div style={{ fontSize: 9, color: '#9ca3af' }}>{detail.donation_count || 0} total donations</div>
              </div>
              <button className="btn btn-sm" onClick={clearSelection} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Clear
              </button>
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {FIELDS.map(f => (
                  <label key={f.key} style={{ fontSize: 11, fontWeight: 500, color: '#374151', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>{f.label}</span>
                    {f.type === 'select' ? (
                      <select
                        className="field-input"
                        value={form[f.key] || ''}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={fieldInputStyle}
                      >
                        <option value="">Select...</option>
                        {f.options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                      </select>
                    ) : (
                      <input
                        className="field-input"
                        type={f.type}
                        value={form[f.key] || ''}
                        placeholder={f.placeholder}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={fieldInputStyle}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                className="btn btn-sm"
                onClick={save}
                disabled={saving}
                style={{ padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--sage)', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: saving ? .6 : 1, cursor: 'pointer' }}
              >
                {saving ? 'Saving...' : changedCount > 0 ? 'Save Donor Changes' : 'Donor Details Up To Date'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

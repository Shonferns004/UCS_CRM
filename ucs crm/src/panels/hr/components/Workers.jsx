import { useState, useEffect, useRef } from 'react';
import { useHR } from '../store';
import { Who, Avatar, Dropdown } from './ui';
import { Plus, Trash, Check } from '../icons';
import { api } from '../../../api/auth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

function load() {
  try { return JSON.parse(sessionStorage.getItem('wrk') || '{}'); } catch { return {}; }
}
function save(v) {
  try { const d = load(); sessionStorage.setItem('wrk', JSON.stringify({ ...d, ...v })); } catch {}
}

function isComplete(w) {
  const val = (v) => v && typeof v === 'string' && v.trim() !== '';
  return (
    val(w.email) && val(w.phone) && val(w.dob) && val(w.gender) &&
    (val(w.address) || val(w.permanent_address)) &&
    val(w.city) && val(w.state) &&
    val(w.father_husband_name) && val(w.marital_status) &&
    val(w.pan_number) && val(w.aadhar_number) &&
    val(w.account_holder_name) && val(w.bank_name) && val(w.ifsc_code) && val(w.account_number) &&
    val(w.photo_url)
  );
}

function WhoWithPhoto({ name, role, photo_url }) {
  const [photoErr, setPhotoErr] = useState(false);
  const hasPhoto = photo_url && !photoErr;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      {hasPhoto ? (
        <img src={photo_url} alt="" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} onError={() => setPhotoErr(true)} />
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!hasPhoto ? <Avatar name={name} /> : null}
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{role}</div>
        </div>
      </div>
    </div>
  );
}

export default function Workers({ onSelect, onOffboard }) {
  const { addWorker, DEPTS, fetchWorkers, fetchNGOs } = useHR();
  const [workers, setWorkers] = useState([]);
  const [name, setName] = useState('');
  const [dept, setDept] = useState(DEPTS?.[0] || '');
  const [err, setErr] = useState('');
  const [search, setSearch] = useState(load().search || '');
  const [roleFilter, setRoleFilter] = useState(load().roleFilter || '');
  const [page, setPage] = useState(load().page || 1);
  const [created, setCreated] = useState(null);
  const [salaryMap, setSalaryMap] = useState({});
  const [ngos, setNgos] = useState([]);
  const [selectedNgos, setSelectedNgos] = useState([]);
  const PAGE_SIZE = 20;
  const tableRef = useRef(null);

  useEffect(() => {
    fetchWorkers().then(setWorkers).catch(() => {});
    fetchNGOs().then(setNgos).catch(() => {});
    api('/salary/workers-summary', { _prefix: 'ucs' })
      .then(data => {
        const map = {};
        for (const w of data) map[w.id] = w;
        setSalaryMap(map);
      })
      .catch(() => {});
  }, []);

  const roles = [...new Set(workers.map(w => (w.department || 'Team Member')).filter(Boolean))].sort();
  const filtered = workers.filter(w => {
    const role = w.department || 'Team Member';
    if (roleFilter && role !== roleFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q) ||
      (w.email || '').toLowerCase().includes(q) ||
      role.toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const mountedSearch = useRef(false);
  useEffect(() => { if (!mountedSearch.current) { mountedSearch.current = true; return; } save({ search, page: 1 }); setPage(1); }, [search]);
  const mountedRole = useRef(false);
  useEffect(() => { if (!mountedRole.current) { mountedRole.current = true; return; } save({ roleFilter, page: 1 }); setPage(1); }, [roleFilter]);
  useEffect(() => { save({ page }); }, [page]);
  useEffect(() => {
    if (tableRef.current) tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [safePage]);

  const submit = async () => {
    if (!name.trim()) return;
    setErr('');
    setCreated(null);
    try {
      const body = { name: name.trim(), department: dept };
      if (dept === 'NGO Admin' && selectedNgos.length > 0) {
        body.allocations = selectedNgos.map(id => ({ ngo_id: id, salary_portion: 0 }));
      }
      const res = await addWorker(body);
      setCreated(res.worker);
      setName('');
      setDept(DEPTS?.[0] || '');
      setSelectedNgos([]);
      fetchWorkers().then(setWorkers).catch(() => {});
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleFullPayExport = async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    try {
      const data = await api('/salary/payroll?month=' + month + '&extended=true', { _prefix: 'ucs' });
      if (!data.rows || data.rows.length === 0) { alert('No payroll data for this month'); return; }

      const groups = {};
      for (const r of data.rows) {
        if (!groups[r.ngo_name]) groups[r.ngo_name] = [];
        groups[r.ngo_name].push(r);
      }

      const headers = [
        'Team Name', 'Branch Name', 'Agent Name', 'Date of Joining',
        'Salary', 'Target', 'Achieved', 'Balance', 'Achieved %',
        'May Present Days', 'Training and Sunday Deduction',
        'Sunday Need To Add', 'Net May Present Days', 'May Salary',
        'Monthly 10% Incentive', 'Aaj Ka Incentive (Daily 50% for PC)',
        'Weekly Incentive / TL', 'Gross Payable Salary',
        'OT/Appreciation/Extra Incentive', 'Any Pending Expenses Paid for Previous Month',
        'Advance need to be deducted in May, 2026', 'Net Payable Salary',
        'ACCOUNT HOL', 'ACC COL', 'Bank', 'IFSC Code',
      ];

      const wsData = [headers];
      for (const [ngo, rows] of Object.entries(groups)) {
        for (const r of rows) {
          wsData.push([
            r.department || '',
            r.ngo_name,
            r.name,
            r.date_of_joining ? r.date_of_joining.split('T')[0] : '',
            r.salary || 0,           // E: Salary
            r.target || 0,           // F: Target
            r.achieved || 0,         // G: Achieved
            null,                     // H: Balance (formula)
            null,                     // I: Achieved % (formula)
            r.present_days || 0,     // J: May Present Days
            0,                        // K: Training and Sunday Deduction
            0,                        // L: Sunday Need To Add
            null,                     // M: Net May Present Days (formula)
            r.total_due || 0,        // N: May Salary
            r.monthly_incentive || 0,  // O: Monthly 10% Incentive
            r.aki_payout || 0,         // P: Aaj Ka Incentive
            0,                        // Q: Weekly Incentive
            null,                     // R: Gross Payable Salary (formula)
            0,                        // S: OT/Appreciation
            0,                        // T: Pending Expenses
            0,                        // U: Advance to Deduct
            null,                     // V: Net Payable Salary (formula)
            r.account_holder_name || '',  // W: ACCOUNT HOL
            r.account_number || '',       // X: ACC COL
            r.bank_name || '',            // Y: Bank
            r.ifsc_code || '',            // Z: IFSC Code
          ]);
        }
      }

      for (let i = 1; i < wsData.length; i++) {
        const row = i + 1;
        wsData[i][7] = { f: `F${row}-G${row}` };                         // H: Balance (Target - Achieved)
        wsData[i][8] = { f: `IF(F${row}>0,G${row}/F${row}*100,0)` };     // I: Achieved %
        wsData[i][12] = { f: `J${row}-K${row}+L${row}` };                // M: Net May Present Days
        wsData[i][14] = { f: `IF(F${row}>0,IF(G${row}>=F${row},(G${row}-F${row})*0.1,0),0)` }; // O: Monthly 10% Incentive
        wsData[i][17] = { f: `N${row}+O${row}+P${row}+Q${row}` };        // R: Gross Payable Salary
        wsData[i][21] = { f: `R${row}+S${row}+T${row}-U${row}` };        // V: Net Payable Salary
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 22 },
        { wch: 16 }, { wch: 18 }, { wch: 14 },
        { wch: 18 }, { wch: 26 }, { wch: 16 },
        { wch: 20 }, { wch: 30 }, { wch: 30 },
        { wch: 28 }, { wch: 18 },
        { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      link.download = `payroll-full-${month}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { alert(e.message); }
  };

  const handleOffboard = (e, worker) => {
    e.stopPropagation();
    if (onOffboard) onOffboard(worker);
  };

  const handleExportAll = async () => {
    try {
      const list = await api('/workers', { _prefix: 'ucs' });
      if (!list || list.length === 0) { alert('No workers to export'); return; }
      const full = await Promise.all(list.map(w => api('/workers/' + w.id, { _prefix: 'ucs' }).catch(() => null)));
      const data = full.filter(Boolean);

      const eduFields = ['degree', 'institution', 'university', 'year_of_passing', 'percentage', 'from_year', 'to_year', 'specialization'];
      const famFields = ['name', 'relationship', 'occupation', 'phone', 'dob'];
      const orgFields = ['name', 'role', 'from_year', 'to_year', 'salary'];

      const eduNorm = (e) => ({ degree: e.degree, institution: e.institution, university: e.university, year_of_passing: e.year_of_passing || e.year, percentage: e.percentage, from_year: e.from_year || e.fromYear, to_year: e.to_year || e.toYear, specialization: e.specialization });
      const famNorm = (f) => ({ name: f.name, relationship: f.relationship, occupation: f.occupation, phone: f.phone, dob: f.dob });
      const orgNorm = (o) => ({ name: o.name || o.organization_name, role: o.role || o.designation, from_year: o.from_year || o.fromYear, to_year: o.to_year || o.toYear, salary: o.salary });

      const maxEdu = Math.max(...data.map(w => (w.education || w.education_details || []).length));
      const maxFam = Math.max(...data.map(w => (w.family || w.family_details || []).length));
      const maxOrg = Math.max(...data.map(w => (w.previous_organizations || []).length));

      const rows = data.map(w => {
        const edu = (w.education || w.education_details || []).map(eduNorm);
        const fam = (w.family || w.family_details || []).map(famNorm);
        const org = (w.previous_organizations || []).map(orgNorm);

        const corrParts = [
          w.correspondence?.address || w.address,
          w.correspondence?.city || w.city,
          w.correspondence?.state || w.state,
          w.correspondence?.pincode || w.pincode,
        ].filter(Boolean);

        const row = {
          name: w.name,
          email: w.email,
          login_id: w.login_id,
          department: w.department,
          gender: w.gender,
          dob: w.dob,
          phone: w.phone,
          alternate_phone: w.alternate_phone,
          address: w.address,
          city: w.city,
          state: w.state,
          pincode: w.pincode,
          father_husband_name: w.father_husband_name,
          marital_status: w.marital_status,
          pan_number: w.pan_number,
          aadhar_number: w.aadhar_number,
          account_holder_name: w.account_holder_name,
          bank_name: w.bank_name,
          ifsc_code: w.ifsc_code,
          account_number: w.account_number,
          correspondence: corrParts.join(', '),
          salary: w.salary,
        };

        for (let i = 0; i < maxEdu; i++) {
          const e = edu[i] || {};
          for (const field of eduFields) row[`education_${i + 1}_${field}`] = e[field] || '';
        }
        for (let i = 0; i < maxFam; i++) {
          const f = fam[i] || {};
          for (const field of famFields) row[`family_${i + 1}_${field}`] = f[field] || '';
        }
        for (let i = 0; i < maxOrg; i++) {
          const o = org[i] || {};
          for (const field of orgFields) row[`previous_org_${i + 1}_${field}`] = o[field] || '';
        }

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Workers');
      const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      link.download = `workers-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { alert(e.message); }
  };

  const handlePayExport = async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    try {
      const data = await api('/salary/payroll?month=' + month, { _prefix: 'ucs' });
      if (!data.rows || data.rows.length === 0) { alert('No payroll data for this month'); return; }

      const groups = {};
      for (const r of data.rows) {
        if (!groups[r.ngo_name]) groups[r.ngo_name] = [];
        groups[r.ngo_name].push(r);
      }
      const colWidths = [{ wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
      const zip = new JSZip();
      for (const [ngo, rows] of Object.entries(groups)) {
        const wsData = [
          ['NGO', 'Name', 'Account Number', 'IFSC Code', 'Total Due (₹)'],
          ...rows.map(r => [r.ngo_name, r.name, r.account_number, r.ifsc_code, r.total_due]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const safeName = ngo.replace(/[\/:*?"<>|]/g, '_');
        zip.file(`${safeName}.xlsx`, xlsxBuf);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `payroll-${month}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-head"><h3>Add an employee</h3></div>
        <div className="card-pad">
          <div className="form-row">
            <label className="field">Full name
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Doe"
                onKeyDown={e=>e.key==='Enter'&&submit()} />
            </label>
            <label className="field">Team
              <Dropdown value={dept} onChange={e=>{ setDept(e.target.value); setSelectedNgos([]); }} options={DEPTS} />
            </label>
          </div>
          {dept === 'NGO Admin' && ngos.length > 0 && (
            <div className="form-row" style={{ marginTop:8 }}>
              <label className="field">Assign NGOs
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
                  {ngos.map(n => {
                    const active = selectedNgos.includes(n.id);
                    return (
                      <span key={n.id} onClick={() => setSelectedNgos(prev =>
                        prev.includes(n.id) ? prev.filter(id => id !== n.id) : [...prev, n.id]
                      )} style={{
                        padding:'4px 12px', borderRadius:20, fontSize:13, cursor:'pointer',
                        border:'1px solid var(--line)',
                        background: active ? '#5B6B4E' : 'var(--paper)',
                        color: active ? '#fff' : 'var(--ink)',
                        fontWeight: active ? 600 : 400,
                        userSelect:'none', transition:'all .15s',
                      }}>{n.name}</span>
                    );
                  })}
                </div>
                {selectedNgos.length === 0 && <span style={{ fontSize:12, color:'var(--ink-soft)', marginTop:4, display:'block' }}>Select at least one NGO</span>}
              </label>
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
            <button className="btn btn-primary" onClick={submit}><Plus width={16}/> Add employee</button>
          </div>
          {err && <div style={{ color:'var(--danger)', fontSize:13, marginTop:8 }}>{err}</div>}
          {created && (
            <div style={{ background:'#e8f5e9', padding:'10px 14px', borderRadius:8, marginTop:8, fontSize:13, lineHeight:1.7 }}>
              <strong>{created.name}</strong> added<br/>
              Login ID: <code style={{ background:'#c8e6c9', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>{created.login_id}</code><br/>
              Password: <code style={{ background:'#c8e6c9', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>{created.generated_password}</code>
            </div>
          )}
        </div>
      </div>

      <div className="card" ref={tableRef}>
        <div className="card-head"><h3>Employees</h3>
          <div className="search-input-wrap">
            <button className="btn btn-primary btn-sm" onClick={handlePayExport} title="Download payroll Excel">Pay</button>
            <button className="btn btn-outline btn-sm" onClick={handleFullPayExport} title="Download full payroll with formulas">Full Excel</button>
            <button className="btn btn-outline btn-sm" onClick={handleExportAll} title="Export all worker data to Excel">Export All</button>
            <span className="sub">{filtered.length} total</span>
            <Dropdown className="role-filter" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}
              options={[{value:'',label:'All members'}, ...roles.map(r => ({value:r, label:r}))]} />
            <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by name, email, or team…"
              style={{ marginTop:0, maxWidth:200 }} />
          </div>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Joined</th><th>Salary</th><th></th></tr></thead>
          <tbody>
            {paginated.map(w => {
              const sw = salaryMap[w.id];
              const paid = sw?.current_salary_paid;
              const currentMonth = new Date().toISOString().slice(0, 7);
              const salaryFromMonth = sw?.current_salary_from?.slice(0, 7);
              const isCurrent = salaryFromMonth && salaryFromMonth <= currentMonth;
              return (
                <tr key={w.id} className="clickable-row" onClick={() => { if (onSelect) onSelect(w); }}
                  style={{ cursor:'pointer' }}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <WhoWithPhoto name={w.name} role={w.department || 'Team Member'} photo_url={w.photo_url} />
                      {isComplete(w) && <Check size={16} style={{ color:'var(--sage)', flexShrink:0 }} title="All details filled" />}
                    </div>
                  </td>
                  <td style={{ color:'var(--ink-soft)' }}>{new Date(w.created_at).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}</td>
                  <td>
                    {sw?.current_salary ? (
                      <span style={{ fontWeight:600 }}>
                        ₹{parseFloat(sw.current_salary).toLocaleString('en-IN')}
                        {paid && <span className="pill pill-green" style={{ marginLeft:6, fontSize:10 }}>Paid</span>}
                      </span>
                    ) : <span style={{ color:'var(--ink-soft)', fontSize:12 }}>—</span>}
                  </td>
                  <td style={{ textAlign:'right' }}>
                    <button className="btn btn-icon" onClick={(e)=>handleOffboard(e, w)} aria-label="Offboard employee"><Trash width={16}/></button>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={4}><div className="empty">No employees found.</div></td></tr>}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>← Prev</button>
            <div className="pagination-dots">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <span key={p} className={`dot ${p === safePage ? 'dot-active' : ''}`} onClick={() => setPage(p)} />
              ))}
            </div>
            <button className="btn btn-sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next →</button>
          </div>
        )}
      </div>
    </>
  );
}

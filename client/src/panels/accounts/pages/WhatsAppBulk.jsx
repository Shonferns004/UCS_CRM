import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { apiGet, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';
import BulkProgressModal from '../components/BulkProgressModal';
import ConfirmBulkModal from '../components/ConfirmBulkModal';
import TemplatePreview from '../components/TemplatePreview';
import StatusBadge from '../components/StatusBadge';

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  return digits;
}

function dedupeByPhone(rows) {
  const seen = new Set();
  return rows.filter(r => {
    if (!r.phone || seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });
}

export default function WhatsAppBulk() {
  const [mode, setMode] = useState('sheet');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [ngos, setNgos] = useState([]);
  const [selectedNgoId, setSelectedNgoId] = useState('');
  const [stations, setStations] = useState([]);
  const [selectedStations, setSelectedStations] = useState([]);
  const [stationSearch, setStationSearch] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateLang, setTemplateLang] = useState('en');
  const [variables, setVariables] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [keepCount, setKeepCount] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [testName, setTestName] = useState('Test');
  const [loadingStations, setLoadingStations] = useState(false);
  const [fetchingRecipients, setFetchingRecipients] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState({ visible: false, donorCount: 0 });
  const [bulkState, setBulkState] = useState({ active: false, total: 0, sent: 0, failed: 0, currentBatch: 0, totalBatches: 0, results: [], previousBatches: [] });
  const [deliveryStatuses, setDeliveryStatuses] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [healthModal, setHealthModal] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [showFailureBanner, setShowFailureBanner] = useState(true);
  const cancelBulkRef = useRef(null);
  const fileRef = useRef(null);

  const loadDeliveryStatuses = async () => {
    try {
      const data = await apiGet('/whatsapp/bulk/statuses?limit=50');
      setDeliveryStatuses(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    apiGet('/whatsapp/accounts').then(data => {
      const list = Array.isArray(data) ? data : [];
      setAccounts(list);
      const def = list.find(a => a.is_default && a.is_active) || list.find(a => a.is_active) || list[0];
      if (def) {
        setSelectedAccountId(def.id);
        setSelectedTemplate(def.template_name || '');
        setTemplateLang(def.template_language || 'en');
      }
    }).catch(() => {});
    apiGet('/whatsapp/bulk/ngos').then(data => setNgos(Array.isArray(data) ? data : [])).catch(() => {});
    loadDeliveryStatuses();
  }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    const acc = accounts.find(a => a.id === selectedAccountId);
    if (acc) {
      if (acc.template_name) setSelectedTemplate(acc.template_name);
      if (acc.template_language) setTemplateLang(acc.template_language);
    }
    apiGet(`/whatsapp/templates?accountId=${selectedAccountId}`).then(data => {
      const list = Array.isArray(data) ? data : [];
      setTemplates(list);
      if (!selectedTemplate && list.length) setSelectedTemplate(list[0].name);
    }).catch(() => {});
  }, [selectedAccountId, accounts]);

  useEffect(() => {
    const tpl = templates.find(t => t.name === selectedTemplate);
    if (!tpl) return;
    const body = (tpl.components || []).find(c => String(c.type || '').toUpperCase() === 'BODY')?.text || '';
    const count = (body.match(/\{\{\d+\}\}/g) || []).length;
    if (count === 0) setVariables('');
    else setVariables(Array(count).fill('{{name}}').join(', '));
  }, [selectedTemplate, templates]);

  useEffect(() => {
    if (mode === 'station' && selectedNgoId) loadStations(selectedNgoId);
  }, [mode, selectedNgoId]);

  const loadStations = async (ngoId) => {
    setLoadingStations(true);
    try {
      const qs = ngoId ? `?ngo_id=${encodeURIComponent(ngoId)}` : '';
      const data = await apiGet(`/whatsapp/bulk/stations${qs}`);
      setStations(Array.isArray(data) ? data : []);
    } catch {
      setStations([]);
    } finally {
      setLoadingStations(false);
    }
  };

  const handleSheet = async (file) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    const sourceRows = wb.SheetNames.map(sn => XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '', raw: false })).find(r => r.length > 0) || [];
    const rows = sourceRows.map((row, index) => {
      const keys = Object.keys(row);
      const nameKey = keys.find(k => /name/i.test(k));
      let phoneKey = keys.find(k => /phone|mobile|contact|cell/i.test(k));
      if (!phoneKey && keys.length === 1) phoneKey = keys[0];
      if (!phoneKey) {
        const candidate = keys.find(k => normalizePhone(row[k]).length >= 10);
        if (candidate) phoneKey = candidate;
      }
      const stationKey = keys.find(k => /station/i.test(k));
      const ngoKey = keys.find(k => /ngo|project/i.test(k));
      const phone = normalizePhone(phoneKey ? row[phoneKey] : '');
      const rawName = nameKey ? String(row[nameKey] || '').trim() : '';
      return {
        name: rawName || (phone ? `Recipient ${index + 1}` : 'Unknown'),
        phone,
        station: stationKey ? String(row[stationKey] || '').trim() : '',
        ngo: ngoKey ? String(row[ngoKey] || '').trim() : '',
        source: 'sheet',
        valid: phone.length >= 10,
      };
    }).filter(r => r.phone);
    setRecipients(dedupeByPhone(rows));
    setSelectedRecipients([]);
  };

  const fetchStationRecipients = async () => {
    if (!selectedStations.length) return;
    setFetchingRecipients(true);
    try {
      const all = [];
      for (const st of selectedStations) {
        const data = await apiGet(`/whatsapp/bulk/donors-by-station?station=${encodeURIComponent(st)}&ngo_id=${selectedNgoId}`);
        const list = Array.isArray(data) ? data : [];
        list.forEach(d => {
          const phone = normalizePhone(d.donor_mobile || d.donor_mobile_2 || '');
          if (!phone) return;
          all.push({
            name: d.donor_name || 'Unknown',
            phone,
            station: d.station || st,
            ngo: d.ngo_name || '',
            source: 'station',
            valid: phone.length >= 10,
          });
        });
      }
      setRecipients(dedupeByPhone(all));
      setSelectedRecipients([]);
    } catch (e) {
      toast('error', e.message || 'Failed to fetch recipients');
    } finally {
      setFetchingRecipients(false);
    }
  };

  const accountFilteredStatuses = accountFilter === 'all' ? deliveryStatuses : deliveryStatuses.filter(r => String(r.account_id) === String(accountFilter));
  const filteredStatuses = accountFilteredStatuses.filter(r => statusFilter === 'all' || String(r.status || '').toLowerCase() === statusFilter);
  const statusCounts = accountFilteredStatuses.reduce((acc, r) => {
    const key = String(r.status || 'unknown').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const validRecipients = recipients.filter(r => r.valid);
  const filteredStations = stations.filter(s => {
    const name = s.station || s.name || String(s);
    return name.toLowerCase().includes(stationSearch.trim().toLowerCase());
  });

  const handleSendAll = () => {
    if (validRecipients.length === 0) {
      toast('error', 'No valid recipients');
      return;
    }
    setConfirmBulk({ visible: true, donorCount: validRecipients.length });
  };

  const handleConfirmBulkSend = async () => {
    setConfirmBulk({ visible: false, donorCount: 0 });

    let campaignId = null;
    try {
      const camp = await apiPost('/whatsapp/campaigns', {
        name: `Bulk - ${accounts.find(a => String(a.id) === String(selectedAccountId))?.name || 'WhatsApp'} - ${new Date().toISOString().slice(0, 10)}`,
        accountId: selectedAccountId,
        templateName: selectedTemplate,
      });
      campaignId = camp?.id || null;
    } catch (e) {
      console.error('Campaign create failed:', e.message);
    }

    const batches = [];
    for (let i = 0; i < validRecipients.length; i += 5) batches.push(validRecipients.slice(i, i + 5));
    cancelBulkRef.current = false;
    setBulkState({ active: true, total: validRecipients.length, sent: 0, failed: 0, currentBatch: 0, totalBatches: batches.length, results: [], previousBatches: [] });

    const paramsArr = variables.split(',').map(v => v.trim()).filter(Boolean);
    const selectedTpl = templates.find(t => t.name === selectedTemplate);
    const headerComp = (selectedTpl?.components || []).find(c => String(c.type || '').toUpperCase() === 'HEADER');
    const headerImageUrl = (headerComp?.format === 'IMAGE' || headerComp?.format === 'DOCUMENT') ? (headerComp.example?.header_handle?.[0] || '') : '';
    const headerFormat = headerComp?.format || 'IMAGE';

    let totalSent = 0, totalFailed = 0;
    const failedRows = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      if (cancelBulkRef.current) break;
      const batch = batches[batchIdx];
      setBulkState(prev => ({ ...prev, currentBatch: batchIdx + 1, results: batch.map(r => ({ name: r.name, status: 'sending' })) }));

      const batchResults = await Promise.allSettled(batch.map(async (r) => {
        const res = await apiPost('/whatsapp/send-bulk-template', {
          accountId: selectedAccountId,
          to: r.phone,
          templateName: selectedTemplate,
          templateLang,
          headerImageUrl,
          headerFormat,
          campaignId,
          recipientName: r.name,
          parameters: paramsArr.map(v => v === '{{name}}' ? r.name : v),
        });
        if (!res?.success) throw new Error(res?.message || 'Send failed');
        return res;
      }));

      const batchSent = batchResults.filter(r => r.status === 'fulfilled').length;
      const batchFailed = batchResults.filter(r => r.status === 'rejected').length;
      totalSent += batchSent; totalFailed += batchFailed;

      batchResults.forEach((r, i) => {
        if (r.status === 'rejected') {
          failedRows.push({ ...batch[i], error: r.reason?.message || 'Failed' });
        }
      });

      setBulkState(prev => ({
        ...prev,
        sent: totalSent,
        failed: totalFailed,
        results: batchResults.map((r, i) => ({ name: batch[i].name, status: r.status === 'fulfilled' ? 'sent' : 'failed', error: r.status === 'rejected' ? r.reason?.message : null })),
        previousBatches: [...prev.previousBatches, { batch: batchIdx + 1, sent: batchSent, failed: batchFailed }],
      }));
      if (batchIdx < batches.length - 1) await new Promise(r => setTimeout(r, 5000));
    }

    setBulkState(prev => ({ ...prev, active: false }));
    if (failedRows.length) {
      setRecipients(prev => {
        const failedPhones = new Set(failedRows.map(f => f.phone));
        return prev.filter(r => failedPhones.has(r.phone)).map(r => ({ ...r, failed: true }));
      });
    } else {
      setRecipients([]);
      setSelectedRecipients([]);
    }
    loadDeliveryStatuses();
    toast(cancelBulkRef.current ? 'info' : 'success', cancelBulkRef.current ? `Cancelled. ${totalSent} sent, ${totalFailed} failed` : `Bulk send complete! ${totalSent} sent, ${totalFailed} failed`);
  };

  const exportFailed = () => {
    const failed = recipients.filter(r => r.failed || !r.valid);
    if (!failed.length) return;
    const headers = ['Name', 'Phone', 'Station', 'NGO', 'Source', 'Error'];
    const lines = [headers.join(',')];
    failed.forEach(r => lines.push([r.name, r.phone, r.station || '', r.ngo || '', r.source || '', r.error || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'whatsapp-bulk-failed.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="wa-page" style={{ background: '#eef1f8', minHeight: '100vh', padding: 0, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {showFailureBanner && deliveryStatuses.filter(r => String(r.status).toLowerCase() === 'failed').length > 0 && (
        <div style={{ background: '#fde2e5', border: '1px solid #fca5a5', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ color: '#a8182b', fontWeight: 600 }}>
            {deliveryStatuses.filter(r => String(r.status).toLowerCase() === 'failed').length} failed messages need review
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="wa-btn wa-btn-outline" onClick={() => setStatusFilter('failed')}>Review failures</button>
            <button className="wa-btn wa-btn-outline" onClick={() => setShowFailureBanner(false)}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['Select account', 'Choose template', 'Upload recipients', 'Review and send'].map((step, i) => (
          <div key={step} style={{ padding: '6px 12px', borderRadius: 999, background: i === 0 ? '#0866FF' : '#f4f6fb', color: i === 0 ? '#fff' : '#5B6070', fontSize: 12, fontWeight: 600, border: '1px solid #cbd0dc' }}>
            {i + 1}. {step}
          </div>
        ))}
      </div>



      <div style={{ background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 1px 3px rgba(20,30,60,.10)', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#1C1E21' }}>Delivery Insights</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['sent', 'delivered', 'read', 'failed'].map(key => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusBadge status={key} />
              <span style={{ fontWeight: 700 }}>{statusCounts[key] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="wa-form" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label className="wa-f">
            <span className="wa-f-label">WhatsApp Account</span>
            <select className="wa-select" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.project})</option>)}
            </select>
          </label>
          <div className="wa-f">
            <span className="wa-f-label">Account Health</span>
            <button className="wa-btn wa-btn-outline" onClick={async () => {
              setHealthModal(true);
              setHealthData(null);
              try {
                const data = await apiGet(`/whatsapp/accounts/${selectedAccountId}/health`);
                setHealthData(data);
              } catch (e) {
                setHealthData({ error: e.message });
              }
            }}>View Health</button>
          </div>
          <label className="wa-f">
            <span className="wa-f-label">Template</span>
            <select className="wa-select" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
              {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </label>
          <label className="wa-f">
            <span className="wa-f-label">Language</span>
            <input className="wa-input" value={templateLang} onChange={e => setTemplateLang(e.target.value)} />
          </label>
          <label className="wa-f">
            <span className="wa-f-label">Variables (comma, use {'{{name}}'})</span>
            <input className="wa-input" value={variables} onChange={e => setVariables(e.target.value)} placeholder="e.g. {{name}}" />
          </label>
          <div className="wa-f" style={{ gridColumn: '1 / -1' }}>
            <span className="wa-f-label">Template Preview</span>
            <TemplatePreview template={templates.find(t => t.name === selectedTemplate)} />
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`wa-btn ${mode === 'sheet' ? 'wa-btn-primary' : 'wa-btn-outline'}`} onClick={() => setMode('sheet')}>Sheet Upload</button>
        <button className={`wa-btn ${mode === 'station' ? 'wa-btn-primary' : 'wa-btn-outline'}`} onClick={() => setMode('station')}>Station / Donor</button>
      </div>

      {mode === 'sheet' && (
        <section className="wa-form" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ padding: 12 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { if (e.target.files[0]) handleSheet(e.target.files[0]); e.target.value = ''; }} />
            <p style={{ fontSize: 12, color: '#5B6070', marginTop: 6 }}>Upload sheet with Name and Phone columns. Accepted: .xlsx, .xls, .csv</p>
          </div>
        </section>
      )}

      {mode === 'station' && (
        <section className="wa-form" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="wa-f">
              <span className="wa-f-label">NGO</span>
              <select className="wa-select" value={selectedNgoId} onChange={e => setSelectedNgoId(e.target.value)}>
                <option value="">Select NGO</option>
                {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
            <div className="wa-f" style={{ gridColumn: '1 / -1' }}>
              <span className="wa-f-label">Stations</span>
              <input className="wa-input" placeholder="Search station..." value={stationSearch} onChange={e => setStationSearch(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <button type="button" className="wa-btn wa-btn-outline" onClick={() => setSelectedStations(filteredStations.map(s => s.station || s.name || String(s)))}>Select All</button>
                <button type="button" className="wa-btn wa-btn-outline" onClick={() => setSelectedStations([])}>Clear</button>
                <span style={{ fontSize: 12, color: '#5B6070', alignSelf: 'center' }}>{selectedStations.length} selected</span>
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #cbd0dc', borderRadius: 8, padding: 8, background: '#fff' }}>
                {filteredStations.map(s => {
                  const name = s.station || s.name || String(s);
                  const count = s.donor_count ? Object.values(s.donor_count).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
                  const id = s.id || name;
                  const checked = selectedStations.includes(name);
                  return (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid #ebdef3', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        setSelectedStations(prev => checked ? prev.filter(x => x !== name) : [...prev, name]);
                      }} />
                      <span style={{ flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 11, color: '#5B6070' }}>{count ? `${count} donors` : ''}</span>
                    </label>
                  );
                })}
                {filteredStations.length === 0 && <div style={{ padding: 12, color: '#5B6070', fontSize: 12 }}>No stations found</div>}
              </div>
            </div>
          </div>
          <div className="wa-form-foot" style={{ marginTop: 12 }}>
            <button className="wa-btn wa-btn-primary" onClick={fetchStationRecipients} disabled={fetchingRecipients || !selectedStations.length}>
              {fetchingRecipients ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />
                  Fetching...
                </span>
              ) : 'Fetch Recipients'}
            </button>
            {loadingStations && <span style={{ fontSize: 12, color: '#5B6070' }}>Loading stations...</span>}
          </div>
        </section>
      )}

      <section className="wa-form" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
        <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <strong>Recipients:</strong> {recipients.length} total, {validRecipients.length} valid, {recipients.length - validRecipients.length} invalid
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="wa-input" placeholder="Test name" value={testName} onChange={e => setTestName(e.target.value)} style={{ width: 100 }} />
            <input className="wa-input" placeholder="Test phone" value={testNumber} onChange={e => setTestNumber(e.target.value)} style={{ width: 120 }} />
            <button className="wa-btn wa-btn-outline" onClick={() => {
              const phone = normalizePhone(testNumber);
              if (!phone || phone.length < 10) { toast('error', 'Invalid phone'); return; }
              const row = { name: testName || 'Test', phone, station: 'Test', ngo: '', source: 'manual', valid: true };
              setRecipients(prev => dedupeByPhone([...prev, row]));
              setTestNumber('');
            }} disabled={!testNumber}>Add Test</button>
            <input className="wa-input" type="number" min="1" placeholder="Keep first N" value={keepCount} onChange={e => setKeepCount(e.target.value)} style={{ width: 110 }} />
            <button className="wa-btn wa-btn-outline" onClick={() => {
              const n = parseInt(keepCount, 10);
              if (!n || n < 1) return;
              setRecipients(prev => prev.slice(0, n));
              setSelectedRecipients([]);
            }} disabled={!recipients.length || !keepCount}>Keep First</button>
            <button className="wa-btn wa-btn-outline" onClick={() => {
              setRecipients(prev => prev.filter(r => !selectedRecipients.includes(r.phone)));
              setSelectedRecipients([]);
            }} disabled={!selectedRecipients.length}>Remove Selected</button>
            <button className="wa-btn wa-btn-outline" onClick={exportFailed} disabled={!recipients.length}>Export Failed/Invalid</button>
            <button className="wa-btn wa-btn-primary" onClick={handleSendAll} disabled={!validRecipients.length || bulkState.active}>
              {bulkState.active ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />
                  Sending...
                </span>
              ) : 'Send Bulk'}
            </button>
          </div>
        </div>
        <div style={{ maxHeight: 320, overflow: 'auto', padding: '0 12px 12px' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f4f6fb' }}>
                <th style={{ textAlign: 'left', padding: 6 }}>
                  <input type="checkbox" checked={recipients.length > 0 && selectedRecipients.length === recipients.length} onChange={(e) => {
                    if (e.target.checked) setSelectedRecipients(recipients.map(r => r.phone));
                    else setSelectedRecipients([]);
                  }} />
                </th>
                <th style={{ textAlign: 'left', padding: 6 }}>Name</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Phone</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Station</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Source</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map(r => (
                <tr key={r.phone} style={{ borderTop: '1px solid #ebdef3', opacity: r.valid ? 1 : 0.5 }}>
                  <td style={{ padding: 6 }}>
                    <input type="checkbox" checked={selectedRecipients.includes(r.phone)} onChange={() => {
                      setSelectedRecipients(prev => prev.includes(r.phone) ? prev.filter(x => x !== r.phone) : [...prev, r.phone]);
                    }} />
                  </td>
                  <td style={{ padding: 6 }}>{r.name}</td>
                  <td style={{ padding: 6 }}>{r.phone}</td>
                  <td style={{ padding: 6 }}>{r.station || '—'}</td>
                  <td style={{ padding: 6 }}>{r.source}</td>
                  <td style={{ padding: 6 }}>{r.valid ? (r.failed ? 'Failed' : 'Valid') : 'Invalid'}</td>
                </tr>
              ))}
              {recipients.length === 0 && (
                <tr><td colSpan="6" style={{ padding: 12, textAlign: 'center', color: '#5B6070' }}>No recipients loaded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>



      {healthModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setHealthModal(false)}>
          <div className="modal" style={{ maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Account Health</h3>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              {!healthData ? (
                <p>Loading...</p>
              ) : healthData.error ? (
                <p style={{ color: '#b91c1c' }}>{healthData.error}</p>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}><strong>Name:</strong> {healthData.account?.name}</div>
                  <div style={{ marginBottom: 8 }}><strong>Project:</strong> {healthData.account?.project}</div>
                  <div style={{ marginBottom: 8 }}><strong>Quality:</strong> {healthData.quality === 'UNKNOWN' ? 'UNKNOWN (Meta rating not available yet)' : healthData.quality}</div>
                  <div style={{ marginBottom: 8 }}><strong>Verified Name:</strong> {healthData.verifiedName}</div>
                  <div style={{ marginBottom: 8 }}><strong>Display Phone:</strong> {healthData.displayPhone || '—'}</div>
                  <div style={{ marginBottom: 8 }}><strong>Total Sent (tracked):</strong> {healthData.usage?.sent ?? 0}</div>
                  <div style={{ marginBottom: 8 }}><strong>Failed (tracked):</strong> {healthData.usage?.failed ?? 0}</div>
                  <div style={{ fontSize: 11, color: '#5B6070', marginTop: 10 }}>
                    Note: Meta billing/quality details are best viewed in Meta Business Manager.
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="wa-btn wa-btn-outline" onClick={() => setHealthModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailRow && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setDetailRow(null)}>
          <div className="modal" style={{ maxWidth: 460, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Error Details</h3>
            </div>
            <div className="modal-body" style={{ padding: 20, fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}><strong>Account:</strong> {accounts.find(a => String(a.id) === String(detailRow.account_id))?.name || detailRow.account_id}</div>
              <div style={{ marginBottom: 8 }}><strong>Phone:</strong> {detailRow.phone}</div>
              <div style={{ marginBottom: 8 }}><strong>Template:</strong> {detailRow.template_name}</div>
              <div style={{ marginBottom: 8 }}><strong>Status:</strong> <StatusBadge status={detailRow.status} /></div>
              <div style={{ marginBottom: 8 }}><strong>Message ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{detailRow.wa_message_id}</span></div>
              <div style={{ marginBottom: 8 }}><strong>Sent At:</strong> {detailRow.created_at ? new Date(detailRow.created_at).toLocaleString() : '—'}</div>
              <div style={{ marginBottom: 8 }}><strong>Error:</strong> {detailRow.failure_reason || '—'}</div>
              <div style={{ fontSize: 11, color: '#5B6070', marginTop: 10 }}>
                Retry is recommended only for retryable failures (e.g. rate limit). Permanent failures should be fixed first.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="wa-btn wa-btn-outline" onClick={() => setDetailRow(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmBulk.visible && (
        <ConfirmBulkModal
          visible={confirmBulk.visible}
          donorCount={confirmBulk.donorCount}
          onConfirm={handleConfirmBulkSend}
          onCancel={() => setConfirmBulk({ visible: false, donorCount: 0 })}
        />
      )}

      {bulkState.active && (
        <BulkProgressModal
          bulkState={bulkState}
          onCancel={() => { cancelBulkRef.current = true; }}
        />
      )}
    </div>
  );
}
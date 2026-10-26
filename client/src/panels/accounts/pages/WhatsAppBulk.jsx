import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { apiGet, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';
import BulkProgressModal from '../components/BulkProgressModal';
import ConfirmBulkModal from '../components/ConfirmBulkModal';

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
  const [deliveryStatuses, setDeliveryStatuses] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [fetchingRecipients, setFetchingRecipients] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState({ visible: false, donorCount: 0 });
  const [bulkState, setBulkState] = useState({ active: false, total: 0, sent: 0, failed: 0, currentBatch: 0, totalBatches: 0, results: [], previousBatches: [] });
  const cancelBulkRef = useRef(false);
  const fileRef = useRef(null);

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
    const count = (body.match(/\\{\\{\\d+\\}\\}/g) || []).length;
    if (count === 0) setVariables('');
    else setVariables(Array(count).fill('{{name}}').join(', '));
  }, [selectedTemplate, templates]);

  const loadStations = async (ngoId) => {
    setLoadingStations(true);
    try {
      const qs = ngoId ? `?ngo_id=${encodeURIComponent(ngoId)}` : '';
      const data = await apiGet(`/whatsapp/bulk/stations${qs}`);
      const list = Array.isArray(data) ? data : [];
      setStations(list);
    } catch {
      setStations([]);
    } finally {
      setLoadingStations(false);
    }
  };

  useEffect(() => {
    if (mode === 'station' && selectedNgoId) loadStations(selectedNgoId);
  }, [mode, selectedNgoId]);

  const handleSheet = async (file) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    const sourceRows = wb.SheetNames.map(sn => XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '', raw: false })).find(r => r.length > 0) || [];
    const rows = sourceRows.map((row, index) => {
      const keys = Object.keys(row);
      const nameKey = keys.find(k => /name/i.test(k));
      let phoneKey = keys.find(k => /phone|mobile|contact|cell/i.test(k));
      // Support simple sheets where only numbers are pasted in one column.
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
  };

  const fetchStationRecipients = async () => {
    if (!selectedStations.length) return;
    setFetchingRecipients(true);
    try {
      const all = [];
      for (const st of selectedStations) {
        const stationName = typeof st === 'string' ? st : (st.name || st.station || st);
        const data = await apiGet(`/whatsapp/bulk/donors-by-station?station=${encodeURIComponent(stationName)}&ngo_id=${selectedNgoId}`);
        const list = Array.isArray(data) ? data : [];
        list.forEach(d => {
          const phone = normalizePhone(d.donor_mobile || d.donor_mobile_2 || '');
          if (!phone) return;
          all.push({
            name: d.donor_name || 'Unknown',
            phone,
            station: d.station || stationName,
            ngo: d.ngo_name || '',
            source: 'station',
            valid: phone.length >= 10,
          });
        });
      }
      setRecipients(dedupeByPhone(all));
    } catch (e) {
      toast('error', e.message || 'Failed to fetch recipients');
    } finally {
      setFetchingRecipients(false);
    }
  };

  const filteredStations = stations.filter(s => {
    const name = s.station || s.name || String(s);
    return name.toLowerCase().includes(stationSearch.trim().toLowerCase());
  });
  const loadDeliveryStatuses = async () => {
    try {
      const data = await apiGet('/whatsapp/bulk/statuses?limit=20');
      setDeliveryStatuses(Array.isArray(data) ? data : []);
    } catch {}
  };

  const validRecipients = recipients.filter(r => r.valid);
  const invalidCount = recipients.filter(r => !r.valid).length;

  const handleSendAll = () => {
    if (validRecipients.length === 0) {
      toast('error', 'No valid recipients');
      return;
    }
    setConfirmBulk({ visible: true, donorCount: validRecipients.length });
  };

  const handleConfirmBulkSend = async () => {
    setConfirmBulk({ visible: false, donorCount: 0 });
    const batches = [];
    for (let i = 0; i < validRecipients.length; i += 5) batches.push(validRecipients.slice(i, i + 5));
    cancelBulkRef.current = false;
    setBulkState({ active: true, total: validRecipients.length, sent: 0, failed: 0, currentBatch: 0, totalBatches: batches.length, results: [], previousBatches: [] });

    const paramsArr = variables.split(',').map(v => v.trim()).filter(Boolean);
    const selectedTpl = templates.find(t => t.name === selectedTemplate);
    const headerComp = (selectedTpl?.components || []).find(c => String(c.type || '').toUpperCase() === 'HEADER');
    const headerImageUrl = headerComp?.format === 'IMAGE' ? (headerComp.example?.header_handle?.[0] || '') : '';
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
    loadDeliveryStatuses();
    // keep failed rows in recipients for export/retry
    if (failedRows.length) {
      setRecipients(prev => {
        const failedPhones = new Set(failedRows.map(f => f.phone));
        const kept = prev.filter(r => failedPhones.has(r.phone));
        // mark them
        return kept.map(r => ({ ...r, valid: r.valid, failed: true }));
      });
    } else {
      setRecipients([]);
    }
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

  const removeRecipient = (phone) => setRecipients(prev => prev.filter(r => r.phone !== phone));

  return (
    <div className="wa-page">
      <header className="wa-header">
        <div>
          <h1 className="wa-h1">WhatsApp Bulking</h1>
          <p className="wa-sub">Send approved WhatsApp templates in bulk via sheet or station donors.</p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={`wa-btn ${mode === 'sheet' ? 'wa-btn-primary' : 'wa-btn-outline'}`} onClick={() => setMode('sheet')}>Sheet Upload</button>
        <button className={`wa-btn ${mode === 'station' ? 'wa-btn-primary' : 'wa-btn-outline'}`} onClick={() => setMode('station')}>Station / Donor</button>
      </div>

      <section className="wa-form" style={{ marginBottom: 12 }}>
        <div className="wa-form-grid">
          <label className="wa-f">
            <span className="wa-f-label">WhatsApp Account</span>
            <select className="wa-select" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.project})</option>)}
            </select>
          </label>
          <label className="wa-f">
            <span className="wa-f-label">Template</span>
            <select className="wa-select" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
              {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </label>
          {(() => {
            const tpl = templates.find(t => t.name === selectedTemplate);
            const body = (tpl?.components || []).find(c => String(c.type || '').toUpperCase() === 'BODY')?.text || '';
            const fallback = !body && tpl?.components ? JSON.stringify(tpl.components) : '';
            if (!body && !fallback) return null;
            return (
              <div className="wa-f" style={{ gridColumn: '1 / -1' }}>
                <span className="wa-f-label">Template Body</span>
                <div style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 8, background: '#f8fafc', fontSize: 12, whiteSpace: 'pre-wrap' }}>{body || fallback}</div>
              </div>
            );
          })()}
          <label className="wa-f">
            <span className="wa-f-label">Language</span>
            <input className="wa-input" value={templateLang} onChange={e => setTemplateLang(e.target.value)} />
          </label>
          <label className="wa-f">
            <span className="wa-f-label">Variables (comma, use {'{{name}}'})</span>
            <input className="wa-input" value={variables} onChange={e => setVariables(e.target.value)} placeholder="e.g. {{name}}" />
          </label>
        </div>
      </section>

      {mode === 'sheet' && (
        <section className="wa-form" style={{ marginBottom: 12 }}>
          <div style={{ padding: 12 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { if (e.target.files[0]) handleSheet(e.target.files[0]); e.target.value = ''; }} />
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Upload sheet with Name and Phone columns.</p>
          </div>
        </section>
      )}

      {mode === 'station' && (
        <section className="wa-form" style={{ marginBottom: 12 }}>
          <div className="wa-form-grid">
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button" className="wa-btn wa-btn-outline" onClick={() => setSelectedStations(filteredStations.map(s => s.station || s.name || String(s)))}>Select All</button>
                <button type="button" className="wa-btn wa-btn-outline" onClick={() => setSelectedStations([])}>Clear</button>
                <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>{selectedStations.length} selected</span>
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #d1d5db', borderRadius: 8, padding: 8, background: '#fff' }}>
                {filteredStations.map(s => {
                  const name = s.station || s.name || String(s);
                  const count = s.donor_count ? Object.values(s.donor_count).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
                  const id = s.id || name;
                  const checked = selectedStations.includes(name);
                  return (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        setSelectedStations(prev => checked ? prev.filter(x => x !== name) : [...prev, name]);
                      }} />
                      <span style={{ flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{count ? `${count} donors` : ''}</span>
                    </label>
                  );
                })}
                {filteredStations.length === 0 && <div style={{ padding: 12, color: '#6b7280', fontSize: 12 }}>No stations found</div>}
              </div>
            </div>
          </div>
          <div className="wa-form-foot">
            <button className="wa-btn wa-btn-primary" onClick={fetchStationRecipients} disabled={fetchingRecipients || !selectedStations.length}>
              {fetchingRecipients ? 'Fetching...' : 'Fetch Recipients'}
            </button>
            {loadingStations && <span style={{ fontSize: 12, color: '#6b7280' }}>Loading stations...</span>}
          </div>
        </section>
      )}

      <section className="wa-form" style={{ marginBottom: 12 }}>
        <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Recipients:</strong> {recipients.length} total, {validRecipients.length} valid, {invalidCount} invalid
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="wa-btn wa-btn-outline" onClick={exportFailed} disabled={!recipients.length}>Export Failed/Invalid</button>
            <button className="wa-btn wa-btn-primary" onClick={handleSendAll} disabled={!validRecipients.length}>Send Bulk</button>
          </div>
        </div>
        <div style={{ maxHeight: 320, overflow: 'auto', padding: '0 12px 12px' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6 }}>Name</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Phone</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Station</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Source</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 6 }}></th>
              </tr>
            </thead>
            <tbody>
              {recipients.map(r => (
                <tr key={r.phone} style={{ borderTop: '1px solid #eee', opacity: r.valid ? 1 : 0.5 }}>
                  <td style={{ padding: 6 }}>{r.name}</td>
                  <td style={{ padding: 6 }}>{r.phone}</td>
                  <td style={{ padding: 6 }}>{r.station || '—'}</td>
                  <td style={{ padding: 6 }}>{r.source}</td>
                  <td style={{ padding: 6 }}>{r.valid ? (r.failed ? 'Failed' : 'Valid') : 'Invalid'}</td>
                  <td style={{ padding: 6 }}><button className="wa-ghost-btn" onClick={() => removeRecipient(r.phone)}>Remove</button></td>
                </tr>
              ))}
              {recipients.length === 0 && (
                <tr><td colSpan="6" style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>No recipients loaded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wa-form" style={{ marginBottom: 12 }}>
        <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Recent Delivery Status</strong>
          <button className="wa-btn wa-btn-outline" onClick={loadDeliveryStatuses}>Refresh</button>
        </div>
        <div style={{ maxHeight: 220, overflow: 'auto', padding: '0 12px 12px' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6 }}>Phone</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Template</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {deliveryStatuses.map(r => (
                <tr key={r.wa_message_id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 6 }}>{r.phone}</td>
                  <td style={{ padding: 6 }}>{r.template_name}</td>
                  <td style={{ padding: 6 }}>{r.status}</td>
                  <td style={{ padding: 6 }}>{r.failure_reason || '—'}</td>
                </tr>
              ))}
              {deliveryStatuses.length === 0 && (
                <tr><td colSpan="4" style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>No recent sends</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
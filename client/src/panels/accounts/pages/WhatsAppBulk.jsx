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

function fmtDay(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

const CAMPAIGN_STORAGE_KEY = 'wa_bulk_campaign_id';
const ACTIVE_CAMPAIGN_STATUSES = new Set(['queued', 'processing']);
const TERMINAL_CAMPAIGN_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled']);

export default function WhatsAppBulk() {
  const [mode, setMode] = useState('sheet');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [ngos, setNgos] = useState([]);
  const [selectedNgoId, setSelectedNgoId] = useState('');
  const [stations, setStations] = useState([]);
  const [selectedStations, setSelectedStations] = useState([]);
  const [stationSearch, setStationSearch] = useState('');
  const [extractorLeads, setExtractorLeads] = useState([]);
  const [extractorCounts, setExtractorCounts] = useState({ total: 0, used: 0, available: 0 });
  const [extractorFiltered, setExtractorFiltered] = useState(0);
  const [extractorLoading, setExtractorLoading] = useState(false);
  const [extractorSelected, setExtractorSelected] = useState([]);
  const [extractorLimit, setExtractorLimit] = useState('500');
  const [extractorUsage, setExtractorUsage] = useState('unused');
  const [extractorSort, setExtractorSort] = useState('oldest');
  const [extractorSearch, setExtractorSearch] = useState('');
  const [extractorCategory, setExtractorCategory] = useState('');
  const [extractorMinScore, setExtractorMinScore] = useState('');
  const [extractorCity, setExtractorCity] = useState('');
  const [extractorNgoId, setExtractorNgoId] = useState('');
  const [extractorCategories, setExtractorCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateLang, setTemplateLang] = useState('en');
  const [variables, setVariables] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [keepCount, setKeepCount] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [testName, setTestName] = useState('Test');
  const [loadingStations, setLoadingStations] = useState(false);
  const [fetchingRecipients, setFetchingRecipients] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState({ visible: false, donorCount: 0 });
  const [bulkState, setBulkState] = useState({ active: false, status: 'queued', total: 0, sent: 0, failed: 0, unknown: 0, currentBatch: 0, totalBatches: 0, results: [], previousBatches: [] });
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [progressHidden, setProgressHidden] = useState(false);
  const [deliveryStatuses, setDeliveryStatuses] = useState([]);
  const [statusSummary, setStatusSummary] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthModal, setHealthModal] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [showFailureBanner, setShowFailureBanner] = useState(true);
  const pollTimer = useRef(null);
  const campaignIdRef = useRef(null);
  const fileRef = useRef(null);

  const loadDeliveryStatuses = async (accountId = selectedAccountId) => {
    if (!accountId) {
      setDeliveryStatuses([]);
      setStatusSummary({});
      return;
    }
    const qs = `?accountId=${encodeURIComponent(accountId)}`;
    try {
      const [summary, list] = await Promise.all([
        apiGet(`/whatsapp/bulk/statuses${qs}&summary=1`),
        apiGet(`/whatsapp/bulk/statuses${qs}&limit=50`),
      ]);
      setStatusSummary(summary?.counts || {});
      setDeliveryStatuses(Array.isArray(list) ? list : []);
    } catch {}
  };

  const stopPolling = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const applyCampaignProgress = (data) => {
    const progress = data?.progress || {};
    const campaign = data?.campaign || {};
    setBulkState({
      active: ACTIVE_CAMPAIGN_STATUSES.has(campaign.status),
      status: campaign.status || 'queued',
      total: progress.total || campaign.total_count || 0,
      sent: progress.sent || 0,
      failed: progress.failed || 0,
      unknown: progress.unknown || 0,
      currentBatch: progress.currentBatch || 0,
      totalBatches: progress.totalBatches || 0,
      results: Array.isArray(progress.results) ? progress.results : [],
      previousBatches: Array.isArray(progress.previousBatches) ? progress.previousBatches : [],
    });
  };

  const finalizeCampaign = (data) => {
    const campaign = data?.campaign || {};
    const retryable = Array.isArray(data?.retryableRecipients)
      ? data.retryableRecipients.filter(r => campaign.status !== 'cancelled' || r.status !== 'pending')
      : [];
    if (retryable.length) {
      setRecipients(prev => {
        const byPhone = new Map(retryable.map(r => [String(r.phone), r]));
        const kept = prev
          .filter(r => byPhone.has(String(r.phone)))
          .map(r => ({ ...r, failed: true, error: byPhone.get(String(r.phone))?.error || '' }));
        const seen = new Set(kept.map(r => String(r.phone)));
        retryable.forEach(r => {
          if (seen.has(String(r.phone))) return;
          kept.push({
            name: r.name || r.phone,
            phone: r.phone,
            station: '',
            ngo: '',
            source: 'campaign',
            valid: true,
            failed: true,
            error: r.error || '',
          });
        });
        return kept;
      });
      setSelectedRecipients([]);
    } else {
      setRecipients([]);
      setSelectedRecipients([]);
    }

    setActiveCampaignId(null);
    campaignIdRef.current = null;
    localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
    stopPolling();
    if (campaign.account_id) loadDeliveryStatuses(campaign.account_id);

    const sent = campaign.sent_count || 0;
    const failed = campaign.failed_count || 0;
    const unknown = campaign.unknown_count || 0;
    if (campaign.status === 'cancelled') {
      toast('info', `Campaign cancelled. ${sent} sent, ${failed} failed`);
    } else {
      toast(failed || unknown ? 'warning' : 'success', `Bulk send ${campaign.status}. ${sent} sent, ${failed} failed${unknown ? `, ${unknown} need review` : ''}`);
    }
    // Used rows were recorded as each message went out; refresh the picker now
    // that the campaign is finished.
    if (mode === 'extractor') void loadExtractorLeads();
  };

  const pollCampaign = (id) => {
    stopPolling();
    campaignIdRef.current = id;
    setActiveCampaignId(id);
    let pollFailed = false;
    const tick = async () => {
      let data;
      try {
        data = await apiGet(`/whatsapp/campaigns/${id}/progress`);
        pollFailed = false;
      } catch (e) {
        if (!pollFailed) toast('error', e?.message || 'Could not load campaign progress');
        pollFailed = true;
        // A transient blip must not strand the modal; retry until the server
        // answers again (or the user hides the progress).
        pollTimer.current = setTimeout(tick, 5000);
        return;
      }
      applyCampaignProgress(data);
      const status = data?.campaign?.status;
      if (TERMINAL_CAMPAIGN_STATUSES.has(status)) {
        finalizeCampaign(data);
        return;
      }
      if (status === 'interrupted') {
        setActiveCampaignId(id);
        setProgressHidden(false);
        return;
      }
      pollTimer.current = setTimeout(tick, 3000);
    };
    tick();
  };

  useEffect(() => {
    let cancelled = false;
    const attach = async () => {
      try {
        let id = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
        let data = id ? await apiGet(`/whatsapp/campaigns/${id}/progress`).catch(() => null) : null;
        let status = data?.campaign?.status;

        if (!data || (!ACTIVE_CAMPAIGN_STATUSES.has(status) && status !== 'interrupted')) {
          if (id) localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
          const active = await apiGet('/whatsapp/campaigns?active=1').catch(() => []);
          const row = Array.isArray(active) ? active[0] : null;
          id = row?.id || null;
          data = id ? await apiGet(`/whatsapp/campaigns/${id}/progress`).catch(() => null) : null;
          status = data?.campaign?.status;
        }

        if (cancelled || !id || !data) return;
        if (!ACTIVE_CAMPAIGN_STATUSES.has(status) && status !== 'interrupted') return;

        localStorage.setItem(CAMPAIGN_STORAGE_KEY, id);
        applyCampaignProgress(data);
        if (ACTIVE_CAMPAIGN_STATUSES.has(status)) {
          pollCampaign(id);
        } else {
          campaignIdRef.current = id;
          setActiveCampaignId(id);
          setProgressHidden(false);
        }
      } catch { /* no active campaign to re-attach */ }
    };
    attach();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, []);

  useEffect(() => {
    if (selectedAccountId) loadDeliveryStatuses(selectedAccountId);
  }, [selectedAccountId]);

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

  const handleSheetFiles = async (files) => {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;
    const allRows = [];
    for (const file of fileList) {
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
      allRows.push(...rows);
    }
    setRecipients(dedupeByPhone(allRows));
    setSelectedRecipients([]);
    return;
  };

  // Backward-compatible single-file handler
  const handleSheet = async (file) => {
    if (!file) return;
    await handleSheetFiles([file]);
  };

  const fetchStationRecipients = async () => {    if (!selectedStations.length) return;
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

  // ── Extractor Leads mode ────────────────────────────────────────────────
  const loadExtractorLeads = async () => {
    setExtractorLoading(true);
    try {
      const params = new URLSearchParams();
      if (extractorSearch.trim()) params.set('q', extractorSearch.trim());
      if (extractorCategory) params.set('category', extractorCategory);
      if (extractorMinScore !== '') params.set('minScore', extractorMinScore);
      if (extractorCity.trim()) params.set('city', extractorCity.trim());
      params.set('onlyUnused', extractorUsage === 'unused' ? 'true' : 'false');
      params.set('usage', extractorUsage);
      params.set('sort', extractorSort);
      const raw = Number(extractorLimit);
      const limit = raw > 0 ? Math.min(2000, raw) : 2000;
      params.set('limit', String(limit));

      const data = await apiGet(`/whatsapp/bulk/extractor-leads?${params.toString()}`);
      const list = Array.isArray(data?.leads) ? data.leads : [];
      const fresh = list.filter((lead) => !lead.used);
      setExtractorLeads(list);
      setExtractorCounts(data?.counts || { total: 0, used: 0, available: 0 });
      setExtractorFiltered(Number(data?.filtered) || list.length);
      setExtractorCategories(Array.isArray(data?.categories) ? data.categories : []);
      // Used rows are shown for review/manual fixes, not for sending, so only
      // the unused list gets a default selection.
      setExtractorSelected(
        extractorUsage === 'used' ? [] : fresh.slice(0, limit).map((lead) => lead.id),
      );
    } catch (e) {
      toast('error', e?.message || 'Failed to load extractor leads');
    } finally {
      setExtractorLoading(false);
    }
  };

  const selectTopExtractor = (count) => {
    const raw = count === undefined ? Number(extractorLimit) : Number(count);
    if (count !== undefined) setExtractorLimit(String(count));
    const limit = raw > 0 ? Math.min(2000, raw) : 2000;
    const pool = extractorUsage === 'used'
      ? extractorLeads
      : extractorLeads.filter((lead) => !lead.used);
    setExtractorSelected(pool.slice(0, limit).map((lead) => lead.id));
  };

  const fetchExtractorRecipients = () => {
    const chosen = extractorLeads.filter(
      (lead) => extractorSelected.includes(lead.id) && !lead.used,
    );
    if (chosen.length === 0) {
      toast('error', 'Select at least one unused lead');
      return;
    }
    const ngoName = ngos.find((n) => String(n.id) === String(extractorNgoId))?.name || '';
    const rows = chosen.map((lead) => ({
      name: lead.displayName,
      phone: normalizePhone(lead.phone),
      station: '',
      ngo: ngoName,
      source: 'extractor',
      extractorLeadId: lead.id,
      ngoId: extractorNgoId || '',
      valid: true,
    }));
    setRecipients(dedupeByPhone(rows));
    setSelectedRecipients([]);
    toast('success', `${rows.length} extractor lead(s) added to recipients`);
  };

  const markExtractorSelected = async (used) => {
    const phones = extractorLeads
      .filter((lead) => extractorSelected.includes(lead.id))
      .map((lead) => lead.phone);
    if (phones.length === 0) {
      toast('error', 'Select at least one lead');
      return;
    }
    try {
      await apiPost('/whatsapp/bulk/extractor-leads/mark', {
        phones,
        used,
        ngoId: extractorNgoId || null,
      });
      toast('success', `${phones.length} number(s) marked ${used ? 'used' : 'unused'}`);
      await loadExtractorLeads();
    } catch (e) {
      toast('error', e?.message || 'Could not update the used list');
    }
  };

  useEffect(() => {
    if (mode !== 'extractor') return;
    void loadExtractorLeads();
    // Filters are applied by the Load button; loading on every keystroke would
    // hammer the endpoint for no benefit. The Unused/Used/All view does reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, extractorUsage]);

  const filteredStatuses = deliveryStatuses.filter(r => statusFilter === 'all' || String(r.status || '').toLowerCase() === statusFilter);
  const statusCounts = statusSummary;
  const statusTotal = Object.values(statusCounts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const selectedAccountName = accounts.find(a => String(a.id) === String(selectedAccountId))?.name || '';
  const validRecipients = recipients.filter(r => r.valid);
  const filteredStations = stations.filter(s => {
    const name = s.station || s.name || String(s);
    return name.toLowerCase().includes(stationSearch.trim().toLowerCase());
  });

  const extractorSelectable = extractorLeads;
  const extractorSelectedUnused = extractorLeads.filter(
    lead => extractorSelected.includes(lead.id) && !lead.used,
  ).length;
  const allExtractorVisibleSelected =
    extractorSelectable.length > 0 &&
    extractorSelectable.every(lead => extractorSelected.includes(lead.id));
  const toggleAllExtractorVisible = () => {
    if (allExtractorVisibleSelected) {
      const ids = new Set(extractorSelectable.map(lead => lead.id));
      setExtractorSelected(prev => prev.filter(id => !ids.has(id)));
      return;
    }
    setExtractorSelected(prev => [...new Set([...prev, ...extractorSelectable.map(lead => lead.id)])]);
  };

  const handleSendAll = () => {
    if (validRecipients.length === 0) {
      toast('error', 'No valid recipients');
      return;
    }
    setConfirmBulk({ visible: true, donorCount: validRecipients.length });
  };

  const handleConfirmBulkSend = async () => {
    setConfirmBulk({ visible: false, donorCount: 0 });

    const paramsArr = variables.split(',').map(v => v.trim()).filter(Boolean);
    const selectedTpl = templates.find(t => t.name === selectedTemplate);
    const headerComp = (selectedTpl?.components || []).find(c => String(c.type || '').toUpperCase() === 'HEADER');
    const headerImageUrl = (headerComp?.format === 'IMAGE' || headerComp?.format === 'DOCUMENT') ? (headerComp.example?.header_handle?.[0] || '') : '';
    const headerFormat = headerComp?.format || 'IMAGE';
    const queuedRecipients = validRecipients.map(r => ({
      phone: r.phone,
      name: r.name,
      parameters: paramsArr.map(v => v === '{{name}}' ? r.name : v),
      extractorLeadId: r.extractorLeadId || null,
      ngoId: r.ngoId || null,
    }));

    try {
      // The server owns the send loop from here. This request returns as soon
      // as the queue is stored, so refreshing or leaving the page cannot stop
      // the campaign.
      const campaign = await apiPost('/whatsapp/campaigns', {
        name: `Bulk - ${accounts.find(a => String(a.id) === String(selectedAccountId))?.name || 'WhatsApp'} - ${new Date().toISOString().slice(0, 10)}`,
        accountId: selectedAccountId,
        templateName: selectedTemplate,
        templateLang,
        headerImageUrl,
        headerFormat,
        recipients: queuedRecipients,
      });
      if (!campaign?.id) throw new Error(campaign?.message || 'Could not start the campaign');
      if (campaign.skippedUsed > 0) {
        toast('warning', `${campaign.skippedUsed} number(s) were already messaged before and were skipped.`);
      }
      if (mode === 'extractor') void loadExtractorLeads();

      localStorage.setItem(CAMPAIGN_STORAGE_KEY, campaign.id);
      setProgressHidden(false);
      setBulkState({
        active: true,
        status: 'queued',
        total: campaign.total || queuedRecipients.length,
        sent: 0,
        failed: 0,
        unknown: 0,
        currentBatch: 0,
        totalBatches: Math.ceil(queuedRecipients.length / 5),
        results: [],
        previousBatches: [],
      });
      pollCampaign(campaign.id);
    } catch (e) {
      toast('error', e?.message || 'Could not start the campaign');
    }
  };

  const handleCancelCampaign = async () => {
    const id = campaignIdRef.current || activeCampaignId;
    if (!id) return;
    try {
      await apiPost(`/whatsapp/campaigns/${id}/cancel`, {});
      toast('info', 'Cancelling after the current batch...');
    } catch (e) {
      toast('error', e?.message || 'Could not cancel the campaign');
    }
  };

  const handleResumeCampaign = async () => {
    const id = campaignIdRef.current || activeCampaignId;
    if (!id) return;
    try {
      await apiPost(`/whatsapp/campaigns/${id}/resume`, {});
      setProgressHidden(false);
      pollCampaign(id);
    } catch (e) {
      toast('error', e?.message || 'Could not resume the campaign');
    }
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
    <div className="wa-page" style={{  minHeight: '100vh', padding: 0, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {showFailureBanner && Number(statusCounts.failed || 0) > 0 && (
        <div style={{ background: '#fde2e5', border: '1px solid #fca5a5', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ color: '#a8182b', fontWeight: 600 }}>
            {Number(statusCounts.failed || 0)} failed messages need review
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="wa-btn wa-btn-outline" onClick={() => setStatusFilter('failed')}>Review failures</button>
            <button className="wa-btn wa-btn-outline" onClick={() => setShowFailureBanner(false)}>Dismiss</button>
          </div>
        </div>
      )}

      {activeCampaignId && progressHidden && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ color: '#1e3a8a', fontWeight: 600 }}>
            {bulkState.status === 'interrupted'
              ? 'Campaign paused — resume to continue sending'
              : `Sending in the background… ${bulkState.sent + bulkState.failed + bulkState.unknown}/${bulkState.total}`}
          </span>
          <button className="wa-btn wa-btn-outline" onClick={() => setProgressHidden(false)}>View progress</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['Select account', 'Choose template', 'Choose recipients', 'Review and send'].map((step, i) => (
          <div key={step} style={{ padding: '6px 12px', borderRadius: 999, background: i === 0 ? '#0866FF' : '#f4f6fb', color: i === 0 ? '#fff' : '#5B6070', fontSize: 12, fontWeight: 600, border: '1px solid #cbd0dc' }}>
            {i + 1}. {step}
          </div>
        ))}
      </div>



      <div style={{ background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 1px 3px rgba(20,30,60,.10)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1C1E21' }}>Delivery Insights</div>
          <div style={{ fontSize: 11, color: '#5B6070' }}>
            {selectedAccountName ? `Account: ${selectedAccountName}` : 'Select an account'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {['accepted', 'sent', 'delivered', 'read', 'failed'].map(key => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusBadge status={key} />
              <span style={{ fontWeight: 700 }}>{statusCounts[key] || 0}</span>
            </div>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#5B6070' }}>
            {statusTotal} total
          </span>
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
        <button className={`wa-btn ${mode === 'extractor' ? 'wa-btn-primary' : 'wa-btn-outline'}`} onClick={() => setMode('extractor')}>Extractor Leads</button>
      </div>

      {mode === 'sheet' && (
        <section className="wa-form" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ padding: 12 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={e => { if (e.target.files?.length) handleSheetFiles(e.target.files); e.target.value = ''; }} />
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

      {mode === 'extractor' && (
        <section className="wa-form" style={{ marginBottom: 12, background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(20,30,60,.10)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', paddingBottom: 16, borderBottom: '1px solid #eef1f6' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Extractor Leads</div>
              <div style={{ fontSize: 12, color: '#5B6070', marginTop: 3 }}>
                Pick unused leads from the Extractor. Numbers messaged before are marked used and cannot be selected.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Total', value: extractorCounts.total, color: '#111827', bg: '#f8fafc', border: '#e5e7eb' },
                { label: 'Used', value: extractorCounts.used, color: '#9f1239', bg: '#fff1f2', border: '#fecdd3' },
                { label: 'Available', value: extractorCounts.available, color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
              ].map(stat => (
                <div key={stat.label} style={{ minWidth: 96, padding: '8px 14px', borderRadius: 10, background: stat.bg, border: `1px solid ${stat.border}` }}>
                  <div style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 }}>{stat.label}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: stat.color, lineHeight: 1.2 }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'end', marginTop: 16 }}>
            <label className="wa-f">
              <span className="wa-f-label">NGO (optional, saved for the record)</span>
              <select className="wa-select" value={extractorNgoId} onChange={e => setExtractorNgoId(e.target.value)}>
                <option value="">No NGO</option>
                {ngos.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ color: '#5B6070' }}>Show</span>
                <div style={{ display: 'inline-flex', border: '1px solid #cbd0dc', borderRadius: 9, overflow: 'hidden' }}>
                  {[['unused', 'Unused'], ['used', 'Used'], ['all', 'All']].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setExtractorUsage(value)}
                      style={{
                        padding: '6px 14px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        background: extractorUsage === value ? '#0866FF' : '#fff',
                        color: extractorUsage === value ? '#fff' : '#374151',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                <span style={{ color: '#5B6070' }}>Sort</span>
                <select className="wa-select" value={extractorSort} onChange={e => setExtractorSort(e.target.value)} style={{ width: 170 }}>
                  <option value="oldest">Oldest first</option>
                  <option value="newest">Newest first</option>
                  <option value="score">AI score high</option>
                </select>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 12, marginTop: 16 }}>
            <label className="wa-f">
              <span className="wa-f-label">Search</span>
              <input className="wa-input" placeholder="Name, phone or address" value={extractorSearch} onChange={e => setExtractorSearch(e.target.value)} />
            </label>
            <label className="wa-f">
              <span className="wa-f-label">Category</span>
              <select className="wa-select" value={extractorCategory} onChange={e => setExtractorCategory(e.target.value)}>
                <option value="">All categories</option>
                {extractorCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.count})</option>)}
              </select>
            </label>
            <label className="wa-f">
              <span className="wa-f-label">Min AI score</span>
              <input className="wa-input" type="number" min="0" max="100" placeholder="0–100" value={extractorMinScore} onChange={e => setExtractorMinScore(e.target.value)} />
            </label>
            <label className="wa-f">
              <span className="wa-f-label">City</span>
              <input className="wa-input" placeholder="e.g. Mumbai" value={extractorCity} onChange={e => setExtractorCity(e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14, padding: '10px 12px', background: '#f8fafc', border: '1px solid #eef1f6', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>How many to send</span>
              <input
                className="wa-input"
                type="number"
                min="0"
                max="2000"
                value={extractorLimit}
                onChange={e => setExtractorLimit(e.target.value)}
                style={{ width: 90 }}
              />
              <span style={{ fontSize: 11, color: '#6b7280' }}>max {extractorCounts.available} · 0 = all</span>
              <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                {[100, 250, 500].map(n => (
                  <button key={n} type="button" className="wa-btn wa-btn-outline" onClick={() => selectTopExtractor(n)} style={{ padding: '4px 9px', fontSize: 11 }}>{n}</button>
                ))}
                <button type="button" className="wa-btn wa-btn-outline" onClick={() => selectTopExtractor(0)} style={{ padding: '4px 9px', fontSize: 11 }}>All</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="wa-btn wa-btn-outline" onClick={loadExtractorLeads} disabled={extractorLoading}>
                {extractorLoading ? 'Loading…' : 'Load'}
              </button>
              <button type="button" className="wa-btn wa-btn-outline" onClick={() => selectTopExtractor()} disabled={extractorLeads.length === 0}>
                Select top {extractorLimit || 'all'}
              </button>
              <button type="button" className="wa-btn wa-btn-outline" onClick={() => setExtractorSelected([])}>Clear</button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#374151', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={allExtractorVisibleSelected}
                onChange={toggleAllExtractorVisible}
                disabled={extractorSelectable.length === 0}
              />
              Select all shown ({extractorSelectable.length})
            </label>
            <span style={{ fontSize: 12, color: '#5B6070' }}>
              {extractorSelected.length} selected · {extractorFiltered} matching · {extractorCounts.available} available
            </span>
          </div>

          <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ width: 38, padding: '10px 10px', borderBottom: '1px solid #e5e7eb' }} />
                  {['Business', 'Phone', 'City', 'AI score', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 10px', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {extractorLeads.map(lead => {
                  const checked = extractorSelected.includes(lead.id);
                  return (
                    <tr key={lead.id} style={{ borderBottom: '1px solid #f3f4f6', background: lead.used ? '#fafafa' : '#fff' }}>
                      <td style={{ padding: '9px 10px' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setExtractorSelected(prev => checked ? prev.filter(id => id !== lead.id) : [...prev, lead.id])}
                        />
                      </td>
                      <td style={{ padding: '9px 10px', fontWeight: 600, color: lead.used ? '#6b7280' : '#111827', minWidth: 240 }}>{lead.displayName}</td>
                      <td style={{ padding: '9px 10px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#374151' }}>{lead.phone}</td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#5B6070' }}>{lead.city || '—'}</td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            minWidth: 28,
                            textAlign: 'center',
                            padding: '2px 7px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: lead.aiScore >= 60 ? '#ecfdf5' : '#f3f4f6',
                            color: lead.aiScore >= 60 ? '#065f46' : '#374151',
                          }}>
                            {lead.aiScore ?? '—'}
                          </span>
                          {(lead.aiTags || []).slice(0, 1).map(tag => (
                            <span key={tag} style={{ fontSize: 10.5, color: '#4338ca' }}>{tag}</span>
                          ))}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                        {lead.used ? (
                          <span style={{ padding: '2px 9px', borderRadius: 999, background: '#fff1f2', color: '#9f1239', fontSize: 11, fontWeight: 700 }}>Used</span>
                        ) : (
                          <span style={{ padding: '2px 9px', borderRadius: 999, background: '#ecfdf5', color: '#065f46', fontSize: 11, fontWeight: 700 }}>Unused</span>
                        )}
                        {lead.used && lead.usedAt && (
                          <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2 }}>Sent {fmtDay(lead.usedAt)}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {extractorLeads.length === 0 && !extractorLoading && (
                  <tr>
                    <td colSpan="6" style={{ padding: 24, textAlign: 'center', color: '#5B6070' }}>
                      No leads match these filters. Try clearing the city or AI score.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: '1px solid #eef1f6' }}>
            <div style={{ fontSize: 12, color: '#5B6070' }}>
              <b style={{ color: '#111827' }}>{extractorSelected.length}</b> selected ·{' '}
              <b style={{ color: '#065f46' }}>{extractorSelectedUnused}</b> usable ·{' '}
              {extractorCounts.available} available globally
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="wa-btn wa-btn-outline" onClick={() => markExtractorSelected(true)} disabled={extractorSelected.length === 0}>
                Mark used
              </button>
              <button type="button" className="wa-btn wa-btn-outline" onClick={() => markExtractorSelected(false)} disabled={extractorSelected.length === 0}>
                Mark unused
              </button>
              <button type="button" className="wa-btn wa-btn-primary" onClick={fetchExtractorRecipients} disabled={extractorSelectedUnused === 0}>
                Fetch recipients
              </button>
            </div>
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
            <button className="wa-btn wa-btn-outline" onClick={async () => {
              try {
                const res = await apiPost('/whatsapp/validate-contacts', {
                  accountId: selectedAccountId,
                  phones: recipients.map(r => r.phone),
                });
                const validSet = new Set((res.valid || []).map(String));
                setRecipients(prev => prev.map(r => ({ ...r, valid: validSet.has(String(r.phone)) })));
                if (res.validationUnavailable) {
                  toast('warning', `Validation unavailable (Meta): ${res.metaError || ''}. All recipients kept as valid.`);
                } else {
                  toast('success', `${res.valid?.length || 0} WhatsApp-active, ${res.invalid?.length || 0} not on WhatsApp`);
                }
              } catch (e) {
                toast('error', e.message || 'Validation failed');
              }
            }} disabled={!recipients.length || !selectedAccountId}>Validate WhatsApp</button>
            <button className="wa-btn wa-btn-outline" onClick={exportFailed} disabled={!recipients.length}>Export Failed/Invalid</button>
            <button className="wa-btn wa-btn-primary" onClick={handleSendAll} disabled={!validRecipients.length || bulkState.active || Boolean(activeCampaignId)}>
              {bulkState.active ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />
                  Sending...
                </span>
              ) : activeCampaignId ? 'Campaign in progress' : 'Send Bulk'}
            </button>
          </div>
        </div>
        <div style={{ padding: '0 12px 8px' }}>
          <input placeholder="Search recipients by name/phone/station..." value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} style={{ width: '100%', maxWidth: 360, height: 34, padding: '0 10px', border: '1px solid #cbd0dc', borderRadius: 8, fontSize: 13 }} />
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
              {recipients.filter(r => {
                const q = recipientSearch.trim().toLowerCase();
                if (!q) return true;
                return [r.name, r.phone, r.station, r.source].some(v => String(v || '').toLowerCase().includes(q));
              }).map(r => (
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

      {activeCampaignId && !progressHidden && (
        <BulkProgressModal
          visible
          status={bulkState.status}
          total={bulkState.total}
          sent={bulkState.sent}
          failed={bulkState.failed}
          unknown={bulkState.unknown}
          currentBatch={bulkState.currentBatch}
          totalBatches={bulkState.totalBatches}
          results={bulkState.results}
          previousBatches={bulkState.previousBatches}
          onCancel={handleCancelCampaign}
          onHide={() => setProgressHidden(true)}
          onResume={bulkState.status === 'interrupted' ? handleResumeCampaign : undefined}
        />
      )}
    </div>
  );
}
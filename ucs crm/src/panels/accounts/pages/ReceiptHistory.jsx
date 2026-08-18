import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import * as JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, FileSpreadsheet } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../api/auth';
import { getReceipt } from '../api/receipts';
import { PROJECTS } from '../data/projects';
import { generateReceiptPDF } from '../services/pdfGenerator';
import ReceiptTemplate_MannCar from '../components/ReceiptTemplate_MannCar';
import ReceiptTemplate_Ashray from '../components/ReceiptTemplate_Ashray';
import ReceiptTemplate_BeingSevak from '../components/ReceiptTemplate_BeingSevak';

const TEMPLATES = { manncar: ReceiptTemplate_MannCar, ashray: ReceiptTemplate_Ashray, beingsevak: ReceiptTemplate_BeingSevak };
const DB_TO_TEMPLATE = { mann: 'manncar', aflf: 'ashray', bsct: 'beingsevak' };
const PROJECT_LABELS = { mann: 'Mann Care Foundation', aflf: 'Ashray For Life Foundation', bsct: 'Being Sevak Charitable Trust' };

const EXCEL_HEADER = ["Team Name","Transaction Date","Caller Name","Receipt Name","Mobile no.","Len","Count","Mobil No. 2 / Tel ","Len","Address-1 ","Address-2 ","Station","East / West","City","Pin Code","Pan. No. ","Len ","Mail Id ","Birth Date","Data Cat","Station","Mobile","Android No","Team","Agent Name","FSE Name","MOP","Received Bank","Payment ID No. ","Len","Count","Donors Bank Name","Amt","Receipt No.","Receipt Book No","Receipt Date ","Time","Project Supported","Account of","State","Branch"];

const IMPORT_FIELDS = {
  receipt_no: ['receiptno', 'recieptno', 'receiptnumber'],
  receipt_date: ['receiptdate', 'recieptdate', 'donationdate', 'date', 'transactiondate', 'transdate'],
  receipt_time: ['time', 'receipttime', 'donationtime', 'transactiontime'],
  donor_name: ['donorname', 'receiptname', 'name'],
  donor_mobile: ['mobileno', 'mobile', 'mobilenumber', 'phone', 'phoneno', 'contactno'],
  amount: ['amount', 'donationamount', 'amt'],
  mode: ['mode', 'mop', 'paymentmode', 'modeofpayment'],
  project_id: ['project', 'ngo', 'projectsupported'],
  email: ['email', 'emailid', 'mailid'],
  pan_number: ['pan', 'panno', 'pannumber'],
  address: ['address', 'address1'],
  city: ['city'],
  payment_id: ['paymentid', 'paymentidno', 'transactionid', 'transactionno', 'utr', ''],
  bank_name: ['bankname', 'donorbankname', 'receivedbank', 'receivedbankname'],
  agent_name: ['fsename', 'agentname', 'agent', 'fro'],
};

const normalizeImportHeader = (value) => String(value || '').replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function formatImportDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return value == null ? '' : String(value).trim();
}

function formatImportTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return value == null ? '' : String(value).trim();
}

function fmtTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(t);
  const ap = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

export function prepareImportRows(rows) {
  return rows.map(row => {
    const fields = Object.fromEntries(Object.keys(row).map(key => [normalizeImportHeader(key), row[key]]));
    const result = { ...row };
    for (const [field, aliases] of Object.entries(IMPORT_FIELDS)) {
      const value = aliases.map(alias => fields[alias]).find(value => value !== undefined && value !== null && String(value).trim() !== '');
      result[field] = field === 'receipt_date' ? formatImportDate(value)
        : field === 'receipt_time' ? formatImportTime(value)
        : (value == null ? '' : String(value).trim());
    }
    return result;
  }).filter(row => row.receipt_no || row.donor_name || row.amount);
}

function getTemplateId(projectId) {
  return DB_TO_TEMPLATE[projectId] || 'beingsevak';
}

function buildDonor(r, lead) {
  return {
    'Receipt No.': r.receipt_no || '',
    'Receipt Date': r.receipt_date || '',
    'Donor Name': r.donor_name || '',
    'Address 1': r.address || '',
    'PAN No.': r.pan_number || '',
    'Email ID': lead?.donor_email || r.email || '',
    'Amount': r.amount || 0,
    'Mode of Payment (MOP)': r.mode || lead?.payment_mode || '',
    'Payment ID No.': lead?.upi_transaction_id || r.payment_id || '',
    'Donor Bank Name': lead?.payment_from || r.bank_name || '',
    'Account Of': 'Corpus',
    'City': lead?.donor_city || '',
    'State': '',
    'Pincode': '',
  };
}

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';

const StatRow = ({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
    <div style={{ fontSize: 'clamp(20px,1.9vw,26px)', fontWeight: 700, color, lineHeight: 1.2, whiteSpace: 'nowrap', letterSpacing: '-.02em' }}>{value}</div>
    <div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
  </div>
);

export default function ReceiptHistory() {
  const [receipts, setReceipts] = useState([]);
  const [total, setTotal] = useState(0);
  const [statsByProject, setStatsByProject] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [donorDetail, setDonorDetail] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [waLoading, setWaLoading] = useState(false);
  const [waResult, setWaResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadMode, setUploadMode] = useState('receipts');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [namesImporting, setNamesImporting] = useState(false);
  const [namesResult, setNamesResult] = useState(null);
  const [namesUploadProgress, setNamesUploadProgress] = useState(0);
  const [ngoId, setNgoId] = useState('');
  const [ngoOptions, setNgoOptions] = useState([]);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [receiptNgo, setReceiptNgo] = useState('');
  const [suspenseMode, setSuspenseMode] = useState(false);
  const [filterMonth, setFilterMonth] = useState(0);
  const [filterYear, setFilterYear] = useState(0);
  const [todayDownloading, setTodayDownloading] = useState(false);
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [historyForDownload, setHistoryForDownload] = useState(null);
  const [dlWindow, setDlWindow] = useState(0);
  const DL_BATCH = 8;
  const [savedDetail, setSavedDetail] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [cleanMode, setCleanMode] = useState('all');
  const [cleanFrom, setCleanFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [cleanTo, setCleanTo] = useState(() => new Date().toISOString().slice(0, 10));
  const fileRef = useRef(null);
  const namesFileRef = useRef(null);
  const CHUNK_SIZE = 100;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '100');
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (receiptNgo) params.set('project', receiptNgo);
    if (suspenseMode) params.set('suspense', '1');
    if (filterMonth && filterYear) {
      params.set('filter_month', String(filterMonth));
      params.set('filter_year', String(filterYear));
    } else if (period === 'custom') {
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
    } else if (period && period !== 'all') {
      params.set('period', period);
    }
    apiGet(`/accounts/receipts?${params.toString()}`)
      .then((res) => {
        setReceipts(Array.isArray(res?.data) ? res.data : []);
        setTotal(Number(res?.total) || 0);
        setStatsByProject(Array.isArray(res?.statsByProject) ? res.statsByProject : []);
      })
      .catch((err) => { console.error('API error:', err.message); })
      .finally(() => setLoading(false));
  }, [page, searchQuery, period, fromDate, toDate, receiptNgo, suspenseMode, filterMonth, filterYear]);

  const runImport = useCallback(async (rows, ngoIdForImport) => {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    setImportResult(null);
    setUploadProgress(0);
    setUploadStatus('Reading file...');
    try {
      const chunks = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
      }

      let totalImported = 0;
      let totalMatched = 0;
      let totalUpgraded = 0;
      let totalCreditedPending = 0;
      let totalFailed = 0;
      let failedFileUrl = null;

      for (let i = 0; i < chunks.length; i++) {
        setUploadStatus(`Importing ${Math.min((i+1)*CHUNK_SIZE, rows.length)} of ${rows.length} rows...`);
        const res = await apiPost('/accounts/receipts/import', { receipts: chunks[i], ngo_id: ngoIdForImport }, 300000);
        totalImported += res.imported || 0;
        totalMatched += res.matchedDonors || 0;
        totalUpgraded += res.upgraded || 0;
        totalCreditedPending += res.creditedPending || 0;
        totalFailed += res.failedCount || 0;
        if (res.failedFile && !failedFileUrl) failedFileUrl = res.failedFile;
        setUploadProgress(Math.round(((i + 1) / chunks.length) * 100));
      }
      setUploadProgress(100);
      setUploadStatus('');

      const apiBase = import.meta.env.VITE_API_URL || 'https://api.beingsevak.org/api';
      const rootUrl = apiBase.replace(/\/api\/?$/, '');
      const parts = [`${totalImported} receipts imported`];
      if (totalUpgraded > 0) parts.push(`${totalUpgraded} suspense receipts credited from re-upload`);
      if (totalCreditedPending > 0) parts.push(`${totalCreditedPending} pending claims auto-credited`);
      if (totalMatched > 0) parts.push(`${totalMatched} linked to donors`);
      if (totalFailed > 0) parts.push(`${totalFailed} failed`);
      setImportResult({
        message: parts.join(', '),
        imported: totalImported,
        matchedDonors: totalMatched,
        failedCount: totalFailed,
        failedFile: failedFileUrl ? rootUrl + failedFileUrl : null,
      });
      load();
    } catch (err) { alert('Import failed: ' + err.message); }
    finally { setImporting(false); setUploadProgress(0); setUploadStatus(''); }
  }, [load]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!ngoId) { alert('Please select the NGO for this upload first'); return; }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      alert('Please upload a valid Excel/CSV file'); return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const sourceRows = wb.SheetNames
        .map(sheetName => XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false }))
        .find(sheetRows => sheetRows.length > 0) || [];
      const rows = prepareImportRows(sourceRows);
      if (!rows || rows.length === 0) { alert('File is empty'); return; }
      await runImport(rows, ngoId);
    } catch (err) { alert('Import failed: ' + err.message); }
  }, [ngoId, runImport]);

  const handleNamesFile = useCallback(async (file) => {
    if (!file) return;
    if (!ngoId) { alert('Please select the NGO for this upload first'); return; }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      alert('Please upload a valid Excel/CSV file'); return;
    }
    setNamesImporting(true);
    setNamesResult(null);
    setNamesUploadProgress(0);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const sourceRows = wb.SheetNames
        .map(sheetName => XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false }))
        .find(sheetRows => sheetRows.length > 0) || [];
      const rows = prepareImportRows(sourceRows)
        .map(r => ({ receipt_no: String(r.receipt_no || '').trim(), donor_name: String(r.donor_name || '').trim() }))
        .filter(r => r.receipt_no && r.donor_name);
      if (!rows || rows.length === 0) { alert('No rows with a Receipt No. and a donor name (Receipt Name / Donor Name) found'); return; }

      const chunks = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
      }

      let updated = 0;
      let notFound = 0;
      for (let i = 0; i < chunks.length; i++) {
        setNamesUploadProgress(Math.round((i / chunks.length) * 100));
        const res = await apiPost('/accounts/receipts/names-import', { rows: chunks[i], ngo_id: ngoId }, 300000);
        updated += res.updated || 0;
        notFound += res.notFound || 0;
        setNamesUploadProgress(Math.round(((i + 1) / chunks.length) * 100));
      }
      setNamesResult({ message: `${updated} receipt${updated === 1 ? '' : 's'} updated${notFound > 0 ? `, ${notFound} receipt no. not found` : ''}` });
      load();
    } catch (err) { alert('Update failed: ' + err.message); }
    finally { setNamesImporting(false); setNamesUploadProgress(0); }
  }, [ngoId, load]);

  const handleCleanUp = async () => {
    setShowCleanModal(false);
    setDeleting(true);
    setDeleteStatus('Finding receipts...');
    setDeleteProgress(0);
    try {
      const { count: total } = await apiGet('/accounts/receipts/count');
      if (total === 0) {
        setDeleteStatus('No receipts to delete');
        setTimeout(() => { setDeleting(false); setDeleteStatus(''); }, 800);
        return;
      }
      let deleted = 0;
      let isFirst = true;
      const BATCH = 1000;
      while (true) {
        const res = await apiDelete(`/accounts/receipts?batch=${BATCH}${isFirst ? '&reverse=1' : ''}`);
        isFirst = false;
        if (!res.deleted || res.deleted === 0) break;
        deleted += res.deleted;
        const pct = Math.round((Math.min(deleted, total) / total) * 100);
        setDeleteProgress(pct);
        setDeleteStatus(`Deleting ${Math.min(deleted, total)} of ${total} receipts...`);
      }
      setDeleteStatus(`Deleted ${total} receipts`);
      setTimeout(() => { setDeleting(false); setDeleteStatus(''); setDeleteProgress(0); }, 1500);
      load();
    } catch (err) { alert('Clean up failed: ' + err.message); setDeleting(false); setDeleteStatus(''); setDeleteProgress(0); }
  };

  const handleCleanUpDate = async () => {
    if (!cleanFrom) { alert('Please choose a date to delete'); return; }
    const from = cleanFrom;
    const to = cleanTo || cleanFrom;
    if (to < from) { alert('"To" date must be on or after the "From" date'); return; }
    if (!window.confirm(`Delete all receipts from ${from}${to !== from ? ` to ${to}` : ''}? This cannot be undone.`)) return;
    setShowCleanModal(false);
    setDeleting(true);
    setDeleteStatus('Deleting receipts...');
    setDeleteProgress(0);
    try {
      const res = await apiDelete(`/accounts/receipts?from=${from}${to !== from ? `&to=${to}` : ''}`);
      const done = res?.deleted || 0;
      setDeleteProgress(100);
      setDeleteStatus(done > 0 ? `Deleted ${done} receipt${done !== 1 ? 's' : ''}` : 'No receipts found on this date');
      setTimeout(() => { setDeleting(false); setDeleteStatus(''); setDeleteProgress(0); }, 1500);
      load();
    } catch (err) { alert('Clean up failed: ' + err.message); setDeleting(false); setDeleteStatus(''); setDeleteProgress(0); }
  };

  useEffect(() => { setPage(1); }, [searchQuery, period, fromDate, toDate, receiptNgo, suspenseMode, filterMonth, filterYear]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const h = () => load();
    window.addEventListener('ucs:receipts-refresh', h);
    return () => window.removeEventListener('ucs:receipts-refresh', h);
  }, [load]);

  useEffect(() => {
    apiGet('/accounts/ngos').then(setNgoOptions).catch(() => {});
  }, []);

  const uniqueDonors = useMemo(() => {
    const seen = new Set();
    return receipts.filter(r => {
      const mobile = (r.donor_mobile || '').replace(/\D/g, '');
      if (!mobile) return true;
      if (seen.has(mobile)) return false;
      seen.add(mobile);
      return true;
    });
  }, [receipts]);

  const totalPages = Math.ceil(total / 100) || 1;

  const donorMap = useMemo(() => {
    const map = {};
    receipts.forEach(d => {
      const mobile = (d.donor_mobile || '').replace(/\D/g, '');
      const key = mobile || (d.donor_name || '').toLowerCase().trim();
      if (!map[key]) map[key] = { receipts: [], count: 0, total: 0 };
      map[key].receipts.push(d);
      map[key].count++;
      map[key].total += Number(d.amount || 0);
    });
    return map;
  }, [receipts]);

  const handlePreview = async (r) => {
    if (donorDetail) setSavedDetail(donorDetail);
    setDonorDetail(null);
    const templateId = getTemplateId(r.project_id);
    const Comp = TEMPLATES[templateId];
    if (!Comp) return;
    setPreview({ receipt: r, templateId, Comp, lead: null });
  };

  const handleDownload = async () => {
    if (!preview) return;
    setDownloading(true);
    try {
      const el = document.querySelector('[data-receipt-preview]');
      if (!el) return;
      const pdf = await generateReceiptPDF(el);
      pdf.save(`receipt_${preview.receipt.receipt_no.replace(/[/\\]/g, '_')}.pdf`);
    } catch (err) { alert('Failed to generate PDF: ' + err.message); }
    finally { setDownloading(false); }
  };

  const handleWhatsApp = async () => {
    if (!preview) return;
    const phone = (preview.receipt.donor_mobile || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) { alert('No valid mobile number for this receipt'); return; }
    const formatted = phone.length === 10 ? '91' + phone : phone.startsWith('0') ? '91' + phone.slice(1) : phone;
    setWaLoading(true);
    setWaResult(null);
    try {
      const el = document.querySelector('[data-receipt-preview]');
      let pdfBase64 = null;
      if (el) {
        const pdf = await generateReceiptPDF(el, { scale: 1, jpegQuality: 0.7 });
        pdfBase64 = pdf.output('datauristring').split(',')[1];
      }
      await apiPost('/whatsapp/send-direct', {
        to: formatted,
        pdfBase64,
        receiptNo: preview.receipt.receipt_no,
        donorName: preview.receipt.donor_name,
        amount: preview.receipt.amount,
        project: preview.receipt.project_id,
      });
      try { await apiPost('/accounts/receipts/mark-sent', { receiptId: preview.receipt.id }) } catch (e) { console.error('Error:', e.message); }
      setWaResult({ success: true, message: 'Receipt sent via WhatsApp!' });
    } catch (err) {
      setWaResult({ success: false, message: 'Failed: ' + err.message });
    } finally { setWaLoading(false); }
  };

  const closePreview = () => {
    setPreview(null);
    if (savedDetail) { setDonorDetail(savedDetail); setSavedDetail(null); }
  };

  const buildFilterParams = (extra = {}) => {
    const p = new URLSearchParams();
    if (searchQuery.trim()) p.set('search', searchQuery.trim());
    if (receiptNgo) p.set('project', receiptNgo);
    if (suspenseMode) p.set('suspense', '1');
    if (filterMonth && filterYear) {
      p.set('filter_month', String(filterMonth));
      p.set('filter_year', String(filterYear));
    } else if (period === 'custom') {
      if (fromDate) p.set('from_date', fromDate);
      if (toDate) p.set('to_date', toDate);
    } else if (period && period !== 'all') {
      p.set('period', period);
    }
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  };

  const fetchAllFiltered = async () => {
    const all = [];
    let page = 1;
    for (;;) {
      const p = buildFilterParams({ page: String(page), limit: '100' });
      const res = await apiGet(`/accounts/receipts?${p.toString()}`);
      const data = res?.data || [];
      all.push(...data);
      const total = Number(res?.total) || 0;
      if (all.length >= total || data.length === 0 || page >= 200) break;
      page++;
    }
    return all;
  };

  const handleDownloadReceipts = async () => {
    setTodayDownloading(true);
    try {
      const all = await fetchAllFiltered();
      if (all.length === 0) { alert('No receipts match the current filter'); setTodayDownloading(false); return; }
      setHistoryForDownload(all);
    } catch (err) {
      alert('Failed to fetch: ' + err.message);
      setTodayDownloading(false);
    }
  };

  const handleDownloadExcel = async () => {
    setExcelDownloading(true);
    try {
      const all = await fetchAllFiltered();
      if (!all.length) { alert('No receipts to export'); return; }
      const toRow = r => ({
        'Team Name': '',
        'Transaction Date': r.receipt_date || '',
        'Caller Name': '',
        'Receipt Name': r.donor_name || '',
        'Mobile no.': r.donor_mobile || '',
        'Len': '',
        'Count': '',
        'Mobil No. 2 / Tel ': '',
        'Address-1 ': r.address || '',
        'Address-2 ': '',
        'Station': '',
        'East / West': '',
        'City': '',
        'Pin Code': '',
        'Pan. No. ': r.pan_number || '',
        'Mail Id ': r.email || '',
        'Birth Date': '',
        'Data Cat': '',
        'Mobile': '',
        'Android No': '',
        'Team': '',
        'Agent Name': r.agent_name || '',
        'FSE Name': r.agent_name || '',
        'MOP': r.mode || '',
        'Received Bank': r.bank_name || '',
        'Payment ID No. ': r.payment_id || '',
        'Donors Bank Name': r.bank_payer_name || '',
        'Amt': r.amount || 0,
        'Receipt No.': r.receipt_no || '',
        'Receipt Book No': '',
        'Receipt Date ': r.receipt_date || '',
        'Time': r.receipt_time || '',
        'Project Supported': r.project_id || '',
        'Account of': 'Corpus',
        'State': '',
        'Branch': '',
      });
      const buildSheet = rows => XLSX.utils.aoa_to_sheet([EXCEL_HEADER, ...rows.map(row => EXCEL_HEADER.map(h => row[h] ?? ''))]);
      const wb = XLSX.utils.book_new();
      const groups = {
        beingsevak: all.filter(r => r.project_id === 'bsct'),
        ashray: all.filter(r => r.project_id === 'aflf'),
        manncare: all.filter(r => r.project_id === 'mann'),
      };
      XLSX.utils.book_append_sheet(wb, buildSheet(groups.beingsevak.map(toRow)), 'BeingSevak');
      XLSX.utils.book_append_sheet(wb, buildSheet(groups.ashray.map(toRow)), 'Ashray');
      XLSX.utils.book_append_sheet(wb, buildSheet(groups.manncare.map(toRow)), 'MannCare');
      XLSX.writeFile(wb, `receipts_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExcelDownloading(false);
    }
  };

  useEffect(() => {
    if (!historyForDownload || historyForDownload.length === 0) return;
    let cancelled = false;
    (async () => {
      const ngoFolder = { bsct:'BeingSevak', mann:'MannCare', aflf:'Ashray' };
      const zip = new JSZip();
      const total = historyForDownload.length;
      setDlWindow(0);

      const processBatch = async (start) => {
        await new Promise(res => setTimeout(res, 60));
        const els = document.querySelectorAll('[data-dl-history]');
        const map = {};
        els.forEach(el => map[Number(el.getAttribute('data-dl-idx'))] = el);
        const batch = [];
        for (let i = start; i < Math.min(start + DL_BATCH, total); i++) {
          const el = map[i];
          if (!el) continue;
          const r = historyForDownload[i];
          const ngo = r.project_id || 'bsct';
          const donorName = String(r.donor_name || 'Donor').replace(/[<>:"/\\|?*]/g, '_').trim();
          const receiptNo = r.receipt_no || 'NA';
          const filename = ngo === 'mann'
            ? `MannCare_${receiptNo}.pdf`
            : `${ngoFolder[ngo]}_Receipt_${receiptNo}_${donorName}.pdf`;
          batch.push({ el, ngo, filename });
        }
        await Promise.all(batch.map(async ({ el, ngo, filename }) => {
          try {
            const pdf = await generateReceiptPDF(el);
            zip.folder(ngoFolder[ngo] || 'Other').file(filename, pdf.output('arraybuffer'));
          } catch (e) { console.error('PDF gen failed:', e.message); }
        }));
      };

      for (let start = 0; start < total && !cancelled; start += DL_BATCH) {
        setDlWindow(start);
        await processBatch(start);
      }

      if (!cancelled) {
        setDlWindow(0);
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `Receipts_${new Date().toISOString().slice(0,10)}.zip`);
        alert(`Downloaded ${total} receipts`);
      }
      setHistoryForDownload(null);
      setTodayDownloading(false);
    })();
    return () => { cancelled = true };
  }, [historyForDownload]);

  return (
    <div>
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Receipt History</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--ink-soft)' }}>{total} total receipts</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleDownloadExcel}
              disabled={excelDownloading}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: excelDownloading ? 0.6 : 1,
              }}>
              <FileSpreadsheet size={14} strokeWidth={2.5} />
              {excelDownloading ? 'Exporting...' : 'Download Excel'}
            </button>
            <button
              onClick={handleDownloadReceipts}
              disabled={todayDownloading}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', background: '#5B6B4E', color: '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: todayDownloading ? 0.6 : 1,
              }}>
              <Download size={14} strokeWidth={2.5} />
              {todayDownloading ? 'Zipping...' : 'Download Receipts'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => { setSuspenseMode(s => !s); setPage(1) }}
            style={{ background: suspenseMode ? '#dc2626' : '#f3f4f6', color: suspenseMode ? '#fff' : '#374151', border: 'none', fontWeight: 600, borderRadius: 6 }}>
            Suspense
          </button>
          <span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
          <select value={filterMonth} onChange={e => { setFilterMonth(Number(e.target.value)); setPeriod('all'); setPage(1) }}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
            <option value={0}>All Months</option>
            {[{ v: 1, l: 'Jan' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Apr' }, { v: 5, l: 'May' }, { v: 6, l: 'Jun' },
              { v: 7, l: 'Jul' }, { v: 8, l: 'Aug' }, { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' }].map(m => (
              <option key={m.v} value={m.v}>{m.l}</option>
            ))}
          </select>
          <select value={filterYear} onChange={e => { setFilterYear(Number(e.target.value)); setPeriod('all'); setPage(1) }}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
            <option value={0}>All Years</option>
            {[2026, 2025, 2024, 2023, 2022].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
          {[{ k: 'all', l: 'All' }, { k: 'today', l: 'Today' }, { k: 'yesterday', l: 'Yesterday' }, { k: 'week', l: 'This Week' }, { k: 'month', l: 'This Month' }, { k: 'year', l: 'This Year' }, { k: 'custom', l: 'Custom' }].map(f => (
            <button key={f.k} className={`btn btn-sm${period === f.k ? ' btn-primary' : ''}`}
              onClick={() => { setPeriod(f.k); setFilterMonth(0); setFilterYear(0); setPage(1) }}>
              {f.l}
            </button>
          ))}
          {period === 'custom' && (<>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>to</span>
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }} />
          </>)}
          <select value={receiptNgo} onChange={e => { setReceiptNgo(e.target.value); setPage(1) }}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
            <option value="">All NGOs</option>
            <option value="bsct">Being Sevak</option>
            <option value="mann">Mann Care</option>
            <option value="aflf">Ashray</option>
          </select>
          <input
            className="search-input"
            placeholder="Search by receipt no, donor name, or mobile..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: 200, maxWidth: 300 }}
          />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginLeft: 'auto' }}>{total} receipts</span>
        </div>
        <div className="table-wrap">
          <table className="donors-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Donor Name</th>
                <th>Receipt No.</th>
                <th>NGO</th>
                <th>Date</th>
                <th>Time</th>
                <th>Amount</th>
                <th>No. of Donations</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="sk" style={{ width: '55%', height: 12, borderRadius: 3 }} /></td>
                    <td><div className="sk" style={{ width: 55, height: 12, borderRadius: 3 }} /></td>
                    <td><div className="sk" style={{ width: '45%', height: 12, borderRadius: 3 }} /></td>
                    <td><div className="sk" style={{ width: 60, height: 12, borderRadius: 3 }} /></td>
                    <td><div className="sk" style={{ width: 45, height: 12, borderRadius: 3 }} /></td>
                    <td><div className="sk" style={{ width: 55, height: 12, borderRadius: 3 }} /></td>
                    <td><div className="sk" style={{ width: 40, height: 12, borderRadius: 3 }} /></td>
                  </tr>
                ))
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>
                    {searchQuery ? 'No receipts match your search.' : 'No receipts found for this period.'}
                  </td>
                </tr>
              ) : (
                receipts.map((r, i) => {
                  const rMobileClean = (r.donor_mobile || '').replace(/\D/g, '');
                  const key = rMobileClean || (r.donor_name || '').toLowerCase().trim();
                  const info = donorMap[key] || { count: 1, total: 0 };
                  const dateStr = r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';
                  return (
                    <tr key={r.id || i} className="clickable-row" onClick={() => {
                      setDonorDetail({ name: r.donor_name, mobile: rMobileClean.length >= 10 ? rMobileClean : r.donor_mobile, receipts: [r] });
                    }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{(r.donor_name || '?')[0].toUpperCase()}</div>
                          <strong>{r.donor_name || '\u2014'}</strong>
                        </div>
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.receipt_no || '\u2014'}</td>
                      <td style={{ fontSize: 12 }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6' }}>{PROJECT_LABELS[r.project_id] || r.project_id || '\u2014'}</span></td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{dateStr}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime12(r.receipt_time) || '\u2014'}</td>
                      <td style={{ fontSize: 12, fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>{currency(r.amount)}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{info.count}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {!loading && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 5, background: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
                &larr; Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Page {page} of {totalPages} ({total} receipts)</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 5, background: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
                Next &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      {historyForDownload && historyForDownload.slice(dlWindow, dlWindow + DL_BATCH).map((r, i) => {
        const ngo = r.project_id || 'bsct';
        const Comp = TEMPLATES[getTemplateId(ngo)];
        const idx = dlWindow + i;
        return <div key={idx} data-dl-history data-dl-idx={idx} style={{ position:'fixed', left:'-9999px', top:0, width:'1000px', opacity:0, pointerEvents:'none' }}><Comp donor={buildDonor(r, null)} project={getTemplateId(ngo)} /></div>;
      })}

      {preview && (
        <>
          <div className="modal-overlay" onClick={closePreview} />
          <div className="modal" style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3>Receipt — {preview.receipt.receipt_no}</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {waResult && (
                  <span style={{ fontSize: 11, color: waResult.success ? '#059669' : '#dc2626', marginRight: 4, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {waResult.message}
                  </span>
                )}
                <button onClick={handleDownload} disabled={downloading} title="Download PDF"
                  style={{ border: 'none', background: '#e5e7eb', color: '#374151', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {downloading ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="30 10" transform="rotate(0 12 12)"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  )}
                </button>
                <button onClick={handleWhatsApp} disabled={waLoading} title="Send via WhatsApp"
                  style={{ border: 'none', background: '#e5e7eb', color: '#374151', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {waLoading ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="30 10" transform="rotate(0 12 12)"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.077 4.928C17.191 3.041 14.683 2 12.006 2 6.798 2 2.548 6.193 2.54 11.4c-.003 2.06.537 4.074 1.563 5.86L2.99 21.273 7.97 19.36a9.426 9.426 0 0 0 4.024.96h.004c5.2 0 9.46-4.192 9.468-9.4a9.37 9.37 0 0 0-2.389-5.993ZM17.38 14.48c-.29 1.063-1.66 1.946-2.736 2.06-.569.06-1.282.107-2.084-.228-1.213-.508-2.695-1.837-4.07-3.307-1.26-1.346-2.05-2.5-2.324-3.388-.258-.84.082-1.955.44-2.465.469-.667.985-.672 1.33-.672.152 0 .294.007.418.013.354.017.53.036.767.6.14.333.477 1.164.52 1.248.066.13.11.282.033.456-.077.174-.116.282-.232.447-.116.165-.174.276-.348.445-.116.116-.237.242-.102.476.135.233.602.994 1.292 1.607.888.79 1.636 1.036 1.87 1.152.233.116.37.097.506-.058.136-.155.586-.682.742-.916.156-.233.312-.194.527-.116.215.077 1.362.672 1.596.794.234.122.39.182.448.283.058.101.058.587-.137 1.153-.195.566-1.076 1.085-1.076 1.085Z"/></svg>
                  )}
                </button>
                <button onClick={closePreview} title="Close"
                  style={{ border: 'none', background: '#e5e7eb', color: '#374151', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div data-receipt-preview data-receipt-print>
                {React.createElement(preview.Comp, { donor: buildDonor(preview.receipt, preview.lead), index: 0, project: preview.templateId })}
              </div>
            </div>
          </div>
        </>
      )}

      {donorDetail && (
        <>
          <div className="modal-overlay" onClick={() => setDonorDetail(null)} />
          <div className="modal" style={{ maxWidth: 500, width: '90%', maxHeight: '80vh', overflow: 'auto', borderRadius: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #5B6B4E, #7A8F6A)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0, boxShadow: '0 2px 6px rgba(91,107,78,0.25)' }}>
                  {(donorDetail.name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{donorDetail.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{donorDetail.mobile || ''} &middot; <strong>{donorDetail.receipts.length}</strong> receipt{donorDetail.receipts.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <button onClick={() => setDonorDetail(null)} title="Close"
                style={{ border: 'none', background: '#f3f4f6', color: '#6b7280', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}
                onMouseOver={e => e.currentTarget.style.background = '#e5e7eb'}
                onMouseOut={e => e.currentTarget.style.background = '#f3f4f6'}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '6px 0', background: '#fafafa' }}>
              {donorDetail.receipts.map((r, i) => (
                <div key={r.id} onClick={() => { setSavedDetail(donorDetail); setDonorDetail(null); setTimeout(() => handlePreview(r), 50) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', cursor: 'pointer', borderBottom: i < donorDetail.receipts.length - 1 ? '1px solid #f0f0f0' : 'none', transition: 'background .1s' }}
                  onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d1d5db', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#374151' }}>{r.receipt_no}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}{r.receipt_time ? ` · ${fmtTime12(r.receipt_time)}` : ''}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                      {r.mode || ''}{r.project_id ? ` · ${PROJECT_LABELS[r.project_id] || r.project_id}` : ''}
                    </div>
                    {r.bank_payer_name && (
                      <div style={{ fontSize: 10, color: '#a3a3a3', marginTop: 1 }}>Payer: {r.bank_payer_name}</div>
                    )}
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Agent: {r.agent_name || r.fro_donor_logs?.workers?.name || 'Not assigned'}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{currency(r.amount)}</div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ flexShrink: 0, opacity: .6 }}><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: '0 0 14px 14px' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Total receipts</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{currency(donorDetail.receipts.reduce((s, r) => s + Number(r.amount || 0), 0))} <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>({donorDetail.receipts.length})</span></span>
            </div>
          </div>
        </>
      )}

      {showCleanModal && (
        <>
          <div className="modal-overlay" onClick={() => setShowCleanModal(false)} />
          <div className="modal" style={{ maxWidth: 400, width: '90%' }}>
            <div className="modal-header">
              <h3>Delete receipts</h3>
              <button className="btn btn-sm" onClick={() => setShowCleanModal(false)}>Cancel</button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <button
                  onClick={() => setCleanMode('all')}
                  style={{
                    padding: '12px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1.3,
                    border: cleanMode === 'all' ? '2px solid #dc2626' : '1px solid #d1d5db',
                    background: cleanMode === 'all' ? '#fef2f2' : '#fff', color: '#111827',
                  }}>
                  Delete ALL receipts
                </button>
                <button
                  onClick={() => setCleanMode('date')}
                  style={{
                    padding: '12px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1.3,
                    border: cleanMode === 'date' ? '2px solid #dc2626' : '1px solid #d1d5db',
                    background: cleanMode === 'date' ? '#fef2f2' : '#fff', color: '#111827',
                  }}>
                  Delete by date
                </button>
              </div>

              {cleanMode === 'date' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <label style={{ flex: 1, fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                    From
                    <input type="date" value={cleanFrom} onChange={e => setCleanFrom(e.target.value)}
                      style={{ width: '100%', marginTop: 4, padding: '7px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
                  </label>
                  <label style={{ flex: 1, fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                    To
                    <input type="date" value={cleanTo} onChange={e => setCleanTo(e.target.value)}
                      style={{ width: '100%', marginTop: 4, padding: '7px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
                  </label>
                </div>
              )}

              <p style={{ fontSize: 13, color: '#374151', marginBottom: 4, textAlign: 'center' }}>
                {cleanMode === 'all'
                  ? <>This will permanently delete <strong>all {total} receipts</strong>.</>
                  : <>This will permanently delete all receipts between <strong>{cleanFrom || '...'}</strong> and <strong>{cleanTo || cleanFrom || '...'}</strong>.</>}
              </p>
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, textAlign: 'center' }}>Donor donation history (totals, dates, and collected status) for affected donors will also be removed.</p>
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16, textAlign: 'center' }}>This action cannot be undone.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-sm" onClick={() => setShowCleanModal(false)} style={{ padding: '6px 16px' }}>Cancel</button>
                <button className="btn btn-sm" onClick={cleanMode === 'all' ? handleCleanUp : handleCleanUpDate}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '6px 16px' }}>
                  {cleanMode === 'all' ? 'Delete All' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        .donors-table th, .donors-table td { border-right: 1px solid var(--line); }
        .donors-table th:last-child, .donors-table td:last-child { border-right: none; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2000;
          animation: fadeIn .15s ease;
        }
        .modal {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; border-radius: 12px; z-index: 2001; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
          animation: modalIn .2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalIn { from { opacity: 0; transform: translate(-50%, -50%) scale(.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #e5e7eb; }
        .modal-header h3 { margin: 0; font-size: 16px; }
        .modal-body { overflow: auto; max-height: calc(90vh - 70px); }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          [data-receipt-print], [data-receipt-print] * { visibility: visible; }
          .modal-overlay { display: none !important; }
          .modal-header { display: none !important; }
          .modal { position: static !important; transform: none !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; }
          .modal-body { padding: 0 !important; margin: 0 !important; max-height: none !important; overflow: visible !important; display: flex !important; justify-content: center !important; align-items: flex-start !important; }
          [data-receipt-print] { position: relative; width: 100%; margin: -8mm 0 0 !important; padding: 0 !important; display: flex !important; justify-content: center !important; align-items: flex-start !important; overflow: visible !important; }
          [data-receipt-print] [data-receipt-sheet] { margin: 0 auto !important; max-width: none !important; break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          [data-receipt-print] [data-pdf-width="1000"] { zoom: 0.68; }
          [data-receipt-print] [data-pdf-width="900"] { zoom: 0.75; }
          [data-receipt-print] [data-pdf-width="794"] { zoom: 0.85; }
        }
      `}</style>
    </div>
  );
}

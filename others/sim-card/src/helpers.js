export const SIM_STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Replaced', 'Inactive'];

export const SIM_TYPES = ['Prepaid', 'Postpaid'];

export const SIM_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

export const FORM_FIELDS = [
  { key: 'mobile_id', label: 'Mobile ID No.', type: 'text' },
  { key: 'device_model', label: 'Device & Model Name', type: 'text' },
  { key: 'imei', label: 'IMEI No.', type: 'text' },
  { key: 'team', label: 'Team', type: 'text' },
  { key: 'signature', label: 'Signature', type: 'text' },
  { key: 'sim_1', label: 'SIM 1', type: 'text' },
  { key: 'sim_2', label: 'SIM 2', type: 'text' },
  { key: 'sim_3', label: 'SIM 3', type: 'text' },
  { key: 'sim_4', label: 'SIM 4', type: 'text' },
  { key: 'sim_5', label: 'SIM 5', type: 'text' },
  { key: 'sim_6', label: 'SIM 6', type: 'text' },
  { key: 'sim_7', label: 'SIM 7', type: 'text' },
  { key: 'sim_8', label: 'SIM 8', type: 'text' },
];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysLeft(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  const end = new Date(`${expiryDate}T00:00:00`);
  return Math.round((end - today) / 86400000);
}

export function effectiveStatus(card) {
  const base = card.status || 'Active';
  if (base === 'Replaced') return base;
  const dl = card.days_left !== undefined && card.days_left !== null ? card.days_left : daysLeft(card.expiry_date);
  if (dl === null) return 'Inactive';
  if (dl < 1) return 'Expired';
  if (base === 'Inactive') return base;
  if (dl > 30) return 'Active';
  return 'Expiring Soon';
}

export function dayClass(dl) {
  if (dl === null || dl === undefined || Number.isNaN(dl)) return 'days-neutral';
  if (dl > 30) return 'days-good';
  if (dl >= 8) return 'days-warn';
  if (dl >= 1) return 'days-urgent';
  return 'days-expired';
}

export function dayLabel(dl) {
  if (dl === null || dl === undefined || Number.isNaN(dl)) return '—';
  if (dl < 0) return 'Expired';
  if (dl === 0) return 'Today';
  return `${dl} days`;
}

export function pillForStatus(status) {
  const map = {
    Active: 'pill-active',
    'Expiring Soon': 'pill-expiring',
    Expired: 'pill-expired',
    Replaced: 'pill-replaced',
    Inactive: 'pill-inactive',
  };
  return map[status] || 'pill-neutral';
}

export function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  if (!y || !m || !day) return d;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

export const EXPORT_COLUMNS = [
  'Mobile ID No.',
  'Device & Model Name',
  'IMEI No.',
  'Team',
  'Signature',
  'SIM Card Issue Date',
  'Auto Expiry Date',
  'SIM Expiry Days Left',
  'SIM Card Status',
  'SIM 1',
  'SIM 2',
  'SIM 3',
  'SIM 4',
  'SIM 5',
  'SIM 6',
  'SIM 7',
  'SIM 8',
  'SIM Card Replacement Count',
];

function baseRow(c) {
  return [
    c.mobile_id || '',
    c.device_model || '',
    c.imei || '',
    c.team || '',
    c.signature || '',
    c.issue_date || '',
    c.expiry_date || '',
    c.days_left !== undefined && c.days_left !== null ? c.days_left : daysLeft(c.expiry_date),
    effectiveStatus(c),
  ];
}

function usedSimSlots(cards) {
  let max = 0;
  for (const n of SIM_SLOTS) {
    if (cards.some((c) => c[`sim_${n}`])) max = n;
  }
  return max;
}

function buildColumns(maxSlots, includeSlots = true) {
  const cols = ['Mobile ID No.', 'Device & Model Name', 'IMEI No.', 'Team', 'Signature', 'SIM Card Issue Date', 'Auto Expiry Date', 'SIM Expiry Days Left', 'SIM Card Status'];
  if (includeSlots) {
    for (let n = 1; n <= maxSlots; n++) cols.push(`SIM ${n}`);
  }
  cols.push('SIM Card Replacement Count');
  return cols;
}

function buildRow(c, maxSlots) {
  const r = baseRow(c);
  for (let n = 1; n <= maxSlots; n++) r.push(c[`sim_${n}`] || '');
  r.push(c.replacement_count || 0);
  return r;
}

export function toExportRow(c) {
  return buildRow(c, 8);
}


function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function exportToCSV(cards) {
  const maxSlots = usedSimSlots(cards);
  const header = buildColumns(maxSlots);
  const rows = [header, ...cards.map((c) => buildRow(c, maxSlots))];
  const csv = rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  downloadBlob('\ufeff' + csv, `sim-cards-${todayStr()}.csv`, 'text/csv;charset=utf-8;');
}

export function exportToExcel(cards) {
  const maxSlots = usedSimSlots(cards);
  const xml = buildSpreadsheetXml(cards, maxSlots);
  downloadBlob(xml, `sim-cards-${todayStr()}.xls`, 'application/vnd.ms-excel');
}

export function exportSimTemplate() {
  const xml = buildSpreadsheetXml([], 8);
  downloadBlob(xml, `sim-card-template.xls`, 'application/vnd.ms-excel');
  const csv = EXPORT_COLUMNS.join(',');
  downloadBlob('\ufeff' + csv, `sim-card-template.csv`, 'text/csv;charset=utf-8;');
}

function xmlEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSpreadsheetXml(cards, maxSlots) {
  const header = buildColumns(maxSlots);
  const rows = cards.map((c) => buildRow(c, maxSlots));
  const all = [header, ...rows];
  const body = all.map((r) => {
    const cells = r.map((v) => `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`).join('');
    return `<Row>${cells}</Row>`;
  }).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
<Worksheet ss:Name="SIM Cards">
<Table>${body}</Table>
</Worksheet>
</Workbook>`;
}

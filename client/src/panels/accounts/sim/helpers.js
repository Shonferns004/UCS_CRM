export const SIM_STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Replaced', 'Inactive'];

export const SIM_TYPES = ['Prepaid', 'Postpaid'];

export const MAX_SIM_SLOTS = 20;

export const SIM_SLOTS = Array.from({ length: MAX_SIM_SLOTS }, (_, i) => i + 1);

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
  { key: 'sim_9', label: 'SIM 9', type: 'text' },
  { key: 'sim_10', label: 'SIM 10', type: 'text' },
  { key: 'sim_11', label: 'SIM 11', type: 'text' },
  { key: 'sim_12', label: 'SIM 12', type: 'text' },
  { key: 'sim_13', label: 'SIM 13', type: 'text' },
  { key: 'sim_14', label: 'SIM 14', type: 'text' },
  { key: 'sim_15', label: 'SIM 15', type: 'text' },
  { key: 'sim_16', label: 'SIM 16', type: 'text' },
  { key: 'sim_17', label: 'SIM 17', type: 'text' },
  { key: 'sim_18', label: 'SIM 18', type: 'text' },
  { key: 'sim_19', label: 'SIM 19', type: 'text' },
  { key: 'sim_20', label: 'SIM 20', type: 'text' },
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

/* How long a SIM stays valid once it is issued. A SIM handed out on 21-09-2026
   therefore expires on 19-10-2026 (28 days later), and the days-left figure is
   derived from that expiry rather than stored. */
export const SIM_VALIDITY_DAYS = 28;

/* Calendar-day arithmetic, not milliseconds: adding 86400000 drifts by an hour
   across a DST boundary and can land on the wrong day. setDate() keeps the local
   calendar date exact. */
export function addDaysStr(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Auto Expiry Date for a SIM Card Issue Date. Null issue date means the SIM has
   not been issued yet, so there is nothing to count down from. */
export function autoExpiryDate(issueDate, validityDays = SIM_VALIDITY_DAYS) {
  return addDaysStr(issueDate, validityDays);
}

export function effectiveStatus(card) {
  const base = card.status || 'Active';
  if (base === 'Replaced') return base;
  const dl = card.expiry_date ? daysLeft(card.expiry_date) : (card.days_left !== undefined && card.days_left !== null ? card.days_left : null);
  if (dl === null) return base === 'Active' ? 'Active' : 'Inactive';
  if (dl < 0) return 'Expired';
  if (base === 'Inactive') return base;
  if (base === 'Expired') return base;
  if (dl > 5) return 'Active';
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
    Assigned: 'pill-assigned',
    'Expiring Soon': 'pill-expiring',
    Expired: 'pill-expired',
    Replaced: 'pill-replaced',
    Inactive: 'pill-inactive',
    'No Sim': 'pill-inactive',
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

/* The `days_left` column is a snapshot taken when the source sheet was
   imported, so it is already wrong the day after expiry passes - UFRS 1 still
   reported "8 days" long after its expiry date had gone. A real expiry date
   therefore always wins, and the stored value is only a fallback for rows that
   carry no date at all. Dashboard applied this rule inline; this is the shared
   version the list, the Expiring page and the detail drawer all use. */
export function liveDaysLeft(card) {
  if (!card) return null;
  if (card.expiry_date) return daysLeft(card.expiry_date);
  return card.days_left !== undefined && card.days_left !== null ? card.days_left : null;
}

/* Two spellings can describe the same phone: "android 1" is also linked through
   its "android whatsapp 1" card. Every Locker -> card join (table pills, the
   detail drawer, the status verdict) accepts either direction. */
export function sameMobileId(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const wa = x.match(/^android whatsapp\s+(\d+)$/);
  if (wa && `android ${wa[1]}` === y) return true;
  const wb = y.match(/^android whatsapp\s+(\d+)$/);
  return !!wb && `android ${wb[1]}` === x;
}

/* Live expiry verdict for a mobile: Active only while the phone still carries
   at least one SIM that has not run out. When a Locker row sits on the phone it
   decides (it owns its own number's dates and is immune to the stale imported
   days_left snapshot); otherwise the card's own dates decide, which is what
   effectiveStatus already does for a phone with no Locker SIM. A phone whose
   numbers have all run out reads Expired instead of sitting on the stored
   "Active" word forever. Thresholds match effectiveStatus (>5 Active, 0-5
   Expiring Soon) so the Dashboard, the Expiring page and this table agree. */
export function mobileExpiryStatus(card, inventory = []) {
  if (!card) return null;
  const base = card.status || 'Active';
  if (base === 'Replaced') return 'Replaced';

  const rows = inventory || [];
  const assigned = rows.filter((it) => sameMobileId(it?.mobile_id, card.mobile_id));
  const nums = simNumbersOf(card);

  /* A mobile that carries no SIM at all is not "Active" - there is nothing
     that could be active. Neither the Locker nor any card slot holds a number
     for it, so it says so instead. */
  if (!assigned.length && !nums.length) return 'No Sim';

  const dls = [];
  if (assigned.length) {
    assigned.forEach((it) => dls.push(liveDaysLeft(it)));
  } else {
    const byNumber = new Map();
    rows.forEach((row) => {
      const k = String(row?.sim_number || '').trim().toLowerCase();
      if (k && !byNumber.has(k)) byNumber.set(k, row);
    });
    nums.forEach((s) => {
      const inv = byNumber.get(String(s.number).trim().toLowerCase()) || null;
      dls.push(inv ? liveDaysLeft(inv) : liveDaysLeft(card));
    });
  }

  if (dls.every((d) => d === null)) return base === 'Inactive' ? 'Inactive' : 'Active';
  /* Every number has a date in the past - there is no active SIM left. One
     number with an unknown date keeps the phone active: expiry is never
     assumed. */
  if (!dls.some((d) => d === null || d >= 0)) return 'Expired';
  if (base === 'Inactive') return 'Inactive';
  const known = dls.filter((d) => d !== null);
  const soonest = known.length ? Math.min(...known.filter((d) => d >= 0)) : Infinity;
  return soonest <= 5 ? 'Expiring Soon' : 'Active';
}

/* Slot cells keep the placeholder the source spreadsheet used for "no SIM
   here" ('NA', 'NO SIM', ...). Those cells are not numbers and must never
   appear as one. */
const PLACEHOLDER_VALUES = ['', '-', '--', '.', 'NA', 'N/A', 'NOSIM', 'NO SIM', 'NO-SIM', 'NONE', 'NULL', 'NIL'];

export function isPlaceholder(v) {
  return PLACEHOLDER_VALUES.includes(String(v ?? '').trim().toUpperCase());
}

/* Every real number on a mobile, slot by slot, with the NGO name the Android
   rows carry alongside slots 1-4. */
export function simNumbersOf(card) {
  const out = [];
  if (!card) return out;
  SIM_SLOTS.forEach((n) => {
    const number = card[`sim_${n}`];
    if (isPlaceholder(number)) return;
    out.push({
      n,
      number: String(number).trim(),
      ngo: String(card[`w${n}_name`] || '').trim(),
    });
  });
  return out;
}

/* Splits a mobile's numbers into the two lists the detail drawer shows:
   active numbers and expired numbers, each with its own dates.

   Date source per number, best first:
     1. the SIM Locker row (`sim_inventory`) for that exact number - the only
        place individual numbers carry their own issue/expiry dates, and the
        only one immune to a stale card-level expiry;
     2. the mobile's own issue/expiry dates, which is what the schema stores
        per number by default.
   A number the Locker has handed to this phone that never made it into a
   sim_cards slot (the sync warning case) or that sits on the phone's WhatsApp
   twin is added from the Locker's own mobile_id, so the drawer never reports
   "0 active" for a phone that plainly carries one.
   Numbers that left the mobile are recovered from two audit trails so past
   SIMs never disappear: the replacement log (`old_sim` + replacement date)
   and the card's edit history (`changed_cols.sim_N.old` + when it changed).
   Their dates come from their own locker row when that row has an expiry
   that has already passed, otherwise from the day the number left the slot.

   Returns { active, expired, filled } - both lists sorted by slot, expired
   newest first, ready to render. */
export function classifySims({ card, inventory = [], replacements = [], history = [] } = {}) {
  const lockerByNumber = new Map();
  for (const row of inventory) {
    const key = String(row?.sim_number || '').trim().toLowerCase();
    if (key && !lockerByNumber.has(key)) lockerByNumber.set(key, row);
  }

  const active = [];
  const expired = [];
  const current = new Set();

  for (const s of simNumbersOf(card)) {
    current.add(s.number.toLowerCase());
    const inv = lockerByNumber.get(s.number.toLowerCase()) || null;
    const activatedOn = inv?.issue_date || inv?.assignment_date || card?.issue_date || null;
    /* The Locker row owns its own number's dates; the card's dates only speak
       for numbers the Locker has never heard of. Falling back to the card when
       a Locker row exists is what pushed a SIM assigned today into the Expired
       list - the phone's own auto-expiry was long past while the new SIM is
       weeks from expiring. */
    const expiresOn = inv ? (inv.expiry_date || null) : (card?.expiry_date || null);
    const dl = inv ? liveDaysLeft(inv) : liveDaysLeft(card);
    const row = {
      key: `cur-${s.n}-${s.number}`,
      slot: s.n,
      number: s.number,
      ngo: s.ngo,
      activatedOn,
      expiresOn,
      daysLeft: dl,
      note: null,
    };
    if (dl !== null && dl < 0) expired.push(row);
    else active.push(row);
  }

  /* A SIM this Locker handed to the phone belongs on the list even when the
     sim_cards slot write failed (the warning toast case) or when the number
     landed on the phone's WhatsApp twin and this row is the phone's own card.
     Without it the drawer reports "0 active" for a phone that plainly carries
     one. */
  for (const it of inventory) {
    if (!sameMobileId(it?.mobile_id, card?.mobile_id)) continue;
    const num = String(it.sim_number || '').trim();
    const key = num.toLowerCase();
    if (!num || isPlaceholder(num) || current.has(key)) continue;
    current.add(key);
    const dl = liveDaysLeft(it);
    const row = {
      key: `locker-${key}`,
      slot: null,
      number: num,
      ngo: '',
      activatedOn: it.issue_date || it.assignment_date || null,
      expiresOn: it.expiry_date || null,
      daysLeft: dl,
      note: null,
    };
    if (dl !== null && dl < 0) expired.push(row);
    else active.push(row);
  }

  const mobileId = String(card?.mobile_id || '').trim().toLowerCase();
  const seen = new Set(current);

  // One number that has left this mobile. `leftOn` is the day it went away;
  // a locker expiry that has already passed outranks it because that is the
  // date the SIM itself stopped being valid.
  const pastRow = (rawNumber, leftOn, note) => {
    const number = String(rawNumber ?? '').trim();
    const key = number.toLowerCase();
    if (!number || isPlaceholder(number) || key === mobileId || seen.has(key)) return null;
    seen.add(key);
    const inv = lockerByNumber.get(key) || null;
    const invExpiry = inv?.expiry_date || null;
    const invDays = invExpiry ? daysLeft(invExpiry) : null;
    const expiresOn = invDays !== null && invDays < 0 ? invExpiry : (leftOn || invExpiry || null);
    return {
      key: `${note.toLowerCase()}-${key}`,
      slot: null,
      number,
      ngo: '',
      activatedOn: inv?.issue_date || inv?.assignment_date || null,
      expiresOn,
      daysLeft: expiresOn ? daysLeft(expiresOn) : null,
      note,
    };
  };

  // Replacement log first: it carries the richer record (new SIM, reason).
  for (const rep of replacements) {
    const row = pastRow(rep?.old_sim, rep?.replacement_date || null, 'Replaced');
    if (row) expired.push(row);
  }

  // Then the edit trail: every past value of a sim_N slot, newest row first.
  for (const r of history) {
    const cols = r && typeof r.changed_cols === 'object' && r.changed_cols ? r.changed_cols : null;
    if (!cols) continue;
    const leftOn = r.changed_at ? String(r.changed_at).slice(0, 10) : null;
    for (const [slotKey, change] of Object.entries(cols)) {
      if (!/^sim_\d+$/.test(slotKey)) continue;
      const oldV = change && typeof change === 'object' ? change.old : change;
      const row = pastRow(oldV, leftOn, 'Changed');
      if (row) expired.push(row);
    }
  }

  /* Locker-sourced rows carry no slot number, so a plain subtraction would be
     NaN and leave them in whatever order they arrived. */
  active.sort((a, b) => (a.slot ?? 999) - (b.slot ?? 999));
  expired.sort((a, b) => {
    if (a.slot !== b.slot && a.slot !== null && b.slot !== null) return a.slot - b.slot;
    if (a.slot === null && b.slot !== null) return 1;
    if (a.slot !== null && b.slot === null) return -1;
    return String(b.expiresOn || '').localeCompare(String(a.expiresOn || ''));
  });

  return { active, expired, filled: active.length + expired.length };
}

export const EXPORT_COLUMNS = [
  'Mobile ID No.',
  'Device & Model Name',
  'IMEI No.',
  'Sim Card Status',
  'Team',
  'Remark',
  'Sim Card Issue Date',
  'Auto Expiry Date',
  'Sim Expiry Days Left',
  'Sim 1',
  'Sim 2',
  'NGO 1',
  'W1 Number',
  'NGO 2',
  'W2 Number',
  'NGO 3',
  'W3 Number',
  'NGO 4',
  'W4 Number',
  'Sim 3',
  'Sim 4',
  'Sim Card Repla. Count',
];

export const ANDROID_EXPORT_COLUMNS = [
  'Mobile ID No.',
  'GB',
  'Device & Model Name',
  'IMEI No.',
  'Team',
  'NGO',
  'W1 Number',
  'NGO',
  'W2 Number',
  'NGO',
  'W3 Number',
  'NGO',
  'W4 Number',
];

export function androidExportRow(c) {
  return [
    c.mobile_id || '',
    c.gb || '',
    c.device_model || '',
    c.imei || '',
    c.team || '',
    c.w1_name || '',
    c.sim_1 || '',
    c.w2_name || '',
    c.sim_2 || '',
    c.w3_name || '',
    c.sim_3 || '',
    c.w4_name || '',
    c.sim_4 || '',
  ];
}

export const NOKIA_EXPORT_COLUMNS = [
  'Mobile ID No.',
  'Calling Mobile',
  'Device & Model Name',
  'IMEI No.',
  'Sim Card Status',
  'Team',
  'Remark',
  'Sim Card Issue Date',
  'Auto Expiry Date',
  'Sim Expiry Days Left',
  'Sim 1',
  'Sim 2',
  'Sim Card Repla. Count',
];

export function nokiaExportRow(c) {
  return [
    c.mobile_id || '',
    c.calling_mobile || '',
    c.device_model || '',
    c.imei || '',
    c.status || '',
    c.team || '',
    c.remark || '',
    formatDate(c.issue_date),
    formatDate(c.expiry_date),
    c.days_left === null || c.days_left === undefined || Number.isNaN(c.days_left) ? '—' : `${c.days_left} days`,
    c.sim_1 || '',
    c.sim_2 || '',
    c.replacement_count || 0,
  ];
}

function baseRow(c) {
  return [
    c.mobile_id || '',
    c.device_model || '',
    c.imei || '',
    c.status || '',
    c.team || '',
    c.signature || '',
    c.issue_date || '',
    c.expiry_date || '',
    c.days_left !== undefined && c.days_left !== null ? c.days_left : daysLeft(c.expiry_date),
    c.sim_1 || '',
    c.sim_2 || '',
    c.w1_name || '',
    c.sim_1 || '',
    c.w2_name || '',
    c.sim_2 || '',
    c.w3_name || '',
    c.sim_3 || '',
    c.w4_name || '',
    c.sim_4 || '',
    c.sim_3 || '',
    c.sim_4 || '',
    c.replacement_count || 0,
  ];
}

function buildColumns(columns) {
  return columns ? [...columns] : [...EXPORT_COLUMNS];
}

function buildRow(c, row) {
  return row ? row(c) : baseRow(c);
}

export function toExportRow(c) {
  return buildRow(c);
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

export function exportToCSV(cards, columns, row) {
  const header = buildColumns(columns);
  const rows = [header, ...cards.map((c) => buildRow(c, row))];
  const csv = rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  downloadBlob('\ufeff' + csv, `sim-cards-${todayStr()}.csv`, 'text/csv;charset=utf-8;');
}

export function exportToExcel(cards, columns, row) {
  const xml = buildSpreadsheetXml(cards, columns, row);
  downloadBlob(xml, `sim-cards-${todayStr()}.xls`, 'application/vnd.ms-excel');
}

export function exportSimTemplate() {
  const xml = buildSpreadsheetXml([]);
  downloadBlob(xml, `sim-card-template.xls`, 'application/vnd.ms-excel');
  const csv = EXPORT_COLUMNS.join(',');
  downloadBlob('\ufeff' + csv, `sim-card-template.csv`, 'text/csv;charset=utf-8;');
}

function xmlEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSpreadsheetXml(cards, columns, row) {
  const header = buildColumns(columns);
  const rows = cards.map((c) => buildRow(c, row));
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

// ---------------------------------------------------------------------------
// Nokia / Android number history
// ---------------------------------------------------------------------------
// A card is exactly one brand, decided by its Mobile ID, using the same rules
// as the list filters in SimSection.jsx and Inventory.jsx:
//   ufrs...                     -> Nokia
//   "android <n>"               -> Android
//   "android whatsapp <n>"      -> companion row, hidden from every list
export function simBrandOf(mobileId) {
  const id = String(mobileId || '').toLowerCase().trim();
  if (id.startsWith('ufrs')) return 'Nokia';
  if (id.startsWith('android whatsapp')) return '';
  if (id.startsWith('android ')) return 'Android';
  return '';
}

export const SIM_BRAND_FILTERS = ['All', 'Nokia', 'Android'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function historyValue(v) {
  if (v === null || v === undefined || v === '') return 'Blank';
  return String(v);
}

function historyAction(oldV, newV) {
  const oldEmpty = oldV === null || oldV === undefined || String(oldV).trim() === '';
  const newEmpty = newV === null || newV === undefined || String(newV).trim() === '';
  if (oldEmpty && !newEmpty) return 'Added';
  if (!oldEmpty && newEmpty) return 'Removed';
  return 'Updated';
}

function historyTime(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

// Flattens audit rows into one entry per changed SIM slot, newest first.
// Only sim_N columns are kept: this view answers "which number changed", so
// edits to team/status/expiry and friends are intentionally left out.
export function numberHistoryEntries(rows) {
  const out = [];
  for (const r of rows || []) {
    if (!r) continue;
    const cols = r.changed_cols && typeof r.changed_cols === 'object' ? r.changed_cols : null;
    if (!cols) continue;
    const card = r.sim_cards && typeof r.sim_cards === 'object' ? r.sim_cards : {};
    for (const [key, change] of Object.entries(cols)) {
      if (!/^sim_\d+$/.test(key)) continue;
      const oldV = change && typeof change === 'object' ? change.old : change;
      const newV = change && typeof change === 'object' ? change.new : change;
      out.push({
        key: `${r.id}-${key}`,
        changed_at: r.changed_at,
        changed_by: r.changed_by || '',
        mobile_id: card.mobile_id || '',
        device_model: card.device_model || '',
        slot: key.slice(4),
        old: historyValue(oldV),
        new: historyValue(newV),
        action: historyAction(oldV, newV),
      });
    }
  }
  out.sort((a, b) => historyTime(b.changed_at) - historyTime(a.changed_at));
  return out;
}

// Buckets entries into month groups, newest month first. Entries with an
// unreadable changed_at keep their data and collect in a trailing group
// instead of being dropped.
export function groupEntriesByMonth(entries) {
  const groups = new Map();
  for (const e of entries || []) {
    const dt = new Date(e.changed_at);
    const valid = Number.isFinite(dt.getTime());
    const key = valid ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: valid ? `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}` : 'Date unknown',
        entries: [],
      });
    }
    groups.get(key).entries.push(e);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === 'unknown') return 1;
    if (b.key === 'unknown') return -1;
    return b.key.localeCompare(a.key);
  });
}

// The period filter, in one place: the label the chip shows and how far back it
// reaches. Adding an option (2y, ...) is a single line here - the cutoff math
// and the row filter both read from this.
export const HISTORY_PERIODS = [
  { value: '6m', label: '6 Month', months: 6 },
  { value: '12m', label: '1 Year', months: 12 },
  { value: 'all', label: 'All Time', months: null },
];

export function historyPeriod(range) {
  return HISTORY_PERIODS.find((p) => p.value === range) || HISTORY_PERIODS[0];
}

// Period value -> YYYY-MM-DD cutoff, or null for all time.
// The day is clamped to the target month's length: d.setMonth() on the 31st
// would overflow (31 Feb -> 3 Mar) and silently shorten the window by a month.
export function historyRangeFrom(range) {
  const months = historyPeriod(range).months;
  if (!months) return null;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(now.getDate(), lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

const BRAND_ORDER = ['Nokia', 'Android', 'Other'];

// Applies a period option to already-loaded entries. The full history is kept
// in memory and narrowed here, so switching periods costs no request.
export function filterEntriesByRange(entries, range) {
  const from = historyRangeFrom(range);
  if (!from) return entries || [];
  const cutoff = new Date(`${from}T00:00:00`).getTime();
  if (!Number.isFinite(cutoff)) return entries || [];
  return (entries || []).filter((e) => {
    const t = new Date(e.changed_at).getTime();
    return !Number.isFinite(t) || t >= cutoff;
  });
}

// Splits entries into one section per brand, each holding its own month groups,
// so a Nokia row can never sit under an Android heading. Brands come out in a
// fixed order; months inside each stay newest first.
export function groupEntriesByBrand(entries, selectedBrand = 'All') {
  const buckets = new Map();
  for (const e of entries || []) {
    const of = simBrandOf(e.mobile_id) || 'Other';
    if (selectedBrand !== 'All' && of !== selectedBrand) continue;
    if (!buckets.has(of)) buckets.set(of, []);
    buckets.get(of).push(e);
  }
  return [...buckets.entries()]
    .sort((a, b) => {
      const ia = BRAND_ORDER.indexOf(a[0]);
      const ib = BRAND_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([name, list]) => ({
      brand: name,
      key: name,
      label: name,
      total: list.length,
      months: groupEntriesByMonth(list),
    }));
}

// ---------------------------------------------------------------------------
// Which SIM numbers this mobile has carried, and when - the "this Nokia used
// six SIMs in the last seven months" view.
//
// Built from three sources, merged into one list of intervals per number:
//   1. the card's own edit history (changed_cols.sim_N old/new) - the primary
//      trail: a slot changing value closes the old interval and opens a new one;
//   2. the replacement log (old_sim -> new_sim with a replacement_date), which
//      covers replacements whose history write failed;
//   3. the card's current sim_1..sim_20 slots, so a phone with no history at
//      all still shows what it is carrying today.
//
// Each row: { number, slot, from, to, current }. `to === null` means the end
// date is unknown (shown as a dash), `current` marks a number sitting in the
// phone right now (shown as "Current").
export function mobileSimUsage({ history = [], replacements = [], card = null } = {}) {
  const ms = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  };
  const val = (v) => (isPlaceholder(v) ? '' : String(v ?? '').trim());

  // One flat event stream, oldest first, so intervals can be replayed in order.
  const events = [];
  for (const h of history || []) {
    const cols = h && h.changed_cols && typeof h.changed_cols === 'object' ? h.changed_cols : {};
    for (const [key, ch] of Object.entries(cols)) {
      if (!/^sim_\d+$/.test(key)) continue;
      const oldV = val(ch && typeof ch === 'object' ? ch.old : ch);
      const newV = val(ch && typeof ch === 'object' ? ch.new : ch);
      if (!oldV && !newV) continue;
      events.push({ slot: Number(key.slice(4)), oldV, newV, at: h.changed_at });
    }
  }
  for (const r of replacements || []) {
    const oldV = val(r.old_sim);
    const newV = val(r.new_sim);
    if (!oldV && !newV) continue;
    events.push({ slot: null, oldV, newV, at: r.replacement_date || r.created_at || null });
  }
  events.sort((a, b) => (ms(a.at) || 0) - (ms(b.at) || 0));

  const intervals = [];
  const openSlot = new Map(); // slot -> interval index
  const openNum = new Map(); // lowercased number -> interval index

  const open = (slot, number, at) => {
    const iv = { number, slot, from: at || null, to: null, current: false, closed: false };
    intervals.push(iv);
    const i = intervals.length - 1;
    if (slot !== null && slot !== undefined) openSlot.set(slot, i);
    openNum.set(number.toLowerCase(), i);
    return i;
  };
  const end = (i, at) => {
    if (i === null || i === undefined) return;
    const iv = intervals[i];
    if (!iv || iv.closed) return;
    iv.closed = true;
    iv.to = at || null;
    openNum.delete(iv.number.toLowerCase());
  };

  for (const ev of events) {
    if (ev.oldV) {
      if (ev.slot !== null && ev.slot !== undefined) {
        end(openSlot.get(ev.slot), ev.at);
        openSlot.delete(ev.slot);
      } else {
        end(openNum.get(ev.oldV.toLowerCase()), ev.at);
      }
    }
    if (!ev.newV) continue;
    const key = ev.newV.toLowerCase();
    if (ev.slot !== null && ev.slot !== undefined) {
      const cur = openSlot.get(ev.slot);
      if (cur !== null && cur !== undefined && intervals[cur].number.toLowerCase() === key) continue;
      /* The same number can already be open without a slot (the replacement
         log opened it before history caught up) - attach it to this slot
         instead of recording the SIM twice. */
      const linked = openNum.get(key);
      if (linked !== null && linked !== undefined && !intervals[linked].closed) {
        intervals[linked].slot = ev.slot;
        openSlot.set(ev.slot, linked);
        continue;
      }
    } else if (openNum.has(key)) {
      continue;
    }
    open(ev.slot, ev.newV, ev.at);
  }

  // Reconcile with what the card carries right now: history is an audit trail
  // and can be incomplete (imports, failed writes), so the live slots win.
  for (const s of simNumbersOf(card)) {
    const key = s.number.toLowerCase();
    const openIdx = openSlot.get(s.n);
    if (openIdx !== null && openIdx !== undefined && intervals[openIdx].number.toLowerCase() === key) {
      intervals[openIdx].current = true;
      continue;
    }
    if (openIdx !== null && openIdx !== undefined) {
      end(openIdx, null); // that number left the slot at an unknown moment
      openSlot.delete(s.n);
    }
    const already = openNum.get(key);
    if (already !== null && already !== undefined) {
      intervals[already].current = true;
      intervals[already].slot = s.n;
      openSlot.set(s.n, already);
    } else {
      const i = open(s.n, s.number, card?.issue_date || card?.created_at || null);
      intervals[i].current = true;
    }
  }

  const nowT = Date.now();
  const endT = (iv) => (iv.to !== null ? (ms(iv.to) || 0) : iv.current ? nowT : 0);
  return intervals
    .map(({ closed, ...iv }) => iv)
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      const d = endT(b) - endT(a);
      if (d) return d;
      return (ms(b.from) || 0) - (ms(a.from) || 0);
    });
}

// Applies a period option to SIM-usage rows: anything still current or with an
// unknown end stays (it cannot be proved to sit outside the window); a number
// whose last day is older than the cutoff drops out.
export function filterUsageByRange(rows, range) {
  const from = historyRangeFrom(range);
  if (!from) return rows || [];
  const cutoff = new Date(`${from}T00:00:00`).getTime();
  if (!Number.isFinite(cutoff)) return rows || [];
  return (rows || []).filter((r) => {
    if (r.current) return true;
    if (r.to === null || r.to === undefined) return true;
    const t = new Date(r.to).getTime();
    return !Number.isFinite(t) || t >= cutoff;
  });
}

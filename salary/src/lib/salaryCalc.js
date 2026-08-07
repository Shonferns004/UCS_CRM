import * as XLSX_NS from 'xlsx';
const XLSX = XLSX_NS.default || XLSX_NS;

export const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[₹, ]/g, ''));
  return isFinite(n) ? n : 0;
};

export const money = (v) => '₹' + (isFinite(v) ? v : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+-\s+.*$/g, '')
    .replace(/\bleft\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeStatus(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (/^(active|working|yes|in\s*service)$/.test(s)) return 'active';
  if (/^(inactive|not\s*working|left|resigned|deactivated|terminated|no)$/.test(s)) return 'inactive';
  if (/^abscond/.test(s)) return 'absconded';
  return s;
}

export const STATUS_ORDER = { active: 0, inactive: 1, absconded: 2 };

const MONTH_WORDS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AKI_RANGES = {
  Sunday: [
    { min: 3750, max: 6999, incentive: 200 },
    { min: 7000, max: 11999, incentive: 400 },
    { min: 12000, max: 13749, incentive: 800 },
    { min: 13750, max: 18999, incentive: 1100 },
    { min: 19000, max: Infinity, incentive: 1500 },
  ],
  Monday: [
    { min: 3000, max: 5999, incentive: 180 },
    { min: 6000, max: 8999, incentive: 360 },
    { min: 9000, max: 11999, incentive: 540 },
    { min: 12000, max: 13999, incentive: 720 },
    { min: 14000, max: Infinity, incentive: 900 },
  ],
  Tuesday: [
    { min: 2500, max: 7999, incentive: 100 },
    { min: 8000, max: 12499, incentive: 400 },
    { min: 12500, max: 15999, incentive: 700 },
    { min: 16000, max: Infinity, incentive: 1100 },
  ],
  Wednesday: [
    { min: 3000, max: 5499, incentive: 250 },
    { min: 5500, max: 7499, incentive: 300 },
    { min: 7500, max: 10499, incentive: 450 },
    { min: 10500, max: 12499, incentive: 610 },
    { min: 12500, max: Infinity, incentive: 750 },
  ],
  Thursday: [
    { min: 3750, max: 6999, incentive: 200 },
    { min: 7000, max: 11999, incentive: 400 },
    { min: 12000, max: 13749, incentive: 800 },
    { min: 13750, max: 18999, incentive: 1100 },
    { min: 19000, max: Infinity, incentive: 1500 },
  ],
  Friday: [
    { min: 3000, max: 5999, incentive: 180 },
    { min: 6000, max: 8999, incentive: 360 },
    { min: 9000, max: 11999, incentive: 540 },
    { min: 12000, max: 13999, incentive: 720 },
    { min: 14000, max: Infinity, incentive: 900 },
  ],
  Saturday: [
    { min: 2500, max: 3999, incentive: 100 },
    { min: 4000, max: 7999, incentive: 200 },
    { min: 8000, max: 12499, incentive: 400 },
    { min: 12500, max: 15999, incentive: 700 },
    { min: 16000, max: Infinity, incentive: 1100 },
  ],
};

function getDayNameFromDateParts({ y, m, d }) {
  return DAY_NAMES[new Date(y, m, d).getDay()];
}

export function calculateAKI(amount, dayName) {
  const ranges = AKI_RANGES[dayName];
  if (!ranges) return 0;
  const range = ranges.find(r => amount >= r.min && amount <= r.max);
  return range ? range.incentive : 0;
}

function parseAnyDateValue(raw) {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return new Date(d.y, d.m - 1, d.d);
    return null;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return new Date(y, +m[2] - 1, +m[1]);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDoj(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
    return '';
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.getFullYear() + '-' + String(raw.getMonth() + 1).padStart(2, '0') + '-' + String(raw.getDate()).padStart(2, '0');
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return s.slice(0, 10);
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return y + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
  }
  return '';
}

export function getMonthsEmployedFromDate(joinDate, refDate = new Date()) {
  if (!(joinDate instanceof Date) || isNaN(joinDate.getTime())) return null;
  const months = (refDate.getFullYear() - joinDate.getFullYear()) * 12 + (refDate.getMonth() - joinDate.getMonth());
  const isAfterJoinDay = refDate.getDate() >= joinDate.getDate();
  return isAfterJoinDay ? months + 1 : months;
}

const HEADER_PATTERNS = {
  agent: [/^agent\s*name$/i, /^employee\s*name$/i, /^name$/i],
  salary: [/^salary$/i, /base\s*salary/i],
  target: [/^target$/i, /new\s*target/i, /monthly\s*target/i],
  achieved: [/^achieved$/i, /total\s*bsct.*achieved/i, /bsct\s*achieved/i, /total\s*bsct/i],
  totalAchieved: [/total\s*bsct.*(?:aflf|mann).*achieved/i, /total\s*bsct.*achieved/i],
  doj: [/date\s*of\s*joining/i, /^doj$/i],
  status: [/^status$/i, /employee\s*status/i, /^(active|inactive|absconded|working)\b/i],
  present: [/present\s*days/i],
  netPresent: [/^net\b.*present\s*days/i, /^net\b.*present\b/i],
  training: [/training\b.*deduction/i, /training\s*and\s*sunday/i],
  sundayAdd: [/sunday\s*need\s*to\s*add/i, /sunday\s*add/i],
  monthSalary: [/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\b.*salary/i, /gross\s*salary/i],
  monthly10: [/monthly\s*10%/i, /10%\s*incentive/i],
  aajKa: [/aaj\s*ka\s*incentive/i],
  weekly: [/weekly\s*incentive/i],
  gross: [/gross\s*payable/i],
  otExtra: [/^ot\b/i, /appreciation/i, /extra\s*incentive/i, /ot\/appreciation/i],
  pending: [/pending\s*expenses/i, /pending\s*salary/i, /pending\s*paid/i, /any\s*pending/i],
  advance: [/advance/i],
  netPayable: [/net\s*payable/i],
};

function normText(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function scoreCell(value, patterns) {
  const text = normText(value);
  if (!text) return -1;
  for (const pattern of patterns) {
    if (pattern.test(text)) return 1;
  }
  return -1;
}

function findHeaderRow(ws) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  const maxRow = Math.min(range.e.r, 6);
  let bestRow = 0;
  let bestScore = -1;
  for (let r = 0; r <= maxRow; r++) {
    let score = 0;
    for (const key of ['agent', 'salary', 'present', 'netPresent', 'training', 'sundayAdd', 'monthSalary']) {
      for (let c = 0; c <= Math.min(range.e.c, 100); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (scoreCell(cell && cell.v, HEADER_PATTERNS[key]) > 0) {
          score++;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

function detectHeader(headers) {
  const h = headers.map(normText);
  const find = (re) => h.findIndex(c => re.test(c));
  const findAny = (patterns) => {
    for (const re of patterns) {
      const idx = find(re);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const cols = {
    agent: find(HEADER_PATTERNS.agent[0]) !== -1 ? find(HEADER_PATTERNS.agent[0]) : (find(HEADER_PATTERNS.agent[1]) !== -1 ? find(HEADER_PATTERNS.agent[1]) : find(HEADER_PATTERNS.agent[2])),
    salary: find(HEADER_PATTERNS.salary[0]) !== -1 ? find(HEADER_PATTERNS.salary[0]) : find(HEADER_PATTERNS.salary[1]),
    target: find(HEADER_PATTERNS.target[0]) !== -1 ? find(HEADER_PATTERNS.target[0]) : (find(HEADER_PATTERNS.target[1]) !== -1 ? find(HEADER_PATTERNS.target[1]) : find(HEADER_PATTERNS.target[2])),
    achieved: find(HEADER_PATTERNS.achieved[0]) !== -1 ? find(HEADER_PATTERNS.achieved[0]) : (find(HEADER_PATTERNS.achieved[1]) !== -1 ? find(HEADER_PATTERNS.achieved[1]) : (find(HEADER_PATTERNS.achieved[2]) !== -1 ? find(HEADER_PATTERNS.achieved[2]) : find(HEADER_PATTERNS.achieved[3]))),
    totalAchieved: find(HEADER_PATTERNS.totalAchieved[0]) !== -1 ? find(HEADER_PATTERNS.totalAchieved[0]) : find(HEADER_PATTERNS.totalAchieved[1]),
    doj: find(HEADER_PATTERNS.doj[0]) !== -1 ? find(HEADER_PATTERNS.doj[0]) : find(HEADER_PATTERNS.doj[1]),
    status: findAny(HEADER_PATTERNS.status),
    present: find(HEADER_PATTERNS.present[0]),
    netPresent: find(HEADER_PATTERNS.netPresent[0]) !== -1 ? find(HEADER_PATTERNS.netPresent[0]) : find(HEADER_PATTERNS.netPresent[1]),
    training: find(HEADER_PATTERNS.training[0]) !== -1 ? find(HEADER_PATTERNS.training[0]) : find(HEADER_PATTERNS.training[1]),
    sundayAdd: find(HEADER_PATTERNS.sundayAdd[0]) !== -1 ? find(HEADER_PATTERNS.sundayAdd[0]) : find(HEADER_PATTERNS.sundayAdd[1]),
    monthSalary: find(HEADER_PATTERNS.monthSalary[0]) !== -1 ? find(HEADER_PATTERNS.monthSalary[0]) : find(HEADER_PATTERNS.monthSalary[1]),
    monthly10: find(HEADER_PATTERNS.monthly10[0]) !== -1 ? find(HEADER_PATTERNS.monthly10[0]) : find(HEADER_PATTERNS.monthly10[1]),
    aajKa: find(HEADER_PATTERNS.aajKa[0]),
    weekly: find(HEADER_PATTERNS.weekly[0]),
    gross: find(HEADER_PATTERNS.gross[0]),
    otExtra: find(HEADER_PATTERNS.otExtra[0]),
    pending: findAny(HEADER_PATTERNS.pending),
    advance: find(HEADER_PATTERNS.advance[0]),
    netPayable: find(HEADER_PATTERNS.netPayable[0]),
  };
  cols.hasPayroll = cols.agent !== -1 && cols.salary !== -1;
  return cols;
}

function parseHeaderDate(raw) {
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return { y: d.y, m: d.m - 1, d: d.d };
  } else if (raw instanceof Date) {
    return { y: raw.getUTCFullYear(), m: raw.getUTCMonth(), d: raw.getUTCDate() };
  }
  const s = String(raw == null ? '' : raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
  if (m && MONTH_WORDS[m[2].toLowerCase()] !== undefined) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return { y, m: MONTH_WORDS[m[2].toLowerCase()], d: +m[1] };
  }
  m = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*'?(\d{2,4})$/i);
  if (m && MONTH_WORDS[m[1].toLowerCase()] !== undefined) {
    let y = +m[2];
    if (y < 100) y += 2000;
    return { y, m: MONTH_WORDS[m[1].toLowerCase()] };
  }
  return null;
}

function daysInMonthFromHeaders(headers) {
  for (const raw of headers) {
    const d = parseHeaderDate(raw);
    if (d) return new Date(Date.UTC(d.y, d.m + 1, 0)).getUTCDate();
  }
  return null;
}

function parseMonthFromSheetName(name) {
  const m = String(name).match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\.?\s*'?(\d{2,4})/i);
  if (!m) return null;
  const map = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  let y = +m[2];
  if (y < 100) y += 2000;
  const mon = map[m[1].toLowerCase().slice(0,3)];
  if (y && mon) return new Date(Date.UTC(y, mon, 0)).getUTCDate();
  return null;
}

function getDateColumns(headers) {
  const cols = [];
  for (let c = 0; c < headers.length; c++) {
    const date = parseHeaderDate(headers[c]);
    if (date) cols.push({ col: c, ...date });
  }
  return cols;
}

function calculateDailyAki(rowGetter, dateColumns) {
  let total = 0;
  for (const info of dateColumns) {
    const amount = num(rowGetter(info.col));
    if (!amount) continue;
    const dayName = getDayNameFromDateParts(info);
    total += calculateAKI(amount, dayName);
  }
  return total;
}

function isTeamRow(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^UFS\b/i.test(n)) return true;
  return /(^|\b)(total|team|branch)(\b|$)/i.test(n) || /NEHA KHARWAR TEAM/i.test(n) || /incl sir and ma'am lead/i.test(n) || /management total/i.test(n) || /hr total/i.test(n);
}

// Match an Excel name to a DB name. Cascading loose matching so every worker
// in the sheet resolves to a database entry: exact → first+last → first →
// last → token-containment.
function resolveDbEntry(dbMap, name) {
  if (!dbMap) return undefined;
  const n = normalizeName(name);
  if (!n) return undefined;
  if (dbMap[n] !== undefined) return dbMap[n];
  const parts = n.split(' ').filter(Boolean);
  const keys = Object.keys(dbMap);
  if (parts.length >= 2) {
    const firstLast = parts[0] + ' ' + parts[parts.length - 1];
    if (dbMap[firstLast] !== undefined) return dbMap[firstLast];
    for (const k of keys) {
      const kp = k.split(' ').filter(Boolean);
      if (kp.length >= 2 && kp[0] + ' ' + kp[kp.length - 1] === firstLast) return dbMap[k];
    }
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  const byFirst = keys.filter(k => k.split(' ')[0] === first);
  if (byFirst.length === 1) return dbMap[byFirst[0]];
  const byLast = keys.filter(k => {
    const kp = k.split(' ').filter(Boolean);
    return kp[kp.length - 1] === last;
  });
  if (byLast.length === 1) return dbMap[byLast[0]];
  const tokSet = new Set(parts);
  const excelInDb = keys.filter(k => {
    const kp = k.split(' ').filter(Boolean);
    return kp.length > 1 && kp.every(t => tokSet.has(t));
  });
  if (excelInDb.length === 1) return dbMap[excelInDb[0]];
  const dbInExcel = keys.filter(k => {
    const kp = k.split(' ').filter(Boolean);
    return kp.length <= parts.length && parts.every(t => kp.includes(t));
  });
  if (dbInExcel.length === 1) return dbMap[dbInExcel[0]];
  return undefined;
}

function processSheet(wsName, wb, dbPresent) {
  const ws = wb.Sheets[wsName];
  if (!ws || !ws['!ref']) return null;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const maxCol = Math.min(range.e.c, 255);
  const firstRow = findHeaderRow(ws);
  const headers = [];
  for (let c = 0; c <= maxCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: firstRow, c })];
    headers.push(cell && cell.v !== undefined ? cell.v : '');
  }
  const cols = detectHeader(headers);
  if (!cols.hasPayroll) return null;
  const dateColumns = getDateColumns(headers);
  const sheetRef = dateColumns.length ? dateColumns[0] : null;
  const mkey = sheetRef ? sheetRef.y * 12 + sheetRef.m : null;
  const dbMap = mkey !== null ? (dbPresent[mkey] || null) : null;

  const days = daysInMonthFromHeaders(headers) || parseMonthFromSheetName(wsName) || 30;

  const rows = [];
  for (let r = firstRow + 1; r <= range.e.r; r++) {
    const g = (c) => {
      if (c === -1 || c > maxCol) return null;
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      return cell && cell.v !== undefined ? cell.v : null;
    };
    const name = String(g(cols.agent) || '').trim();
    if (isTeamRow(name)) continue;
    const status = normalizeStatus(g(cols.status));
    const salary = num(g(cols.salary));
    if (!salary) continue;

    const target = num(g(cols.target));
    const achieved = num(g(cols.achieved));
    const dbEntry = resolveDbEntry(dbMap, name);
    let joinDate = parseAnyDateValue(g(cols.doj));
    if (dbEntry && typeof dbEntry === 'object' && dbEntry.doj) {
      const dbJoin = parseAnyDateValue(dbEntry.doj);
      if (dbJoin) joinDate = dbJoin;
    }
    const monthsEmployed = getMonthsEmployedFromDate(joinDate, sheetRef ? new Date(sheetRef.y, sheetRef.m + 1, 0) : new Date());
    const isNewJoiner = monthsEmployed !== null ? monthsEmployed <= 3 : false;
    const joinedThisMonth = joinDate && sheetRef
      ? joinDate.getFullYear() === sheetRef.y && joinDate.getMonth() === sheetRef.m
      : false;

    const presentFromDb = dbEntry && typeof dbEntry === 'object' ? dbEntry.days : undefined;
    const present = presentFromDb !== undefined ? presentFromDb : num(g(cols.present));
    const joiningDeduction = presentFromDb !== undefined
      ? (dbEntry.joinDed || 0)
      : (cols.training !== -1 ? num(g(cols.training)) : (joinedThisMonth && isNewJoiner ? 1.5 : 0));
    const lateDeduction = presentFromDb !== undefined ? (dbEntry.lateDed || 0) : 0;
    const dbPresent = present;
    const sundayAdd = num(g(cols.sundayAdd));
    const totalPresentDays = Math.max(0, dbPresent - joiningDeduction - lateDeduction);

    const fmtN = (n) => Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
    const halfPts = (dbEntry && typeof dbEntry === 'object' && dbEntry.half ? dbEntry.half : 0) * 0.5
    const abs = (dbEntry && typeof dbEntry === 'object' ? dbEntry.absent || 0 : 0)
    const leave = (dbEntry && typeof dbEntry === 'object' ? dbEntry.leave || 0 : 0)
    const clubbed = (dbEntry && typeof dbEntry === 'object' ? dbEntry.clubbed || 0 : 0)
    const extraSun = (dbEntry && typeof dbEntry === 'object' ? dbEntry.extra || 0 : 0)
    const sunUnpaid = (dbEntry && typeof dbEntry === 'object' ? dbEntry.sunUnpaid || 0 : 0)
    const workedBack = (dbEntry && typeof dbEntry === 'object' ? dbEntry.workedBack || 0 : 0)
    const avail = (dbEntry && typeof dbEntry === 'object' && dbEntry.available != null) ? dbEntry.available : 0
    const sunReasons = (dbEntry && typeof dbEntry === 'object' && Array.isArray(dbEntry.sunReasons)) ? dbEntry.sunReasons : []
    const fmtDate = (d) => {
      const dt = new Date(String(d).slice(0, 10) + 'T00:00:00Z')
      return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    }
    const sunNet = clubbed + extraSun + sunUnpaid - workedBack
    let explain = null
    let explainNote = null
    let explainTitle = ''
    if (presentFromDb !== undefined) {
      const items = [{ op: '', text: fmtN(avail) + ' avail' }]
      const sub = (val, label) => { if (val > 0) items.push({ op: '-', text: fmtN(val) + ' ' + label }) }
      sub(abs, 'absent')
      sub(leave, 'leave')
      if (sunNet > 0) sub(sunNet, 'sun')
      else if (sunNet < 0) items.push({ op: '+', text: fmtN(-sunNet) + ' sun-back' })
      sub(halfPts, 'half')
      sub(joiningDeduction, 'join')
      sub(lateDeduction, 'late')
      explain = fmtN(totalPresentDays) + ' = ' + items.map((it, i) => (i === 0 ? '' : it.op + ' ') + it.text).join(' ')
      if (sunReasons.length) {
        explainNote = 'Deducted Sunday(s): ' + sunReasons.map(r => `Sun ${fmtDate(r.date)} - ${r.reason}`).join('; ')
      }
      explainTitle = totalPresentDays + ' paid days = ' + avail + ' available - ' + abs + ' absent - ' + leave + ' leave - ' + clubbed + ' clubbed Sun - ' + extraSun + ' extra Sun - ' + sunUnpaid + ' unpaid Sun + ' + workedBack + ' worked-back - ' + fmtN(halfPts) + ' half-day - ' + fmtN(joiningDeduction) + ' joining - ' + fmtN(lateDeduction) + ' late'
      if (explainNote) explainTitle += '\n' + explainNote
    }

    const netPresent = cols.netPresent !== -1 ? num(g(cols.netPresent))
      : present + sundayAdd;
    const perDay = salary / days;
    const calcSalary = perDay * totalPresentDays;

    const rawTotalAki = dateColumns.length ? calculateDailyAki(g, dateColumns) : num(g(cols.aajKa));
    const monthlyTargetMet = target > 0 && achieved >= target;
    const monthly10 = monthlyTargetMet ? Math.round(Math.max(0, achieved - target) * 0.1) : (dateColumns.length ? 0 : num(g(cols.monthly10)));
    const akiPayout = monthlyTargetMet ? (isNewJoiner ? Math.round(rawTotalAki) : Math.round(rawTotalAki / 2)) : 0;
    const incentiveTotal = monthly10 + akiPayout;
    const weekly = num(g(cols.weekly));
    const gross = calcSalary + incentiveTotal + weekly;
    const pending = num(g(cols.pending));
    const advance = num(g(cols.advance));
    const otExtra = num(g(cols.otExtra));
    const fileNetPresent = cols.netPresent !== -1 ? num(g(cols.netPresent)) : null;
    const presentMatch = fileNetPresent !== null ? Math.abs(totalPresentDays - fileNetPresent) < 0.01 : null;
    const eligibleMonthly = monthlyTargetMet;
    const eligibleAki = monthlyTargetMet;
    const netPayable = gross + otExtra + pending - advance;

    const fileSalary = cols.monthSalary !== -1 ? num(g(cols.monthSalary)) : null;
    const fileNet = cols.netPayable !== -1 ? num(g(cols.netPayable)) : null;
    const diff = fileNet !== null ? fileNet - netPayable : null;

    rows.push({
      sheet: wsName,
      name, status, mkey, presentSource: presentFromDb !== undefined ? 'db' : 'excel',
      doj: joinDate ? formatDoj(joinDate) : (cols.doj !== -1 ? formatDoj(g(cols.doj)) : ''),
      salary, present, dbPresent, dbPresentCount: dbEntry && dbEntry.present !== undefined ? dbEntry.present : null,
      dbAbsent: dbEntry && dbEntry.absent !== undefined ? dbEntry.absent : null,
      dbHalf: dbEntry && dbEntry.half !== undefined ? dbEntry.half : null,
      dbAvailable: dbEntry && dbEntry.available !== undefined ? dbEntry.available : null,
      dbSunAttended: dbEntry && dbEntry.sunAttended !== undefined ? dbEntry.sunAttended : null,
      dbSunUnpaid: dbEntry && dbEntry.sunUnpaid !== undefined ? dbEntry.sunUnpaid : null,
      dbSunDeducted: dbEntry && dbEntry.sunDeducted !== undefined ? dbEntry.sunDeducted : null,
      dbSunEligible: dbEntry && dbEntry.sunCount != null ? Math.max(0, dbEntry.sunCount - (dbEntry.sunDeducted || 0)) : null,
      collection: cols.totalAchieved !== -1
        ? num(g(cols.totalAchieved))
        : (dbEntry && dbEntry.collection !== undefined ? dbEntry.collection : 0),
      sundayAdd, totalPresentDays, netPresent, days,
      calcSalary, joiningDeduction, lateDeduction, joinedThisMonth, isNewJoiner,
      explain, explainNote, explainTitle,
      monthly10, totalAki: rawTotalAki, akiPayout, incentiveTotal, weekly, gross, otExtra, pending, advance, netPayable,
      fileSalary, fileNet, fileNetPresent, presentMatch, eligibleMonthly, eligibleAki, monthlyTargetMet, target, achieved, diff,
    });
  }
  return rows;
}

function sheetMonthKey(wsName, wb) {
  const ws = wb.Sheets[wsName];
  if (!ws || !ws['!ref']) return null;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const maxCol = Math.min(range.e.c, 255);
  let best = null;
  for (let c = 0; c <= maxCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (!cell) continue;
    const d = parseHeaderDate(cell.v);
    if (d) {
      const k = d.y * 12 + d.m;
      if (best === null || k > best) best = k;
    }
  }
  return best;
}

export function computeWorkbook(wb, dbPresent) {
  const candidates = [];
  for (const name of wb.SheetNames) {
    const rows = processSheet(name, wb, dbPresent);
    if (!rows || !rows.length) continue;
    const hasData = rows.some(r => r.present > 0 || r.netPresent > 0 || (r.fileSalary || 0) > 0 || (r.fileNet || 0) > 0);
    if (!hasData) continue;
    const ws = wb.Sheets[name];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const width = range.e.c - range.s.c + 1;
    const nonZeroRows = rows.reduce((acc, r) => acc + (r.salary > 0 || r.calcSalary > 0 || r.gross > 0 || r.netPayable > 0 ? 1 : 0), 0);
    const detected = detectHeader((() => {
      const r = findHeaderRow(ws);
      const maxCol = Math.min(range.e.c, 255);
      const hdr = [];
      for (let c = 0; c <= maxCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        hdr.push(cell && cell.v !== undefined ? cell.v : '');
      }
      return hdr;
    })());
    const filledCols = Object.values(detected).filter(v => v !== -1).length;
    const RESULT_KEYS = ['present', 'netPresent', 'sundayAdd', 'monthSalary', 'monthly10', 'aajKa', 'weekly', 'gross', 'otExtra', 'pending', 'advance', 'netPayable'];
    const resultCols = RESULT_KEYS.filter(k => detected[k] !== -1).length;
    const dataCols = rows.reduce((acc, r) => acc + ((r.presentSource === 'excel' && r.present > 0) || r.netPresent > 0 || (r.fileSalary || 0) > 0 || (r.fileNet || 0) > 0 ? 1 : 0), 0);
    candidates.push({ name, rows, monthKey: sheetMonthKey(name, wb), width, rowCount: rows.length, nonZeroRows, filledCols, resultCols, dataCols });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.monthKey || 0) - (a.monthKey || 0) || (b.dataCols || 0) - (a.dataCols || 0) || (b.resultCols || 0) - (a.resultCols || 0) || (b.width || 0) - (a.width || 0) || (b.rowCount || 0) - (a.rowCount || 0) || (b.nonZeroRows || 0) - (a.nonZeroRows || 0) || (b.filledCols || 0) - (a.filledCols || 0) || a.name.localeCompare(b.name));
  const pick = candidates[0];
  const statusRank = (s) => (s == null ? 0 : (STATUS_ORDER[s] ?? 3));
  pick.rows.sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name));
  return { rows: pick.rows, lastMonthKey: pick.rows[0].mkey || null };
}

export function buildCsv(rows) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [];
  lines.push(['Employee', 'Date of Joining', 'Salary', 'Days in Month', 'DB Present Days', 'Half Day', 'Absent', 'Deducted Sun.', 'Joining Ded (new)', 'Late Deduction', 'Total Days', 'Net Present Days', 'Match?', 'Computed Salary', 'File Month Salary', 'Match?', 'Monthly Eligible?', '10% Incentive', 'AKI Eligible?', 'Total AKI', 'Total Incentive', 'Gross Payable', 'OT/Extra (manual)', 'Pending Expenses', 'Advance', 'Net Payable', 'File Net Payable', 'Match?', 'Difference'].join(','));
  for (const r of rows) {
    lines.push([
      r.name, r.doj, r.salary, r.days,
      r.dbPresent,
      r.dbHalf != null ? (r.dbHalf * 0.5) : '', r.dbAbsent != null ? r.dbAbsent : '', r.dbSunDeducted != null ? r.dbSunDeducted : '',
      r.joiningDeduction || 0, r.lateDeduction || 0,
      r.totalPresentDays.toFixed(2), r.netPresent,
      r.presentMatch === null ? '' : (r.presentMatch ? 'match' : 'diff'),
      r.calcSalary.toFixed(2),
      r.fileSalary !== null ? r.fileSalary.toFixed(2) : '',
      r.fileSalary !== null ? (Math.abs(r.calcSalary - r.fileSalary) < 0.01 ? 'match' : 'diff') : '',
      r.eligibleMonthly ? 'yes' : 'no', r.monthly10.toFixed(2),
      r.eligibleAki ? 'yes' : 'no', r.totalAki.toFixed(2),
      r.incentiveTotal.toFixed(2), r.gross.toFixed(2),
      r.otExtra.toFixed(2), r.pending.toFixed(2), r.advance.toFixed(2), r.netPayable.toFixed(2),
      r.fileNet !== null ? r.fileNet.toFixed(2) : '',
      r.fileNet !== null ? (Math.abs(r.netPayable - r.fileNet) < 0.01 ? 'match' : 'diff') : '',
      r.diff !== null ? r.diff.toFixed(2) : '',
    ].map(esc).join(','));
  }
  return lines.join('\n');
}

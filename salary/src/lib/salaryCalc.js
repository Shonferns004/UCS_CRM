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
  doj: [/date\s*of\s*joining/i, /^doj$/i],
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
  pending: [/pending\s*expenses/i],
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
  const cols = {
    agent: find(HEADER_PATTERNS.agent[0]) !== -1 ? find(HEADER_PATTERNS.agent[0]) : (find(HEADER_PATTERNS.agent[1]) !== -1 ? find(HEADER_PATTERNS.agent[1]) : find(HEADER_PATTERNS.agent[2])),
    salary: find(HEADER_PATTERNS.salary[0]) !== -1 ? find(HEADER_PATTERNS.salary[0]) : find(HEADER_PATTERNS.salary[1]),
    target: find(HEADER_PATTERNS.target[0]) !== -1 ? find(HEADER_PATTERNS.target[0]) : (find(HEADER_PATTERNS.target[1]) !== -1 ? find(HEADER_PATTERNS.target[1]) : find(HEADER_PATTERNS.target[2])),
    achieved: find(HEADER_PATTERNS.achieved[0]) !== -1 ? find(HEADER_PATTERNS.achieved[0]) : (find(HEADER_PATTERNS.achieved[1]) !== -1 ? find(HEADER_PATTERNS.achieved[1]) : (find(HEADER_PATTERNS.achieved[2]) !== -1 ? find(HEADER_PATTERNS.achieved[2]) : find(HEADER_PATTERNS.achieved[3]))),
    doj: find(HEADER_PATTERNS.doj[0]) !== -1 ? find(HEADER_PATTERNS.doj[0]) : find(HEADER_PATTERNS.doj[1]),
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
    pending: find(HEADER_PATTERNS.pending[0]),
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

// Match an Excel name to a DB name. Exact normalized match first, then a
// first-name + last-name fallback so "Nazreen Zahur Baig" resolves to the DB
// worker "Nazreen Baig".
function resolveDbEntry(dbMap, name) {
  if (!dbMap) return undefined;
  const n = normalizeName(name);
  if (dbMap[n] !== undefined) return dbMap[n];
  const parts = n.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    const firstLast = parts[0] + ' ' + parts[parts.length - 1];
    if (dbMap[firstLast] !== undefined) return dbMap[firstLast];
    for (const k of Object.keys(dbMap)) {
      const kp = k.split(' ').filter(Boolean);
      if (kp.length >= 2 && kp[0] + ' ' + kp[kp.length - 1] === firstLast) return dbMap[k];
    }
  }
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
    const salary = num(g(cols.salary));
    if (!salary) continue;

    const target = num(g(cols.target));
    const achieved = num(g(cols.achieved));
    const joinDate = parseAnyDateValue(g(cols.doj));
    const monthsEmployed = getMonthsEmployedFromDate(joinDate);
    const isNewJoiner = monthsEmployed !== null ? monthsEmployed <= 3 : false;
    const joinedThisMonth = joinDate && sheetRef
      ? joinDate.getFullYear() === sheetRef.y && joinDate.getMonth() === sheetRef.m
      : false;

    const dbEntry = resolveDbEntry(dbMap, name);
    const presentFromDb = dbEntry && typeof dbEntry === 'object' ? dbEntry.days : undefined;
    const present = presentFromDb !== undefined ? presentFromDb : num(g(cols.present));
    const joiningDeduction = presentFromDb !== undefined
      ? (dbEntry.joinDed || 0)
      : (joinedThisMonth && isNewJoiner ? 1.5 : 0);
    const lateDeduction = presentFromDb !== undefined ? (dbEntry.lateDed || 0) : 0;
    const dbPresent = presentFromDb !== undefined ? present : Math.max(0, present - joiningDeduction);
    const netDays = presentFromDb !== undefined
      ? Math.max(0, present - joiningDeduction - lateDeduction)
      : dbPresent;
    const training = num(g(cols.training));
    const sundayAdd = num(g(cols.sundayAdd));
    const netPresent = cols.netPresent !== -1 ? num(g(cols.netPresent))
      : present - training + sundayAdd;
    const perDay = salary / days;
    const calcSalary = perDay * netDays;

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
    const presentMatch = fileNetPresent !== null ? Math.abs(dbPresent - fileNetPresent) < 0.01 : null;
    const eligibleMonthly = monthlyTargetMet;
    const eligibleAki = monthlyTargetMet;
    const netPayable = gross + otExtra + pending - advance;

    const fileSalary = cols.monthSalary !== -1 ? num(g(cols.monthSalary)) : null;
    const fileNet = cols.netPayable !== -1 ? num(g(cols.netPayable)) : null;

    rows.push({
      sheet: wsName,
      name, mkey, presentSource: presentFromDb !== undefined ? 'db' : 'excel',
      doj: cols.doj !== -1 ? String(g(cols.doj) || '').slice(0, 10) : '',
      salary, present, dbPresent, training, sundayAdd, netPresent, days,
      calcSalary, joiningDeduction, lateDeduction, netDays, joinedThisMonth, isNewJoiner,
      monthly10, totalAki: rawTotalAki, akiPayout, incentiveTotal, weekly, gross, otExtra, pending, advance, netPayable,
      fileSalary, fileNet, fileNetPresent, presentMatch, eligibleMonthly, eligibleAki, monthlyTargetMet, target, achieved,
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
    const filledCols = Object.values(detectHeader((() => {
      const r = findHeaderRow(ws);
      const maxCol = Math.min(range.e.c, 255);
      const hdr = [];
      for (let c = 0; c <= maxCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        hdr.push(cell && cell.v !== undefined ? cell.v : '');
      }
      return hdr;
    })())).filter(v => v !== -1).length;
    candidates.push({ name, rows, monthKey: sheetMonthKey(name, wb), width, rowCount: rows.length, nonZeroRows, filledCols });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.monthKey || 0) - (a.monthKey || 0) || (b.width || 0) - (a.width || 0) || (b.rowCount || 0) - (a.rowCount || 0) || (b.nonZeroRows || 0) - (a.nonZeroRows || 0) || (b.filledCols || 0) - (a.filledCols || 0) || a.name.localeCompare(b.name));
  const pick = candidates[0];
  return { rows: pick.rows, lastMonthKey: pick.rows[0].mkey || null };
}

export function buildCsv(rows) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [];
  lines.push(['Sheet', 'Employee', 'Date of Joining', 'Salary', 'Days in Month', 'DB Present Days', 'Match?', 'Training & Sun Ded', 'Sunday To Add', 'Net Present Days', 'Joining Ded (new)', 'Late Deduction', 'Computed Salary', '10% Incentive', 'Monthly Eligible?', 'Total AKI', 'AKI Eligible?', 'Total Incentive', 'Weekly Incentive', 'Gross Payable', 'OT/Extra (manual)', 'Pending Expenses', 'Advance', 'Net Payable'].join(','));
  for (const r of rows) {
    lines.push([r.sheet, r.name, r.doj, r.salary, r.days, r.dbPresent, r.presentMatch === null ? '' : (r.presentMatch ? 'match' : 'diff'), r.training, r.sundayAdd, r.netPresent,
      r.joiningDeduction || 0,
      r.lateDeduction || 0,
      r.calcSalary.toFixed(2), r.monthly10.toFixed(2), r.eligibleMonthly ? 'yes' : 'no', r.totalAki.toFixed(2), r.eligibleAki ? 'yes' : 'no', r.incentiveTotal.toFixed(2), r.weekly.toFixed(2),
      r.gross.toFixed(2), '', r.pending.toFixed(2), r.advance.toFixed(2), r.netPayable.toFixed(2)].map(esc).join(','));
  }
  return lines.join('\n');
}

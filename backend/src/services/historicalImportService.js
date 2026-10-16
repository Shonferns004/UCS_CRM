// Historical workbook import (Accounts → Operations). A multi-sheet Excel of
// past months' collection is uploaded, PREVIEWED first (nothing written),
// and only on Confirm upserted into historical_monthly_performance keyed
// (worker, month). Re-uploading the same file is a no-op once confirmed
// (sha256 unique); a preview-only file is re-parsed on re-upload.
//
// Layout-adaptive: every sheet gets its own header row detection and column
// mapping. Auto-mapping is fuzzy over header names; ambiguous columns are
// returned for explicit confirmation, and confirmed maps are remembered per
// header-signature so re-uploads skip the mapping step.
//
// Month resolution: Month column → sheet name → filename (last resort).
// Skip cascade per row (first hit wins):
//   EMPLOYEE_NOT_FOUND → EMPLOYEE_AMBIGUOUS → MONTH_UNRECOGNISED →
//   NOTHING_TO_IMPORT

import XLSX from 'xlsx';
import db from '../config/db.js';
import { createHash } from 'crypto';

// ── header auto-mapping ──────────────────────────────────────────────────────
// Order matters: first alias group that hits a header wins the field.
const FIELD_ALIASES = {
  employee: ['employee name', 'employee', 'name', 'volunteer', 'volunteer name', 'agent', 'agent name', 'fro name', 'worker', 'worker name', 'emp name', 'staff name'],
  login_id: ['login id', 'login', 'emp id', 'employee id', 'staff id', 'code', 'emp code'],
  collection: ['collection', 'collected', 'collection amount', 'total collection', 'amount collected', 'achieved', 'achieved amount', 'total achieved', 'achievement', 'amount', 'total', 'receipts', 'total amount', 'collected amount'],
  target: ['target', 'monthly target', 'goal', 'target amount'],
  month: ['month', 'period', 'salary month', 'for month', 'set for month'],
  salary: ['salary', 'monthly salary', 'gross salary', 'total salary'],
};

const FIELD_LABEL = {
  employee: 'Employee name', login_id: 'Employee ID', collection: 'Collection amount',
  target: 'Target', month: 'Month', salary: 'Salary',
};

const MONTH_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Typo variants seen in real workbooks ('Fab' as a sheet name).
const MONTH_ALIASES = { fab: 2 };
const monthIndexOf = (token) => {
  const t = String(token || '').toLowerCase().slice(0, 3);
  return MONTH_NAMES[t] || MONTH_ALIASES[t] || null;
};

// '%' is preserved so 'Achieved %' stays distinct from 'Achieved' — otherwise
// both normalize to 'achieved' and the real collection column looks ambiguous.
const normHeader = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 %]+/g, ' ').replace(/\s+/g, ' ').trim();
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// '₹1,29,032', '129032.5', '1,29,032.00', Date-serial numbers → number.
export const parseAmount = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Sheet name or in-sheet cell → 'YYYY-MM' or null. Accepts
// 'Oct 2025', 'October 2025', '2025-10', '10-2025', '10/2025'.
const parseMonth = (v) => {
  if (v == null) return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, '0')}`;
  m = s.match(/^([a-z]{3,9})\s+(\d{4})$/);
  if (m && monthIndexOf(m[1])) {
    return `${m[2]}-${String(monthIndexOf(m[1])).padStart(2, '0')}`;
  }
  return null;
};

// Loose search for a month inside longer text (filenames like
// 'fro-targets-2026-10 (8).xlsx' or sheet names like 'Collection Oct 2026').
const parseMonthLoose = (v) => {
  const direct = parseMonth(v);
  if (direct) return direct;
  const s = String(v ?? '').toLowerCase();
  let m = s.match(/(\d{4})[-/](\d{1,2})/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${String(+m[2]).padStart(2, '0')}`;
  m = s.match(/(\d{1,2})[-/](\d{4})/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${String(+m[1]).padStart(2, '0')}`;
  m = s.match(/([a-z]{3,9})[ _-]+(\d{4})/);
  if (m && monthIndexOf(m[1])) {
    return `${m[2]}-${String(monthIndexOf(m[1])).padStart(2, '0')}`;
  }
  return null;
};

// Sheet-name month resolution for workbooks where each sheet IS a month:
// 'Jan', 'Fab', 'March', 'Nov25', 'Sept 25', 'July 2026', 'Oct26'.
// A bare name carries no year — take it from the sheet's per-day date header
// cells (median of the row's dates, so a stray previous-month column like
// Dec 31 on the Jan sheet can't flip it). Falls back to null → skip.
const resolveSheetMonth = (sheetName, headerCells) => {
  const s = String(sheetName || '').trim().toLowerCase();
  const m = s.match(/^([a-z]{3,9})\s*(\d{2,4})?$/);
  let month = m ? monthIndexOf(m[1]) : null;
  let year = null;
  if (m && m[2]) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (y >= 2000 && y <= 2100) year = y;
  }
  if (month && year) return `${year}-${String(month).padStart(2, '0')}`;

  const dates = (headerCells || [])
    .filter(v => v instanceof Date && !isNaN(v))
    .map(v => v.getTime())
    .sort((a, b) => a - b);
  if (dates.length) {
    // Shift into IST before reading parts (workbook dates land ~23:59:50 IST
    // on their label date — same calendar day, so no off-by-one).
    const med = new Date(dates[Math.floor(dates.length / 2)] + 5.5 * 3600 * 1000);
    const y = med.getUTCFullYear();
    const mo = month || med.getUTCMonth() + 1;
    if (y >= 2000 && y <= 2100) return `${y}-${String(mo).padStart(2, '0')}`;
  }
  return null;
};

// Find the header row: first row with ≥2 non-empty strings in the first 10.
export const detectHeaderRow = (grid) => {
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const filled = (grid[i] || []).filter(c => String(c ?? '').trim() !== '').length;
    if (filled >= 2) return i;
  }
  return 0;
};

// sheet_to_json over a whole sheet is fatal on padded sheets: some workbooks
// have '!ref' covering the FULL Excel grid (1,048,576 rows), which allocates
// millions of empty arrays and made uploads time out (>120s). Read in 500-row
// pages instead and stop as soon as a page's last row is blank (data blocks
// start at the top and are contiguous). Grid indices stay absolute.
const SHEET_PAGE_ROWS = 500;
const SHEET_MAX_COLS = 500;
const SHEET_MAX_PAGES = 100; // 50k rows — far past any real sheet here
const isBlankRow = (row) => !row || row.every(c => String(c ?? '').trim() === '');
export const readSheetGrid = (ws) => {
  const ref = ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
  if (!ref) return [];
  const colEnd = Math.min(ref.e.c, SHEET_MAX_COLS - 1);
  const grid = [];
  for (let page = 0, start = 0; page < SHEET_MAX_PAGES && start <= ref.e.r; page++) {
    const end = Math.min(start + SHEET_PAGE_ROWS - 1, ref.e.r);
    const range = XLSX.utils.encode_range({ s: { r: start, c: ref.s.c }, e: { r: end, c: colEnd } });
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, range });
    grid.push(...rows);
    if (isBlankRow(rows[rows.length - 1])) break; // trailing padding — stop
    start = end + 1;
  }
  return grid;
};

// Map headers → fields. Returns { map, ambiguous } where map[field] = col idx.
// saved (from a previous confirm) always wins; ambiguity is only surfaced for
// fields we could not pick confidently.
export const autoMap = (headers, saved) => {
  const map = {};
  const ambiguous = [];
  if (saved && typeof saved === 'object') {
    for (const [f, idx] of Object.entries(saved)) {
      if (idx != null && headers[idx] !== undefined) map[f] = idx;
    }
  }
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (map[field] != null) continue;
    const hits = [];
    headers.forEach((h, idx) => {
      const nh = normHeader(h);
      if (!nh) return;
      if (field === 'month') {
        // Month gets strict matching: exact alias, or the header mentions the
        // word month as a SHORT label. Descriptive columns ('Last Month
        // Pending OT Salary', 'Paid for the month of Dec, 2023') are not
        // period columns — 'Salary' must never map either, nor 'Tenure (months)'.
        const shortLabel = nh.split(' ').length <= 3 && !/tenure|hold/i.test(nh);
        if (aliases.some(a => nh === a)) hits.push({ idx, exact: true });
        else if (shortLabel && /\bmonths?\b/.test(nh)) hits.push({ idx, exact: false });
        return;
      }
      // Percentages ('Achieved %', 'Target 50%') are ratios — never amounts.
      if (nh.endsWith('%')) return;
      if (aliases.some(a => nh === a)) hits.push({ idx, exact: true });
      else if (aliases.some(a => nh.startsWith(a) || a.startsWith(nh) || nh.includes(a))) hits.push({ idx, exact: false });
    });
    const exact = hits.filter(h => h.exact);
    let resolved = null;
    if (exact.length >= 1) {
      // Duplicate labels ('Target' appears twice — monthly + weekly block):
      // the leftmost one is the summary column that pairs with Achieved.
      resolved = exact[0];
    } else if (hits.length === 1) {
      resolved = hits[0];
    } else if (hits.length > 1) {
      // Split sheets: 'Total BSCT + AFLF Achieved' is the real total; BSCT /
      // AFLF / weekly totals are parts of it. A label repeated at the sheet's
      // end ('TOTAL BSCT+AFLF ACHIEVED' appears twice) resolves to its
      // leftmost occurrence — only genuinely different labels stay ambiguous.
      const totals = hits.filter(h => normHeader(headers[h.idx]).startsWith('total'));
      const pool = totals.length ? totals : hits;
      const labels = new Set(pool.map(h => normHeader(headers[h.idx])));
      if (labels.size === 1) resolved = pool[0];
    }
    if (resolved) map[field] = resolved.idx;
    else if (hits.length > 1) {
      ambiguous.push({ field, label: FIELD_LABEL[field], options: hits.map(h => ({ index: h.idx, header: String(headers[h.idx] ?? '') })) });
    }
  }
  return { map, ambiguous };
};

// ── employee resolution ──────────────────────────────────────────────────────
// One pass over workers + aliases; the import never guesses per row.
const loadEmployeeIndex = async () => {
  const byKey = new Map(); // normName(name) / normName(login) -> worker[]
  const add = (key, w) => {
    if (!key) return;
    const list = byKey.get(key) || [];
    if (!list.some(x => x.id === w.id)) list.push(w);
    byKey.set(key, list);
  };
  const { data: workers, error } = await db
    .from('workers')
    .select('id, name, login_id, employment_status');
  if (error) throw error;
  for (const w of workers || []) {
    add(normName(w.name), w);
    add(normName(w.login_id), w);
  }
  try {
    const { data: aliases } = await db
      .from('worker_aliases')
      .select('alias_name, worker_id')
      .not('alias_name', 'is', null);
    const byId = new Map((workers || []).map(w => [w.id, w]));
    for (const a of aliases || []) {
      const w = byId.get(a.worker_id);
      if (w) add(normName(a.alias_name), w);
    }
  } catch { /* canonical names alone still resolve most rows */ }
  return byKey;
};

const SKIP_CODES = {
  EMPLOYEE_NOT_FOUND: 'No employee matches this name or ID (checked names, logins and aliases)',
  EMPLOYEE_AMBIGUOUS: 'Name matches more than one employee — set the Employee ID column',
};

// First-hit-wins cascade. Returns { worker, skip } — exactly one is set.
// Workbook names carry notes: 'Kanchan Gupta - HOLD', 'Neha Kamkar - Half
// salary HOLD', stray double spaces. Exact key first, then the longest
// word-prefix that resolves to exactly one worker; >1 worker → ambiguous.
const matchByName = (key, index) => {
  const exact = index.get(key);
  if (exact?.length) return exact;
  const tokens = key.split(' ').filter(Boolean);
  for (let n = tokens.length - 1; n >= 1; n--) {
    const hits = index.get(tokens.slice(0, n).join(' '));
    if (hits?.length) return hits; // longest prefix wins; 2+ → ambiguous
  }
  return [];
};

const resolveEmployee = (row, map, index) => {
  const login = map.login_id != null ? normName(row[map.login_id]) : '';
  const name = map.employee != null ? normName(row[map.employee]) : '';
  let matches = [];
  if (login) matches = index.get(login) || [];
  if (matches.length === 0 && name) matches = matchByName(name, index);
  if (matches.length === 0) return { skip: 'EMPLOYEE_NOT_FOUND' };
  if (matches.length > 1) return { skip: 'EMPLOYEE_AMBIGUOUS' };
  // Historical facts about people who have since left are still valid history —
  // absconded/offboarded/terminated rows are imported, not blocked.
  return { worker: matches[0] };
};

// ── parse (no writes except the batch row itself) ────────────────────────────
export async function parseHistoricalWorkbook(buffer, fileName) {
  const fileSha = sha256(buffer);
  // sha256 idempotency: a confirmed file is a no-op. A file that was only
  // previewed (never confirmed) is re-parsed, so mapping/parser fixes can be
  // tested by re-uploading the same workbook.
  const { data: existing } = await db
    .from('historical_import_batches')
    .select('*')
    .eq('file_sha256', fileSha)
    .maybeSingle();
  if (existing && existing.status === 'confirmed') return { duplicate: true, batch: existing };

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const index = await loadEmployeeIndex();
  // Last-resort month: the filename ('fro-targets-2026-10 (8).xlsx').
  const fileMonth = parseMonthLoose(String(fileName || '').replace(/\.[a-z0-9]+$/i, ''));

  const sheets = [];
  const allRows = [];
  let globalRow = 0;

  for (const sheetName of wb.SheetNames) {
    const grid = readSheetGrid(wb.Sheets[sheetName]);
    if (!grid.length) continue;
    const headerIdx = detectHeaderRow(grid);
    const headers = (grid[headerIdx] || []).map(h => String(h ?? '').trim());

    // Saved mapping for this exact header layout.
    const signature = sha256(Buffer.from(headers.map(normHeader).join('|')));
    const { data: savedRow } = await db
      .from('historical_column_mappings')
      .select('mapping')
      .eq('header_signature', signature)
      .maybeSingle();

    const { map, ambiguous } = autoMap(headers, savedRow?.mapping || null);
    // Month: Month column (row loop) → sheet name ('Jan', 'Oct26', 'July 2026',
    // bare names get the year from the sheet's date headers) → filename.
    const sheetMonth = resolveSheetMonth(sheetName, grid[headerIdx]) || fileMonth;
    // Sheets with no employee and no login column (name lists like
    // '1 Year Employee') cannot attribute rows — don't report them all as
    // EMPLOYEE_NOT_FOUND, there is nothing to key a lookup on.
    const canResolve = map.employee != null || map.login_id != null;

    const rows = [];
    let emptyRun = 0;
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const raw = grid[i] || [];
      if (isBlankRow(raw)) {
        // Long runs of blank rows are padding — stop scanning this sheet.
        if (++emptyRun > 100) break;
        continue;
      }
      emptyRun = 0;
      globalRow += 1;
      const month = map.month != null ? parseMonthLoose(raw[map.month]) : null;
      const effectiveMonth = month || sheetMonth;
      const { worker, skip } = canResolve ? resolveEmployee(raw, map, index) : { worker: null, skip: null };
      const collection = map.collection != null ? parseAmount(raw[map.collection]) : null;
      const target = map.target != null ? parseAmount(raw[map.target]) : null;
      const salary = map.salary != null ? parseAmount(raw[map.salary]) : null;

      let rowSkip = canResolve ? (skip || null) : 'NOTHING_TO_IMPORT';
      if (!rowSkip && !effectiveMonth) rowSkip = 'MONTH_UNRECOGNISED';
      if (!rowSkip && collection == null && target == null) rowSkip = 'NOTHING_TO_IMPORT';

      rows.push({
        row: i + 1, // 1-based, as seen in Excel
        sheet: sheetName,
        employee: String(raw[map.employee] ?? ''),
        login_id: String(raw[map.login_id] ?? ''),
        month: effectiveMonth,
        collection,
        target,
        salary,
        worker_id: worker?.id || null,
        worker_name: worker?.name || null,
        skip: rowSkip,
      });
    }
    allRows.push(...rows);
    sheets.push({
      name: sheetName,
      header_row: headerIdx + 1,
      headers,
      map,
      ambiguous,
      saved: !!savedRow?.mapping,
      signature,
      month: sheetMonth,
      row_count: rows.length,
      preview: rows.slice(0, 5),
    });
  }

  const okRows = allRows.filter(r => !r.skip);
  const skipped = allRows.filter(r => r.skip);

  const batchPayload = {
    file_name: fileName,
    file_sha256: fileSha,
    sheet_count: sheets.length,
    total_rows: allRows.length,
    imported_rows: 0,
    skipped_rows: skipped.length,
    status: 'preview',
    notes: { skip_counts: countBy(skipped, r => r.skip) },
    parsed: { sheets, rows: allRows },
  };
  let batch;
  if (existing) {
    // Same file re-uploaded while still a preview → replace the staged parse.
    const { data: updated, error: uErr } = await db
      .from('historical_import_batches')
      .update(batchPayload)
      .eq('id', existing.id)
      .select()
      .single();
    if (uErr) throw uErr;
    batch = updated;
  } else {
    const { data: inserted, error } = await db
      .from('historical_import_batches')
      .insert(batchPayload)
      .select()
      .single();
    if (error) throw error;
    batch = inserted;
  }

  return {
    duplicate: false,
    batch,
    sheets,
    summary: {
      sheets: sheets.length,
      total_rows: allRows.length,
      importable: okRows.length,
      skipped: skipped.length,
      skip_counts: countBy(skipped, r => r.skip),
      skip_reasons: SKIP_CODES,
      importable_months: [...new Set(okRows.map(r => r.month))].sort(),
    },
  };
}

const countBy = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});

// ── confirm (the ONLY write path) ────────────────────────────────────────────
export async function confirmHistoricalBatch(batchId, confirmedMaps) {
  const { data: batch, error } = await db
    .from('historical_import_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch) { const e = new Error('Batch not found'); e.status = 404; throw e; }
  if (batch.status === 'confirmed') return { already_confirmed: true, batch };

  const parsed = batch.parsed || { sheets: [], rows: [] };

  // Remember each sheet's confirmed mapping (skip the ones left untouched
  // that were already saved at parse time).
  for (const s of parsed.sheets || []) {
    const mapToSave = confirmedMaps?.[s.name] || s.map;
    if (!mapToSave || Object.keys(mapToSave).length === 0) continue;
    await db
      .from('historical_column_mappings')
      .upsert({ header_signature: s.signature, mapping: mapToSave, sample_sheet: s.name }, { onConflict: 'header_signature' });
  }

  const okRows = (parsed.rows || []).filter(r => !r.skip);
  const skipped = (parsed.rows || []).filter(r => r.skip);

  // Upsert per (worker, month) — re-running the confirm is safe. Chunked so
  // a multi-thousand-row workbook confirms in seconds over the DB tunnel
  // instead of one sequential round-trip per row.
  const CHUNK = 15;
  for (let i = 0; i < okRows.length; i += CHUNK) {
    await Promise.all(okRows.slice(i, i + CHUNK).map(async (r) => {
      const { error: upErr } = await db
        .from('historical_monthly_performance')
        .upsert({
          batch_id: batchId,
          worker_id: r.worker_id,
          month: r.month,
          collection: r.collection,
          target: r.target,
          salary: r.salary ?? null,
          source_sheet: r.sheet || null,
          source_row: r.row,
        }, { onConflict: 'worker_id,month' });
      if (upErr) throw upErr;
    }));
  }

  const { data: updated, error: uErr } = await db
    .from('historical_import_batches')
    .update({
      status: 'confirmed',
      imported_rows: okRows.length,
      skipped_rows: skipped.length,
    })
    .eq('id', batchId)
    .select()
    .single();
  if (uErr) throw uErr;

  return {
    already_confirmed: false,
    batch: updated,
    imported: okRows.length,
    skipped_rows: skipped.map(r => ({ ...r, reason: SKIP_CODES[r.skip] || r.skip })),
  };
}

// ── reads ────────────────────────────────────────────────────────────────────
export const listHistoricalBatches = async () => {
  const { data, error } = await db
    .from('historical_import_batches')
    .select('id, file_name, sheet_count, total_rows, imported_rows, skipped_rows, status, created_at, notes')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
};

// Monthly performance history for one worker + a naive forecast: last-3-month
// average projected over the current (incomplete) month.
export const getWorkerPerformanceHistory = async (workerId) => {
  const { data, error } = await db
    .from('historical_monthly_performance')
    .select('month, collection, target, salary, source_sheet, created_at')
    .eq('worker_id', workerId)
    .order('month', { ascending: true });
  if (error) throw error;
  const rows = (data || []).map(r => ({
    month: r.month,
    collection: Number(r.collection) || 0,
    target: r.target != null ? Number(r.target) : null,
    salary: r.salary != null ? Number(r.salary) : null,
    source: r.source_sheet,
  }));

  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const thisMonth = istNow.toISOString().slice(0, 7);
  const last3 = rows.filter(r => r.month < thisMonth).slice(-3);
  const forecast = last3.length > 0
    ? Math.round(last3.reduce((s, r) => s + r.collection, 0) / last3.length)
    : null;

  return {
    rows,
    current_month: thisMonth,
    forecast: forecast != null ? { month: thisMonth, value: forecast, basis: `avg of last ${last3.length} imported month${last3.length === 1 ? '' : 's'}` } : null,
  };
};

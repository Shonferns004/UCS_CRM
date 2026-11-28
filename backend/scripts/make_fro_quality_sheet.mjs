import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/config/db.js';
import { getWorkerCollectionReceipts } from '../src/models/froDonorLogModel.js';
import { istMonthBounds } from '../src/utils/ist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../FRO_Inactive_Active_Category_Upgrades.xlsx');

const CATEGORY_LABELS = ['Below Low', 'Low Value', 'Medium', 'High Value', 'Premium'];
const CATEGORY_VALIDATION = '"Below Low,Low Value,Medium,High Value,Premium"';
const EXCLUDED_NAMES = new Set(['pg', 'suspense', 'library', 'na', 'l', 'ps', 'aj', 's', 'a', 'b', 'm']);

const monthBounds = istMonthBounds(new Date());
const { startDay, endDay, month } = monthBounds;
const monthLabel = new Date(`${startDay}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const cutoff = new Date();
cutoff.setFullYear(cutoff.getFullYear() - 1);
const activeCutoffDay = cutoff.toISOString().slice(0, 10);

const categoryRank = (count, total) => {
  if (!count || !total) return 0;
  const avg = Number(total) / Number(count);
  if (avg >= 5000) return 4;
  if (avg >= 2000) return 3;
  if (avg >= 500) return 2;
  if (avg >= 251) return 1;
  return 0;
};
const categoryLabel = (rank) => CATEGORY_LABELS[Math.max(0, Math.min(4, rank))];
const avgOf = (rows) => {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + Number(r.amount || 0), 0) / rows.length;
};
const dayDiff = (a, b) => {
  const t1 = new Date(`${a}T00:00:00Z`).getTime();
  const t2 = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return '';
  return Math.max(0, Math.round((t2 - t1) / 86400000));
};
const money = (n) => Number(n || 0);
const titleCase = (s) => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

async function loadWorkers() {
  const permanent = await db._pool.query(`
    SELECT w.id, w.name,
           array_remove(array_agg(DISTINCT n.code || ':' || btrim(f.station)), NULL) AS stations
      FROM fro_station_assignments f
      JOIN workers w ON w.id = f.fro_worker_id
      LEFT JOIN ngos n ON n.id = f.ngo_id
     WHERE f.fro_worker_id IS NOT NULL
       AND w.is_active = TRUE
       AND w.department = 'FRO'
     GROUP BY w.id, w.name
  `);
  const temp = await db._pool.query(`
    SELECT w.id, w.name,
           array_remove(array_agg(DISTINCT n.code || ':' || btrim(t.station)), NULL) AS stations
      FROM temporary_data_assignments t
      JOIN workers w ON w.id = t.working_fro_worker_id
      LEFT JOIN ngos n ON n.id = t.ngo_id
     WHERE t.status = 'ACTIVE'
       AND t.starts_at <= now()
       AND t.expires_at >= now()
       AND w.is_active = TRUE
       AND w.department = 'FRO'
     GROUP BY w.id, w.name
  `);

  const map = new Map();
  for (const row of [...permanent.rows, ...temp.rows]) {
    if (EXCLUDED_NAMES.has(String(row.name || '').trim().toLowerCase())) continue;
    const prev = map.get(row.id) || { id: row.id, name: row.name, stations: new Set() };
    for (const s of row.stations || []) if (s) prev.stations.add(s);
    map.set(row.id, prev);
  }
  return [...map.values()]
    .filter(w => w.stations.size > 0)
    .map(w => ({ ...w, stations: [...w.stations].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function stationPairsForWorker(workerId) {
  const { rows: permanent } = await db._pool.query(`
    SELECT n.code AS ngo_code, btrim(f.station) AS station, f.ngo_id
      FROM fro_station_assignments f
      JOIN ngos n ON n.id = f.ngo_id
     WHERE f.fro_worker_id = $1
  `, [workerId]);
  const { rows: temp } = await db._pool.query(`
    SELECT n.code AS ngo_code, btrim(t.station) AS station, t.ngo_id
      FROM temporary_data_assignments t
      JOIN ngos n ON n.id = t.ngo_id
     WHERE t.working_fro_worker_id = $1
       AND t.status = 'ACTIVE'
       AND t.starts_at <= now()
       AND t.expires_at >= now()
  `, [workerId]);
  const map = new Map();
  for (const p of [...permanent, ...temp]) {
    if (!p.ngo_id || !p.station) continue;
    map.set(`${p.ngo_id}|${p.station}`, { ngo_id: p.ngo_id, ngo_code: p.ngo_code, station: p.station });
  }
  return [...map.values()];
}

async function historyForDonors(donorIds) {
  if (!donorIds.length) return [];
  const out = [];
  for (let i = 0; i < donorIds.length; i += 1000) {
    const chunk = donorIds.slice(i, i + 1000);
    const { rows } = await db._pool.query(`
      SELECT donor_id, lower(project_id) AS project, receipt_date, amount
        FROM receipts
       WHERE donor_id = ANY($1::int[])
         AND voided_at IS NULL
         AND COALESCE(amount, 0) > 0
         AND receipt_date <= $2
    `, [chunk, endDay]);
    out.push(...rows);
  }
  return out;
}

async function donorProfiles(donorIds) {
  if (!donorIds.length) return new Map();
  const map = new Map();
  for (let i = 0; i < donorIds.length; i += 1000) {
    const chunk = donorIds.slice(i, i + 1000);
    const { rows } = await db._pool.query(`
      SELECT id, name, mobile_number, last_donation_date
        FROM donor_profiles
       WHERE id = ANY($1::int[])
    `, [chunk]);
    for (const r of rows) map.set(r.id, r);
  }
  return map;
}

async function lastReceiptsByDonorProject(donorIds) {
  const map = new Map();
  if (!donorIds.length) return map;
  for (let i = 0; i < donorIds.length; i += 1000) {
    const chunk = donorIds.slice(i, i + 1000);
    const { rows } = await db._pool.query(`
      SELECT donor_id, lower(project_id) AS project, max(receipt_date) AS last_date
        FROM receipts
       WHERE donor_id = ANY($1::int[])
         AND voided_at IS NULL
         AND COALESCE(amount, 0) > 0
       GROUP BY donor_id, lower(project_id)
    `, [chunk]);
    for (const r of rows) map.set(`${r.donor_id}|${r.project}`, String(r.last_date).slice(0, 10));
  }
  return map;
}

async function computeMetrics(workerId) {
  const todayDay = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const collected = await getWorkerCollectionReceipts(
    workerId,
    monthBounds.start.toISOString(),
    monthBounds.end.toISOString(),
    { startDay, endDay },
  );

  const pairs = new Map();
  const todayPairs = new Map();
  for (const r of collected || []) {
    const donorId = Number(r.donor_id);
    const project = String(r.project_id || '').toLowerCase();
    if (!donorId || !project) continue;
    const key = `${donorId}|${project}`;
    const day = String(r.receipt_date || '').slice(0, 10);
    const prev = pairs.get(key);
    if (!prev) {
      pairs.set(key, { donorId, project, firstDate: day || startDay, amount: money(r.amount) });
    } else {
      if (day && day < prev.firstDate) prev.firstDate = day;
      prev.amount += money(r.amount);
    }
    if (day === todayDay) {
      const tp = todayPairs.get(key);
      if (!tp) todayPairs.set(key, { donorId, project, firstDate: todayDay, amount: money(r.amount) });
      else tp.amount += money(r.amount);
    }
  }

  const donorIds = [...new Set([...pairs.values()].map(p => p.donorId))];
  const historyRows = await historyForDonors(donorIds);
  const history = new Map();
  for (const r of historyRows) {
    const key = `${Number(r.donor_id)}|${String(r.project || '').toLowerCase()}`;
    if (!history.has(key)) history.set(key, { prior: [], all: [] });
    const h = history.get(key);
    h.all.push(r);
    if (String(r.receipt_date).slice(0, 10) < startDay) h.prior.push(r);
  }

  const profiles = await donorProfiles(donorIds);
  const activations = new Map();
  const activationsToday = new Map();
  const upgrades = new Map();

  for (const { donorId, project, firstDate, amount } of pairs.values()) {
    const h = history.get(`${donorId}|${project}`);
    if (!h || h.prior.length === 0) continue;
    const profile = profiles.get(donorId) || {};
    const priorTotal = h.prior.reduce((s, x) => s + money(x.amount), 0);
    const allTotal = h.all.reduce((s, x) => s + money(x.amount), 0);
    const beforeRank = categoryRank(h.prior.length, priorTotal);
    const afterRank = categoryRank(h.all.length, allTotal);
    const lastPrior = h.prior.reduce((max, x) => {
      const d = String(x.receipt_date).slice(0, 10);
      return d > max ? d : max;
    }, '');

    const cutoffDate = new Date(`${firstDate}T00:00:00Z`);
    cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
    const cutoffDay = cutoffDate.toISOString().slice(0, 10);

    if (lastPrior && lastPrior <= cutoffDay) {
      const row = {
        donor: profile.name || 'Unknown',
        mobile: profile.mobile_number || '',
        ngo: titleCase(project),
        previousLast: lastPrior,
        reactivatedOn: firstDate,
        daysInactive: dayDiff(lastPrior, firstDate),
        amount,
        donorId,
      };
      const prev = activations.get(donorId);
      if (!prev || row.daysInactive > prev.daysInactive) activations.set(donorId, row);
    }

    if (afterRank > beforeRank) {
      const row = {
        donor: profile.name || 'Unknown',
        mobile: profile.mobile_number || '',
        ngo: titleCase(project),
        from: categoryLabel(beforeRank),
        to: categoryLabel(afterRank),
        avgBefore: avgOf(h.prior),
        avgAfter: avgOf(h.all),
        amount,
        upgradedOn: firstDate,
        rankDelta: afterRank - beforeRank,
        donorId,
      };
      const prev = upgrades.get(donorId);
      if (!prev || row.rankDelta > prev.rankDelta) upgrades.set(donorId, row);
    }
  }

  for (const { donorId, project, amount } of todayPairs.values()) {
    const h = history.get(`${donorId}|${project}`);
    if (!h || h.all.length === 0) continue;
    const priorToday = h.all.filter(x => String(x.receipt_date).slice(0, 10) < todayDay);
    if (priorToday.length === 0) continue;
    const lastPrior = priorToday.reduce((max, x) => {
      const d = String(x.receipt_date).slice(0, 10);
      return d > max ? d : max;
    }, '');
    const cutoffDate = new Date(`${todayDay}T00:00:00Z`);
    cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
    const cutoffDay = cutoffDate.toISOString().slice(0, 10);
    if (!lastPrior || lastPrior > cutoffDay) continue;
    const profile = profiles.get(donorId) || {};
    const row = {
      donor: profile.name || 'Unknown',
      mobile: profile.mobile_number || '',
      ngo: titleCase(project),
      previousLast: lastPrior,
      reactivatedOn: todayDay,
      daysInactive: dayDiff(lastPrior, todayDay),
      amount,
      donorId,
    };
    const prev = activationsToday.get(donorId);
    if (!prev || row.daysInactive > prev.daysInactive) activationsToday.set(donorId, row);
  }

  return { collected, activations: [...activations.values()], activationsToday: [...activationsToday.values()], upgrades: [...upgrades.values()] };
}

async function computeStatusLists(workerId, pairs) {
  if (!pairs.length) return { active: [], inactive: [] };
  const pairKeys = pairs.map(p => `${p.ngo_id}|${p.station}`);
  const { rows: assigns } = await db._pool.query(`
    SELECT DISTINCT a.donor_id, a.ngo_id, btrim(a.station) AS station
      FROM fro_assignments a
     WHERE (a.status IS NULL OR a.status <> 'reassigned')
       AND a.station IS NOT NULL
       AND (a.ngo_id::text || '|' || btrim(a.station)) = ANY($1::text[])
  `, [pairKeys]);
  if (!assigns.length) return { active: [], inactive: [] };

  const donorIds = [...new Set(assigns.map(a => Number(a.donor_id)).filter(Boolean))];
  const [profiles, lastReceipts] = await Promise.all([
    donorProfiles(donorIds),
    lastReceiptsByDonorProject(donorIds),
  ]);
  const ngoIds = [...new Set(assigns.map(a => a.ngo_id).filter(Boolean))];
  const { rows: ngoRows } = ngoIds.length
    ? await db._pool.query(`SELECT id, lower(code) AS code FROM ngos WHERE id = ANY($1::uuid[])`, [ngoIds])
    : { rows: [] };
  const ngoCode = new Map(ngoRows.map(n => [String(n.id), n.code]));

  const active = [];
  const inactive = [];
  for (const a of assigns) {
    const profile = profiles.get(Number(a.donor_id)) || {};
    const project = ngoCode.get(String(a.ngo_id)) || '';
    const receiptLast = lastReceipts.get(`${a.donor_id}|${project}`) || '';
    const profileLast = profile.last_donation_date ? String(profile.last_donation_date).slice(0, 10) : '';
    const last = receiptLast > profileLast ? receiptLast : profileLast;
    const row = {
      donor: profile.name || 'Unknown',
      mobile: profile.mobile_number || '',
      ngo: titleCase(project),
      station: a.station,
      lastDonation: last || '',
      donorId: a.donor_id,
    };
    if (last && last >= activeCutoffDay) active.push(row);
    else inactive.push(row);
  }
  const dedupe = (rows) => {
    const seen = new Set();
    return rows.filter(r => {
      const key = `${r.donorId}|${r.ngo}|${r.station}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => String(a.donor).localeCompare(String(b.donor)));
  };
  return { active: dedupe(active), inactive: dedupe(inactive) };
}

function styleHeader(row, fill = 'FF2F5597') {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    };
  });
}

function styleBody(row, index, numericCols = []) {
  row.height = 19;
  row.eachCell((cell, col) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: numericCols.includes(col) ? 'center' : 'left',
      wrapText: false,
    };
    if (index % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
  });
}

function addSheet(wb, name, columns, rows, options = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns;
  styleHeader(ws.getRow(1));
  rows.forEach((values, i) => {
    const row = ws.addRow(values);
    styleBody(row, i, options.numericCols || []);
  });
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}${Math.max(1, rows.length + 1)}` };
  if (options.categoryCols?.length) {
    for (const col of options.categoryCols) {
      for (let r = 2; r <= rows.length + 1; r++) {
        ws.getCell(`${col}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [CATEGORY_VALIDATION],
        };
      }
    }
  }
  return ws;
}

(async () => {
  console.log('Loading active FROs with stations…');
  const workers = await loadWorkers();
  console.log(`  ${workers.length} FRO(s)`);

  const summary = [];
  const allActivations = [];
  const allUpgrades = [];
  const allActive = [];
  const allInactive = [];

  for (const w of workers) {
    process.stdout.write(`  ${w.name}… `);
    const pairs = await stationPairsForWorker(w.id);
    const metrics = await computeMetrics(w.id);
    const status = await computeStatusLists(w.id, pairs);
    const activeDistinct = new Set(status.active.map(r => r.donorId)).size;
    const inactiveDistinct = new Set(status.inactive.map(r => r.donorId)).size;

    summary.push([
      w.name,
      w.stations.join(', '),
      metrics.activationsToday.length,
      metrics.activations.length,
      metrics.upgrades.length,
      activeDistinct,
      inactiveDistinct,
    ]);
    for (const r of metrics.activations) allActivations.push([w.name, 'Month', r.donor, r.mobile, r.ngo, r.previousLast, r.reactivatedOn, r.daysInactive, money(r.amount)]);
    for (const r of metrics.activationsToday) allActivations.push([w.name, 'Today', r.donor, r.mobile, r.ngo, r.previousLast, r.reactivatedOn, r.daysInactive, money(r.amount)]);
    for (const r of metrics.upgrades) allUpgrades.push([w.name, r.donor, r.mobile, r.ngo, r.from, r.to, r.avgBefore, r.avgAfter, money(r.amount), r.upgradedOn]);
    for (const r of status.active) allActive.push([w.name, r.donor, r.mobile, r.ngo, r.station, r.lastDonation]);
    for (const r of status.inactive) allInactive.push([w.name, r.donor, r.mobile, r.ngo, r.station, r.lastDonation]);
    console.log(`done (${metrics.activationsToday.length}/${metrics.activations.length}/${metrics.upgrades.length})`);
  }

  const excluded = await db._pool.query(`
    SELECT w.name, count(*)::int receipts, sum(r.amount)::numeric total
      FROM receipts r
      JOIN workers w ON w.name = btrim(r.agent_name)
     WHERE r.receipt_date >= $1 AND r.receipt_date <= $2
       AND r.voided_at IS NULL
       AND w.department = 'FRO'
       AND w.is_active = TRUE
       AND NOT EXISTS (SELECT 1 FROM fro_station_assignments f WHERE f.fro_worker_id = w.id)
       AND NOT EXISTS (
         SELECT 1 FROM temporary_data_assignments t
          WHERE t.working_fro_worker_id = w.id
            AND t.status = 'ACTIVE'
            AND t.starts_at <= now()
            AND t.expires_at >= now()
       )
     GROUP BY w.name
     ORDER BY total DESC
  `, [startDay, endDay]);
  const excludedRows = (excluded.rows || [])
    .filter(r => !EXCLUDED_NAMES.has(String(r.name || '').trim().toLowerCase()))
    .map(r => [r.name, Number(r.receipts || 0), money(r.total), 'No current station assignment — excluded from the main sheet']);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UCS CRM';
  wb.created = new Date();

  // Summary
  const summarySheet = addSheet(wb, 'Summary', [
    { header: 'FRO', key: 'fro', width: 24 },
    { header: 'Stations', key: 'stations', width: 40 },
    { header: 'Inactive → Active (Today)', key: 'inactive', width: 20 },
    { header: 'Inactive → Active (Month)', key: 'inactiveMonth', width: 21 },
    { header: 'Category Upgrades (Month)', key: 'upgrades', width: 21 },
    { header: 'Active Donors', key: 'active', width: 15 },
    { header: 'Inactive Donors', key: 'inactiveDonors', width: 16 },
  ], summary, { numericCols: [3, 4, 5, 6, 7] });
  summarySheet.getColumn(2).alignment = { wrapText: true, vertical: 'middle' };
  const totalRow = summarySheet.addRow([
    'Total',
    '',
    summary.reduce((s, r) => s + r[2], 0),
    summary.reduce((s, r) => s + r[3], 0),
    summary.reduce((s, r) => s + r[4], 0),
    summary.reduce((s, r) => s + r[5], 0),
    summary.reduce((s, r) => s + r[6], 0),
  ]);
  totalRow.height = 21;
  totalRow.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    cell.border = { top: { style: 'medium', color: { argb: 'FF93C5FD' } } };
    cell.alignment = { vertical: 'middle', horizontal: col >= 3 ? 'center' : 'left' };
  });

  addSheet(wb, 'Inactive to Active', [
    { header: 'FRO', key: 'fro', width: 22 },
    { header: 'Window', key: 'window', width: 10 },
    { header: 'Donor', key: 'donor', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'NGO', key: 'ngo', width: 12 },
    { header: 'Previous Last Donation', key: 'prev', width: 20 },
    { header: 'Reactivated On', key: 'on', width: 17 },
    { header: 'Days Inactive', key: 'days', width: 14 },
    { header: 'This Month Amount', key: 'amount', width: 18 },
  ], allActivations, { numericCols: [8, 9] });

  addSheet(wb, 'Category Upgrades', [
    { header: 'FRO', key: 'fro', width: 22 },
    { header: 'Donor', key: 'donor', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'NGO', key: 'ngo', width: 12 },
    { header: 'From Category', key: 'from', width: 16 },
    { header: 'To Category', key: 'to', width: 16 },
    { header: 'Avg Before', key: 'avgBefore', width: 14 },
    { header: 'Avg After', key: 'avgAfter', width: 14 },
    { header: 'This Month Amount', key: 'amount', width: 18 },
    { header: 'Upgraded On', key: 'on', width: 15 },
  ], allUpgrades, { numericCols: [7, 8, 9], categoryCols: ['E', 'F'] });

  addSheet(wb, 'Active Donors', [
    { header: 'FRO', key: 'fro', width: 22 },
    { header: 'Donor', key: 'donor', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'NGO', key: 'ngo', width: 12 },
    { header: 'Station', key: 'station', width: 16 },
    { header: 'Last Donation', key: 'last', width: 16 },
  ], allActive.filter(r => r[5]));

  addSheet(wb, 'Inactive Donors', [
    { header: 'FRO', key: 'fro', width: 22 },
    { header: 'Donor', key: 'donor', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'NGO', key: 'ngo', width: 12 },
    { header: 'Station', key: 'station', width: 16 },
    { header: 'Last Donation', key: 'last', width: 16 },
  ], allInactive);

  addSheet(wb, 'Excluded FROs', [
    { header: 'FRO', key: 'fro', width: 24 },
    { header: 'Nov Receipts', key: 'receipts', width: 14 },
    { header: 'Nov Total', key: 'total', width: 16 },
    { header: 'Reason', key: 'reason', width: 60 },
  ], excludedRows, { numericCols: [2, 3] });

  // Definitions
  const defs = wb.addWorksheet('Definitions', { views: [{ state: 'frozen', ySplit: 1 }] });
  defs.columns = [{ width: 30 }, { width: 110 }];
  defs.getRow(1).values = ['Metric / Field', 'Definition'];
  styleHeader(defs.getRow(1));
  const defRows = [
    ['Period', `${monthLabel} · Today = ${new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)}`],
    ['Inactive → Active (Today)', 'Donors credited to the FRO today whose previous receipt in the same NGO was 12 months or more before today. New donors are excluded.'],
    ['Inactive → Active (Month)', 'Donors credited to the FRO this month whose previous receipt in the same NGO was 12 months or more before their first donation this month. New donors are excluded.'],
    ['Category Upgrades (Month)', 'Donors whose per-NGO average donation category moved to a higher bucket versus the start of the month. From Category → To Category is shown in the detail sheet.'],
    ['Active Donors', 'Current live donors in the FRO\'s stations whose last receipt (or profile last donation) is within the last 12 months.'],
    ['Inactive Donors', 'Current live donors in the FRO\'s stations whose last receipt (or profile last donation) is older than 12 months, or missing.'],
    ['Why a FRO may be missing', 'FROs with no current station (permanent or active temporary access) are listed on the Excluded FROs sheet — e.g. Sakshi Singh had receipts but no station at the time of this export.'],
    ['Editable', 'No sheet protection is applied. Category From/To columns have dropdown validation; filters and frozen headers are enabled.'],
    ['Source', 'LAN CRM ucs_crm · station scope + receipts'],
  ];
  defRows.forEach(([a, b], i) => {
    const r = defs.addRow([a, b]);
    styleBody(r, i);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.height = 34;
  });

  await wb.xlsx.writeFile(OUT);
  console.log('WROTE', OUT);
  await db._pool.end();
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});

import fs from 'fs';
import pg from 'pg';

const A_PATH = 'C:/Users/Shon/AppData/Local/Temp/opencode/aflf_donors.ndjson';
const B_PATH = 'C:/Users/Shon/AppData/Local/Temp/opencode/bsct_donors.ndjson';
const OUT = 'C:/Users/Shon/AppData/Local/Temp/opencode/reconciliation.json';

const A = fs.readFileSync(A_PATH, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const B = fs.readFileSync(B_PATH, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const ok = (s, p) => { const m = new RegExp(`^${p}-(\\d+)$`).exec(s || ''); return m && Number(m[1]) <= 18; };

const aodRows = A.filter(r => ok(r.station, 'AOD'));
const bodRows = B.filter(r => ok(r.station, 'BOD'));
const aod = new Map(aodRows.map(r => [r.id, r]));
const bod = new Map(bodRows.map(r => [r.id, r]));
const allAflf = new Map(A.map(r => [r.id, r]));
const allBsct = new Map(B.map(r => [r.id, r]));

const ids = new Set([...aod.keys(), ...bod.keys()]);
const aonly = [...ids].filter(id => aod.has(id) && !bod.has(id));
const bonly = [...ids].filter(id => bod.has(id) && !aod.has(id));
const common = [...ids].filter(id => aod.has(id) && bod.has(id));

const p = new pg.Pool({ connectionString: 'postgres://postgres:bsct_2014@192.168.1.100:5432/ucs_crm', ssl: false });
let dndRows = [];
try {
  dndRows = (await p.query(`
    SELECT d.donor_id, n.code, d.station
      FROM donor_dnd d
      JOIN ngos n ON n.id = d.ngo_id
     WHERE d.released_at IS NULL
  `)).rows;
} finally { await p.end(); }

const dndMap = new Map(); // donor_id -> { BSCT:Set, AFLF:Set, MANN:Set }
for (const d of dndRows) {
  if (!dndMap.has(d.donor_id)) dndMap.set(d.donor_id, {});
  const obj = dndMap.get(d.donor_id);
  const st = String(d.station || '').trim() || 'station not set';
  if (!obj[d.code]) obj[d.code] = new Set();
  obj[d.code].add(st);
}
const dndText = (id, code) => {
  const set = dndMap.get(id)?.[code];
  return set ? [...set].join(', ') : '';
};

const rowFor = (id, side) => {
  const a = aod.get(id);
  const b = bod.get(id);
  const aAny = allAflf.get(id);
  const bAny = allBsct.get(id);
  return {
    id,
    name: (a || b || aAny || bAny)?.name || 'Unknown',
    mobile: (a || b || aAny || bAny)?.mobile || '',
    side,
    inAod: !!a,
    inBod: !!b,
    aflfStation: aAny?.station || '',
    bsctStation: bAny?.station || '',
    aodStation: a?.station || '',
    bodStation: b?.station || '',
    bsctDnd: dndText(id, 'BSCT'),
    aflfDnd: dndText(id, 'AFLF'),
    mannDnd: dndText(id, 'MANN'),
  };
};

const rows = [
  ...aonly.map(id => rowFor(id, 'AFLF Only')),
  ...common.map(id => rowFor(id, 'Common')),
  ...bonly.map(id => rowFor(id, 'BSCT Only')),
];

const breakdown = {};
for (const id of aonly) {
  const r = rowFor(id, 'AFLF Only');
  const st = r.bsctStation || 'No BSCT assignment';
  const key = st === 'No BSCT assignment' ? st : (st.split('-')[0] || st);
  breakdown[key] = (breakdown[key] || 0) + 1;
}

const dndSummary = (idsList) => {
  let bsct = 0, aflf = 0, mann = 0, any = 0;
  for (const id of idsList) {
    const b = !!dndText(id, 'BSCT');
    const a = !!dndText(id, 'AFLF');
    const m = !!dndText(id, 'MANN');
    if (b) bsct++;
    if (a) aflf++;
    if (m) mann++;
    if (b || a || m) any++;
  }
  return { total: idsList.length, bsct, aflf, mann, any, none: idsList.length - any };
};

const bonlyBreakdown = {};
for (const id of bonly) {
  const r = rowFor(id, 'BSCT Only');
  const st = r.aflfStation || 'No AFLF assignment';
  const key = st === 'No AFLF assignment' ? st : (st.split('-')[0] || st);
  bonlyBreakdown[key] = (bonlyBreakdown[key] || 0) + 1;
}

const data = {
  generatedAt: new Date().toISOString(),
  counts: {
    aod: aod.size,
    bod: bod.size,
    common: common.length,
    aonly: aonly.length,
    bonly: bonly.length,
    unique: ids.size,
    diff: aod.size - bod.size,
  },
  breakdown,
  bonlyBreakdown,
  aonlyDnd: dndSummary(aonly),
  bonlyDnd: dndSummary(bonly),
  commonDnd: dndSummary(common),
  rows,
};

fs.writeFileSync(OUT, JSON.stringify(data), 'utf8');
console.log('wrote', OUT);
console.log(data.counts);
console.log('breakdown', breakdown);
console.log('bonlyBreakdown', bonlyBreakdown);
console.log('aonlyDnd', data.aonlyDnd);
console.log('commonDnd', data.commonDnd);

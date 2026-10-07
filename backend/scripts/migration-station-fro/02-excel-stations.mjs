// D2: apply the three "pure split" Excel files as the authority for
// donor -> station within each NGO.
//
//   bsct -> BOD-*   mann -> MOD-*   aflf -> AOD-*
//
// Rules:
//   * donor present in the file with a Station -> write it
//   * Station blank                            -> no change
//   * donor absent from the file               -> no change (never moved)
//   * ghost ids 307761 / 320534 / 308424       -> skipped; they alias onto
//     320535 / 323510, which have their own file rows
//
// Reads are done one query per NGO (not one per row) so a dry run finishes in
// seconds instead of tens of thousands of round trips.
import pg from 'pg';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const DSN =
  process.env.DATABASE_URL ||
  'postgres://ucs_admin:ucscompany123@ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com:5432/postgres';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..');
const APPLY = process.argv.includes('--apply');

const GHOST_ALIAS = { 320534: 320535, 307761: 320535, 308424: 323510 };

const FILES = [
  { file: 'bsct pure split(new).xlsx', ngo: 'BSCT', prefix: 'BOD-' },
  { file: 'mann pure split(new).xlsx', ngo: 'MANN', prefix: 'MOD-' },
  { file: 'aflf pure split(new).xlsx', ngo: 'AFLF', prefix: 'AOD-' },
];

async function main() {
  const client = new pg.Client({
    connectionString: DSN,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  });
  client.on('error', e => console.error('pg error:', e.message));
  await client.connect();

  try {
    const ngoRows = await client.query('SELECT id, name FROM ngos');
    const ngoByName = {};
    for (const r of ngoRows.rows) ngoByName[r.name] = r.id;

    let totalWrites = 0;

    for (const spec of FILES) {
      const ngoId = ngoByName[spec.ngo];
      if (!ngoId) throw new Error('NGO not found: ' + spec.ngo);

      const wb = xlsx.read(fs.readFileSync(path.join(REPO, spec.file)));
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });

      // 1) file -> desired station, skipping ghosts / blanks / wrong prefix
      const want = new Map();
      let skippedGhost = 0;
      let skippedBlank = 0;
      let wrongPrefix = 0;
      for (const r of rows) {
        const raw = String(r.DonorID);
        if (Object.prototype.hasOwnProperty.call(GHOST_ALIAS, raw)) { skippedGhost++; continue; }
        const station = r.Station && String(r.Station).trim() ? String(r.Station).trim() : null;
        if (!station) { skippedBlank++; continue; }
        if (!station.startsWith(spec.prefix)) { wrongPrefix++; continue; }
        const donorId = parseInt(raw, 10);
        if (!Number.isFinite(donorId)) continue;
        want.set(donorId, station);
      }

      // 2) one query for the NGO's whole active assignment set
      const { rows: current } = await client.query(
        `SELECT id, donor_id, station FROM fro_assignments
          WHERE ngo_id = $1 AND status IS DISTINCT FROM 'reassigned'`,
        [ngoId]);
      const have = new Map();
      for (const a of current) if (!have.has(a.donor_id)) have.set(a.donor_id, a);

      // 3) diff
      const changes = [];
      const noActiveRow = [];
      for (const [donorId, station] of want) {
        const a = have.get(donorId);
        if (!a) { noActiveRow.push(donorId); continue; }
        if (a.station !== station) changes.push({ id: a.id, donor_id: donorId, from: a.station, to: station });
      }

      const nullToVal = changes.filter(c => c.from === null).length;

      console.log(`\n=== ${spec.ngo} (${spec.file}) ===`);
      console.log(`  file rows           : ${rows.length}`);
      console.log(`  applicable donors   : ${want.size}`);
      console.log(`  skipped ghost alias : ${skippedGhost}`);
      console.log(`  skipped blank Stn   : ${skippedBlank}`);
      console.log(`  wrong prefix        : ${wrongPrefix}`);
      console.log(`  no active row       : ${noActiveRow.length}` +
        (noActiveRow.length ? ' -> ' + JSON.stringify(noActiveRow.slice(0, 10)) : ''));
      console.log(`  station changes     : ${changes.length} (null->value ${nullToVal})`);
      if (changes.length) console.log(`      sample          : ${JSON.stringify(changes.slice(0, 5))}`);

      if (APPLY && changes.length) {
        for (const ch of changes) {
          const res = await client.query(
            `UPDATE fro_assignments SET station = $1
              WHERE id = $2 AND status IS DISTINCT FROM 'reassigned' AND station IS DISTINCT FROM $1`,
            [ch.to, ch.id]);
          if (res.rowCount !== 1) console.error(`  WARN: expected 1 row updated, got ${res.rowCount} for id ${ch.id}`);
        }
        console.log(`  APPLIED ${changes.length} station updates`);
        totalWrites += changes.length;
      }
    }

    console.log(`\nTOTAL station writes: ${APPLY ? totalWrites : '(dry run)'}`);
    if (!APPLY) console.log('DRY RUN — pass --apply to execute.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});

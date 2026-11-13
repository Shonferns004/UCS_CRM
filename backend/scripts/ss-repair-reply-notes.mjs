// Repair SS assignment notes that were saved without the reply text.
//
// The old replyText() stripped [Button: ...] as if it were a CRM tag, so a
// template-button reply produced notes like "[Lead:<id>]" with no visible
// answer. This copies the missing reply back from the source lead.
//
//   node scripts/ss-repair-reply-notes.mjs
//   node scripts/ss-repair-reply-notes.mjs --apply
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
const pg = (await import('pg')).default;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;

const APPLY = process.argv.includes('--apply');

const replyText = (notes) => String(notes || '')
  .split('\n')
  .filter((l) => !/^\[(Template|Account|Lead):/i.test(l.trim()))
  .join('\n')
  .trim();

try {
  const rows = await q(`
    select a.id, a.station, a.notes
      from fro_assignments a
     where a.notes like '%[Lead:%'
     order by a.id`);

  const leadIds = new Set();
  for (const r of rows) {
    for (const m of String(r.notes || '').matchAll(/\[Lead:([^\]]+)\]/g)) leadIds.add(m[1]);
  }

  const leads = leadIds.size
    ? await q(`select id, notes from leads where id = any($1::uuid[])`, [[...leadIds]])
    : [];
  const replyById = new Map(leads.map((l) => [l.id, replyText(l.notes)]));

  const fixes = [];
  for (const r of rows) {
    const markers = [...String(r.notes || '').matchAll(/\[Lead:([^\]]+)\]/g)].map((m) => m[1]);
    const missing = [...new Set(markers.map((id) => replyById.get(id)).filter(Boolean))]
      .filter((reply) => !String(r.notes || '').includes(reply));
    if (missing.length === 0) continue;
    fixes.push({ id: r.id, station: r.station, add: missing, before: r.notes });
  }

  console.log(`assignments with a [Lead:] marker: ${rows.length}`);
  console.log(`need the reply restored: ${fixes.length}`);
  console.table(fixes.slice(0, 20).map((f) => ({ id: f.id, station: f.station, reply: f.add.join(' | '), before: f.before })));

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write.');
    await pool.end();
    process.exit(0);
  }

  let updated = 0;
  for (const f of fixes) {
    const next = `${f.add.join('\n')}\n${f.before}`;
    await pool.query(`update fro_assignments set notes = $2, updated_at = now() where id = $1`, [f.id, next]);
    updated += 1;
  }
  console.log(`\nAPPLIED — updated ${updated} assignment(s)`);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}

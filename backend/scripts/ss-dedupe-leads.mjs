// Remove duplicate WhatsApp reply leads that share the same last-10 phone.
// Keeps the strongest row (highest AI score), appends the other replies to its
// notes, then deletes the duplicates.
//
//   node scripts/ss-dedupe-leads.mjs
//   node scripts/ss-dedupe-leads.mjs --apply
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

const replyLines = (notes) => String(notes || '')
  .split('\n')
  .filter((l) => !/^\[(Template|Account|Lead):/i.test(l.trim()))
  .map((l) => l.trim())
  .filter(Boolean);

try {
  const groups = await q(`
    select right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10) m10,
           array_agg(id order by coalesce(ai_score,0) desc, created_at asc) ids
      from leads
     where source = 'WhatsApp Bulk Reply'
     group by 1
    having count(*) > 1`);

  if (groups.length === 0) {
    console.log('no duplicate reply leads');
    await pool.end();
    process.exit(0);
  }

  const plan = [];
  for (const g of groups) {
    const ids = g.ids;
    const keepId = ids[0];
    const { rows } = await pool.query(
      `select id, name, phone, notes from leads where id = any($1::uuid[])`,
      [ids],
    );
    const keep = rows.find((r) => r.id === keepId);
    const drop = rows.filter((r) => r.id !== keepId);
    const extra = [];
    for (const d of drop) {
      for (const line of replyLines(d.notes)) {
        if (!replyLines(keep.notes).includes(line) && !extra.includes(line)) extra.push(line);
      }
    }
    plan.push({ m10: g.m10, keep: keepId, drop: drop.map((d) => d.id), extra, keepNotes: keep.notes });
  }

  console.table(plan.map((p) => ({ phone: p.m10, keep: p.keep, remove: p.drop.join(','), extra: p.extra.join(' | ') })));

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write.');
    await pool.end();
    process.exit(0);
  }

  for (const p of plan) {
    if (p.extra.length) {
      await pool.query(
        `update leads
            set notes = coalesce(nullif(notes, ''), '') ||
                        case when coalesce(notes, '') = '' then '' else E'\n' end || $2,
                ai_at = null,
                updated_at = now()
          where id = $1`,
        [p.keep, p.extra.join('\n')],
      );
    }
    await pool.query(`delete from leads where id = any($1::uuid[])`, [p.drop]);
  }
  console.log(`\nAPPLIED — kept ${plan.length} lead(s), removed ${plan.reduce((s, p) => s + p.drop.length, 0)} duplicate(s)`);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}

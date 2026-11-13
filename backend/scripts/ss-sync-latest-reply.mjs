// Sync the latest inbound WhatsApp message into a reply lead and its assignment.
//
// The old webhook skipped repeat replies, so a lead could keep showing the first
// button ("Volunteer With Us") even after the donor clicked "Donate Now".
//
//   node scripts/ss-sync-latest-reply.mjs
//   node scripts/ss-sync-latest-reply.mjs --apply
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

try {
  const rows = await q(`
    with latest as (
      select distinct on (right(regexp_replace(coalesce(c.phone_normalized, c.phone, ''), '[^0-9]', '', 'g'), 10))
             right(regexp_replace(coalesce(c.phone_normalized, c.phone, ''), '[^0-9]', '', 'g'), 10) as m10,
             m.body_text, m.created_at
        from messages m
        join contacts c on c.id = m.contact_id
       where m.direction = 'inbound'
         and coalesce(m.body_text, '') <> ''
       order by right(regexp_replace(coalesce(c.phone_normalized, c.phone, ''), '[^0-9]', '', 'g'), 10),
                m.created_at desc
    )
    select l.id, l.name, l.phone, l.notes, l.updated_at,
           latest.body_text, latest.created_at as msg_at
      from leads l
      join latest
        on right(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), 10) = latest.m10
     where l.source = 'WhatsApp Bulk Reply'
     order by latest.created_at desc`);

  const fixes = [];
  for (const r of rows) {
    const body = String(r.body_text || '').trim();
    if (!body) continue;
    if (String(r.notes || '').includes(body)) continue;
    fixes.push(r);
  }

  console.log(`leads checked: ${rows.length}`);
  console.log(`need the latest reply: ${fixes.length}`);
  console.table(fixes.slice(0, 15).map((f) => ({
    name: f.name,
    phone: f.phone,
    latest: f.body_text,
    msg_at: f.msg_at,
    notes: String(f.notes || '').replace(/\n/g, ' | ').slice(0, 70),
  })));

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write.');
    await pool.end();
    process.exit(0);
  }

  let leadUpdates = 0; let assignmentUpdates = 0;
  for (const f of fixes) {
    const stamp = new Date(f.msg_at).toISOString();
    const line = `[${stamp}] ${String(f.body_text).trim()}`;

    await pool.query(
      `update leads
          set notes = coalesce(nullif(notes, ''), '') ||
                      case when coalesce(notes, '') = '' then '' else E'\n' end || $2,
              ai_at = null,
              updated_at = now()
        where id = $1`,
      [f.id, line],
    );
    leadUpdates += 1;

    const { rows: assigns } = await pool.query(
      `select id, notes from fro_assignments
        where notes like '%[Lead:' || $1 || ']%'
          and (status is null or status <> 'reassigned')`,
      [f.id],
    );
    for (const a of assigns) {
      const body = String(f.body_text).trim();
      if (String(a.notes || '').includes(body)) continue;
      await pool.query(
        `update fro_assignments
            set notes = coalesce(nullif(notes, ''), '') ||
                        case when coalesce(notes, '') = '' then '' else E'\n' end || $2,
                updated_at = now()
          where id = $1`,
        [a.id, body],
      );
      assignmentUpdates += 1;
    }
  }

  console.log(`\nAPPLIED — leads updated: ${leadUpdates}, assignments updated: ${assignmentUpdates}`);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}

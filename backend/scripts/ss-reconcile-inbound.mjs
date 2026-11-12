// ---------------------------------------------------------------------------
// Reconcile inbound WhatsApp messages that never became leads.
//
// The old webhook only created a lead when the sender was an exact-format match
// in whatsapp_bulk_recipients. Replies from other numbers on the same NGO
// numbers were stored as chat messages but never reached the SS inbox.
//
// Usage:
//   node scripts/ss-reconcile-inbound.mjs --hours=48
//   node scripts/ss-reconcile-inbound.mjs --hours=48 --apply
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
const pg = (await import('pg')).default;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;

const arg = (name, def) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : true;
};
const HOURS = Number(arg('hours', 48));
const APPLY = !!arg('apply', false);

const { qualifySsReply, materializeReplyLead } = await import('../src/services/ssLeadService.js');

try {
  const candidates = await q(`
    with latest as (
      select distinct on (right(regexp_replace(coalesce(c.phone_normalized, c.phone, ''), '[^0-9]', '', 'g'), 10))
             right(regexp_replace(coalesce(c.phone_normalized, c.phone, ''), '[^0-9]', '', 'g'), 10) as m10,
             c.phone_normalized, c.phone, c.wa_profile_name,
             cv.project,
             m.body_text, m.created_at
        from messages m
        join contacts c on c.id = m.contact_id
        left join conversations cv on cv.id = m.conversation_id
       where m.direction = 'inbound'
         and m.created_at > now() - ($1 || ' hours')::interval
       order by right(regexp_replace(coalesce(c.phone_normalized, c.phone, ''), '[^0-9]', '', 'g'), 10),
                m.created_at desc
    )
    select l.*
      from latest l
     where coalesce(l.project, '') <> ''
       and not exists (
         select 1 from leads x
          where x.source = 'WhatsApp Bulk Reply'
            and right(regexp_replace(coalesce(x.phone, ''), '[^0-9]', '', 'g'), 10) = l.m10
       )
     order by l.created_at desc
  `, [HOURS]);

  console.log(`window: last ${HOURS}h · inbound without a lead: ${candidates.length}`);
  console.table(candidates.map((c) => ({
    m10: c.m10,
    name: c.wa_profile_name || '',
    project: c.project,
    message: String(c.body_text || '').replace(/\s+/g, ' ').slice(0, 50),
    qualify: qualifySsReply(c.body_text || '') ? 'YES → station' : 'no → inbox',
    at: c.created_at,
  })));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to create these leads.');
    await pool.end();
    process.exit(0);
  }

  let created = 0; let placed = 0;
  for (const c of candidates) {
    const phone = c.phone_normalized || c.phone || c.m10;
    const { rows } = await pool.query(
      `insert into leads (name, phone, source, status, notes, created_by_name)
       values ($1, $2, 'WhatsApp Bulk Reply', 'new', $3, 'WhatsApp Bulk Reply')
       returning id, name, phone, notes`,
      [
        c.wa_profile_name || phone,
        phone,
        `${c.body_text || ''}\n[Template: -]\n[Account: ${c.project}]`,
      ],
    );
    created += 1;
    const lead = rows[0];
    if (lead && qualifySsReply(c.body_text || '')) {
      try {
        const res = await materializeReplyLead(lead, {});
        if (res.ok) placed += 1;
      } catch (e) {
        console.error('place failed for', c.m10, e.message);
      }
    }
  }
  console.log(`\nAPPLIED — leads created: ${created}, placed in SS stations: ${placed}`);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}

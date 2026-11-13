// ---------------------------------------------------------------------------
// SS (WhatsApp reply) leads -> per-NGO SS stations
//
// What it does
//   1. Reads WhatsApp Bulk Reply leads from the last N days.
//   2. Classifies each reply: INTERESTED / NOT_INTERESTED / AUTO_REPLY / REVIEW.
//   3. Dry-run: prints what it WOULD do (no writes).
//   4. --apply: creates the three SS stations if missing, optionally revokes the
//      old manual assignments, then materialises only INTERESTED leads as real
//      donor_profiles + fro_assignments rows inside the NGO's SS station.
//
// Safe by design
//   * Idempotent: one active assignment per (donor_id, ngo_id) is enforced by
//     uq_fro_assignments_active_donor_ngo; replies for a donor that already has
//     a live assignment are appended to that assignment's notes, never duplicated.
//   * Re-running --apply will not add anything twice (assignment notes carry a
//     [Lead:<id>] marker).
//   * Nothing is deleted. Revoke only flips leads.status back to 'new' and
//     clears recruiter_id.
//
// Usage
//   node scripts/ss-leads-backfill.mjs                     (dry run, 6 days)
//   node scripts/ss-leads-backfill.mjs --days=5 --verbose  (dry run, 5 days)
//   node scripts/ss-leads-backfill.mjs --apply --revoke    (do it)
//   node scripts/ss-leads-backfill.mjs --apply --revoke --include-review
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

const pg = (await import('pg')).default;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
});

const arg = (name, def) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : true;
};

const DAYS = Number(arg('days', 6));
const APPLY = !!arg('apply', false);
const REVOKE = !!arg('revoke', false);
const INCLUDE_REVIEW = !!arg('include-review', false);
const VERBOSE = !!arg('verbose', false);

const STATIONS = { BSCT: 'SS-BSCT', AFLF: 'SS-AFLF', MANN: 'SS-MANN' };

// ── classification ──────────────────────────────────────────────────────────
const REJECT_BUTTON = /not\s*interested|maybe\s*later|^stop$|unsubscribe|no\s*thanks/i;
const INTEREST_BUTTON = /interested|want\s*to\s*donate|donate\s*now|send\s*details|more\s*information|volunteer|yes/i;
const REJECT_TEXT = /(not\s*interested|don'?t\s*call|do\s*not\s*call|wrong\s*number|remove\s*my\s*number|unsubscribe|^stop\b|no\s*thanks|already\s*donated)/i;
const AUTO_REPLY = /(thank\s*you\s*for\s*contacting|thanks\s*for\s*contacting|thank\s*you\s*for\s*your\s*(message|interest)|thank\s*you\s*for\s*writing|welcome\s*to|please\s*let\s*us\s*know\s*how\s*we\s*can\s*help|we\s*(will|'ll)\s*(respond|get\s*back)|please\s*wait|we\s*are\s*unavailable|auto[\s-]?reply|automated|assalamoaleikum|namaste|hello\s*and\s*welcome|jay\s*shri\s*shyam|business\s*hours)/i;

function parseNotes(notes) {
  const text = String(notes || '');
  const button = (text.match(/\[Button:\s*([^\]]+)\]/i) || [])[1] || '';
  const account = (text.match(/\[Account:\s*([^\]]+)\]/i) || [])[1] || '';
  const template = (text.match(/\[Template:\s*([^\]]+)\]/i) || [])[1] || '';
  const message = text
    .split('\n')
    .filter((l) => !/^\[(Template|Account|Button|Station|Lead):/i.test(l.trim()))
    .join('\n')
    .trim();
  return { button, account, template, message };
}

function ngoOf(account) {
  const a = String(account || '').toLowerCase();
  if (a.startsWith('bsct')) return 'BSCT';
  if (a.startsWith('aflf')) return 'AFLF';
  if (a.startsWith('mann')) return 'MANN';
  return null;
}

function classify({ button, message }) {
  const b = String(button || '').trim();
  if (b) {
    if (REJECT_BUTTON.test(b)) return 'NOT_INTERESTED';
    if (INTEREST_BUTTON.test(b)) return 'INTERESTED';
    return 'REVIEW';
  }
  const m = String(message || '').trim();
  if (!m) return 'REVIEW';
  if (REJECT_TEXT.test(m)) return 'NOT_INTERESTED';
  if (AUTO_REPLY.test(m)) return 'AUTO_REPLY';
  // Free text is deliberately NOT auto-qualified: business auto-replies and
  // forwards carry words like "donate" / "help" too. Anything without an
  // explicit template button goes to REVIEW (admin decides).
  return 'REVIEW';
}

const m10 = (v) => String(v || '').replace(/[^0-9]/g, '').slice(-10);

// ── main ────────────────────────────────────────────────────────────────────
try {
  const leads = (await pool.query(
    `select id, name, phone, status, recruiter_id, created_at, notes
       from leads
      where source = 'WhatsApp Bulk Reply'
        and created_at >= now() - ($1 || ' days')::interval
      order by created_at desc`,
    [DAYS],
  )).rows;

  const rows = leads.map((l) => {
    const parsed = parseNotes(l.notes);
    const ngo = ngoOf(parsed.account);
    return {
      ...l,
      ...parsed,
      ngo,
      mobile: m10(l.phone),
      decision: ngo ? classify(parsed) : 'NO_NGO',
    };
  });

  // Real WhatsApp profile names from `contacts` (the bulk list label is usually
  // "Recipient 123", which is useless inside a donor record).
  const mobiles = [...new Set(rows.map((r) => r.mobile).filter(Boolean))];
  const contactNames = new Map();
  if (mobiles.length) {
    const found = (await pool.query(
      `select right(regexp_replace(coalesce(phone_normalized, ''), '[^0-9]', '', 'g'), 10) as m10,
              wa_profile_name
         from contacts
        where right(regexp_replace(coalesce(phone_normalized, ''), '[^0-9]', '', 'g'), 10) = any($1::text[])
          and coalesce(wa_profile_name, '') <> ''`,
      [mobiles],
    )).rows;
    for (const c of found) if (!contactNames.has(c.m10)) contactNames.set(c.m10, c.wa_profile_name);
  }
  const isPlaceholder = (n) => !n || /^recipient\s*\d+$/i.test(String(n).trim()) || /^\d+$/.test(String(n).trim());
  for (const r of rows) {
    r.display_name = isPlaceholder(r.name) ? (contactNames.get(r.mobile) || r.name || 'WhatsApp Reply') : r.name;
  }

  const counts = {};
  for (const r of rows) counts[r.decision] = (counts[r.decision] || 0) + 1;

  console.log(`\n=== SS leads backfill — ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
  console.log(`window: last ${DAYS} days · leads: ${rows.length}`);
  console.log('classification:', counts);

  const byNgo = {};
  for (const r of rows) {
    byNgo[r.ngo || 'NONE'] = byNgo[r.ngo || 'NONE'] || { INTERESTED: 0, REVIEW: 0, NOT_INTERESTED: 0, AUTO_REPLY: 0, NO_NGO: 0 };
    byNgo[r.ngo || 'NONE'][r.decision] += 1;
  }
  console.table(byNgo);

  // one row per (mobile, ngo), best decision wins
  const priority = { INTERESTED: 5, REVIEW: 4, AUTO_REPLY: 2, NOT_INTERESTED: 1, NO_NGO: 0 };
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.mobile}|${r.ngo || ''}`;
    const cur = groups.get(key);
    if (!cur || priority[r.decision] > priority[cur.decision]) groups.set(key, r);
  }
  console.log(`unique (mobile, ngo) pairs: ${groups.size}`);

  // existing profiles + assignments
  const mobileList = [...new Set([...groups.values()].map((g) => g.mobile))];
  const profiles = mobileList.length
    ? (await pool.query(
      `select id, mobile_number, name, ngo, station
         from donor_profiles
        where right(regexp_replace(coalesce(mobile_number,''), '[^0-9]', '', 'g'), 10) = any($1::text[])`,
      [mobileList],
    )).rows
    : [];
  const profileByMobile = new Map(profiles.map((p) => [m10(p.mobile_number), p]));

  const donorIds = profiles.map((p) => p.id);
  const assignments = donorIds.length
    ? (await pool.query(
      `select id, donor_id, ngo_id, station, fro_worker_id, status, notes, batch_type
         from fro_assignments
        where donor_id = any($1::int[])
          and (status is null or status <> 'reassigned')`,
      [donorIds],
    )).rows
    : [];
  const assignmentByDonorNgo = new Map(assignments.map((a) => [`${a.donor_id}|${a.ngo_id}`, a]));

  const ngos = (await pool.query(`select id, name from ngos where upper(name) = any($1::text[])`, [['BSCT', 'AFLF', 'MANN']])).rows;
  const ngoIdByName = new Map(ngos.map((n) => [n.name, n.id]));

  console.log('\n=== per-lead plan ===');
  // Leads the team already removed from a station on purpose (assignment parked
  // as 'reassigned') must never be re-added by a later backfill run.
  const handled = new Set();
  {
    const { rows: marked } = await pool.query(
      `select notes from fro_assignments where notes like '%[Lead:%'`,
    );
    for (const row of marked) {
      for (const m of String(row.notes || '').matchAll(/\[Lead:([^\]]+)\]/g)) handled.add(m[1]);
    }
  }
  const plan = [];
  for (const g of groups.values()) {
    const profile = profileByMobile.get(g.mobile) || null;
    const ngoId = g.ngo ? ngoIdByName.get(g.ngo) : null;
    const existing = profile && ngoId ? assignmentByDonorNgo.get(`${profile.id}|${ngoId}`) : null;
    const wantsPlacement = g.decision === 'INTERESTED' || (INCLUDE_REVIEW && g.decision === 'REVIEW');
    let action = 'SKIP';
    if (existing) {
      // Already has a live lead in this NGO (SS station or a normal one).
      action = wantsPlacement ? 'MERGE' : 'SKIP';
    } else if (handled.has(g.id)) {
      // Processed before and then deliberately removed — do not bring it back.
      action = 'KEPT_OUT';
    } else if (wantsPlacement) {
      action = 'ADD';
    }
    plan.push({ ...g, profile, existing, action });
  }
  const planCounts = plan.reduce((a, p) => ({ ...a, [p.action]: (a[p.action] || 0) + 1 }), {});
  console.log('plan:', planCounts);

  const lines = plan.map((p, i) => [
    i + 1,
    p.decision.padEnd(14),
    (p.ngo || '-').padEnd(5),
    p.mobile,
    (p.profile ? `donor ${p.profile.id}` : 'new donor').padEnd(12),
    (p.existing ? `in ${p.existing.station}` : '-').padEnd(12),
    p.action.padEnd(5),
    (p.button ? `[${p.button}]` : p.message.replace(/\s+/g, ' ').slice(0, 38)),
  ].join(' | '));
  if (VERBOSE) console.log(lines.join('\n'));
  console.log(`\n(use --verbose to print all ${plan.length} rows)`);

  const interesting = plan.filter((p) => p.action === 'ADD' || p.action === 'MERGE');
  console.log('\n=== would be placed in stations ===');
  console.table(interesting.map((p) => ({
    mobile: p.mobile,
    name: p.display_name,
    ngo: p.ngo,
    station: p.action === 'ADD' ? STATIONS[p.ngo] : p.existing.station,
    action: p.action,
    reply: p.button ? `[${p.button}]` : p.message.replace(/\s+/g, ' ').slice(0, 40),
    at: p.created_at,
  })));

  // report file
  const reportPath = path.resolve(here, `../ss-leads-plan-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(plan.map(({ profile, existing, ...rest }) => ({
    ...rest,
    donor_id: profile?.id || null,
    existing_station: existing?.station || null,
  })), null, 2));
  console.log(`\nreport: ${reportPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply --revoke to execute.');
    await pool.end();
    process.exit(0);
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('begin');

    // 1. stations
    for (const [ngoName, station] of Object.entries(STATIONS)) {
      const ngoId = ngoIdByName.get(ngoName);
      if (!ngoId) throw new Error(`NGO ${ngoName} not found`);
      await client.query(
        `insert into fro_station_assignments (ngo_id, station)
         select $1, $2
          where not exists (select 1 from fro_station_assignments where ngo_id = $1 and station = $2)`,
        [ngoId, station],
      );
    }

    // 2. revoke old manual assignments
    if (REVOKE) {
      const rev = await client.query(
        `update leads
            set status = 'new', recruiter_id = null, updated_at = now()
          where source = 'WhatsApp Bulk Reply'
            and status = 'assigned'
          returning id`,
      );
      console.log(`revoked ${rev.rowCount} assigned reply leads back to Inbox`);
    }

    // 3. materialise
    let added = 0; let merged = 0; let skipped = 0;
    for (const p of plan) {
      if (p.action !== 'ADD' && p.action !== 'MERGE') { skipped += 1; continue; }
      const ngoId = ngoIdByName.get(p.ngo);
      const station = STATIONS[p.ngo];
      if (!ngoId) { skipped += 1; continue; }

      let donorId = p.profile?.id || null;
      if (!donorId) {
        const ins = await client.query(
          `insert into donor_profiles (mobile_number, name, ngo, station, amount, total_amount, donation_count)
           values ($1, $2, $3, $4, 0, 0, 1)
           on conflict (mobile_number) do update set name = donor_profiles.name
           returning id`,
          [p.mobile, p.display_name || 'WhatsApp Reply', p.ngo, station],
        );
        donorId = ins.rows[0].id;
      }

      const marker = `[Lead:${p.id}]`;
      const existing = (await client.query(
        `select id, notes, station from fro_assignments
          where donor_id = $1 and ngo_id = $2
            and (status is null or status <> 'reassigned')
          limit 1`,
        [donorId, ngoId],
      )).rows[0];

      if (existing) {
        if (!String(existing.notes || '').includes(marker)) {
          const extra = `${p.button ? `[Button: ${p.button}]\n` : ''}${p.message || ''}`.trim();
          await client.query(
            `update fro_assignments
                set notes = coalesce(nullif(notes, ''), '') ||
                            case when coalesce(notes, '') = '' then '' else E'\n' end ||
                            $2
              where id = $1`,
            [existing.id, `${extra}\n${marker}`.trim()],
          );
        }
        merged += 1;
      } else {
        const batchId = crypto.randomUUID();
        await client.query(
          `insert into fro_assignments
             (donor_id, fro_worker_id, ngo_id, station, status, is_new, batch_type,
              assigned_at, batch_id, notes, last_contacted_at)
           values ($1, null, $2, $3, 'pending', true, 'new_data', now(), $4, $5, null)`,
          [donorId, ngoId, station, batchId, `${p.button ? `[Button: ${p.button}]\n` : ''}${p.message || ''}\n${marker}`.trim()],
        );
        await client.query(
          `update donor_profiles set station = coalesce(station, $2), ngo = coalesce(ngo, $3) where id = $1`,
          [donorId, station, p.ngo],
        );
        added += 1;
      }
    }

    await client.query('commit');
    console.log(`\nAPPLIED — added: ${added}, merged: ${merged}, skipped: ${skipped}`);
    console.log('stations:', Object.values(STATIONS).join(', '));
    console.log('NOTE: assign an FRO to each SS station in Station Management so the leads reach a queue.');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';
import {
  COMMUNITY_SLUG,
  getCommunityConversation,
  addParticipant,
  removeStaleParticipants,
  listCommunityCandidates,
} from '../models/chatModel.js';
import { isWriterRole } from '../middleware/chatAccess.js';

/**
 * Community Chat bootstrap (plan.md §3, §5).
 *
 * Creates the tables, seeds the single Community room, and re-syncs membership
 * from the `workers` table on every boot. That last part is deliberate: it means
 * a newly hired accounts user is admitted to the Community room on the next
 * restart with no migration and no manual step, and a deactivated user is
 * dropped, without the seeder needing to be told.
 *
 * Members are `workers` rows only - the eight panels all log in against that
 * table. `users` is the CRM side and has no Community page.
 *
 * It only ever writes into `kind='group'` rooms, so a read-only role is
 * structurally never a member of a DM.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../../migrations');

/**
 * Replays every migration in lexical order on every boot.
 *
 * Not a one-shot runner: these files are written idempotently (IF NOT EXISTS,
 * DROP + ADD constraints) precisely so they can be re-applied, which is what
 * lets a column added in a later file reach a database created before it
 * without a manual step. Sorting matters - 152 builds on tables created in 151.
 */
async function applyMigrations() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    await db._pool.query(sql);
  }
}

async function ensureConversation() {
  const existing = await getCommunityConversation();
  if (existing) return existing;
  // Do NOT re-create a room the user deleted. This seeder used to re-insert
  // on every boot, so a UI delete survived exactly until the next nodemon
  // restart and everyone was re-seated into it. Set SEED_COMMUNITY_ROOM=1 to
  // bring the seeded room back deliberately.
  if (process.env.SEED_COMMUNITY_ROOM !== '1') return null;
  const { rows } = await db._pool.query(
    `INSERT INTO chat_conversations (kind, slug, title, created_by)
     VALUES ('group', $1, 'Community', 'system')
     ON CONFLICT (slug) DO NOTHING
     RETURNING *`,
    [COMMUNITY_SLUG]
  );
  if (rows[0]) return rows[0];
  return getCommunityConversation();
}

/** One row per `workers` record, shaped like a chat participant. */
function toParticipant(w) {
  const email = w.email ? String(w.email).trim().toLowerCase() : null;
  return {
    // Must mirror chatUidFor exactly: email wins when present, otherwise the
    // login id. Worker-panel JWTs carry no email so they resolve to login:<id>;
    // HR-panel JWTs carry email so they resolve to email:<address>. Seating
    // only one spelling leaves the other login path unable to see the room.
    uid: email ? `email:${email}` : `login:${w.id}`,
    subjectId: String(w.id),
    role: w.role,
    canPost: isWriterRole(w.role),
    name: w.name || w.login_id || `User ${w.id}`,
    email,
    ngoId: w.ngo_id,
  };
}

/**
 * Worker-panel logins (authController workerByLogin / workerByEmail) put no
 * email in the JWT, so chatUidFor resolves them to `login:<id>`. HR-panel
 * logins put email in the JWT, resolving to `email:<address>`. A worker who
 * might sign in through either path needs BOTH participant rows, or the other
 * path cannot see the room. Returns the primary plus an optional secondary.
 */
function toParticipants(w) {
  const primary = toParticipant(w);
  const email = w.email ? String(w.email).trim().toLowerCase() : null;
  if (!email) return [primary];
  const secondary = { ...primary, uid: `login:${w.id}` };
  return [primary, secondary];
}

/**
 * The Super Admin is not in `workers` - they log in straight from ADMIN_EMAIL
 * (authController.js adminLogin/salaryLogin) with id 0. Only this file can read
 * .env, so this is the one place their participant row can be created. Without
 * it the Super Admin opens Community, gets "not available for your account",
 * and cannot see the room they moderate.
 */
function superAdminParticipant() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return null;
  return {
    uid: `email:${email}`,
    subjectId: '0',
    role: 'super_admin',
    canPost: true,
    name: 'Super Admin',
    email,
    ngoId: null,
  };
}

/**
 * Re-syncs the Community room's roster.
 *
 * Existing rows are updated in place (ON CONFLICT DO UPDATE) so a role change -
 * someone promoted to accounts, say - gains can_post without losing their
 * last_read cursor. Anyone no longer eligible is deleted, so a deactivated
 * employee cannot keep reading the room on a stale row.
 */
async function syncCommunityParticipants(conversationId) {
  const candidates = await listCommunityCandidates();
  const extra = superAdminParticipant();
  const all = extra ? [...candidates, { ...extra, id: '0' }] : candidates;

  const keepUids = new Set();
  for (const w of all) {
    for (const p of toParticipants(w)) {
      await addParticipant(conversationId, p);
      keepUids.add(p.uid);
    }
  }

  const dropped = await removeStaleParticipants(conversationId, [...keepUids]);
  // Count distinct people, not rows: a worker with an email has two participant
  // rows (login:<id> and email:<address>) so either login path matches.
  const { rows } = await db._pool.query(
    `SELECT count(DISTINCT subject_id)::int AS n FROM chat_participants WHERE conversation_id = $1`,
    [conversationId]
  );
  return { seated: rows[0]?.n ?? all.length, dropped: dropped.length };
}

export async function ensureChatSchema() {
  try {
    await applyMigrations();
    const convo = await ensureConversation();
    if (!convo) {
      console.log('community room absent (deleted; re-seed disabled) — skipping participant sync');
      return;
    }
    const { seated, dropped } = await syncCommunityParticipants(convo.id);
    const note = dropped ? `, dropped ${dropped} stale` : '';
    console.log(`chat schema ready; community room "${convo.slug}" has ${seated} participants${note}`);
  } catch (e) {
    // A chat failure must not stop the rest of the API from booting.
    console.warn('[chat schema] skip:', e?.message || String(e));
  }
}

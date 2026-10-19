import db from '../config/db.js';
import { isWriterRole, CHAT_ROLES, isChatAdminRole } from '../middleware/chatAccess.js';

/**
 * Community Chat data access (plan.md §3).
 *
 * Almost all of this is raw SQL through db._pool rather than the query builder.
 * Chat needs cursor pagination, ILIKE, per-conversation aggregate unread counts
 * and ON CONFLICT idempotency - none of which the builder expresses, and all of
 * which are clearer written out.
 */

const PAGE_MAX = 50;
const PAGE_DEFAULT = 50;

// Role spellings that may post. The `users` table is not perfectly normalized,
// so match case-insensitively and include the common aliases rather than relying
// on normalizeRole to have run at write time.
//
// Must stay in step with CHAT_ROLES in middleware/chatAccess.js, which is what
// actually authorizes a post. 'master' is deliberately NOT here: chatWriter
// rejects it, so listing it would hand someone can_post = true and then 403
// their own messages. If 'master' should moderate chat, add it to CHAT_ROLES
// first, not here.
const CHAT_ROLE_LIST = [
  'super_admin', 'superadmin', 'super admin', 'super-admin', 'sa',
  'accounts', 'accountant',
  'admin', 'ngo admin', 'ngo_admin',
  'fro',
];

// ---------------------------------------------------------------------------
// Identity (plan.md §4)
// ---------------------------------------------------------------------------

/**
 * `req.user.id` is not a usable chat key: the env-configured Super Admin logs in
 * with id 0, and two such logins would collide on the same identity. So the chat
 * key is derived from the credential that is actually unique.
 */
export function chatUidFor(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const id = user?.id ?? user?.workerId;
  if (id != null && String(id) !== '') return `login:${id}`;
  return null;
}

/**
 * Resolves the caller's chat identity, or null if they have no usable key.
 *
 * `subject_id` is String(req.user.id) because that is what
 * notification_log.worker_id stores and what SuperAdminPanel filters on when
 * deciding whether to show a desktop notification.
 */
export function resolveChatIdentity(user) {
  const uid = chatUidFor(user);
  if (!uid) return null;
  return {
    uid,
    subjectId: String(user.id ?? user.workerId ?? ''),
    role: user.role,
    name: user.name || user.email || 'Unknown',
    canPost: isWriterRole(user.role),
  };
}

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

/**
 * Row -> message DTO.
 *
 * The database stores an attachment as four flat columns; the UI wants one
 * nested `attachment` object. This is the only place that translation happens,
 * and it is applied to HTTP responses *and* to the realtime payload - otherwise
 * a message would show its attachment on reload but arrive bare over the socket.
 */
export function toMessageDto(row) {
  if (!row) return null;
  const hasAttachment = !!row.attachment_url;
  const first = hasAttachment
    ? {
        url: row.attachment_url,
        name: row.attachment_name,
        mime: row.attachment_type,
        size: row.attachment_size == null ? null : Number(row.attachment_size),
      }
    : null;
  // A multi-image notice keeps every image in attachment_gallery JSON; a
  // single image has no gallery row and is synthesised from the flat columns,
  // so consumers always see the same array shape.
  let gallery = null;
  if (row.attachment_gallery) {
    try {
      const parsed = JSON.parse(row.attachment_gallery);
      if (Array.isArray(parsed) && parsed.length) gallery = parsed;
    } catch {
      /* a corrupt JSON cell degrades to the single-image view, never a 500 */
    }
  }
  if (!gallery && first) gallery = [first];
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_uid: row.sender_uid,
    sender_role: row.sender_role,
    sender_name: row.sender_name,
    body: row.deleted_at ? null : row.body,
    attachment: first,
    gallery: row.deleted_at ? null : gallery,
    client_id: row.client_id,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    // A notice is an ordinary message flagged in place, so the DTO only needs
    // to carry the two extra columns. `notice_title` is nulled with `body` on
    // soft delete, keeping the deleted-bubble contract identical.
    is_notice: !!row.is_notice,
    notice_title: row.deleted_at ? null : (row.notice_title || null),
  };
}

/** Row -> conversation DTO, matching what the conversation rail renders. */
export function toConversationDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    // Exposed so the rail can keep the seeded Community room pinned first even
    // after a user-created group has newer activity.
    slug: row.slug || null,
    title: row.title,
    member_count: row.member_count ?? null,
    // Only group rooms carry a policy; a DM is always open to its two members.
    post_policy: row.kind === 'group' ? (row.post_policy || 'everyone') : null,
    // 'selected' means only the members an admin ticked (plus admins) may post.
    // 'selected_depts' is the same gate, but the choice was made per department
    // and the sync keeps seating new hires of those departments automatically.
    write_mode: row.kind === 'group' ? (row.write_mode || 'everyone') : null,
    // Departments the creator picked for visibility (auto-seated by the sync)
    // and for posting (used only when write_mode='selected_depts').
    roster_departments: row.kind === 'group' ? (row.roster_departments || []) : [],
    post_departments: row.kind === 'group' ? (row.post_departments || []) : [],
    // Whether the announcement/notice feature is enabled for this group.
    notices_enabled: row.kind === 'group' ? row.notices_enabled !== false : null,
    // The caller's own per-member chat permission, so the composer can hide
    // itself in a 'selected' room without a second round trip. Meaningless
    // outside 'selected' mode - the server re-derives everything on write.
    my_can_post: row.my_can_post == null ? null : !!row.my_can_post,
    peer: row.peer
      ? {
          uid: row.peer.uid,
          subject_id: row.peer.subject_id,
          name: row.peer.display_name,
          email: row.peer.email,
          role: row.peer.role,
        }
      : null,
    unread_count: row.unread || 0,
    last_message: row.last_message_id
      ? {
          id: row.last_message_id,
          sender_uid: row.last_message_sender,
            body: row.last_message_deleted_at
              ? 'This message was deleted'
              : row.last_message_notice_title || row.last_message_body,
          attachment: row.last_message_attachment
            ? { url: row.last_message_attachment }
            : null,
          created_at: row.last_message_at,
          deleted: !!row.last_message_deleted_at,
        }
      : null,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const COMMUNITY_SLUG = 'community';

export async function getCommunityConversation() {
  const { rows } = await db._pool.query(
    `SELECT * FROM chat_conversations WHERE slug = $1 LIMIT 1`,
    [COMMUNITY_SLUG]
  );
  return rows[0] || null;
}

export async function getConversation(id) {
  const { rows } = await db._pool.query(
    `SELECT * FROM chat_conversations WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getConversationBySlug(slug) {
  const { rows } = await db._pool.query(
    `SELECT * FROM chat_conversations WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

/** Sorted so `dm:a|b` and `dm:b|a` resolve to the same conversation. */
export const directSlug = (a, b) => `dm:${[a, b].sort().join('|')}`;

export async function ensureDirectConversation(uidA, uidB, meta) {
  const slug = directSlug(uidA, uidB);
  const existing = await getConversationBySlug(slug);
  if (existing) return existing;
  const { rows } = await db._pool.query(
    `INSERT INTO chat_conversations (kind, slug, title, created_by)
     VALUES ('direct', $1, NULL, $2)
     ON CONFLICT (slug) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [slug, meta.creatorUid]
  );
  const convo = rows[0];
  for (const p of [meta.a, meta.b]) {
    await addParticipant(convo.id, p);
  }
  return convo;
}

export async function touchConversation(id) {
  await db._pool.query(
    `UPDATE chat_conversations SET updated_at = now() WHERE id = $1`,
    [id]
  );
}

/**
 * Whether the caller may post in this conversation.
 *
 * DMs are always open to their members (a read-only role can never reach one,
 * so this is only ever asked about a writer). Groups may carry two switches:
 *   - post_policy  'everyone'    any writer participant
 *                 'admins_only' only the three admin roles
 *   - write_mode   'everyone'    (default) any writer who passes post_policy
 *                 'selected'    only members an admin ticked, plus admins
 *
 * `participant` is consulted only in 'selected' mode - that is the one case
 * where the per-member can_post flag is authoritative rather than a UI hint.
 * In every other mode a forged can_post row still grants nothing.
 */
export function canPostIn(convo, me, participant) {
  // DMs and the seed room: the writer-role gate still holds. A per-group tick
  // never opens a direct message — it is scoped to one room only.
  if (convo?.kind !== 'group') return !!me?.canPost;
  if ((convo.post_policy || 'everyone') === 'admins_only') return isChatAdminRole(me.role);
  if ((convo.write_mode || 'everyone') === 'selected' || convo.write_mode === 'selected_depts') {
    // Admins always keep the wheel: someone has to be able to post the next
    // notice and untick the person who was muted by mistake.
    if (isChatAdminRole(me.role)) return true;
    // An explicit per-member grant is authoritative here, and is the ONE way a
    // normally read-only role (HR, Developer, Event Head, ...) earns posting
    // rights — in this room only. The row exists because an admin ticked it in
    // 'selected' / 'selected_depts' mode, and it grants nothing anywhere else.
    return !!participant?.can_post;
  }
  // 'everyone' write mode: the admin did not restrict it, so the global writer
  // role gate still applies (a read-only role cannot post here).
  return !!me?.canPost;
}

/**
 * Creates a group room and seats its members.
 *
 * A random slug is generated rather than deriving one from the title: titles
 * are free text and may repeat, and `slug` is UNIQUE. The caller is always
 * seated, so a group created with an empty roster still has exactly one member
 * rather than being an orphan nobody can open.
 */
export async function createGroup({ title, creator, members, postPolicy, writeMode, noticesEnabled, rosterDepartments, postDepartments }) {
  const slug = `group:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await db._pool.query(
    `INSERT INTO chat_conversations (kind, slug, title, created_by, post_policy, write_mode, notices_enabled, roster_departments, post_departments)
     VALUES ('group', $1, $2, $3, $4, $5, $6, $7::text[], $8::text[])
     RETURNING *`,
    [
      slug, title, creator.uid,
      postPolicy === 'admins_only' ? 'admins_only' : 'everyone',
      writeMode === 'selected' || writeMode === 'selected_depts' ? writeMode : 'everyone',
      noticesEnabled === false ? false : true,
      Array.isArray(rosterDepartments) ? rosterDepartments : [],
      Array.isArray(postDepartments) ? postDepartments : [],
    ]
  );
  const convo = rows[0];

  // Seat every member under BOTH uid spellings when they have an email, exactly
  // like the Community sync does: worker-panel logins resolve to `login:<id>`
  // (no email in the JWT) while HR-panel logins resolve to `email:<address>`.
  // Seating only one spelling leaves the other login path unable to see the
  // room. De-duplicate by uid so the same person never gets two identical rows.
  const seated = new Map(); // uid -> participant payload
  const seatPerson = (person, computedCanPost) => {
    const subjectId = person.subjectId ?? person.subject_id;
    const email = person.email ? String(person.email).trim().toLowerCase() : null;
    const base = {
      subjectId,
      role: person.role,
      department: person.department || 'Unassigned',
      canPost: computedCanPost,
      name: person.name,
      email: person.email || null,
      ngoId: person.ngo_id ?? person.ngoId ?? null,
    };
    const primaryUid = email ? `email:${email}` : `login:${subjectId}`;
    if (!seated.has(primaryUid)) seated.set(primaryUid, { ...base, uid: primaryUid });
    // Secondary spelling for workers who might sign in the other way.
    if (email && subjectId != null && String(subjectId) !== '') {
      const secondaryUid = `login:${subjectId}`;
      if (!seated.has(secondaryUid)) seated.set(secondaryUid, { ...base, uid: secondaryUid });
    }
  };

  // Creator first so they are always a participant even if the roster omitted
  // them.
  seatPerson(creator, canPostIn(convo, creator, null));

  for (const m of members || []) {
    if (!m?.uid) continue;
    // Skip if already seated under this member's primary uid.
    const email = m.email ? String(m.email).trim().toLowerCase() : null;
    const primaryUid = email ? `email:${email}` : `login:${m.subject_id ?? m.subjectId}`;
    if (seated.has(primaryUid)) continue;
    seatPerson(m, canPostIn(
      convo,
      { canPost: isWriterRole(m.role), role: m.role },
      { can_post: m.canPost !== false }
    ));
  }

  for (const p of seated.values()) {
    await addParticipant(convo.id, p);
  }
  // memberCount counts distinct people, not uid spellings.
  const distinctPeople = new Set([...seated.values()].map((p) => String(p.subjectId)));
  return { convo, memberCount: distinctPeople.size };
}

/** Renames a group and/or flips its policy switches. */
export async function updateGroupSettings(id, { title, postPolicy, writeMode, noticesEnabled, postDepartments }) {
  const { rows } = await db._pool.query(
    `UPDATE chat_conversations
        SET title            = COALESCE($2, title),
            post_policy      = COALESCE($3, post_policy),
            write_mode       = COALESCE($4, write_mode),
            notices_enabled  = COALESCE($5, notices_enabled),
            post_departments = COALESCE($6::text[], post_departments),
            updated_at       = now()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      title == null ? null : title,
      postPolicy == null ? null : (postPolicy === 'admins_only' ? 'admins_only' : 'everyone'),
      writeMode == null ? null : (writeMode === 'selected' || writeMode === 'selected_depts' ? writeMode : 'everyone'),
      noticesEnabled == null ? null : !!noticesEnabled,
      Array.isArray(postDepartments) ? postDepartments : null,
    ]
  );
  return rows[0] || null;
}

/**
 * Applies the per-member "may chat" tick list.
 *
 * Only ever touches rows that already exist - adding and removing members is a
 * separate concern, and an UPDATE cannot seat someone. Unknown uids are
 * silently skipped so a stale client cannot error the whole save.
 */
export async function setParticipantsCanPost(conversationId, entries) {
  let changed = 0;
  for (const e of entries || []) {
    const uid = String(e?.uid || '').trim();
    if (!uid) continue;
    // Resolve the subject behind this uid and update EVERY spelling of it
    // (email:<addr> and login:<id>), so a 'selected' room's can_post flag
    // agrees for both login paths instead of only the one the dialog listed.
    const { rows } = await db._pool.query(
      `SELECT subject_id FROM chat_participants WHERE conversation_id = $1 AND uid = $2 LIMIT 1`,
      [conversationId, uid]
    );
    const subjectId = rows[0]?.subject_id;
    if (subjectId != null && String(subjectId) !== '') {
      const { rowCount } = await db._pool.query(
        `UPDATE chat_participants
            SET can_post = $3
          WHERE conversation_id = $1 AND subject_id = $2`,
        [conversationId, subjectId, !!e.canPost]
      );
      changed += rowCount || 0;
    } else {
      const { rowCount } = await db._pool.query(
        `UPDATE chat_participants
            SET can_post = $3
          WHERE conversation_id = $1 AND uid = $2`,
        [conversationId, uid, !!e.canPost]
      );
      changed += rowCount || 0;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export async function addParticipant(conversationId, p) {
  const { rows } = await db._pool.query(
    `INSERT INTO chat_participants
       (conversation_id, uid, subject_id, role, can_post, display_name, email, ngo_id, department)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (conversation_id, uid) DO UPDATE
       SET subject_id  = EXCLUDED.subject_id,
           role        = EXCLUDED.role,
           can_post    = EXCLUDED.can_post,
           display_name= EXCLUDED.display_name,
           email       = EXCLUDED.email,
           ngo_id      = EXCLUDED.ngo_id,
           department  = COALESCE(EXCLUDED.department, chat_participants.department)
     RETURNING *`,
    [conversationId, p.uid, p.subjectId, p.role, !!p.canPost, p.name, p.email || null, p.ngoId || null, p.department || null]
  );
  return rows[0];
}

export async function getParticipant(conversationId, uid) {
  const { rows } = await db._pool.query(
    `SELECT * FROM chat_participants WHERE conversation_id = $1 AND uid = $2`,
    [conversationId, uid]
  );
  return rows[0] || null;
}

export async function isParticipant(conversationId, uid) {
  return !!(await getParticipant(conversationId, uid));
}

export async function listParticipants(conversationId) {
  // DISTINCT ON: a worker with an email has two rows (login:<id> and
  // email:<address) so either login path matches, but the roster must show
  // each person once. subject_id is the shared key.
  const { rows } = await db._pool.query(
    `SELECT DISTINCT ON (subject_id) *
       FROM chat_participants
      WHERE conversation_id = $1
      ORDER BY subject_id, display_name`,
    [conversationId]
  );
  return rows;
}

/**
 * Conversation list for the rail.
 *
 * Three containment rules live here and are enforced again at the message and
 * search layers, because a single missed filter would leak a DM (plan.md §2.3):
 *   1. only conversations the caller participates in
 *   2. `kind='direct'` rows are dropped entirely for a non-writer
 *   3. the title of a DM is only ever the *other* participant's name
 */
export async function listConversationsFor(me) {
  const { rows } = await db._pool.query(
     `SELECT
        c.id, c.kind, c.slug, c.title, c.updated_at, c.post_policy, c.write_mode, c.notices_enabled,
        c.roster_departments, c.post_departments,
        p.last_read_at, p.last_read_msg_id,
        p.can_post AS my_can_post,
        lm.id         AS last_message_id,
        lm.sender_uid AS last_message_sender,
        lm.created_at AS last_message_at,
        lm.body       AS last_message_body,
        lm.notice_title AS last_message_notice_title,
        lm.deleted_at AS last_message_deleted_at,
        lm.attachment_url AS last_message_attachment,
        (
          SELECT count(*)
          FROM chat_messages m
          WHERE m.conversation_id = c.id
            AND m.id > COALESCE(p.last_read_msg_id, 0)
            AND m.sender_uid <> $1
            AND m.deleted_at IS NULL
        )::int AS unread,
        (SELECT count(DISTINCT cp.subject_id) FROM chat_participants cp
         WHERE cp.conversation_id = c.id)::int AS member_count
     FROM chat_conversations c
     JOIN chat_participants p
       ON p.conversation_id = c.id AND p.uid = $1
      LEFT JOIN LATERAL (
        SELECT id, sender_uid, created_at, body, notice_title, deleted_at, attachment_url
        FROM chat_messages
        WHERE conversation_id = c.id
        ORDER BY id DESC
        LIMIT 1
      ) lm ON true
     WHERE c.is_archived = false
       AND (c.kind = 'group' OR $2::boolean)
     ORDER BY COALESCE(lm.created_at, c.updated_at) DESC`,
    [me.uid, me.canPost]
  );

  // Resolve DM titles server-side. A writer sees each peer's name; a read-only
  // role never receives a DM row at all, so this only runs for writer pairs.
  const out = [];
  for (const row of rows) {
    if (row.kind === 'direct') {
      const peer = await getDirectPeer(row.id, me.uid);
      out.push({ ...row, title: peer?.display_name || 'Direct message', peer });
    } else {
      out.push({ ...row, title: row.title || 'Community' });
    }
  }
  return out;
}

async function getDirectPeer(conversationId, uid) {
  const { rows } = await db._pool.query(
    `SELECT * FROM chat_participants
     WHERE conversation_id = $1 AND uid <> $2
     LIMIT 1`,
    [conversationId, uid]
  );
  return rows[0] || null;
}

/**
 * DM targets for the "new message" picker. Writers only.
 *
 * Reads `workers` rather than `chat_participants` on purpose: the answer to "who
 * can I message" is a property of the staff roster, not of who happens to
 * already share a room with me. Deriving it from participation would silently
 * shrink the list if Community seeding ever missed a row.
 *
 * Only writer roles can be a DM target, because only writers can open one.
 * The department -> role CASE and the writer filter mirror
 * listCommunityCandidates() and CHAT_ROLE_LIST.
 */
const WORKER_ROLE_CASE = `
  CASE
    WHEN btrim(lower(department)) = 'hr'                THEN 'hr'
    WHEN btrim(lower(department)) LIKE '%recruit%'      THEN 'recruiter'
    WHEN btrim(lower(department)) = 'admin'             THEN 'accounts'
    WHEN btrim(lower(department)) = 'fro'               THEN 'fro'
    WHEN btrim(lower(department)) = 'ngo admin'         THEN 'admin'
    WHEN btrim(lower(department)) = 'digital'
      OR btrim(lower(department)) LIKE '%develop%'      THEN 'digital'
    WHEN btrim(lower(department)) LIKE '%event%'        THEN 'event_head'
    ELSE 'worker'
  END`;

export async function listDmTargets(me) {
  // worker.id is a uuid, so the self-exclusion is a text compare. $2::bigint
  // would make every /people request fail with a cast error.
  const { rows } = await db._pool.query(
    `SELECT id, name, email, login_id, ngo_id, ${WORKER_ROLE_CASE} AS role
     FROM workers
     WHERE COALESCE(is_active, true) = true
       AND employment_status IS DISTINCT FROM 'terminated'
       AND ${WORKER_ROLE_CASE} = ANY($1::text[])
       AND id::text <> $2
     ORDER BY name`,
    [[...CHAT_ROLE_LIST], String(me.subjectId ?? '')]
  );
  return rows.map((u) => ({
    // Workers have no email in their JWT, so the uid must be the login key.
    uid: `login:${u.id}`,
    subject_id: String(u.id),
    name: u.name,
    email: u.email,
    role: u.role,
    ngo_id: u.ngo_id,
  }));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Newest-first cursor page. Returns rows in ascending id order for rendering, so
 * the caller does not have to reverse them.
 */
export async function listMessages(conversationId, { before, limit } = {}) {
  const cap = Math.min(Number(limit) || PAGE_DEFAULT, PAGE_MAX);
  const { rows } = await db._pool.query(
    `SELECT * FROM (
       SELECT * FROM chat_messages
       WHERE conversation_id = $1
         AND ($2::bigint IS NULL OR id < $2::bigint)
       ORDER BY id DESC
       LIMIT $3
     ) page
     ORDER BY id ASC`,
    [conversationId, before || null, cap + 1]
  );
  const hasMore = rows.length > cap;
  return { messages: hasMore ? rows.slice(0, cap) : rows, hasMore };
}

export async function getMessage(id) {
  const { rows } = await db._pool.query(
    `SELECT * FROM chat_messages WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getNewestMessageId(conversationId) {
  const { rows } = await db._pool.query(
    `SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages WHERE conversation_id = $1`,
    [conversationId]
  );
  return Number(rows[0]?.id || 0);
}

/**
 * Insert a message, idempotent on client_id.
 *
 * The client reuses the same client_id when the user hits "Retry" on a failed
 * bubble, and a send can succeed server-side while the response is lost. Both
 * cases arrive here as a duplicate, so the unique index turns them into a
 * successful no-op returning the original row instead of a 500.
 */
export async function insertMessage(msg) {
  const { rows } = await db._pool.query(
    `INSERT INTO chat_messages
       (conversation_id, sender_uid, sender_role, sender_name, body,
        attachment_url, attachment_name, attachment_type, attachment_size,
        client_id, is_notice, notice_title, attachment_gallery)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (conversation_id, client_id) WHERE client_id IS NOT NULL
       DO NOTHING
     RETURNING *`,
    [
      msg.conversationId, msg.senderUid, msg.senderRole, msg.senderName,
      msg.body || null, msg.attachment?.url || null, msg.attachment?.name || null,
      msg.attachment?.type || null, msg.attachment?.size || null, msg.clientId || null,
      !!msg.isNotice, msg.isNotice ? msg.noticeTitle || null : null,
      // Only worth a column when there is more than one image; a single image
      // is already fully described by the flat attachment_* columns.
      msg.gallery && msg.gallery.length > 1 ? JSON.stringify(msg.gallery) : null,
    ]
  );
  if (rows[0]) return { message: rows[0], duplicate: false };

  const { rows: existing } = await db._pool.query(
    `SELECT * FROM chat_messages WHERE conversation_id = $1 AND client_id = $2`,
    [msg.conversationId, msg.clientId]
  );
  if (!existing[0]) throw new Error('Message insert failed');
  return { message: existing[0], duplicate: true };
}

/** Edit is always sender-only (plan.md §6.2). */
export async function updateMessageBody(id, body) {
  const { rows } = await db._pool.query(
    `UPDATE chat_messages
     SET body = $2, edited_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, body]
  );
  return rows[0] || null;
}

/** Soft delete: the row survives so the client's position anchor stays valid. */
export async function softDeleteMessage(id) {
  const { rows } = await db._pool.query(
    `UPDATE chat_messages
     SET deleted_at = now(), body = NULL, attachment_url = NULL,
         attachment_name = NULL, attachment_type = NULL, attachment_size = NULL,
         attachment_gallery = NULL, notice_title = NULL
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Notices (group-only, admin-posted; plan.md §6.5)
// ---------------------------------------------------------------------------

/**
 * Notices the caller has not yet dismissed, oldest first so a backlog replays
 * in the order it was written.
 *
 * Three filters that must all hold: the caller must be a participant of the
 * room (JOIN chat_participants - a notice can never reach a non-member), must
 * not be its own author (sending one is not "seeing" it), and must have no
 * chat_notice_views row (the once-per-person guarantee, stored server-side so
 * it survives reloads and devices).
 */
export async function listPendingNotices(uid, limit = 20) {
  const cap = Math.min(Number(limit) || 20, 50);
  const { rows } = await db._pool.query(
    `SELECT m.*, c.title AS conversation_title
       FROM chat_messages m
       JOIN chat_conversations c ON c.id = m.conversation_id
       JOIN chat_participants p ON p.conversation_id = c.id AND p.uid = $1
       LEFT JOIN chat_notice_views v ON v.message_id = m.id AND v.uid = $1
      WHERE m.is_notice = true
        AND m.deleted_at IS NULL
        AND m.sender_uid <> $1
        AND v.message_id IS NULL
        AND c.is_archived = false
      ORDER BY m.id ASC
      LIMIT $2`,
    [uid, cap]
  );
  return rows;
}

/** Idempotent: replaying a dismissal (double-click, lost response) is a no-op. */
export async function markNoticeViewed(messageId, uid) {
  const { rows } = await db._pool.query(
    `INSERT INTO chat_notice_views (message_id, uid)
     VALUES ($1, $2)
     ON CONFLICT (message_id, uid) DO NOTHING
     RETURNING *`,
    [messageId, uid]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Scoped to a single conversation the caller has already been authorized for, so
 * it cannot reach a DM the caller is not party to.
 */
export async function searchMessages(conversationId, q, limit = 50) {
  const cap = Math.min(Number(limit) || 50, 100);
  const { rows } = await db._pool.query(
    `SELECT id, conversation_id, sender_uid, sender_name, sender_role, body,
            notice_title, is_notice,
            attachment_url, attachment_name, attachment_type, attachment_size,
            edited_at, deleted_at, created_at, client_id
     FROM chat_messages
     WHERE conversation_id = $1
       AND deleted_at IS NULL
       AND body ILIKE '%' || $2 || '%'
     ORDER BY id DESC
     LIMIT $3`,
    [conversationId, q, cap]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

/**
 * Upserts the caller's OWN participant row only. This is the one write a
 * read-only role performs, and it cannot touch message content (plan.md §2.4).
 *
 * last_read_msg_id is clamped to the newest message that actually exists, so a
 * stale client cannot mark unseen messages read by sending a large id.
 */
export async function markRead(conversationId, uid, messageId) {
  const newest = await getNewestMessageId(conversationId);
  const target = Math.min(Number(messageId) || 0, newest);
  const { rows } = await db._pool.query(
    `UPDATE chat_participants
     SET last_read_msg_id = GREATEST(COALESCE(last_read_msg_id, 0), $3),
         last_read_at    = now()
     WHERE conversation_id = $1 AND uid = $2
     RETURNING last_read_msg_id`,
    [conversationId, uid, target]
  );
  return rows[0] || null;
}

/**
 * Total unread for the nav badge, across every conversation the caller
 * participates in. DMs are included: a writer with an unread direct message
 * wants the badge on the sidebar tab, not just in the open thread.
 */
export async function unreadCountFor(uid) {
  const { rows } = await db._pool.query(
    `SELECT COALESCE(SUM(u.unread), 0)::int AS total FROM (
       SELECT (
         SELECT count(*) FROM chat_messages m
         WHERE m.conversation_id = c.id
           AND m.id > COALESCE(p.last_read_msg_id, 0)
           AND m.sender_uid <> $1
           AND m.deleted_at IS NULL
       ) AS unread
       FROM chat_conversations c
       JOIN chat_participants p
         ON p.conversation_id = c.id AND p.uid = $1
       WHERE c.is_archived = false
     ) u`,
    [uid]
  );
  return rows[0]?.total || 0;
}

// ---------------------------------------------------------------------------
// Backfill support (ensureChatSchema)
// ---------------------------------------------------------------------------

/**
 * Every identity eligible for the Community room, from `workers`.
 *
 * `workers`, not `users`: the eight panels all authenticate against `workers`
 * (authController.js getWorkerByLoginId), keyed by login_id, and their JWT
 * carries no email. `users` is the CRM side - `agent` and `admin` rows that
 * have no Community page anywhere in the UI.
 *
 * The department -> role CASE is a copy of authController.js, and the
 * department filter below keeps the eight panel departments only, so
 * Housekeeping/operator staff stay out.
 */
export async function listCommunityCandidates() {
  const { rows } = await db._pool.query(
    `SELECT w.id,
            w.name,
            w.email,
            w.login_id,
            w.ngo_id,
            CASE
              WHEN btrim(lower(w.department)) = 'hr'                THEN 'hr'
              WHEN btrim(lower(w.department)) LIKE '%recruit%'      THEN 'recruiter'
              WHEN btrim(lower(w.department)) = 'admin'             THEN 'accounts'
              WHEN btrim(lower(w.department)) = 'fro'               THEN 'fro'
              WHEN btrim(lower(w.department)) = 'ngo admin'         THEN 'admin'
              WHEN btrim(lower(w.department)) = 'digital'
                OR btrim(lower(w.department)) LIKE '%develop%'      THEN 'digital'
              WHEN btrim(lower(w.department)) LIKE '%event%'        THEN 'event_head'
              ELSE 'worker'
            END AS role
     FROM workers w
     WHERE COALESCE(w.is_active, true) = true
       AND w.employment_status IS DISTINCT FROM 'terminated'
       AND (
            btrim(lower(w.department)) IN
              ('hr', 'admin', 'fro', 'ngo admin', 'digital', 'accounts', 'account')
         OR btrim(lower(w.department)) LIKE '%recruit%'
         OR btrim(lower(w.department)) LIKE '%develop%'
         OR btrim(lower(w.department)) LIKE '%event%'
       )
     ORDER BY w.id`
  );
  return rows;
}

/**
 * The whole staff directory, for the group-create picker.
 *
 * Wider than listCommunityCandidates on purpose: a group may legitimately pull
 * in someone from a non-panel department (Housekeeping, Ops), so the picker
 * must not pre-filter. The department -> role CASE is shared so a whole
 * department can be added and each member still gets the role their panel logs
 * in with.
 *
 * `can_post` is computed from the writer role here rather than read off the
 * workers table, so the picker cannot promise someone posting rights the
 * write gate would refuse.
 */
export async function listDirectory() {
  const { rows } = await db._pool.query(
    `SELECT w.id,
            w.name,
            w.email,
            w.login_id,
            w.ngo_id,
            btrim(w.department) AS department,
            CASE
              WHEN btrim(lower(w.department)) = 'hr'                THEN 'hr'
              WHEN btrim(lower(w.department)) LIKE '%recruit%'      THEN 'recruiter'
              WHEN btrim(lower(w.department)) = 'admin'             THEN 'accounts'
              WHEN btrim(lower(w.department)) = 'fro'               THEN 'fro'
              WHEN btrim(lower(w.department)) = 'ngo admin'         THEN 'admin'
              WHEN btrim(lower(w.department)) = 'digital'
                OR btrim(lower(w.department)) LIKE '%develop%'      THEN 'digital'
              WHEN btrim(lower(w.department)) LIKE '%event%'        THEN 'event_head'
              ELSE 'worker'
            END AS role
     FROM workers w
     WHERE COALESCE(w.is_active, true) = true
       AND w.employment_status IS DISTINCT FROM 'terminated'
     ORDER BY btrim(w.department), w.name, w.id`
  );
  return rows.map((r) => {
    const role = r.role;
    const isWriter = CHAT_ROLES.has(role);
    return {
      id: r.id,
      name: r.name || r.login_id || `User ${r.id}`,
      loginId: r.login_id,
      email: r.email ? String(r.email).trim().toLowerCase() : null,
      department: r.department || 'Unassigned',
      role,
      // Cached UI hint only; sendMessage re-derives from CHAT_ROLES.
      canPost: isWriter,
      uid: r.email ? `email:${String(r.email).trim().toLowerCase()}` : `login:${r.id}`,
    };
  });
}

/**
 * Removes Community membership for anyone the sync no longer seats.
 *
 * Without this, a deactivated employee or a CRM account keeps a participant
 * row and therefore keeps passing isParticipant() - the reader check would let
 * someone who is no longer staff read the room.
 */
export async function removeStaleParticipants(conversationId, keepUids) {
  const { rows } = await db._pool.query(
    `DELETE FROM chat_participants
     WHERE conversation_id = $1
       AND NOT (uid = ANY($2::text[]))
     RETURNING uid`,
    [conversationId, keepUids]
  );
  return rows.map((r) => r.uid);
}

/**
 * Backfill: ensure every group participant is seated under BOTH uid spellings.
 */
export async function backfillGroupParticipantUids() {
  const { rows: groups } = await db._pool.query(
    `SELECT id FROM chat_conversations WHERE kind = 'group'`
  );
  for (const g of groups) {
    const { rows: parts } = await db._pool.query(
      `SELECT * FROM chat_participants WHERE conversation_id = $1`,
      [g.id]
    );
    const bySubject = new Map();
    for (const p of parts) {
      const key = String(p.subject_id ?? p.uid);
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push(p);
    }
    for (const [subjectId, list] of bySubject) {
      let email = list.map((p) => p.email).find((e) => e);
      // Fall back to the workers table: older rows may have a NULL email even
      // though the worker has one, which would otherwise skip the email: spelling.
      if (!email && subjectId != null && String(subjectId) !== '' && String(subjectId) !== 'null' && String(subjectId) !== 'undefined') {
        try {
          const { rows: w } = await db._pool.query(
            `SELECT email FROM workers WHERE id::text = $1 LIMIT 1`,
            [String(subjectId)]
          );
          email = w[0]?.email || null;
        } catch {
          email = null;
        }
      }
      const role = list[0].role;
      const name = list[0].display_name;
      const ngoId = list[0].ngo_id;
      const e = email ? String(email).trim().toLowerCase() : null;
      const loginUid = subjectId != null && String(subjectId) !== '' && String(subjectId) !== 'null' && String(subjectId) !== 'undefined'
        ? `login:${subjectId}`
        : null;
      const emailUid = e ? `email:${e}` : null;
      // Preserve each spelling's own can_post instead of OR-ing them, which
      // used to flip a read-only member into a poster via the other spelling.
      const emailCanPost = (list.find((p) => p.uid === emailUid)?.can_post)
        ?? (list.find((p) => p.uid === loginUid)?.can_post)
        ?? list[0]?.can_post
        ?? false;
      const loginCanPost = (list.find((p) => p.uid === loginUid)?.can_post)
        ?? (list.find((p) => p.uid === emailUid)?.can_post)
        ?? list[0]?.can_post
        ?? false;
      if (e) {
        await addParticipant(g.id, {
          uid: `email:${e}`,
          subjectId,
          role,
          canPost: !!emailCanPost,
          name,
          email: e,
          ngoId,
        });
      }
      if (loginUid) {
        await addParticipant(g.id, {
          uid: loginUid,
          subjectId,
          role,
          canPost: !!loginCanPost,
          name,
          email: e,
          ngoId,
        });
      }
    }
  }
}


// ---------------------------------------------------------------------------
// Department roster sync (auto-seating)
// ---------------------------------------------------------------------------

/**
 * Seats every active worker whose department is in a group's roster_departments
 * and who is not yet a participant - the "new HR hire joins automatically" path.
 *
 * Runs at boot and on an interval, and right after a group is created or its
 * settings saved. Deactivated/terminated workers are excluded by listDirectory,
 * so leavers simply stop being candidates (existing rows are left alone here;
 * only ADDITIONS are made - removal is an admin decision).
 *
 * can_post for a newly seated member:
 *   - write_mode 'selected_depts'  -> true only when the department is in
 *     post_departments (admins pass the gate regardless of this flag)
 *   - write_mode 'selected'        -> false (only hand-ticked members chat)
 *   - otherwise                    -> true (cached UI hint; policy gates instead)
 *
 * @param {number|null} conversationId limit to one group; null = every group
 *        that has a non-empty roster_departments.
 */
export async function syncRosterDepartments(conversationId = null) {
  const { rows: groups } = await db._pool.query(
    `SELECT id, write_mode, roster_departments, post_departments
       FROM chat_conversations
      WHERE kind = 'group'
        AND COALESCE(cardinality(roster_departments), 0) > 0
        AND ($1::int IS NULL OR id = $1)`,
    [conversationId]
  );
  if (!groups.length) return { added: 0 };

  const directory = await listDirectory();
  const byDept = new Map(); // lower(department) -> directory people
  for (const person of directory) {
    const key = String(person.department || '').trim().toLowerCase();
    if (!key) continue;
    if (!byDept.has(key)) byDept.set(key, []);
    byDept.get(key).push(person);
  }

  let added = 0;
  for (const g of groups) {
    const roster = (g.roster_departments || [])
      .map((d) => String(d).trim().toLowerCase())
      .filter(Boolean);
    if (!roster.length) continue;
    const postDepartmentsRaw = (g.post_departments || []).map((d) => String(d).trim()).filter(Boolean);
    const post = new Set(postDepartmentsRaw.map((d) => d.toLowerCase()));
    const mode = g.write_mode || 'everyone';

    const { rows: existing } = await db._pool.query(
      `SELECT DISTINCT subject_id FROM chat_participants WHERE conversation_id = $1`,
      [g.id]
    );
    const have = new Set(existing.map((r) => String(r.subject_id)));

    for (const key of roster) {
      for (const person of byDept.get(key) || []) {
        if (have.has(String(person.id))) continue;
        have.add(String(person.id));
        const deptKey = String(person.department || '').trim().toLowerCase();
        const canPost =
          mode === 'selected_depts' ? post.has(deptKey)
          : mode === 'selected' ? false
          : true;
        // Both uid spellings, exactly like createGroup: worker-panel logins are
        // login:<id>, HR-panel logins are email:<address>.
        const email = person.email ? String(person.email).trim().toLowerCase() : null;
        const base = {
          subjectId: person.id,
          role: person.role,
          department: person.department || 'Unassigned',
          canPost,
          name: person.name,
          email,
          ngoId: person.ngo_id ?? null,
        };
        if (email) {
          await addParticipant(g.id, { ...base, uid: `email:${email}` });
          await addParticipant(g.id, { ...base, uid: `login:${person.id}` });
        } else {
          await addParticipant(g.id, { ...base, uid: `login:${person.id}` });
        }
        added += 1;
      }
    }

    // Reconcile EXISTING seats in department mode: the department list is the
    // source of truth there (the settings dialog only offers department
    // toggles), so a member whose department is (or isn't) in post_departments
    // must have a matching can_post regardless of historical glitches.
    if (mode === 'selected_depts') {
      await db._pool.query(
        `UPDATE chat_participants p
            SET can_post = (lower(COALESCE(btrim(p.department), '')) = ANY(
                  SELECT lower(btrim(d)) FROM unnest($2::text[]) AS d))
          WHERE p.conversation_id = $1
            AND p.role NOT IN ('super_admin', 'accounts', 'admin')
            AND COALESCE(p.can_post, false) IS DISTINCT FROM
                (lower(COALESCE(btrim(p.department), '')) = ANY(
                  SELECT lower(btrim(d)) FROM unnest($2::text[]) AS d))`,
        [g.id, postDepartmentsRaw]
      );
    }
  }
  return { added };
}

/**
 * Backfills chat_participants.department for rows seated before migration 192
 * (matched by subject_id, then email). One pass at boot - new rows always carry
 * their department from the sync or the create path.
 */
export async function backfillParticipantDepartments() {
  const { rows: missing } = await db._pool.query(
    `SELECT DISTINCT p.conversation_id, p.subject_id, p.email
       FROM chat_participants p
       JOIN chat_conversations c ON c.id = p.conversation_id
      WHERE c.kind = 'group'
        AND (p.department IS NULL OR p.department = '')`
  );
  if (!missing.length) return 0;
  const directory = await listDirectory();
  const byId = new Map(directory.map((d) => [String(d.id), d.department]));
  const byEmail = new Map(directory.filter((d) => d.email).map((d) => [d.email, d.department]));
  let filled = 0;
  for (const row of missing) {
    const dept =
      (row.subject_id != null && byId.get(String(row.subject_id))) ||
      byEmail.get(String(row.email || '').trim().toLowerCase()) ||
      null;
    if (!dept) continue;
    const { rowCount } = await db._pool.query(
      `UPDATE chat_participants SET department = $3
        WHERE conversation_id = $1 AND subject_id = $2
          AND (department IS NULL OR department = '')`,
      [row.conversation_id, row.subject_id, dept]
    );
    filled += rowCount || 0;
  }
  return filled;
}

/**
 * Chat-side notice feed for the dashboards' "Recent Notices" widget.
 *
 * Group announcements (is_notice) from rooms the caller belongs to, with
 * announcements enabled, newest first. Visibility is the ordinary chat
 * containment rule (JOIN chat_participants), so a notice can never surface
 * for someone outside its room. Independent of listPendingNotices: that one
 * feeds the one-time popup (undelivered only); this one is history.
 */
export async function listNoticeFeedFor(uid, limit = 50) {
  const cap = Math.min(Number(limit) || 50, 200);
  const { rows } = await db._pool.query(
    `SELECT m.id, m.body, m.notice_title, m.sender_name, m.created_at,
            m.attachment_url, m.attachment_name, m.attachment_type,
            m.attachment_gallery,
            c.id AS conversation_id, c.title AS conversation_title
       FROM chat_messages m
       JOIN chat_conversations c ON c.id = m.conversation_id
       JOIN chat_participants p ON p.conversation_id = c.id AND p.uid = $1
      WHERE m.is_notice = true
        AND m.deleted_at IS NULL
        AND c.kind = 'group'
        AND c.notices_enabled IS DISTINCT FROM false
        AND c.is_archived = false
      ORDER BY m.id DESC
      LIMIT $2`,
    [uid, cap]
  );
  return rows;
}

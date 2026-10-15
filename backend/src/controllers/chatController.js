import db from '../config/db.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as chat from '../models/chatModel.js';
import { emitChat, emitChatBroadcast, emitChatToUsers } from '../socket.js';
import { notFound, isChatAdminRole } from '../middleware/chatAccess.js';
import { notifyParticipantsOfMessage } from '../services/chatNotificationService.js';

/**
 * Community Chat HTTP handlers (plan.md §6).
 *
 * Two invariants are enforced in every single handler, deliberately repeated
 * rather than factored into middleware, because the cost of missing one is a
 * private message leaking to the wrong person:
 *
 *   1. the caller must have a chat_participants row for the conversation
 *      (otherwise 404 - never 403, so existence cannot be probed)
 *   2. a `kind='direct'` conversation additionally requires a writer role
 */

const MAX_BODY = 4000;
const MAX_NOTICE_TITLE = 120;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const CHAT_BUCKET = 'chat-media';
const CHAT_PREFIX = 'chat/';

// Chat's own copy of the upload allow-list. The global list at index.js:274 is
// intentionally not reused: widening that one would silently widen every other
// upload endpoint in the app.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
  'video/mp4', 'video/quicktime',
]);

/** Resolves the caller or ends the request. */
function identify(req, res) {
  const me = chat.resolveChatIdentity(req.user);
  if (!me) {
    res.status(401).json({ message: 'No usable chat identity for this account' });
    return null;
  }
  return me;
}

/**
 * Loads a conversation the caller is allowed to see, or ends the request.
 * `writerOnly` additionally demands a writer role (used for DMs).
 */
async function authorize(req, res, { writerOnly = false } = {}) {
  const me = identify(req, res);
  if (!me) return null;

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    notFound(res);
    return null;
  }
  const convo = await chat.getConversation(id);
  if (!convo) {
    notFound(res);
    return null;
  }
  // A read-only role must never reach a DM even if a participant row existed.
  if (convo.kind === 'direct' && !me.canPost) {
    notFound(res);
    return null;
  }
  if (writerOnly && !me.canPost) {
    res.status(403).json({ message: 'Only Super Admin, Accounts, Admin and FRO can post in chat.' });
    return null;
  }
  const participant = await chat.getParticipant(convo.id, me.uid);
  if (!participant) {
    notFound(res);
    return null;
  }
  return { me, convo, participant };
}

/**
 * Rejects a post the conversation's policy forbids.
 *
 * Separate from `authorize` because authorize answers "may this person post at
 * all", while this answers "may they post in this particular room". An
 * admins-only group still lets FRO read it, so the reader path must stay open.
 *
 * Returns true when the caller was already refused (and the response sent).
 */
function policyBlocksPost(ctx) {
  if (chat.canPostIn(ctx.convo, ctx.me, ctx.participant)) return false;
  const policy = ctx.convo.post_policy || 'everyone';
  const writeMode = ctx.convo.write_mode || 'everyone';
  res.status(403).json({
    message:
      policy === 'admins_only'
        ? 'Only admins can post in this group.'
        : writeMode === 'selected'
          ? 'You cannot post in this group. Only members chosen by an admin can chat here.'
          : 'You cannot post in this conversation.',
  });
  return true;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Key is "chat/<file>"; the static mount serves backend/uploads at /uploads,
// so writing to uploads/ + key yields /uploads/chat/<file> — one prefix, no
// duplication.
const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

async function uploadAttachment(file) {
  const key = `${CHAT_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  const { error } = await db.storage
    .from(CHAT_BUCKET)
    .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) {
    // Local-disk fallback: when S3 is not configured (no S3_BUCKET), write to
    // backend/uploads/chat/ which is already served statically at /uploads.
    // This keeps image notices and attachments working in dev without
    // requiring AWS credentials.
    if (error.code === 'STORAGE_NOT_CONFIGURED') {
      try {
        fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
        const filePath = path.join(LOCAL_UPLOAD_DIR, key);
        fs.writeFileSync(filePath, file.buffer);
        return {
          url: `/uploads/${key}`,
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
        };
      } catch (e) {
        const err = new Error(e.message || 'File save failed');
        err.upload = true;
        err.status = 500;
        throw err;
      }
    }
    // Surfaced as its own status so a machine without S3 credentials says so
    // instead of a blanket 500 - "could not send" sends people hunting for a
    // chat bug when the real answer is a missing S3_BUCKET.
    const e = new Error(error.message || 'File upload failed');
    e.upload = true;
    e.status = 500;
    throw e;
  }
  const { data } = db.storage.from(CHAT_BUCKET).getPublicUrl(key);
  return {
    url: data?.publicUrl,
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
  };
}

// ---------------------------------------------------------------------------
// GET /conversations
// ---------------------------------------------------------------------------

/**
 * Bare shapes, no wrapper envelopes.
 *
 * `api()` on the client returns the parsed body untouched, and every consumer
 * destructures it directly - ConversationList does `Array.isArray(list)`,
 * useChatRealtime does `Number(n)`. So a `{ conversations: [...] }` wrapper
 * would silently yield an empty rail and a NaN badge rather than an error.
 */
export const listConversations = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    const rows = await chat.listConversationsFor(me);
    res.json(rows.map(chat.toConversationDto));
  } catch (err) {
    console.error('[chat] listConversations', err);
    res.status(500).json({ message: 'Could not load conversations' });
  }
};

// ---------------------------------------------------------------------------
// GET /people  (writer)
// ---------------------------------------------------------------------------

export const listPeople = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    const rows = await chat.listDmTargets(me);
    res.json(
      rows.map((p) => ({
        id: p.uid,
        uid: p.uid,
        subject_id: p.subject_id,
        name: p.name,
        email: p.email,
        role: p.role,
      }))
    );
  } catch (err) {
    console.error('[chat] listPeople', err);
    res.status(500).json({ message: 'Could not load people' });
  }
};

// ---------------------------------------------------------------------------
// GET /directory  (group creators)
// ---------------------------------------------------------------------------

/**
 * Whole staff list for the group-create picker, so a creator can add a whole
 * department or hand-pick individuals. Gated by chatGroupCreator on the route,
 * so a read-only role never receives the roster.
 */
export const listDirectory = async (req, res) => {
  try {
    const rows = await chat.listDirectory();
    res.json(rows);
  } catch (err) {
    console.error('[chat] listDirectory', err);
    res.status(500).json({ message: 'Could not load the staff directory' });
  }
};

// ---------------------------------------------------------------------------
// POST /conversations/group  (group creators)
// ---------------------------------------------------------------------------

/** Normalizes whatever the picker sent into the roster chat.createGroup wants. */
function normalizeMembers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const m of raw) {
    const uid = String(m?.uid || '').trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push({
      uid,
      subject_id: m?.subject_id != null ? String(m.subject_id) : null,
      role: m?.role,
      name: m?.name,
      email: m?.email,
      ngo_id: m?.ngo_id,
      // Per-member "may chat" choice, honoured only in write_mode='selected'.
      // Absent means "tick it", matching the picker's default.
      canPost: m?.can_post == null ? undefined : !!m.can_post,
    });
  }
  return out;
}

/**
 * Creates a group room.
 *
 * Body: { title, post_policy?: 'everyone'|'admins_only', members?: [{uid, role, ...}] }
 *
 * Members are resolved by the server against the directory rather than trusted
 * wholesale: the role/name sent by the client is used to seat them, but every
 * uid is one the creator could already see. This keeps a crafted request from
 * dropping an arbitrary uid into a private room.
 */
export const createGroup = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    if (!me.canPost) {
      return res.status(403).json({ message: 'Only Super Admin, Accounts and Admin can create groups.' });
    }
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Group name is required' });
    if (title.length > 80) return res.status(400).json({ message: 'Group name is too long (max 80 characters)' });

    const postPolicy = req.body?.post_policy === 'admins_only' ? 'admins_only' : 'everyone';
    // 'selected' = only the members the creator ticks may chat; everyone else
    // in the room reads. Decided at creation time or later via the group's
    // settings dialog - same column, same gate.
    const writeMode = req.body?.write_mode === 'selected' ? 'selected' : 'everyone';

    // Re-seat against the real directory so a forged role cannot grant can_post.
    const directory = await chat.listDirectory();
    const byUid = new Map(directory.map((d) => [d.uid, d]));
    const members = normalizeMembers(req.body?.members).filter((m) => byUid.has(m.uid));
    const roster = members.map((m) => {
      const person = byUid.get(m.uid);
      return { ...person, subject_id: String(person.id), canPost: m.canPost };
    });

    const { convo, memberCount } = await chat.createGroup({
      title,
      creator: { uid: me.uid, subjectId: me.subjectId, role: me.role, canPost: me.canPost, name: me.name },
      members: roster,
      postPolicy,
      writeMode,
    });

    // Tell exactly the people seated in the room (creator included) that it
    // exists: their sockets are not in `chat:<id>` yet, and a broadcast would
    // leak the new group's id to everyone else. Id-only frame - the client
    // reacts by rejoining its rooms and refetching its own rail.
    emitChatToUsers([me.uid, ...roster.map((m) => m.uid)], {
      type: 'conversation:created',
      conversation_id: convo.id,
    });

    res.status(201).json(chat.toConversationDto({ ...convo, member_count: memberCount }));
  } catch (err) {
    console.error('[chat] createGroup', err);
    res.status(500).json({ message: 'Could not create the group' });
  }
};

// ---------------------------------------------------------------------------
// POST /conversations/direct  (writer)
// ---------------------------------------------------------------------------

/** Find-or-create by sorted slug, so opening the same DM twice is idempotent. */
export const openDirect = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    if (!me.canPost) {
      return res.status(403).json({ message: 'Only Super Admin, Accounts, Admin and FRO can start direct messages.' });
    }
    // The client sends `user_id`; accept `uid` too so the two spellings cannot
    // drift into a 400 that is hard to read from the network tab.
    const targetUid = String(req.body?.user_id ?? req.body?.uid ?? '').trim();
    if (!targetUid) return res.status(400).json({ message: 'user_id is required' });
    if (targetUid === me.uid) {
      return res.status(400).json({ message: 'You cannot start a conversation with yourself' });
    }

    const targets = await chat.listDmTargets(me);
    const target = targets.find((t) => t.uid === targetUid);
    if (!target) {
      // Do not confirm whether an arbitrary uid exists as a DM-capable account.
      return res.status(404).json({ message: 'Person not found' });
    }

    const convo = await chat.ensureDirectConversation(me.uid, target.uid, {
      creatorUid: me.uid,
      a: {
        uid: me.uid, subjectId: me.subjectId, role: me.role,
        canPost: true, name: me.name,
      },
      b: {
        uid: target.uid, subjectId: target.subject_id, role: target.role,
        canPost: true, name: target.name, email: target.email, ngoId: target.ngo_id,
      },
    });

    // Returned bare: the caller does `const convo = await createDirect(...)`
    // and then reads convo.id. Same id-only notice as group creation, so the
    // recipient's rail opens the DM without a reload.
    emitChatToUsers([me.uid, target.uid], {
      type: 'conversation:created',
      conversation_id: convo.id,
    });
    res.json(chat.toConversationDto({
      id: convo.id,
      kind: convo.kind,
      title: target.name,
      peer: { ...target, display_name: target.name },
    }));
  } catch (err) {
    console.error('[chat] openDirect', err);
    res.status(500).json({ message: 'Could not open the conversation' });
  }
};

// ---------------------------------------------------------------------------
// GET /conversations/:id/messages
// ---------------------------------------------------------------------------

export const listMessages = async (req, res) => {
  try {
    const ctx = await authorize(req, res);
    if (!ctx) return;
    const { convo } = ctx;
    const before = req.query.before ? Number(req.query.before) : null;
    const { messages, hasMore } = await chat.listMessages(convo.id, {
      before: Number.isFinite(before) ? before : null,
      limit: req.query.limit,
    });
    res.json({ messages: messages.map(chat.toMessageDto), has_more: hasMore });
  } catch (err) {
    console.error('[chat] listMessages', err);
    res.status(500).json({ message: 'Could not load messages' });
  }
};

// ---------------------------------------------------------------------------
// POST /conversations/:id/messages  (writer)
// ---------------------------------------------------------------------------

export const sendMessage = async (req, res) => {
  try {
    const ctx = await authorize(req, res, { writerOnly: true });
    if (!ctx) return;
    const { me, convo } = ctx;
    if (policyBlocksPost(ctx)) return;

    // A notice rides the ordinary send path; only its gates differ. Each rule
    // blocks a different thing: a DM is a two-person room where a broadcast
    // makes no sense, and FRO may post messages but is not an administrator of
    // anything - so notices stay super_admin/accounts/admin everywhere.
    const wantsNotice =
      req.body?.is_notice === true ||
      req.body?.is_notice === 'true' ||
      req.body?.is_notice === '1';
    let noticeTitle = null;
    if (wantsNotice) {
      if (convo.kind !== 'group') {
        return res.status(400).json({ message: 'Notices can only be posted in a group' });
      }
      if (!isChatAdminRole(me.role)) {
        return res.status(403).json({ message: 'Only Super Admin, Accounts and Admin can post notices.' });
      }
      // Optional: the body or the images can carry the notice on their own.
      // An empty string collapses to NULL so the title is either absent or
      // meaningful, never a blank headline.
      noticeTitle = String(req.body?.notice_title || '').trim() || null;
      if (noticeTitle && noticeTitle.length > MAX_NOTICE_TITLE) {
        return res.status(400).json({ message: `Notice title is too long (max ${MAX_NOTICE_TITLE} characters)` });
      }
    }

    const body = String(req.body?.body || '').trim();
    if (body.length > MAX_BODY) {
      return res.status(400).json({ message: `Message is too long (max ${MAX_BODY} characters)` });
    }
    // `uploadChat.any()` - a notice may carry several images; an ordinary
    // message still uses only the first file, exactly as single('file') did.
    const files = (Array.isArray(req.files) && req.files.length ? req.files : null)
      || (req.file ? [req.file] : []);
    if (!body && !files.length) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }
    if (wantsNotice) {
      for (const f of files) {
        if (f.size > MAX_FILE_BYTES) {
          return res.status(400).json({ message: 'File is larger than 25 MB' });
        }
        // A notice shows a poster-style card; a PDF or spreadsheet would
        // render as an unreadable blob there, so images only.
        if (!ALLOWED_MIME.has(f.mimetype) || !f.mimetype.startsWith('image/')) {
          return res.status(400).json({ message: 'A notice can only carry images' });
        }
      }
    } else {
      const file = files[0] || null;
      if (file) {
        if (file.size > MAX_FILE_BYTES) {
          return res.status(400).json({ message: 'File is larger than 25 MB' });
        }
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return res.status(400).json({ message: 'That file type cannot be attached' });
        }
      }
    }

    const attachments = [];
    // A non-notice uploads only its first file - the others were never part of
    // the ordinary composer, and silently dropping them beats inventing a
    // gallery for regular messages.
    const toUpload = wantsNotice ? files : files.slice(0, 1);
    for (const f of toUpload) {
      attachments.push(await uploadAttachment(f));
    }
    const { message, duplicate } = await chat.insertMessage({
      conversationId: convo.id,
      senderUid: me.uid,
      senderRole: me.role,
      senderName: me.name,
      body,
      attachment: attachments[0] || null,
      gallery: attachments,
      clientId: req.body?.client_id || null,
      isNotice: wantsNotice,
      noticeTitle,
    });
    await chat.touchConversation(convo.id);

    const dto = chat.toMessageDto(message);
    if (!duplicate) {
      // Room-scoped, not emitDbChange - see emitChat's note on DM containment.
      // Broadcasts the DTO, not the row, so a live message carries its
      // attachment exactly like one that arrived on a page load.
      emitChat(convo.id, { type: 'message:new', conversation_id: convo.id, message: dto });

      // Queue desktop/in-app notifications for everyone who was not already
      // looking at the room. Skipped on a duplicate replay so a retried send
      // does not notify everyone twice. Not awaited: the response should not
      // wait on a notification insert, and the service swallows its own errors.
      chat.listParticipants(convo.id)
        .then((participants) =>
          notifyParticipantsOfMessage(convo, message, me, participants)
        )
        .catch((e) => console.warn('[chat] notify fan-out failed:', e?.message || String(e)));
    }
    res.status(duplicate ? 200 : 201).json(dto);
  } catch (err) {
    if (err?.upload) {
      return res.status(err.status || 500).json({ message: err.message });
    }
    console.error('[chat] sendMessage', err);
    res.status(500).json({ message: 'Could not send the message' });
  }
};

// ---------------------------------------------------------------------------
// GET /notices/pending
// ---------------------------------------------------------------------------

/**
 * Notices this caller has not dismissed yet - the offline/login path of the
 * one-time popup. The live path is the ordinary `message:new` socket frame, so
 * a notice posted while you were away is caught here on the next load and a
 * notice posted while you are watching is caught by the socket; both funnel
 * into the same dismissal, so neither can show it twice.
 *
 * Returned bare (an array) because chatApi returns the parsed body untouched
 * and the host does `Array.isArray(list)` - a wrapper would yield a popup that
 * never fires.
 */
export const pendingNotices = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    const rows = await chat.listPendingNotices(me.uid);
    res.json(
      rows.map((row) => ({
        ...chat.toMessageDto(row),
        conversation_title: row.conversation_title || null,
      }))
    );
  } catch (err) {
    console.error('[chat] pendingNotices', err);
    res.status(500).json({ message: 'Could not load notices' });
  }
};

// ---------------------------------------------------------------------------
// POST /messages/:id/notice-viewed
// ---------------------------------------------------------------------------

/**
 * Records that the caller has been shown the notice's popup, once.
 *
 * Every precondition is re-checked here rather than trusted from the client:
 * the row must be a real, undeleted notice in a conversation the caller
 * actually belongs to, so a crafted id cannot write a view row for a room the
 * caller has no business in (and, more importantly, cannot mark someone
 * else's notice dismissed for them).
 */
export const noticeViewed = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    const msg = await chat.getMessage(Number(req.params.id));
    if (!msg || !msg.is_notice || msg.deleted_at) return notFound(res);
    if (!(await chat.isParticipant(msg.conversation_id, me.uid))) return notFound(res);
    await chat.markNoticeViewed(msg.id, me.uid);
    res.json({ ok: true });
  } catch (err) {
    console.error('[chat] noticeViewed', err);
    res.status(500).json({ message: 'Could not update notice state' });
  }
};

// ---------------------------------------------------------------------------
// POST /conversations/:id/read
// ---------------------------------------------------------------------------

export const markRead = async (req, res) => {
  try {
    const ctx = await authorize(req, res);
    if (!ctx) return;
    const { me, convo } = ctx;
    const messageId = req.body?.message_id;
    await chat.markRead(convo.id, me.uid, messageId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[chat] markRead', err);
    res.status(500).json({ message: 'Could not update read state' });
  }
};

// ---------------------------------------------------------------------------
// GET /conversations/:id/search
// ---------------------------------------------------------------------------

export const searchMessages = async (req, res) => {
  try {
    const ctx = await authorize(req, res);
    if (!ctx) return;
    const { convo } = ctx;
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const rows = await chat.searchMessages(convo.id, q, req.query.limit);
    res.json(rows.map(chat.toMessageDto));
  } catch (err) {
    console.error('[chat] searchMessages', err);
    res.status(500).json({ message: 'Search failed' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /messages/:id  (writer + sender)
// ---------------------------------------------------------------------------

export const editMessage = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    if (!me.canPost) {
      return res.status(403).json({ message: 'Only Super Admin and Accounts can edit messages.' });
    }
    const msg = await chat.getMessage(Number(req.params.id));
    if (!msg) return notFound(res);
    const convo = await chat.getConversation(msg.conversation_id);
    if (!convo) return notFound(res);
    if (!(await chat.isParticipant(convo.id, me.uid))) return notFound(res);

    // Edit is always sender-only, moderator or not.
    if (msg.sender_uid !== me.uid) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }
    if (msg.deleted_at) {
      return res.status(400).json({ message: 'A deleted message cannot be edited' });
    }
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Message cannot be empty' });
    if (body.length > MAX_BODY) {
      return res.status(400).json({ message: `Message is too long (max ${MAX_BODY} characters)` });
    }

    const updated = chat.toMessageDto(await chat.updateMessageBody(msg.id, body));
    emitChat(convo.id, { type: 'message:update', conversation_id: convo.id, message: updated });
    res.json(updated);
  } catch (err) {
    console.error('[chat] editMessage', err);
    res.status(500).json({ message: 'Could not edit the message' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /messages/:id  (writer + sender, or a chat admin anywhere)
// ---------------------------------------------------------------------------

/**
 * Anyone may delete their own message. Deleting someone else's is moderation
 * and is limited to chat admins (Super Admin, Accounts, Admin) in any
 * conversation they belong to.
 */
export const deleteMessage = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    if (!me.canPost) {
      return res.status(403).json({ message: 'Only Super Admin, Accounts, Admin and FRO can delete messages.' });
    }
    const msg = await chat.getMessage(Number(req.params.id));
    if (!msg) return notFound(res);
    const convo = await chat.getConversation(msg.conversation_id);
    if (!convo) return notFound(res);
    if (!(await chat.isParticipant(convo.id, me.uid))) return notFound(res);

    const isModerator = isChatAdminRole(me.role);
    if (!isModerator && msg.sender_uid !== me.uid) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    const updated = chat.toMessageDto(await chat.softDeleteMessage(msg.id));
    emitChat(convo.id, { type: 'message:update', conversation_id: convo.id, message: updated });
    res.json(updated);
  } catch (err) {
    console.error('[chat] deleteMessage', err);
    res.status(500).json({ message: 'Could not delete the message' });
  }
};

// ---------------------------------------------------------------------------
// Group management — participants list, settings, delete
// ---------------------------------------------------------------------------

/** Loads a group the caller belongs to, or ends the request. */
async function authorizeGroupAdmin(req, res) {
  const me = identify(req, res);
  if (!me) return null;
  if (!isChatAdminRole(me.role)) {
    res.status(403).json({ message: 'Only Super Admin, Accounts and Admin can manage groups.' });
    return null;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    notFound(res);
    return null;
  }
  const convo = await chat.getConversation(id);
  // A DM is never manageable here even if the caller is an admin elsewhere.
  if (!convo || convo.kind !== 'group') {
    notFound(res);
    return null;
  }
  if (!(await chat.isParticipant(convo.id, me.uid))) {
    notFound(res);
    return null;
  }
  return { me, convo };
}

/** Row -> participant DTO for the settings dialog. */
function toParticipantDto(p) {
  return {
    uid: p.uid,
    subject_id: p.subject_id,
    name: p.display_name,
    role: p.role,
    can_post: !!p.can_post,
  };
}

// ---------------------------------------------------------------------------
// GET /conversations/:id/participants
// ---------------------------------------------------------------------------

/**
 * Member roster of a group, for the settings dialog's tick list. Any member
 * may read it - membership is not secret inside a room you are already in -
 * but only the three admin roles get the PATCH that changes anything.
 */
export const listGroupParticipants = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return notFound(res);
    const convo = await chat.getConversation(id);
    if (!convo || convo.kind !== 'group') return notFound(res);
    if (!(await chat.isParticipant(convo.id, me.uid))) return notFound(res);
    const rows = await chat.listParticipants(convo.id);
    res.json(rows.map(toParticipantDto));
  } catch (err) {
    console.error('[chat] listGroupParticipants', err);
    res.status(500).json({ message: 'Could not load group members' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /conversations/:id/settings  (admin participants)
// ---------------------------------------------------------------------------

/**
 * Body: { title?, post_policy?, write_mode?, members?: [{uid, can_post}] }
 *
 * Everything optional - omitted fields stay as they are, so the dialog can
 * send only what changed. Members are applied as can_post ticks on existing
 * participants; joining and leaving is not part of this endpoint.
 */
export const updateGroupSettings = async (req, res) => {
  try {
    const ctx = await authorizeGroupAdmin(req, res);
    if (!ctx) return;
    const { convo } = ctx;

    const rawTitle = req.body?.title;
    let title = null;
    if (rawTitle != null) {
      title = String(rawTitle).trim();
      if (!title) return res.status(400).json({ message: 'Group name is required' });
      if (title.length > 80) {
        return res.status(400).json({ message: 'Group name is too long (max 80 characters)' });
      }
    }
    const postPolicy =
      req.body?.post_policy == null
        ? null
        : req.body.post_policy === 'admins_only'
          ? 'admins_only'
          : 'everyone';
    const writeMode =
      req.body?.write_mode == null ? null : req.body.write_mode === 'selected' ? 'selected' : 'everyone';

    const updated = await chat.updateGroupSettings(convo.id, { title, postPolicy, writeMode });
    if (Array.isArray(req.body?.members)) {
      await chat.setParticipantsCanPost(
        convo.id,
        req.body.members.map((m) => ({ uid: m?.uid, canPost: m?.can_post }))
      );
    }

    // Everyone in the room should see the rename/policy flip immediately; the
    // rail's title and the composer gate both read these fields.
    const dto = chat.toConversationDto({
      ...updated,
      my_can_post:
        (await chat.getParticipant(convo.id, ctx.me.uid))?.can_post ?? null,
    });
    emitChat(convo.id, {
      type: 'conversation:update',
      conversation_id: convo.id,
      conversation: dto,
    });
    res.json(dto);
  } catch (err) {
    console.error('[chat] updateGroupSettings', err);
    res.status(500).json({ message: 'Could not update the group' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /conversations/:id  (admin participants)
// ---------------------------------------------------------------------------

/**
 * Hard-deletes a conversation — a group room or a personal chat: participants,
 * messages and notice views all cascade. Chat admins (Super Admin, Accounts,
 * Admin) may delete either kind, but only from a room they belong to. The
 * removal is announced over the socket after the delete succeeds so everyone's
 * rail drops it without a reload.
 */
export const deleteConversation = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    if (!isChatAdminRole(me.role)) {
      return res.status(403).json({ message: 'Only Super Admin, Accounts and Admin can delete chats.' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return notFound(res);
    const convo = await chat.getConversation(id);
    if (!convo) return notFound(res);
    if (!(await chat.isParticipant(convo.id, me.uid))) return notFound(res);
    // Delete first so a failed write never announces a phantom removal.
    await db._pool.query(`DELETE FROM chat_conversations WHERE id = $1`, [convo.id]);
    // Broadcast globally, not room-scoped: people who never joined this room's
    // socket still have it in their rail from an earlier list fetch, and a
    // room-scoped frame would never reach them. The payload is only an id.
    emitChatBroadcast({ type: 'conversation:deleted', conversation_id: convo.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[chat] deleteConversation', err);
    res.status(500).json({ message: 'Could not delete the chat' });
  }
};

// ---------------------------------------------------------------------------
// GET /unread-count
// ---------------------------------------------------------------------------

export const unreadCount = async (req, res) => {
  try {
    const me = identify(req, res);
    if (!me) return;
    // A bare number: the badge does `Number(n) || 0`.
    res.json(await chat.unreadCountFor(me.uid));
  } catch (err) {
    console.error('[chat] unreadCount', err);
    res.status(500).json({ message: 'Could not load unread count' });
  }
};

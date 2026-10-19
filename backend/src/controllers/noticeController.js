import {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
  getSeenNoticeIds,
  markNoticeSeen,
} from '../models/noticeModel.js';
import { resolveChatIdentity, listNoticeFeedFor } from '../models/chatModel.js';
import { presignNoticeMediaUrls, presignNoticeMediaUrl } from '../services/signatureMediaLink.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuidOrNull = (v) => (v && UUID_RE.test(String(v))) ? String(v) : null;

// notices.media_url holds a raw, unsigned bucket URL written by POST /api/upload.
// It 403s for an anonymous browser since the bucket's public-access block was
// applied, so the image never loaded. Sign it on the way out, as the worker photo
// and signature paths already do. The column is left alone - a signed URL must
// never be persisted - and a value that cannot be signed is returned unchanged
// rather than blanked, so one odd row cannot fail the whole list.
const withSignedMedia = async (notice) => (
  notice ? { ...notice, media_url: await presignNoticeMediaUrl(notice.media_url) } : notice
);

export const addNotice = async (req, res) => {
  try {
    const { title, content, target_role, media_url, media_type, media_name, popup, target_roles } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    // Stored raw on purpose: the column keeps the unsigned object URL. The
    // response is signed so the creator sees the image they just attached
    // instead of a broken one on the next fetch.
    const notice = await createNotice({
      title,
      content,
      target_role: target_role || 'all',
      target_roles: Array.isArray(target_roles) && target_roles.length ? target_roles : ['all'],
      popup: typeof popup === 'boolean' ? popup : true,
      media_url: media_url || null,
      media_type: media_type || null,
      media_name: media_name || null,
      ngo_id: req.user.ngo_id || req.body.ngo_id || null,
      created_by: asUuidOrNull(req.user.id),
      created_by_name: req.user.name || null,
    });
    return res.status(201).json({ message: 'Notice created', notice: await withSignedMedia(notice) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listNotices = async (req, res) => {
  try {
    const ngoId = req.user.role === 'super_admin' ? req.query.ngo_id : req.user.ngo_id;
    const notices = await getAllNotices(ngoId, req.query.target_role, req.user);
    const seen = await getSeenNoticeIds(req.user.id);
    const signed = await presignNoticeMediaUrls((notices || []).map(n => n.media_url));
    const out = (notices || []).map((n, i) => ({ ...n, media_url: signed[i], seen: seen.has(String(n.id)) }));

    // Chat group announcements ride along so a notice posted in UCS chat shows
    // up in every dashboard's "Recent Notices" too. Same containment rule as
    // chat itself (the caller must be a participant of the room), so this
    // cannot leak a notice from a group the caller is not in. The id is
    // prefixed "chat-" so it can never collide with a panel notice's UUID, and
    // `source` lets the widget hide edit/delete (the chat message owns those).
    const chatMe = resolveChatIdentity(req.user);
    if (chatMe) {
      try {
        const chatRows = await listNoticeFeedFor(chatMe.uid, 100);
        for (const m of chatRows) {
          let gallery = null;
          try {
            gallery = typeof m.attachment_gallery === 'string'
              ? JSON.parse(m.attachment_gallery)
              : m.attachment_gallery;
          } catch { gallery = null; }
          const first = Array.isArray(gallery) && gallery.length ? gallery[0] : null;
          out.push({
            id: `chat-${m.id}`,
            source: 'chat',
            chat_message_id: m.id,
            conversation_id: m.conversation_id,
            title: m.notice_title || m.conversation_title || 'Group notice',
            content: m.body || '',
            media_url: first?.url || m.attachment_url || null,
            media_type: first?.type || m.attachment_type || null,
            media_name: first?.name || m.attachment_name || null,
            target_role: null,
            created_at: m.created_at,
            created_by_name: m.sender_name || null,
            seen: true,
          });
        }
      } catch (e) {
        // A chat outage must not take the panel notice list down with it.
        console.warn('[notices] chat notice merge skipped:', e?.message || String(e));
      }
    }
    return res.json(out);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const markSeen = async (req, res) => {
  try {
    // Chat-sourced rows carry their own read tracking (chat_notice_views);
    // they arrive here only because the widget posts blindly on open.
    if (String(req.params.id || '').startsWith('chat-')) return res.json({ seen: true });
    await markNoticeSeen(req.user.id, req.params.id);
    return res.json({ seen: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getNotice = async (req, res) => {
  try {
    const notice = await getNoticeById(req.params.id);
    if (!notice) return res.status(404).json({ message: 'Notice not found' });
    return res.json(await withSignedMedia(notice));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const editNotice = async (req, res) => {
  try {
    const { title, content, is_active, media_url, media_type, media_name, popup, target_roles } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (is_active !== undefined) updates.is_active = is_active;
    if (media_url !== undefined) updates.media_url = media_url || null;
    if (media_type !== undefined) updates.media_type = media_type || null;
    if (media_name !== undefined) updates.media_name = media_name || null;
    if (popup !== undefined) updates.popup = popup === true;
    if (target_roles !== undefined) updates.target_roles = Array.isArray(target_roles) && target_roles.length ? target_roles : ['all'];
    const notice = await updateNotice(req.params.id, updates);
    return res.json({ message: 'Notice updated', notice: await withSignedMedia(notice) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const removeNotice = async (req, res) => {
  try {
    // Chat-sourced rows are messages in a room; deleting them belongs to the
    // chat surface, not here.
    if (String(req.params.id || '').startsWith('chat-')) {
      return res.status(400).json({ message: 'Chat notices are managed in the chat room' });
    }
    const result = await deleteNotice(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

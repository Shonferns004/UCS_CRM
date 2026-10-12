-- Group Notices in Community Chat.
--
-- A notice is an ordinary chat_messages row flagged is_notice, carrying a
-- separate title (the body column keeps the notice text). Flagging the row
-- rather than adding a notices table means the whole existing send pipeline -
-- multipart upload, client_id idempotency, socket fan-out, unread counting,
-- soft delete - keeps working untouched.
--
-- chat_notice_views records who has already been shown the one-time popup.
-- Server-side rather than localStorage so the popup fires exactly once per
-- person across devices and reloads, and so dismissing on a shared machine does
-- not hide it from the next login of another member.
--
-- Idempotent: ensureChatSchema replays every file in migrations/ on each boot.

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_notice BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS notice_title TEXT;
-- Extra images on a notice, as a JSON array of {url,name,type,size}. The FIRST
-- image still lands in the flat attachment_* columns so every existing
-- single-image path (rail preview, notification fan-out, ordinary messages)
-- keeps working untouched; this column only carries the rest (and, when
-- present, the whole set for the gallery grid).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_gallery TEXT;

-- A notice may carry a title, but does not have to: the body or an image can
-- stand alone. If a title is present it must not be blank.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_notice_title;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_notice_title CHECK (
  is_notice = false
  OR notice_title IS NULL
  OR length(btrim(notice_title)) > 0
);

CREATE TABLE IF NOT EXISTS chat_notice_views (
  message_id  BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  uid         TEXT NOT NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, uid)
);

-- Pending-popup lookup: every conversation the caller is in, newest first.
CREATE INDEX IF NOT EXISTS idx_chat_notice_views_uid
  ON chat_notice_views (uid, message_id);

-- The rail previews last_message_body; notices show their title instead.
CREATE INDEX IF NOT EXISTS idx_chat_messages_notice
  ON chat_messages (id DESC) WHERE is_notice = true;

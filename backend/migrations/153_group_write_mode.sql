-- Per-member chat permission for group rooms.
--
-- post_policy answers "which ROLES may post" ('everyone' | 'admins_only').
-- write_mode answers a different question: when only SELECTED MEMBERS of an
-- ordinary group may post, regardless of role. The tick list lives on
-- chat_participants.can_post, which the write gate consults ONLY when the
-- room is in 'selected' mode - everywhere else can_post stays the cached UI
-- hint it has always been, so a hand-edited row cannot widen a normal room.
--
-- Idempotent: ensureChatSchema replays every file in migrations/ on each boot.

ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS write_mode TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_write_mode;
ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_write_mode
  CHECK (write_mode IS NULL OR write_mode IN ('everyone', 'selected', 'selected_depts'));

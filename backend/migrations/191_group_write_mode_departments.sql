-- Remember whether a 'selected' room was picked people-level or
-- department-level, so the Group settings radio reflects what the creator
-- chose instead of always reopening as "Selected people".
--
-- 'selected_depts' is gated exactly like 'selected' (chat_participants.can_post
-- plus admins); the department<->member expansion is done in the UI, so the
-- server gate never needs to know the difference.
--
-- Idempotent: ensureChatSchema replays every file in migrations/ on each boot.

ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_write_mode;
ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_write_mode
  CHECK (write_mode IS NULL OR write_mode IN ('everyone', 'selected', 'selected_depts'));

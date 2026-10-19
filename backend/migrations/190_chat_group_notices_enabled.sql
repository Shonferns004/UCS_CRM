-- Add an opt-in flag for the announcement/notice feature on group rooms.
-- Groups created without announcements keep the column false and the notice
-- composer + popup stay hidden for them.
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS notices_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Existing groups keep announcements enabled by default.
-- Department-based group membership, so picking "Accounts" or "HR" extends into
-- the future automatically: a worker hired next week into a department this
-- group seats is seated at the next sync without anyone editing the roster.
--
--   roster_departments - departments the creator used to pick visibility; the
--                        boot + interval sync seats every active worker whose
--                        department matches.
--   post_departments   - departments allowed to post in write_mode=
--                        'selected_depts'; a seat created by the sync gets
--                        can_post true exactly when its department is here.
--   chat_participants.department - needed for the sync to match new hires by
--                        department and for the settings dialog to group the
--                        tick list the way the creator picked it.
--
-- Idempotent: ensureChatSchema replays every file in migrations/ on each boot.

ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS roster_departments TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS post_departments  TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS department TEXT;

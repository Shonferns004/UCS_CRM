import db from '../config/db.js';

// The FRO WhatsApp inbox gained three conversation-level filters (Groups,
// Favourites, Unread) that depend on columns added after the original
// conversations table was hand-created. Reruns safely via
// ADD COLUMN IF NOT EXISTS so every database converges on boot:
//   is_group  - set by the webhook when a message arrives from a @g.us thread
//   group_id  - the WhatsApp group JID, used to key one conversation per group
//   labels    - jsonb array; 'favourite' marks a star (favourite) thread
//   unread_count - raised by the webhook, reset by markConversationRead
export async function ensureWhatsAppConversationSchema() {
  const columns = [
    'is_group BOOLEAN NOT NULL DEFAULT false',
    'group_id TEXT',
    'labels JSONB',
    'unread_count INTEGER NOT NULL DEFAULT 0',
  ];
  for (const column of columns) {
    await db._pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ${column}`);
  }
  await db._pool.query(
    `CREATE INDEX IF NOT EXISTS idx_conversations_group_id ON conversations(group_id) WHERE group_id IS NOT NULL`
  );
}

export default ensureWhatsAppConversationSchema;

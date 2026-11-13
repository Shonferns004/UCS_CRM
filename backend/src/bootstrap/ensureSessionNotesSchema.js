import db from '../config/db.js';

// Free-text operator notes for a gateway session.
//
// A note belongs to the NUMBER, not to an NGO/station assignment, so it gets its own table keyed by
// the gateway session id: a brand-new session can carry a note ("SIM with Sakshi, don't unlink")
// before it is assigned to anything, and it must survive reassignments. `whatsapp_session_assignments`
// holds one row per station, so a note column there would be duplicated and could disagree with
// itself the moment a session serves two stations.
export async function ensureSessionNotesSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_session_notes (
      session_id text PRIMARY KEY,
      session_name text,
      notes text NOT NULL DEFAULT '',
      updated_by uuid,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

import db from '../config/db.js';

// Meetings: a single global "meeting mode" record. Any NGO admin can broadcast
// a company-wide meeting that pauses live counters across all CRM panels.
// Reruns safely on every boot via IF NOT EXISTS.
export async function ensureMeetingSchema() {
  try {
    await db._pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id serial PRIMARY KEY,
        is_active boolean NOT NULL DEFAULT false,
        title text,
        started_by text,
        started_by_name text,
        started_at timestamptz,
        ended_at timestamptz
      );
    `);
  } catch (error) {
    throw error;
  }
}

export default ensureMeetingSchema;
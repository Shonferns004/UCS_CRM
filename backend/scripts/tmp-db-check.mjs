import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const { rows: deepak } = await pool.query(
  `SELECT uid, role, display_name, conversation_id
     FROM chat_participants
    WHERE display_name ILIKE '%deepak%' OR uid ILIKE '%deepak%'
    ORDER BY conversation_id`
);
console.log('Deepak participant rows:');
for (const r of deepak) console.log(' ', r.conversation_id, r.uid, r.role, r.display_name);

const { rows: counts } = await pool.query(
  `SELECT c.id, c.title, count(DISTINCT cp.subject_id)::int AS people, count(*)::int AS rows_
     FROM chat_conversations c
     LEFT JOIN chat_participants cp ON cp.conversation_id = c.id
    WHERE c.kind = 'group'
    GROUP BY c.id, c.title
    ORDER BY c.id`
);
console.log('\nGroup membership:');
for (const r of counts) console.log(' ', r.id, JSON.stringify(r.title), 'people=' + r.people, 'rows=' + r.rows_);

await pool.end();

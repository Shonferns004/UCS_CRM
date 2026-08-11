import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const c = await p.query("select column_name from information_schema.columns where table_name='leads' order by ordinal_position");
console.log('leads cols:', c.rows.map(r => r.column_name).join(', '));
const r = await p.query("select project, project_name, count(*) from leads group by project, project_name");
console.log('leads by project:', JSON.stringify(r.rows));
await p.end();

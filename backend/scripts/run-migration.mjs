import { config as dotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv({ path: path.join(__dirname, '..', '.env') });
import db from '../src/config/db.js';

// Check if column already exists
const check = await db._pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='fro_assignments' AND column_name='hidden_until'`);
if (check.rows.length) {
  console.log('Column hidden_until already exists on fro_assignments');
} else {
  await db._pool.query('ALTER TABLE fro_assignments ADD COLUMN hidden_until timestamptz');
  console.log('Added hidden_until column to fro_assignments');
}

// Verify
const verify = await db._pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='fro_assignments' AND column_name='hidden_until'`);
console.log('Verified:', JSON.stringify(verify.rows[0]));

process.exit(0);
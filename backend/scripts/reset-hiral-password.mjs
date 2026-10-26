import db from '../src/config/db.js';
import bcrypt from 'bcryptjs';

const newPassword = '123456';
const hash = await bcrypt.hash(newPassword, 10);

const workerId = '8ff3fe20-7ae8-4e97-a940-a70905ab893f';
const userId = '0d831c65-60c6-4a26-866e-f6bb4c8ed1b5';

const r1 = await db._pool.query('UPDATE workers SET password = $1 WHERE id = $2', [hash, workerId]);
console.log('workers updated:', r1.rowCount);

const r2 = await db._pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
console.log('users updated:', r2.rowCount);

process.exit(0);
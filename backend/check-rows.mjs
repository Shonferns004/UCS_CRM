import db from './src/config/db.js';

const tables = ['workers', 'donor_profiles', 'users', 'fro_donor_logs', 'fro_assignments', 'whatsapp_accounts', 'messages', 'conversations'];
for (const t of tables) {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
  console.log(`${error ? `[${error.code || 'ERR'}]` : ''} ${t.padEnd(20)} ${count ?? 'n/a'} rows`);
}

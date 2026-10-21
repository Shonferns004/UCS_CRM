// Read-only inspection: which of the scraper tables/indexes exist locally.
// Usage: node scripts/inspect_scraper_indexes.mjs
import db from '../src/config/db.js';

try {
  const tables = await db._pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('bank_audit_entries','scraper_run_entries','scraper_runs')
      ORDER BY table_name`
  );
  console.log('target tables present:', tables.rows.map((r) => r.table_name).join(', ') || 'NONE');

  const r = await db._pool.query(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname='public'
        AND tablename IN ('bank_audit_entries','scraper_run_entries','scraper_runs')
      ORDER BY tablename, indexname`
  );
  if (r.rows.length === 0) console.log('indexes: none found');
  for (const row of r.rows) console.log(`${row.tablename} | ${row.indexname} | ${row.indexdef}`);

  if (tables.rows.some((t) => t.table_name === 'bank_audit_entries')) {
    const cnt = await db._pool.query('SELECT count(*)::int AS n FROM bank_audit_entries');
    console.log('bank_audit_entries rows:', cnt.rows[0].n);
  }
} catch (e) {
  console.error('QUERY FAILED:', e.message);
  process.exitCode = 1;
} finally {
  process.exit();
}

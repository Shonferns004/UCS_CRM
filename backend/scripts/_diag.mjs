import { sql } from '../src/config/db.js';

try {
  const ext = await sql(`SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements'`);
  console.log('pg_stat_statements installed:', ext.length > 0);
  if (ext.length) {
    const rows = await sql(
      `SELECT round(total_exec_time)::bigint AS total_ms, calls,
              round(mean_exec_time)::bigint AS mean_ms,
              rows AS out_rows, left(query, 160) AS q
         FROM pg_stat_statements
        WHERE query ILIKE '%fro_donor_logs%' OR query ILIKE '%workers%' OR query ILIKE '%fro_monthly_targets%'
        ORDER BY mean_exec_time DESC LIMIT 15`
    );
    for (const r of rows) console.log(`${r.mean_ms}ms x${r.calls} rows=${r.out_rows} :: ${r.q}`);
  }
} catch (e) {
  console.error('ERR', e.message);
}
process.exit(0);

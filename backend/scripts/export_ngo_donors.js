import pg from 'pg';
import fs from 'fs';

pg.types.setTypeParser(1082, (v) => v); // date as string

const NGO = (process.argv[2] || 'BSCT').toUpperCase();
const OUT = process.argv[3] || `C:/Users/Shon/AppData/Local/Temp/opencode/${NGO.toLowerCase()}_donors.ndjson`;
const p = new pg.Pool({ connectionString: 'postgres://postgres:bsct_2014@192.168.1.100:5432/ucs_crm', ssl: false });

try {
  const { rows } = await p.query(`
    WITH la AS (
      SELECT DISTINCT ON (a.donor_id)
             a.donor_id, a.station, a.fro_worker_id
      FROM fro_assignments a
      JOIN ngos n ON n.id = a.ngo_id AND n.code = $1
      ORDER BY a.donor_id, a.assigned_at DESC, a.id DESC
    ),
    rec AS (
      SELECT COALESCE(r.donor_id, d.id) AS donor_id,
             r.amount::numeric AS amount,
             r.receipt_date AS receipt_date
      FROM receipts r
      LEFT JOIN donor_profiles d
        ON r.donor_id IS NULL AND d.mobile_number = r.donor_mobile
      WHERE r.project_id = $2
        AND r.voided_at IS NULL
        AND COALESCE(r.amount, 0) > 0
    ),
    agg AS (
      SELECT donor_id,
             count(*)::int AS cnt,
             sum(amount)::float8 AS total,
             min(receipt_date)::date AS first_date,
             max(receipt_date)::date AS last_date
      FROM rec
      WHERE donor_id IS NOT NULL
      GROUP BY donor_id
    )
    SELECT
      d.id,
      COALESCE(NULLIF(d.name, ''), NULLIF(d.bank_donor_name, ''), NULLIF(d.agent_donor_name, ''), 'Unknown') AS name,
      d.mobile_number,
      COALESCE(a.total, 0)::float8 AS total,
      COALESCE(a.cnt, 0)::int AS cnt,
      a.last_date,
      a.first_date,
      la.station,
      w.name AS fro
    FROM la
    JOIN donor_profiles d ON d.id = la.donor_id
    LEFT JOIN agg a ON a.donor_id = d.id
    LEFT JOIN workers w ON w.id = la.fro_worker_id
    ORDER BY la.station NULLS LAST, d.name
  `, [NGO, NGO.toLowerCase()]);

  const lines = rows.map((r) => JSON.stringify({
    id: r.id,
    name: r.name,
    mobile: r.mobile_number || '',
    total: Number(r.total) || 0,
    count: Number(r.cnt) || 0,
    last: r.last_date || '',
    first: r.first_date || '',
    receipt_count: Number(r.cnt) || 0,
    receipt_first: r.first_date || '',
    receipt_last: r.last_date || '',
    log_count: 0,
    log_first: '',
    log_last: '',
    station: r.station || '',
    fro: r.fro || '',
  }));
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`wrote ${rows.length} ${NGO} assigned donors to ${OUT}`);
} finally {
  await p.end();
}

import { Router } from 'express';
import db from '../config/db.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

// Recipient data for the Accounts → WhatsApp → Broadcast page. Stations and their
// donors come from the CRM tables, not the gateway: the gateway only knows chats.
// Admin roles only (the same set that may assign sessions and open the dashboard).
const router = Router();
const ADMIN_ROLES = ['master', 'super_admin', 'accounts', 'admin'];
const requireAdmin = authenticateRole(...ADMIN_ROLES);

// GET /stations — every station that has donors, with its NGO and donor count.
router.get('/stations', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db._pool.query(`
      SELECT fa.ngo_id,
             n.name AS ngo_name,
             TRIM(fa.station) AS station,
             COUNT(DISTINCT fa.donor_id)::int AS donors
        FROM fro_assignments fa
        JOIN ngos n ON n.id = fa.ngo_id
       WHERE fa.station IS NOT NULL
         AND TRIM(fa.station) <> ''
         AND (fa.status IS NULL OR fa.status <> 'reassigned')
       GROUP BY fa.ngo_id, n.name, TRIM(fa.station)
       ORDER BY n.name ASC, station ASC
    `);
    return res.json({ stations: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load stations' });
  }
});

// POST /recipients { stations: [{ ngoId, station }] } — the donors of those exact
// (station, NGO) pairs, de-duplicated by donor. Station names repeat across NGOs,
// so the pair is required; matching on the name alone would union unrelated stations.
router.post('/recipients', requireAdmin, async (req, res) => {
  const requested = Array.isArray(req.body?.stations) ? req.body.stations : [];
  const pairs = requested
    .map((row) => ({
      station: String(row?.station || '').trim(),
      ngo_id: String(row?.ngoId || row?.ngo_id || '').trim(),
    }))
    .filter((row) => row.station && row.ngo_id);

  if (pairs.length === 0) return res.status(400).json({ message: 'Select at least one station' });

  try {
    const { rows } = await db._pool.query(
      `SELECT DISTINCT ON (p.id)
              p.id AS donor_id,
              p.name,
              p.mobile_number AS mobile,
              p.city,
              TRIM(fa.station) AS station,
              fa.ngo_id,
              n.name AS ngo_name
         FROM fro_assignments fa
         JOIN donor_profiles p ON p.id = fa.donor_id
         JOIN ngos n ON n.id = fa.ngo_id
         JOIN jsonb_to_recordset($1::jsonb) AS sel(station text, ngo_id uuid)
           ON TRIM(fa.station) = sel.station AND fa.ngo_id = sel.ngo_id
        WHERE fa.station IS NOT NULL
          AND (fa.status IS NULL OR fa.status <> 'reassigned')
          AND p.mobile_number IS NOT NULL
          AND TRIM(p.mobile_number) <> ''
        ORDER BY p.id, p.name ASC
        LIMIT 20000`,
      [JSON.stringify(pairs)],
    );
    return res.json({ recipients: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Could not load donors' });
  }
});

export default router;

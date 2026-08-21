import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { getNgoAdminTargets, setNgoAdminTarget } from '../controllers/superAdminController.js';
import db from '../config/db.js';

const superAdminAuth = authenticateRole('super_admin');

const router = Router();

router.get('/ngo-admin-targets', superAdminAuth, getNgoAdminTargets);
router.put('/ngo-admin-targets/:workerId', superAdminAuth, setNgoAdminTarget);

// TEMP: Delete receipt by receipt_no + project_id
router.delete('/receipts/temp', superAdminAuth, async (req, res) => {
  try {
    const { receipt_no, project_id } = req.query;
    if (!receipt_no || !project_id) return res.status(400).json({ message: 'receipt_no and project_id required' });

    const { data: receipt, error: findErr } = await db.from('receipts').select('id').eq('receipt_no', receipt_no).eq('project_id', project_id).maybeSingle();
    if (findErr) throw findErr;
    if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

    // Unlink bank_audit_entries
    await db.from('bank_audit_entries').update({ receipt_id: null }).eq('receipt_id', receipt.id);

    // Delete receipt
    const { error: delErr } = await db.from('receipts').delete().eq('id', receipt.id);
    if (delErr) throw delErr;

    return res.json({ message: `Deleted receipt ${receipt_no} (${project_id})`, id: receipt.id });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;

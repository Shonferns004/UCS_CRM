import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { generateCode, listCodes, listAllCodesDebug } from '../controllers/codeController.js';

const router = Router();

// FROs generate codes from their panel; admins/super admins generate too.
router.post('/generate', authenticateRole('fro', 'admin', 'super_admin'), generateCode);
// Only NGO admins / super admins view the code log.
router.get('/', authenticateRole('admin', 'super_admin'), listCodes);
// Debug: super_admin only - list ALL codes across all NGOs
router.get('/all', authenticateRole('super_admin', 'master'), listAllCodesDebug);

export default router;

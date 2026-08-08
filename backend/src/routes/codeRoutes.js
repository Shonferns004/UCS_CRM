import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { generateCode, listCodes } from '../controllers/codeController.js';

const router = Router();

// FROs generate codes from their panel; admins/super admins generate too.
router.post('/generate', authenticateRole('fro', 'admin', 'super_admin'), generateCode);
// Only NGO admins / super admins view the code log.
router.get('/', authenticateRole('admin', 'super_admin'), listCodes);

export default router;

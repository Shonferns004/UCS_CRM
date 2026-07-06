import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { triggerImport, getImportStatus, getLog } from '../controllers/emailImportController.js';

const router = Router();

router.post('/trigger', authenticateRole('accounts', 'super_admin'), triggerImport);
router.get('/status', authenticateRole('accounts', 'super_admin'), getImportStatus);
router.get('/log', authenticateRole('accounts', 'super_admin'), getLog);

export default router;

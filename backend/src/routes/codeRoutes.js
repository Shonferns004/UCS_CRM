import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { generateCode, listCodes, listAllCodesDebug } from '../controllers/codeController.js';

const router = Router();

// Acting FRO retired at the Temporary Data Access cutover: FROs can no longer
// switch identity, so they no longer mint codes. Admins/super admins keep
// generating for their own use; the Codes page remains as the historical log.
router.post('/generate', authenticateRole('admin', 'super_admin'), generateCode);
// All authenticated users (Flutter workers need to see codes).
router.get('/', authenticateRole('fro', 'admin', 'super_admin'), listCodes);
// Debug: admin/super_admin/master - list ALL codes across all NGOs
router.get('/all', authenticateRole('admin', 'super_admin', 'master'), listAllCodesDebug);

export default router;

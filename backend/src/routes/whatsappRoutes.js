import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { sendReceipt, test, status } from '../controllers/whatsappController.js';

const router = Router();

router.post('/test', authenticateRole('accounts', 'super_admin'), test);
router.get('/status', authenticateRole('accounts', 'super_admin'), status);
router.post('/send-receipt/:logId', authenticateRole('accounts', 'super_admin'), sendReceipt);

export default router;

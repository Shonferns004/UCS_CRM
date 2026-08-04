import { Router } from 'express';
import { sendReceipt, sendDirect } from '../controllers/whatsappController.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/send-receipt/:logId', authenticateRole('accounts', 'super_admin'), sendReceipt);
router.post('/send-direct', authenticateRole('accounts', 'super_admin'), sendDirect);

export default router;

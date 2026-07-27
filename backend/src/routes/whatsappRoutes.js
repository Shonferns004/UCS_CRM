import { Router } from 'express';
import { sendMessage } from '../controllers/whatsappMessageController.js';
import { sendReceipt, sendDirect } from '../controllers/whatsappController.js';
import { authenticate, authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/send-message', authenticate, sendMessage);
router.post('/send-receipt/:logId', authenticateRole('accounts', 'super_admin'), sendReceipt);
router.post('/send-direct', authenticateRole('accounts', 'super_admin'), sendDirect);

export default router;

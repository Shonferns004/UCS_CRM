import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  razorpayWebhookEntry, paytmWebhookEntry, triggerRazorpaySync,
  getWebhookStatus, getWebhookLogs,
} from '../controllers/webhookController.js';

const router = Router();

router.post('/razorpay', razorpayWebhookEntry);
router.post('/paytm', paytmWebhookEntry);

router.post('/razorpay/sync', authenticateRole('accounts', 'super_admin'), triggerRazorpaySync);
router.get('/status', authenticateRole('accounts', 'super_admin'), getWebhookStatus);
router.get('/log', authenticateRole('accounts', 'super_admin'), getWebhookLogs);

export default router;

import { Router } from 'express';
import { sendMessage } from '../controllers/whatsappMessageController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/send-message', authenticate, sendMessage);

export default router;

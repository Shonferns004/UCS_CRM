import { Router } from 'express';
import { whatsappCrmLogin, whatsappCrmRegister, whatsappCrmMe, whatsappCrmLogout } from '../controllers/whatsappCrmAuthController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { message: 'Too many login attempts. Please try again later.' },
});

router.post('/auth/login', authLimiter, whatsappCrmLogin);
router.post('/auth/register', authLimiter, whatsappCrmRegister);
router.get('/auth/me', authenticate, whatsappCrmMe);
router.post('/auth/logout', whatsappCrmLogout);

export default router;

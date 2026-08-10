import { Router } from 'express';
import { adminLogin, unifiedLogin, salaryLogin, impersonateFRO, getFroWorkersForImpersonation } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/admin/login', adminLogin);
router.post('/worker/login', unifiedLogin);
router.post('/login', unifiedLogin);
router.post('/salary-login', salaryLogin);
router.post('/impersonate', authenticate, impersonateFRO);
router.get('/fro-workers', authenticate, getFroWorkersForImpersonation);

export default router;

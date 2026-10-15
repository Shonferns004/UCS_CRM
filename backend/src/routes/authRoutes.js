import { Router } from 'express';
import { adminLogin, unifiedLogin, salaryLogin, impersonateFRO, getFroWorkersForImpersonation, getFroWorkAsStations, releaseWorkAs, changePassword, logout, refreshAccessToken } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/admin/login', adminLogin);
router.post('/worker/login', unifiedLogin);
// Mobile apps swap their expired access token for a new one here.
router.post('/refresh', refreshAccessToken);
router.post('/login', unifiedLogin);
router.post('/salary-login', salaryLogin);
router.post('/impersonate', authenticate, impersonateFRO);
router.get('/fro-workers', authenticate, getFroWorkersForImpersonation);
router.get('/fro-workers/:workerId/stations', authenticate, getFroWorkAsStations);
router.post('/work-as/release', authenticate, releaseWorkAs);
router.post('/change-password', authenticate, changePassword);
router.post('/logout', authenticate, logout);

export default router;

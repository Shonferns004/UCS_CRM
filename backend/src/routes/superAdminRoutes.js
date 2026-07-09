import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { getNgoDailyTargets, setNgoDailyTarget } from '../controllers/superAdminController.js';

const superAdminAuth = authenticateRole('super_admin');

const router = Router();

router.get('/ngo-daily-targets', superAdminAuth, getNgoDailyTargets);
router.put('/ngo-daily-targets/:ngoId', superAdminAuth, setNgoDailyTarget);

export default router;

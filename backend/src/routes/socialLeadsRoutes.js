import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { getSocialLeadsOverview } from '../controllers/socialLeadsController.js';

// Read-only lead analytics for the Social Media panel. Restricted to the social
// team (plus admins) so the panel can show its own performance without granting
// the broad Meta-ads access that the Accounts panel has.
const router = Router();
const team = authenticateRole('super_admin', 'admin', 'social', 'digital');

router.get('/overview', team, getSocialLeadsOverview);

export default router;

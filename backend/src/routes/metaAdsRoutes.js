import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { metaAdsStatus, listMetaAdAccounts, listMetaCampaigns, getMetaCampaignInsights } from '../controllers/metaAdsController.js';

const router = Router();
router.get('/status', authenticateRole('accounts', 'super_admin', 'admin', 'master', 'user'), metaAdsStatus);
router.get('/ad-accounts', authenticateRole('accounts', 'super_admin', 'admin', 'master', 'user'), listMetaAdAccounts);
router.get('/campaigns', authenticateRole('accounts', 'super_admin', 'admin', 'master', 'user'), listMetaCampaigns);
router.get('/campaigns/:id/insights', authenticateRole('accounts', 'super_admin', 'admin', 'master', 'user'), getMetaCampaignInsights);

export default router;
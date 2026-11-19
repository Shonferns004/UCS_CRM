import { Router } from 'express';
import multer from 'multer';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  disconnectGoogleAds,
  getGoogleAdsConfigHandler,
  getGoogleAdsOverviewHandler,
  googleAdsStatus,
  importGoogleAdsLeads,
  listGoogleAdsLeads,
  revealGoogleAdsConfigField,
  saveGoogleAdsConfigHandler,
  syncGoogleAds,
  syncGoogleAdsLeadsHandler,
  testGoogleAdsConnection,
} from '../controllers/googleAdsController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const READ_ROLES = ['accounts', 'super_admin', 'admin', 'master', 'user'];
const WRITE_ROLES = ['accounts', 'super_admin', 'admin'];

router.get('/status', authenticateRole(...READ_ROLES), googleAdsStatus);
router.get('/overview', authenticateRole(...READ_ROLES), getGoogleAdsOverviewHandler);
router.get('/leads', authenticateRole(...READ_ROLES), listGoogleAdsLeads);
router.post('/leads/sync', authenticateRole(...WRITE_ROLES), syncGoogleAdsLeadsHandler);
router.post('/leads/import', authenticateRole(...WRITE_ROLES), upload.single('file'), importGoogleAdsLeads);

// Credentials live in the settings table (like WhatsApp accounts and Meta Ads).
// Read hides secrets behind a mask; save/clear are admin-only.
router.get('/config', authenticateRole(...WRITE_ROLES), getGoogleAdsConfigHandler);
router.post('/config', authenticateRole(...WRITE_ROLES), saveGoogleAdsConfigHandler);
router.post('/config/reveal', authenticateRole(...WRITE_ROLES), revealGoogleAdsConfigField);
router.delete('/config', authenticateRole(...WRITE_ROLES), disconnectGoogleAds);

router.post('/test', authenticateRole(...WRITE_ROLES), testGoogleAdsConnection);
router.post('/sync', authenticateRole(...WRITE_ROLES), syncGoogleAds);

export default router;

import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  getSettingsHandler,
  updateSettingsHandler,
  listSlabsHandler,
  createSlabHandler,
  updateSlabHandler,
  deleteSlabHandler,
  applyAllSlabsHandler,
  dailySummaryHandler,
  froDetailHandler,
  currentChampionHandler,
  leaderboardHandler,
  announceChampionHandler,
  championHistoryHandler,
  deleteChampionHandler,
  getSlabFrosHandler,
  setSlabFrosHandler,
} from '../controllers/leadIncentiveController.js';

const router = Router();
const sirLevel = authenticateRole('super_admin', 'admin');
// Champion display is visible to the same audience that sees contest popups.
const popupLevel = authenticateRole('super_admin', 'admin', 'accounts', 'hr', 'worker', 'fro');

// Global lead rules (settings)
router.get('/settings', sirLevel, getSettingsHandler);
router.put('/settings', sirLevel, updateSettingsHandler);

// Slab CRUD
router.get('/slabs', sirLevel, listSlabsHandler);
router.post('/slabs', sirLevel, createSlabHandler);
// Bulk set: apply a common Min Lead + ₹/Qualified Lead to every active slab.
// Must be registered before /slabs/:id so "apply-all" is not matched as an id.
router.put('/slabs/apply-all', sirLevel, applyAllSlabsHandler);
router.put('/slabs/:id', sirLevel, updateSlabHandler);
router.delete('/slabs/:id', sirLevel, deleteSlabHandler);
// Which FROs compete in a range (⚙️ Configure).
router.get('/slabs/:id/fros', sirLevel, getSlabFrosHandler);
router.put('/slabs/:id/fros', sirLevel, setSlabFrosHandler);

// Lead incentive summary
router.get('/lead-summary', sirLevel, dailySummaryHandler);
router.get('/lead-summary/fro/:id', sirLevel, froDetailHandler);

// Champion announcement
router.get('/leaderboard', popupLevel, leaderboardHandler);
router.get('/champion/current', popupLevel, currentChampionHandler);
router.get('/champion/history', sirLevel, championHistoryHandler);
router.post('/champion/announce', sirLevel, announceChampionHandler);
router.delete('/champion/:id', sirLevel, deleteChampionHandler);

export default router;
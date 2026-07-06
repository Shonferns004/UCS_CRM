import { Router } from 'express';
import {
  getWorkerTargets,
  updateTarget,
  getCurrentMonthTargetsList,
  generateAllTargets,
  getMyTarget,
  getWorkerTargetForMonth,
  setAchievement,
  getWorkerAchievements,
  removeAchievement,
  getIncentiveSummary,
  getMonthlySummary,
  bulkSetAchievements,
} from '../controllers/incentiveController.js';
import { authenticateRole, authenticateWorker } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');

router.get('/worker/:workerId/targets', adminOrHrOrHo, getWorkerTargets);
router.get('/worker/:workerId/month/:month', adminOrHrOrHo, getWorkerTargetForMonth);
router.put('/worker/:workerId/month/:month', adminOrHrOrHo, updateTarget);
router.get('/current-month-targets', adminOrHrOrHo, getCurrentMonthTargetsList);
router.post('/generate-all', adminOrHrOrHo, generateAllTargets);
router.get('/my-target', authenticateWorker, getMyTarget);

router.put('/worker/:workerId/achievement/:date', adminOrHrOrHo, setAchievement);
router.get('/worker/:workerId/achievements/:month', adminOrHrOrHo, getWorkerAchievements);
router.delete('/achievement/:id', adminOrHrOrHo, removeAchievement);
router.get('/worker/:workerId/incentive-summary/:month', adminOrHrOrHo, getIncentiveSummary);
router.get('/monthly-summary', adminOrHrOrHo, getMonthlySummary);
router.post('/bulk-achievements', adminOrHrOrHo, bulkSetAchievements);

export default router;

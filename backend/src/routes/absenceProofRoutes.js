import { Router } from 'express';
import {
  myActionable,
  workerMonth,
  upload,
  listPending,
  review,
} from '../controllers/absenceProofController.js';
import { authenticateRole, authenticate } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');

router.get('/actionable', authenticate, myActionable);
router.post('/', authenticate, upload);
router.get('/pending', adminOrHrOrHo, listPending);
router.get('/worker/:workerId', adminOrHrOrHo, workerMonth);
router.put('/:id/status', adminOrHrOrHo, review);

export default router;

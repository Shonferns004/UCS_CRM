import { Router } from 'express';
import {
  apply,
  myLoans,
  listAll,
  listPending,
  decide,
  getWorkerLoansHandler,
  getWorkerActiveLoans,
} from '../controllers/loanController.js';
import { authenticateRole, authenticate } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');

router.post('/apply', authenticate, apply);
router.get('/my', authenticate, myLoans);

router.get('/', adminOrHrOrHo, listAll);
router.get('/pending', adminOrHrOrHo, listPending);
router.put('/:id/decide', adminOrHrOrHo, decide);
router.get('/worker/:workerId', adminOrHrOrHo, getWorkerLoansHandler);
router.get('/worker/:workerId/active', adminOrHrOrHo, getWorkerActiveLoans);

export default router;

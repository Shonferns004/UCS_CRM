import { Router } from 'express';
import {
  addWorker,
  bulkAddWorkers,
  getWorkers,
  getWorker,
  editWorker,
  bulkEditWorkers,
  removeWorker,
  getBirthdays,
  getMyProfile,
  updateMyProfile,
  updateMyEducation,
  getWorkerAllocations,
  setWorkerAllocations,
  abscondWorkerHandler,
  offboardWorkerHandler,
} from '../controllers/workerController.js';
import { authenticateRole, authenticate } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');
// Volunteers tab is also rendered inside the Accounts panel.
const adminHrAccounts = authenticateRole('super_admin', 'admin', 'hr', 'accounts');

router.post('/', adminOrHrOrHo, addWorker);
router.post('/bulk', adminOrHrOrHo, bulkAddWorkers);
router.put('/bulk', adminOrHrOrHo, bulkEditWorkers);
router.get('/', authenticateRole('super_admin', 'admin', 'hr', 'accounts'), getWorkers);
router.get('/birthdays', adminOrHrOrHo, getBirthdays);
router.get('/me', authenticate, getMyProfile);
router.put('/me', authenticate, updateMyProfile);
router.put('/me/education', authenticate, updateMyEducation);
router.get('/:id', adminHrAccounts, getWorker);
router.put('/:id', adminHrAccounts, editWorker);
router.delete('/:id', adminHrAccounts, removeWorker);
router.put('/:id/abscond', adminHrAccounts, abscondWorkerHandler);
router.put('/:id/offboard', adminHrAccounts, offboardWorkerHandler);
router.get('/:id/allocations', adminHrAccounts, getWorkerAllocations);
router.put('/:id/allocations', adminHrAccounts, setWorkerAllocations);

export default router;

import { Router } from 'express';
import {
  getWorkerSalaries,
  addSalary,
  editSalary,
  getWorkersSummary,
  paySalary,
  removeSalary,
  getMySalaryBreakdown,
  getWorkerSalaryWithAllocations,
  getPayrollExport,
} from '../controllers/salaryController.js';
import { authenticateRole, authenticate } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');

router.get('/workers-summary', adminOrHrOrHo, getWorkersSummary);
router.get('/payroll', adminOrHrOrHo, getPayrollExport);
router.get('/worker/:workerId', adminOrHrOrHo, getWorkerSalaries);
router.post('/', adminOrHrOrHo, addSalary);
router.put('/:id', adminOrHrOrHo, editSalary);
router.put('/:id/pay', adminOrHrOrHo, paySalary);
router.delete('/:id', adminOrHrOrHo, removeSalary);
router.get('/my-breakdown', authenticate, getMySalaryBreakdown);
router.get('/worker/:workerId/allocations', adminOrHrOrHo, getWorkerSalaryWithAllocations);

export default router;

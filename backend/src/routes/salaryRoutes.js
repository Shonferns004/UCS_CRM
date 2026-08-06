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
  getPresentDaysExport,
  getWorkerAttendance,
  updateWorkerAttendance,
} from '../controllers/salaryController.js';
import { authenticateRole, authenticate, authenticateSalary } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');

router.get('/workers-summary', adminOrHrOrHo, getWorkersSummary);
router.get('/payroll', adminOrHrOrHo, getPayrollExport);
router.get('/present-days', authenticateSalary, getPresentDaysExport);
router.get('/attendance', authenticateSalary, getWorkerAttendance);
router.patch('/attendance', authenticateSalary, updateWorkerAttendance);
router.get('/worker/:workerId', adminOrHrOrHo, getWorkerSalaries);
router.post('/', adminOrHrOrHo, addSalary);
router.put('/:id', adminOrHrOrHo, editSalary);
router.put('/:id/pay', adminOrHrOrHo, paySalary);
router.delete('/:id', adminOrHrOrHo, removeSalary);
router.get('/my-breakdown', authenticate, getMySalaryBreakdown);
router.get('/worker/:workerId/allocations', adminOrHrOrHo, getWorkerSalaryWithAllocations);

export default router;

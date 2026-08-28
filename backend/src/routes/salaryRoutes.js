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
  getPagarExport,
  verifySalaryPassword,
} from '../controllers/salaryController.js';
import { authenticateRole, authenticate, authenticateSalary } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr', 'accounts');
// Volunteer detail page is also rendered inside the Accounts panel.
const adminHrAccounts = authenticateRole('super_admin', 'admin', 'hr', 'accounts');

router.post('/verify-password', adminHrAccounts, verifySalaryPassword);
router.get('/workers-summary', adminHrAccounts, getWorkersSummary);
router.get('/payroll', adminOrHrOrHo, getPayrollExport);
router.get('/present-days', authenticateSalary, getPresentDaysExport);
router.get('/attendance', authenticateSalary, getWorkerAttendance);
router.patch('/attendance', authenticateSalary, updateWorkerAttendance);
router.get('/worker/:workerId', adminHrAccounts, getWorkerSalaries);
router.post('/', adminHrAccounts, addSalary);
router.put('/:id', adminHrAccounts, editSalary);
router.put('/:id/pay', adminOrHrOrHo, paySalary);
router.delete('/:id', adminHrAccounts, removeSalary);
router.get('/my-breakdown', authenticate, getMySalaryBreakdown);
router.get('/worker/:workerId/allocations', adminHrAccounts, getWorkerSalaryWithAllocations);
router.get('/pagar-export', adminHrAccounts, getPagarExport);

export default router;

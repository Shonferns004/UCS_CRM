import { Router } from 'express';
import {
  getNgoSettings,
  putNgoSettings,
  getWorkerPeople,
  putWorkerPeople,
  getWorkerSalaryAlloc,
  putWorkerSalaryAlloc,
  postGenerateSalaryAlloc,
  getPayments,
  postPayment,
  putPaymentStatus,
  getReportNgoSalary,
  getReportEmployee,
  getReportNgo,
  getNgoSalarySummary,
} from '../controllers/ngoAllocationController.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');

// Settings (org-wide default/target % per NGO)
router.get('/settings', adminOrHrOrHo, getNgoSettings);
router.put('/settings', adminOrHrOrHo, putNgoSettings);

// People (employment) allocations
router.get('/workers/:id/people', adminOrHrOrHo, getWorkerPeople);
router.put('/workers/:id/people', adminOrHrOrHo, putWorkerPeople);

// Salary allocations (monthly snapshots)
router.get('/workers/:id/salary', adminOrHrOrHo, getWorkerSalaryAlloc);
router.put('/workers/:id/salary', adminOrHrOrHo, putWorkerSalaryAlloc);
router.post('/workers/:id/salary/generate', adminOrHrOrHo, postGenerateSalaryAlloc);

// Payments
router.get('/payments', adminOrHrOrHo, getPayments);
router.post('/payments', adminOrHrOrHo, postPayment);
router.put('/payments/:id/status', adminOrHrOrHo, putPaymentStatus);

// Reports
router.get('/report/ngo-salary', adminOrHrOrHo, getReportNgoSalary);
router.get('/report/employee/:workerId', adminOrHrOrHo, getReportEmployee);
router.get('/report/ngo/:ngoId', adminOrHrOrHo, getReportNgo);

// Summary
router.get('/summary', adminOrHrOrHo, getNgoSalarySummary);

export default router;

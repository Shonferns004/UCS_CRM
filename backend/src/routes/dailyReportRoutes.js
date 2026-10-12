import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  saveReport,
  getMyReport,
  getReports,
  getAllReports,
  getSummary,
  getRoster,
  setReportRemark,
} from '../controllers/dailyReportController.js';

const router = Router();

// Every reporter-facing department plus super_admin/admin oversight. 'digital'
// and 'developers' cover the dev panel (ROLE_ALIASES normalizes 'developer' ->
// 'developers'); 'social' is its own role.
const reporters = authenticateRole('super_admin', 'admin', 'hr', 'recruiter', 'digital', 'developers', 'social');

// HOD oversight (dashboard, pending list, remarks) is super_admin/admin only.
const hod = authenticateRole('super_admin', 'admin');

router.post('/', reporters, saveReport);
router.get('/mine', reporters, getMyReport);
router.get('/all', hod, getAllReports);
router.get('/summary', hod, getSummary);
router.get('/roster', hod, getRoster);
router.get('/', reporters, getReports);
router.put('/:id/remark', hod, setReportRemark);

export default router;

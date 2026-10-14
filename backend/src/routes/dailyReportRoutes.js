import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { isTaskHead } from '../utils/taskAssignmentAccess.js';
import {
  saveReport,
  getMyReport,
  getReports,
  getReviewedReports,
  getAllReports,
  getSummary,
  getRoster,
  setReportRemark,
  setReportReview,
} from '../controllers/dailyReportController.js';

const router = Router();

// Every reporter-facing department plus super_admin/admin oversight. 'digital'
// and 'developers' cover the dev panel (ROLE_ALIASES normalizes 'developer' ->
// 'developers'); 'social' is its own role.
const reporters = authenticateRole('super_admin', 'admin', 'hr', 'recruiter', 'digital', 'developers', 'social');

// HOD oversight (dashboard, pending list, remarks) is super_admin/admin only.
const hod = authenticateRole('super_admin', 'admin');

// The Social Media head reviews the daily reports her team submits. She logs in
// with the derived 'digital' role (the Digital team is also reviewed under
// Social Media), so 'social' and 'digital' are allowed past the role gate; the
// named-head rule in the middleware is what actually decides.
const reviewers = authenticateRole('super_admin', 'admin', 'social', 'digital');

// Accept / reject is the reviewer's call. isTaskHead deliberately has no role
// fallback (see taskAssignmentAccess.js), so admins are added here explicitly
// for HOD oversight of the queue.
const reviewOnly = (req, res, next) => {
  const role = String(req.user?.role || '');
  if (!isTaskHead(req.user) && !['super_admin', 'admin'].includes(role)) {
    return res.status(403).json({ message: 'Only the reviewer can accept or reject a report.' });
  }
  return next();
};

router.post('/', reporters, saveReport);
router.get('/mine', reporters, getMyReport);
router.get('/all', hod, getAllReports);
router.get('/summary', hod, getSummary);
router.get('/roster', hod, getRoster);
router.get('/reviewed', reporters, getReviewedReports);
router.get('/', reporters, getReports);
router.put('/:id/remark', hod, setReportRemark);
router.put('/:id/review', reviewers, reviewOnly, setReportReview);

export default router;

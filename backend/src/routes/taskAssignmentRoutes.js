import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { isTaskHead } from '../utils/taskAssignmentAccess.js';
import {
  getAssignees,
  listMyAssignments,
  addAssignment,
  removeAssignment,
  getAccess,
  updateAssignment,
} from '../controllers/taskAssignmentController.js';

const router = Router();

// The Digital team is reviewed under Social Media and logs in with the 'digital'
// role, so it is allowed here beside 'social' — otherwise a Social member opening
// their own Daily Report block would be refused.
const team = authenticateRole('super_admin', 'admin', 'social', 'digital');

// Only the named head may assign. Everyone else on the team can read their own
// Daily Report block but never sees the assignee picker or the write endpoints.
const headOnly = (req, res, next) => {
  if (!isTaskHead(req.user)) {
    return res.status(403).json({ message: 'Only the Social Media head can assign tasks.' });
  }
  return next();
};

router.get('/access', team, getAccess);
router.get('/assignees', team, headOnly, getAssignees);
router.get('/', team, listMyAssignments);
router.post('/', team, headOnly, addAssignment);
router.patch('/:id/status', team, updateAssignment);
router.delete('/:id', team, headOnly, removeAssignment);

export default router;
import { Router } from 'express';
import {
  addNotice,
  listNotices,
  getNotice,
  editNotice,
  removeNotice,
} from '../controllers/noticeController.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHr = authenticateRole('super_admin', 'admin', 'hr');

router.post('/', adminOrHr, addNotice);
router.get('/', authenticateRole('super_admin', 'admin', 'hr', 'accounts', 'recruiter', 'leads', 'telecaller', 'team_lead'), listNotices);
router.get('/:id', adminOrHr, getNotice);
router.put('/:id', adminOrHr, editNotice);
router.delete('/:id', authenticateRole('super_admin', 'admin', 'hr'), removeNotice);

export default router;

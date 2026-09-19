import { Router } from 'express';
import { authenticate, authenticateRole } from '../middleware/authMiddleware.js';
import { getMeetingStatus, startMeeting, endMeeting } from '../controllers/meetingController.js';

const router = Router();

// GET is available to every logged-in role so all panels can watch for it.
router.get('/', authenticate, getMeetingStatus);
// Start/End are NGO-admin / super-admin actions (global meeting).
router.post('/start', authenticateRole('admin', 'super_admin'), startMeeting);
router.post('/end', authenticateRole('admin', 'super_admin'), endMeeting);

export default router;
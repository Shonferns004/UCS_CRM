import { Router } from 'express';
import { authenticateRole, authenticate } from '../middleware/authMiddleware.js';
import {
  addOperatorEvent, editOperatorEvent, getOperatorEvent,
  listOperatorEventsController, removeOperatorEvent, assignEvent,
  operatorDashboard, saveSelfAssignment, uploadOperatorSelfie,
  listOperatorDayAssignments,
} from '../controllers/operatorController.js';

const router = Router();

// Any authenticated worker can view their own dashboard / assignments.
router.get('/dashboard', authenticate, operatorDashboard);
router.get('/assignments', authenticate, listOperatorDayAssignments);

// Worker saves their own day's assignment + selfie (no admin needed).
router.post('/self-assign', authenticate, saveSelfAssignment);
router.post('/selfie', authenticate, uploadOperatorSelfie);

// Operator event CRUD (admin / ngo / accounts).
router.get('/events', authenticateRole('super_admin', 'admin', 'ngo', 'accounts'), listOperatorEventsController);
router.get('/events/:id', authenticateRole('super_admin', 'admin', 'ngo', 'accounts'), getOperatorEvent);
router.post('/events', authenticateRole('super_admin', 'admin', 'ngo', 'accounts'), addOperatorEvent);
router.put('/events/:id', authenticateRole('super_admin', 'admin', 'ngo', 'accounts'), editOperatorEvent);
router.delete('/events/:id', authenticateRole('super_admin', 'admin', 'ngo'), removeOperatorEvent);

// Operator → state + event assignment for a day.
router.post('/assign', authenticateRole('super_admin', 'admin', 'ngo'), assignEvent);

export default router;
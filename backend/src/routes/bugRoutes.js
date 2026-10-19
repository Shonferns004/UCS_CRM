import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  listBugs, getStats, getActivity, getBug, createBug, editBug, removeBug, getAssignees, getBugHistory,
} from '../controllers/bugController.js';

const router = Router();

router.use(authenticate);

router.get('/stats', getStats);
// Before '/:id' — otherwise Express would read 'activity' as an id.
router.get('/activity', getActivity);
router.get('/assignees', getAssignees);
router.post('/', createBug);
router.get('/', listBugs);
router.get('/:id', getBug);
router.get('/:id/history', getBugHistory);
router.put('/:id', editBug);
router.delete('/:id', removeBug);

export default router;

import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  listStacks, createStack, updateStack, deleteStack,
  addMembers, removeMembers, assignFroToStack, getStackMembers, getMyStacks,
} from '../controllers/stackController.js';

const router = Router();

// Admin
router.get('/ngo-admin/stacks', authenticateRole('admin', 'super_admin'), listStacks);
router.post('/ngo-admin/stacks', authenticateRole('admin', 'super_admin'), createStack);
router.put('/ngo-admin/stacks/:id', authenticateRole('admin', 'super_admin'), updateStack);
router.delete('/ngo-admin/stacks/:id', authenticateRole('admin', 'super_admin'), deleteStack);
router.post('/ngo-admin/stacks/:id/members', authenticateRole('admin', 'super_admin'), addMembers);
router.delete('/ngo-admin/stacks/:id/members', authenticateRole('admin', 'super_admin'), removeMembers);
router.post('/ngo-admin/stacks/:id/assign-fro', authenticateRole('admin', 'super_admin'), assignFroToStack);
router.get('/ngo-admin/stacks/:id/members', authenticateRole('admin', 'super_admin'), getStackMembers);

// FRO
router.get('/fro/my-stacks', authenticateRole('fro', 'worker', 'super_admin'), getMyStacks);

export default router;

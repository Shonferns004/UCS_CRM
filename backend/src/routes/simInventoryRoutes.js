import { Router } from 'express';
import {
  addInventoryItem,
  listInventoryItems,
  getInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  assignInventoryItem,
  updateStatus,
  deleteBulk,
  importInventoryItems,
} from '../controllers/simInventoryController.js';
import { authenticate, authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();

const MANAGERS = authenticateRole('super_admin', 'admin', 'hr', 'accounts');
const ANY_AUTH = authenticate;

router.get('/', ANY_AUTH, listInventoryItems);
router.get('/:id', ANY_AUTH, getInventoryItem);

router.post('/', MANAGERS, addInventoryItem);
router.post('/import', MANAGERS, importInventoryItems);
router.post('/bulk', MANAGERS, deleteBulk);
router.post('/:id/assign', MANAGERS, assignInventoryItem);
router.post('/:id/status', MANAGERS, updateStatus);

router.put('/:id', MANAGERS, editInventoryItem);
router.delete('/:id', MANAGERS, removeInventoryItem);

export default router;

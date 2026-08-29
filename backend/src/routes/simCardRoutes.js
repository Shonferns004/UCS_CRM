import { Router } from 'express';
import {
  addSimCard,
  listSimCards,
  getSimCard,
  editSimCard,
  removeSimCard,
  replaceSimCard,
  listReplacements,
  replaceHistoryForSim,
  updateStatusBulk,
  deleteBulk,
  importSimCards,
} from '../controllers/simCardController.js';
import { authenticate, authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();

const MANAGERS = authenticateRole('super_admin', 'admin', 'hr', 'accounts');
const ANY_AUTH = authenticate;

router.get('/', ANY_AUTH, listSimCards);
router.get('/replacements', ANY_AUTH, listReplacements);
router.get('/:id', ANY_AUTH, getSimCard);
router.get('/:id/replacements', ANY_AUTH, replaceHistoryForSim);

router.post('/', MANAGERS, addSimCard);
router.post('/import', MANAGERS, importSimCards);
router.post('/replacements/bulk', MANAGERS, updateStatusBulk);
router.post('/replacements/bulk-delete', MANAGERS, deleteBulk);
router.post('/:id/replace', MANAGERS, replaceSimCard);

router.put('/:id', MANAGERS, editSimCard);
router.delete('/:id', MANAGERS, removeSimCard);

export default router;

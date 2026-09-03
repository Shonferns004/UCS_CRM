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
  historyForSim,
} from '../controllers/simCardController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

const ANY_AUTH = authenticate;

router.get('/', ANY_AUTH, listSimCards);
router.get('/replacements', ANY_AUTH, listReplacements);
router.get('/:id', ANY_AUTH, getSimCard);
router.get('/:id/replacements', ANY_AUTH, replaceHistoryForSim);
router.get('/:id/history', ANY_AUTH, historyForSim);

router.post('/', ANY_AUTH, addSimCard);
router.post('/import', ANY_AUTH, importSimCards);
router.post('/replacements/bulk', ANY_AUTH, updateStatusBulk);
router.post('/replacements/bulk-delete', ANY_AUTH, deleteBulk);
router.post('/:id/replace', ANY_AUTH, replaceSimCard);

router.put('/:id', ANY_AUTH, editSimCard);
router.delete('/:id', ANY_AUTH, removeSimCard);

export default router;

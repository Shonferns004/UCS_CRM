import { Router } from 'express';
import { addNgo, listNgos, getNgo, editNgo, removeNgo, toggleNgo, getNgoSummary } from '../controllers/ngoController.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();

const adminOrHrOrHo = authenticateRole('super_admin', 'admin', 'hr');

router.get('/', adminOrHrOrHo, listNgos);
router.get('/summary', adminOrHrOrHo, getNgoSummary);
router.post('/', adminOrHrOrHo, addNgo);
router.get('/:id', adminOrHrOrHo, getNgo);
router.put('/:id', adminOrHrOrHo, editNgo);
router.delete('/:id', adminOrHrOrHo, removeNgo);
router.put('/:id/toggle', adminOrHrOrHo, toggleNgo);

export default router;

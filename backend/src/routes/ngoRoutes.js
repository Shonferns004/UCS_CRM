import { Router } from 'express';
import { addNgo, listNgos, getNgo, editNgo, removeNgo, toggleNgo } from '../controllers/ngoController.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateRole('super_admin', 'admin', 'hr'), listNgos);
router.post('/', authenticateRole('super_admin'), addNgo);
router.get('/:id', authenticateRole('super_admin', 'admin', 'hr'), getNgo);
router.put('/:id', authenticateRole('super_admin'), editNgo);
router.delete('/:id', authenticateRole('super_admin'), removeNgo);
router.put('/:id/toggle', authenticateRole('super_admin'), toggleNgo);

export default router;

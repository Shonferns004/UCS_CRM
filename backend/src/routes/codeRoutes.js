import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { generateCode, listCodes } from '../controllers/codeController.js';

const router = Router();

router.use(authenticateRole('admin', 'super_admin'));

router.post('/generate', generateCode);
router.get('/', listCodes);

export default router;

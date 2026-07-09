import { Router } from 'express';
import { parseImage } from '../controllers/ocrController.js';

const router = Router();

router.post('/parse', parseImage);

export default router;

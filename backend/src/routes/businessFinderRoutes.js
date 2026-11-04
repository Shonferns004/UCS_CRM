import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  collectBusinesses,
  deleteBatch,
  deleteBusiness,
  downloadExtension,
  listBatches,
  listBusinesses,
  searchBusinesses,
  status,
} from '../controllers/businessFinderController.js';

const router = Router();
const guard = authenticateRole('accounts', 'super_admin');

router.get('/search', guard, searchBusinesses);
router.post('/collect', guard, collectBusinesses);
router.get('/list', guard, listBusinesses);
router.get('/batches', guard, listBatches);
router.get('/status', guard, status);
router.get('/extension.zip', guard, downloadExtension);
router.delete('/batch/:batchId', guard, deleteBatch);
router.delete('/:id', guard, deleteBusiness);

export default router;

import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  collectCaptures,
  deleteBatch,
  deleteLead,
  downloadExtension,
  exportLeads,
  addAiKeyword,
  addAiKeywordsBulk,
  deleteAiKeyword,
  getAiSettings,
  leadStats,
  listBatches,
  listCategories,
  listLeads,
  runAiTagging,
  status,
  updateLead,
} from '../controllers/extractorController.js';

const router = Router();
const guard = authenticateRole('accounts', 'super_admin');

// Capture ingest (called by the Chrome extension with the user's CRM token).
router.post('/captures/batch', guard, collectCaptures);

// Reads for the Accounts panel.
router.get('/leads', guard, listLeads);
router.get('/leads/stats', guard, leadStats);
router.get('/leads/categories', guard, listCategories);
router.get('/leads/export', guard, exportLeads);
router.patch('/leads/:id', guard, updateLead);
router.delete('/leads/:id', guard, deleteLead);

router.get('/batches', guard, listBatches);
router.delete('/batches/:batchId', guard, deleteBatch);

// AI tagging: vocabulary, queue counts and manual runs.
router.get('/ai/settings', guard, getAiSettings);
router.post('/ai/keywords', guard, addAiKeyword);
router.post('/ai/keywords/bulk', guard, addAiKeywordsBulk);
router.delete('/ai/keywords/:id', guard, deleteAiKeyword);
router.post('/ai/run', guard, runAiTagging);

// Extension package + health.
router.get('/extension.zip', guard, downloadExtension);
router.get('/status', guard, status);
// The extension's "Test connection" probes without needing panel semantics.
router.get('/health', guard, status);

export default router;

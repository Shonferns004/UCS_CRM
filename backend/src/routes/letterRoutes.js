import { Router } from 'express';
import {
  seedTemplates,
  listTemplates,
  getTemplate,
  addTemplate,
  editTemplate,
  removeTemplate,
  generateLetter,
  listGeneratedLetters,
  getWorkerLetters,
  downloadLetter,
} from '../controllers/letterController.js';
import { authenticateRole } from '../middleware/authMiddleware.js';

const router = Router();

const hrRoles = authenticateRole('super_admin', 'admin', 'hr');

router.post('/seed', hrRoles, seedTemplates);
router.get('/templates', hrRoles, listTemplates);
router.get('/templates/:id', hrRoles, getTemplate);
router.post('/templates', hrRoles, addTemplate);
router.put('/templates/:id', hrRoles, editTemplate);
router.delete('/templates/:id', hrRoles, removeTemplate);
router.post('/generate', hrRoles, generateLetter);
router.get('/generated', hrRoles, listGeneratedLetters);
router.get('/generated/worker/:workerId', hrRoles, getWorkerLetters);
router.get('/generated/:id/download', hrRoles, downloadLetter);

export default router;

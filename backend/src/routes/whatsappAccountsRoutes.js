import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireWhatsAppAdmin } from '../middleware/authMiddleware.js';
import {
  list, getById, create, update, remove, createTemplate, listAccountTemplates, deleteAccountTemplate, uploadTemplateMedia,
} from '../controllers/whatsappAccountController.js';
import {
  listAgents, assignAgent, removeAgent, searchAgents, listAssignableAgents,
} from '../controllers/froWhatsAppAssignmentController.js';

/**
 * WhatsApp account administration.
 *
 * These endpoints create and edit `whatsapp_accounts` rows, which hold the Meta
 * ACCESS TOKEN for each business number. That makes them the most sensitive
 * routes in the WhatsApp surface: anyone who can reach them can read or replace
 * a token and therefore send as that business. They are restricted to
 * super_admin / accounts, and -- unlike the rest of the WhatsApp API -- they are
 * NOT exposed to the fro/agent roles that use the inbox.
 *
 * This also closes a real gap: whatsappAccountController.js and
 * froWhatsAppAssignmentController.js were both written but never mounted, so
 * there was no supported way to add an account or grant an agent access to one.
 * Until now that could only be done with raw SQL.
 *
 * Access is requireWhatsAppAdmin: the accounts/super_admin/master staff paths
 * keep their existing rights, and a CRM agent reaches it ONLY through
 * crm_agents.whatsapp_admin. That flag is not a CRM role, so granting it does
 * not open any other panel.
 */

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

router.use(authenticate);
router.use(requireWhatsAppAdmin);

// Declared before '/:accountId/...' so the literal segment is never read as an id.
router.get('/agents/search', searchAgents);
router.get('/agents/list', listAssignableAgents);

router.get('/', list);
router.post('/', create);
router.get('/:accountId', getById);
router.put('/:accountId', update);
router.delete('/:accountId', remove);

router.get('/:accountId/agents', listAgents);
router.post('/:accountId/agents', assignAgent);
router.delete('/:accountId/agents/:froId', removeAgent);

router.post('/:accountId/templates', createTemplate);
router.post('/:accountId/templates/upload-media', upload.single('file'), uploadTemplateMedia);
router.get('/:accountId/templates', listAccountTemplates);
router.delete('/:accountId/templates/:name', deleteAccountTemplate);

export default router;
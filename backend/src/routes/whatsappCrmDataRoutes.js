import { Router } from 'express';
import { authenticate, normalizeRole } from '../middleware/authMiddleware.js';
import { resolveWaCaller } from '../services/whatsappScope.js';
import {
  getMessages, createMessage, updateMessage, getMessageCounts,
  getConversations, getConversation, createConversation, updateConversation,
  getConversationCounts, getConversationByContact,
} from '../controllers/whatsappCrmDataController.js';

const router = Router();

// Roles allowed on the WhatsApp panel. Mirrors requireWhatsApp in
// routes/froWhatsAppRoutes.js so this surface and the inbox admit the same
// people; before this router used `authenticate` alone, which let an HR or
// NGO-admin login enumerate every donor conversation in the organisation.
const ALLOWED_ROLES = ['fro', 'worker', 'agent', 'admin', 'super_admin', 'master'];

const requireWhatsApp = (req, res, next) => {
  const role = normalizeRole(req.user?.role);
  if (ALLOWED_ROLES.includes(role)) return next();
  if (req.user?.department && req.user.department.toLowerCase().trim() === 'fro') return next();
  return res.status(403).json({ message: 'Access denied' });
};

// Resolve the caller once per request so the controller can read req.waCaller
// instead of re-deriving an identity (and a different one) per query.
const attachCaller = async (req, res, next) => {
  try {
    req.waCaller = await resolveWaCaller(req);
    next();
  } catch (error) {
    next(error);
  }
};

router.use(authenticate, requireWhatsApp, attachCaller);

router.get('/messages', getMessages);
router.post('/messages', createMessage);
router.put('/messages/:id', updateMessage);
router.get('/messages/counts', getMessageCounts);

router.get('/conversations', getConversations);
router.get('/conversations/counts', getConversationCounts);
router.get('/conversations/by-contact', getConversationByContact);
router.get('/conversations/:id', getConversation);
router.post('/conversations', createConversation);
router.put('/conversations/:id', updateConversation);

export default router;
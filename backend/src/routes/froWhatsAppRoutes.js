import { Router } from 'express';
import { authenticate, requireWhatsAppAdmin } from '../middleware/authMiddleware.js';
import multer from 'multer';
import {
  whatsappAutoLogin,
} from '../controllers/froWhatsAppAuthController.js';
import {
  listConversations,
  listAgentConversations,
  agentUnreadCount,
  listMessages,
  sendMessage,
  sendDirect,
  createConversation,
  markRead,
  unreadCount,
  listQuickReplies,
  listTemplates,
  sendTemplate,
  searchMessages,
  updateLabels,
  uploadMedia,
  listMyAccounts,
  whatsappAdminStatus,
  getMedia,
  listLabels,
  updateConversationStatus,
  retryFailedMessage,
} from '../controllers/froWhatsAppController.js';
import { sendInteractive } from '../controllers/whatsappEnhancementsController.js';
import { testSendPreview, testSend } from '../controllers/froWhatsAppTestController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

const ALLOWED_ROLES = ['fro', 'worker', 'agent', 'admin', 'super_admin', 'master'];

const requireWhatsApp = (req, res, next) => {
  const role = req.user?.role;
  if (ALLOWED_ROLES.includes(role)) return next();
  if (req.user?.department && req.user.department.toLowerCase().trim() === 'fro') return next();
  return res.status(403).json({ message: 'Access denied' });
};

router.get('/auto-login', whatsappAutoLogin);

router.use(requireWhatsApp);

router.get('/agent-conversations', listAgentConversations);
router.get('/agent-conversations/unread-count', agentUnreadCount);
router.get('/my-accounts', listMyAccounts);
// Read-only: tells the FRO panel whether to render the WhatsApp admin entry.
router.get('/admin-status', whatsappAdminStatus);
router.post('/send-direct', sendDirect);
router.post('/create-conversation', createConversation);
router.get('/conversations/:id/messages', listMessages);
router.post('/conversations/:id/send', sendMessage);
router.post('/conversations/:id/send-interactive', sendInteractive);
router.put('/conversations/:id/read', markRead);
router.get('/search', searchMessages);
router.get('/media/:mediaId', getMedia);
router.post('/upload-media', upload.single('file'), uploadMedia);
router.post('/send-template', sendTemplate);
router.get('/quick-replies', listQuickReplies);
router.get('/templates', listTemplates);
// Labels in use across the caller's conversations, for the inbox tag filter.
router.get('/labels', listLabels);
// Conversation lifecycle. The `:id` parameter must not shadow these, so they are
// declared before the `/conversations/:id/...` block below.
router.patch('/conversations/:id/status', updateConversationStatus);
router.post('/conversations/:id/messages/:messageId/retry', retryFailedMessage);

router.get('/conversations', listConversations);
router.get('/conversations/unread-count', unreadCount);
router.put('/conversations/:id/labels', updateLabels);

// ── Controlled send test ───────────────────────────────────────────────────
//
// Agent 1 only, one authorised recipient, two verbs. Declared last so the path
// can never be shadowed by the `:id` routes above.
//
// requireWhatsAppAdmin is the gate, not a role string: it reads
// crm_agents.whatsapp_admin (authMiddleware.js:99) and leaves req.user.role
// untouched, so it grants WhatsApp scope without granting CRM administration.
router.get('/test-send/preview', requireWhatsAppAdmin, testSendPreview);
router.post('/test-send', requireWhatsAppAdmin, testSend);

export default router;

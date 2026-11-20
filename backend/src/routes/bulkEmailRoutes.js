import { Router } from 'express';
import multer from 'multer';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  cancelCampaign,
  createSender,
  createTemplate,
  deleteSender,
  deleteTemplate,
  getLog,
  getTemplate,
  getTemplateAttachment,
  listSenders,
  listTemplateAttachments,
  listLogs,
  listRecipients,
  listReplies,
  listTemplates,
  pollReplies,
  previewTemplate,
  resumeCampaign,
  send,
  testSender,
  updateSender,
  updateTemplate,
  uploadAsset,
} from '../controllers/bulkEmailController.js';
import {
  bulk,
  downloadAttachment,
  getMessage,
  listMessages,
  markRead,
  reply,
  sync,
} from '../controllers/mailboxController.js';

const router = Router();
const roles = authenticateRole('accounts', 'admin', 'super_admin');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const handleUpload = (req, res, next) => {
  upload.array('attachments', 10)(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Each attachment must be 20 MB or smaller.'
      : error.code === 'LIMIT_FILE_COUNT'
        ? 'You can attach up to 10 files at a time.'
        : error.message || 'Could not upload attachments.';
    return res.status(400).json({ message });
  });
};

const handleImageUpload = (req, res, next) => {
  uploadImage.single('file')(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be 5 MB or smaller.'
      : error.message || 'Could not upload image.';
    return res.status(400).json({ message });
  });
};

router.get('/recipients', roles, listRecipients);
router.get('/senders', roles, listSenders);
router.post('/senders', roles, createSender);
router.post('/senders/:id/test', roles, testSender);
router.put('/senders/:id', roles, updateSender);
router.delete('/senders/:id', roles, deleteSender);
router.get('/templates', roles, listTemplates);
router.post('/templates/preview', roles, previewTemplate);
router.get('/templates/:id/attachment', roles, getTemplateAttachment);
router.get('/templates/:id/attachments', roles, listTemplateAttachments);
router.get('/templates/:id/attachments/:aid', roles, getTemplateAttachment);
router.get('/templates/:id', roles, getTemplate);
router.post('/templates', roles, handleUpload, createTemplate);
router.put('/templates/:id', roles, handleUpload, updateTemplate);
router.delete('/templates/:id', roles, deleteTemplate);
router.post('/assets', roles, handleImageUpload, uploadAsset);
router.get('/logs', roles, listLogs);
router.get('/replies', roles, listReplies);
router.post('/replies/poll', roles, pollReplies);

// Inbound mailbox (Bulk Email > Mailbox tab). Read-only mirror of the sender
// inbox; attachments are streamed from IMAP, never stored in Postgres.
router.get('/mailbox/messages', roles, listMessages);
router.get('/mailbox/messages/:id', roles, getMessage);
router.get('/mailbox/messages/:id/attachments/:index', roles, downloadAttachment);
router.post('/mailbox/messages/bulk', roles, bulk);
router.post('/mailbox/messages/:id/read', roles, markRead);
router.post('/mailbox/messages/:id/reply', roles, handleUpload, reply);
router.post('/mailbox/sync', roles, sync);

router.post('/logs/:id/resume', roles, resumeCampaign);
router.post('/logs/:id/cancel', roles, cancelCampaign);
router.get('/logs/:id', roles, getLog);
router.post('/send', roles, handleUpload, send);

export default router;

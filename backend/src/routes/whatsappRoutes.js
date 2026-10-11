import { Router } from 'express';
import { sendReceipt, sendDirect, serveReceiptFile } from '../controllers/whatsappController.js';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { getAccountById } from '../models/whatsappAccountModel.js';
import { listTemplatesForAccount } from '../services/whatsappService.js';

const router = Router();
router.post('/send-receipt/:logId', authenticateRole('accounts', 'super_admin'), sendReceipt);
router.post('/send-direct', authenticateRole('accounts', 'super_admin'), sendDirect);

// Live APPROVED template list for one account, straight from Meta. The account
// manager's template picker calls this as /whatsapp/templates?accountId=N.
// Reading a token out of the DB and using it is admin-only for the same reason
// the account routes are.
router.get('/templates', authenticateRole('accounts', 'super_admin'), async (req, res) => {
  const accountId = req.query.accountId;
  if (!accountId) return res.status(400).json({ message: 'accountId is required' });
  try {
    const account = await getAccountById(accountId);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    return res.json(await listTemplatesForAccount(account));
  } catch (error) {
    return res.status(502).json({ message: error.message });
  }
});

// Meta fetches the template's HEADER document with a plain GET and cannot
// present a session token, so this route is deliberately unauthenticated. The
// HMAC-signed, expiring token in the URL is the authorisation -- it is verified
// before any storage call, and a rejected token answers 404 so the endpoint
// cannot be used to probe which receipt keys exist.
router.get('/receipt-file/:token', serveReceiptFile);

export default router;

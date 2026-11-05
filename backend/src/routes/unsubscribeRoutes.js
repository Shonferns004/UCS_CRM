import { Router } from 'express';
import { unsubscribeInfo, unsubscribeOneClick } from '../controllers/bulkEmailController.js';

// Public, token-protected unsubscribe page used by bulk email footers and by
// Gmail's one-click List-Unsubscribe flow. No auth by design.
const router = Router();

router.get('/', unsubscribeInfo);
router.post('/', unsubscribeOneClick);

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  callingStatus,
  requestCallPermission,
  startCall,
  answerCall,
  declineCall,
  endCall,
  activeCalls,
  callHistory,
} from '../controllers/whatsappCallingController.js';

const router = Router();

// Calling is agent/FRO scoped like the rest of the inbox. It is deliberately
// NOT behind requireWhatsAppAdmin: any agent handling a donor may call, while
// account/assignment management stays admin-only.
router.use(authenticate);

router.post('/status', callingStatus);
router.post('/request-permission', requestCallPermission);
router.post('/start', startCall);
router.post('/:callId/answer', answerCall);
router.post('/:callId/decline', declineCall);
router.post('/:callId/end', endCall);
router.get('/active', activeCalls);
router.get('/history', callHistory);

export default router;

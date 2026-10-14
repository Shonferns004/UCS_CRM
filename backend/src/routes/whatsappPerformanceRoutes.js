import { Router } from 'express';
import { authenticate, requireWhatsAppAdmin } from '../middleware/authMiddleware.js';
import {
  agentPerformance,
  agentConversations,
} from '../controllers/whatsappAgentPerformanceController.js';

// Per-agent WhatsApp performance for the admin surface.
//
// Same gate as the account and automation routes -- requireWhatsAppAdmin -- so a
// CRM agent holding crm_agents.whatsapp_admin reaches this, and nobody else does.
// This matters here more than for the account routes: performance is a direct
// read of every contact name and phone number handled under each agent's login,
// so it must not sit behind a wider guard than the surface it lives on.
//
// It is deliberately NOT served from the existing /whatsapp/analytics/agents.
// That endpoint exists (analyticsService.js:60) but is gated by
// authenticateRole('accounts','super_admin'), which 403s exactly the agents this
// screen is for, and it ranks the 'whatsapp-automation' sender as if it were a
// person. See whatsappAgentPerfModel.js for the full list of differences.
const router = Router();

router.use(authenticate);
router.use(requireWhatsAppAdmin);

/** The leaderboard: one row per agent for the window. `?range=today|7d|30d`. */
router.get('/agents', agentPerformance);

/** The conversations behind one agent row. */
router.get('/agents/:agentId/conversations', agentConversations);

export default router;
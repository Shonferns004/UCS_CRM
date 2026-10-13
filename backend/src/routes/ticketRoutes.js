import { Router } from 'express';
import { authenticate, authenticateRole, authenticateAccountsOrEventTeam } from '../middleware/authMiddleware.js';
import {
  listTickets, listMyTickets, listToSuperAdmin, getTicket, createTicket, updateTicket, updateSuperAdminTicket,
  addReply, deleteTicket, getWorkers, getPendingTicketPopups, ackTicketPopup
} from '../controllers/ticketController.js';

const router = Router();

router.use(authenticate);

router.get('/workers', getWorkers);
router.get('/my', listMyTickets);
// Must precede GET /:id or 'pending-popups' and 'to-super-admin' are swallowed
// as ids.
router.get('/pending-popups', getPendingTicketPopups);
router.get('/to-super-admin', listToSuperAdmin);

router.post('/', createTicket);
// Accounts/super admin list everything; the Event Manager team lists the same
// endpoint but the UI only ever asks for its own department + category.
router.get('/', authenticateAccountsOrEventTeam, listTickets);
router.get('/:id', getTicket);
router.put('/:id', authenticateAccountsOrEventTeam, updateTicket);
// Scoped resolve/update for To-Super-Admin tickets: any authenticated user may
// action them, but only when the row is department 'super_admin' (checked in
// the controller). Must precede generic PUT-handling order is irrelevant here,
// but keep it spelled out next to the scoped GET it belongs with.
router.put('/:id/to-super-admin', updateSuperAdminTicket);
router.delete('/:id', authenticateRole('accounts', 'super_admin'), deleteTicket);
router.post('/:id/reply', addReply);
router.post('/:id/popup-seen', ackTicketPopup);

export default router;

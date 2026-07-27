import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  listTickets, listMyTickets, listUnassigned, getStats, getTicket,
  createTicket, updateTicket, addReply, bulkUpdate, getAssignees,
} from '../controllers/developerTicketController.js';

const router = Router();

router.use(authenticate);

router.get('/stats', getStats);
router.get('/my', listMyTickets);
router.get('/unassigned', listUnassigned);
router.get('/assignees', getAssignees);
router.post('/', createTicket);
router.get('/', listTickets);
router.get('/:id', getTicket);
router.put('/:id', updateTicket);
router.post('/:id/reply', addReply);
router.put('/bulk', bulkUpdate);

export default router;

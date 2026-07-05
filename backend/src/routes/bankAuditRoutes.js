import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import {
  listSources, addSource, editSource, removeSource,
  listEntries, addEntry, editEntry, removeEntry, getSummary,
  suggestEntries, markEntryVerified,
  assignEntryToNgo, listNgoSuspense, assignSuspenseToFro,
  listFroSuspense, resolveSuspenseEntry,
} from '../controllers/bankAuditController.js';

const router = Router();

// Accounts & Super Admin routes
router.get('/sources', authenticateRole('accounts', 'super_admin'), listSources);
router.post('/sources', authenticateRole('accounts', 'super_admin'), addSource);
router.put('/sources/:id', authenticateRole('accounts', 'super_admin'), editSource);
router.delete('/sources/:id', authenticateRole('accounts', 'super_admin'), removeSource);

router.get('/entries', authenticateRole('accounts', 'super_admin'), listEntries);
router.post('/entries', authenticateRole('accounts', 'super_admin'), addEntry);
router.put('/entries/:id', authenticateRole('accounts', 'super_admin'), editEntry);
router.delete('/entries/:id', authenticateRole('accounts', 'super_admin'), removeEntry);

router.get('/entries/suggest', authenticateRole('accounts', 'super_admin'), suggestEntries);
router.put('/entries/:id/verify', authenticateRole('accounts', 'super_admin'), markEntryVerified);
router.put('/entries/:id/assign-ngo', authenticateRole('accounts', 'super_admin'), assignEntryToNgo);

router.get('/summary', authenticateRole('accounts', 'super_admin'), getSummary);

// NGO Admin routes
router.get('/ngo-suspense', authenticateRole('hoadmin', 'ngo-admin', 'super_admin'), listNgoSuspense);
router.put('/ngo-suspense/:id/assign-fro', authenticateRole('hoadmin', 'ngo-admin', 'super_admin'), assignSuspenseToFro);

// FRO routes
router.get('/fro-suspense', authenticateRole('fro', 'worker', 'super_admin'), listFroSuspense);
router.put('/fro-suspense/:id/resolve', authenticateRole('fro', 'worker', 'super_admin'), resolveSuspenseEntry);

export default router;

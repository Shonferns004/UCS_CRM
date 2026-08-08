import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { getLeadList, verifyLead, rejectLead, getSuspenseList, createSuspense, addSuspenseNote, assignSuspense, generateReceipt, getReceipt, getReceiptList, getPendingReceipts, markReceiptAsSent, patchLeadField, getDonorHistory, getDayEndReport, importReceipts, clearReceipts, getReceiptCount, getDonorsList, exportDonors, getDonorDetail, updateDonor, getImportNgoOptions, listReceiptClaims, verifyReceiptClaim, rejectReceiptClaim } from '../controllers/accountsController.js';

const router = Router();

router.use(authenticateRole('accounts', 'super_admin'));

router.get('/leads', getLeadList);
router.post('/leads/:logId/verify', verifyLead);
router.post('/leads/:logId/reject', rejectLead);
router.patch('/leads/:logId/field', patchLeadField);

router.get('/suspense', getSuspenseList);
router.post('/suspense', createSuspense);
router.post('/suspense/:id/note', addSuspenseNote);
router.post('/suspense/:id/assign', assignSuspense);

router.post('/leads/:logId/receipt', generateReceipt);
router.get('/leads/:logId/receipt', getReceipt);
router.get('/receipts/count', getReceiptCount);
router.get('/receipts', getReceiptList);
router.get('/receipts/pending', getPendingReceipts);
router.post('/receipts/mark-sent', markReceiptAsSent);
router.post('/receipts/import', importReceipts);
router.get('/ngos', getImportNgoOptions);
router.delete('/receipts', clearReceipts);
router.get('/donors', getDonorsList);
router.get('/donors/export', exportDonors);
router.get('/donors/:id', getDonorDetail);
router.patch('/donors/:id', updateDonor);
router.get('/donor/:donorId/history', getDonorHistory);

router.get('/day-end-report', getDayEndReport);

router.get('/receipt-claims', listReceiptClaims);
router.put('/receipt-claims/:id/verify', verifyReceiptClaim);
router.put('/receipt-claims/:id/reject', rejectReceiptClaim);

export default router;

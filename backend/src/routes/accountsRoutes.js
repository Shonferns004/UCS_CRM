import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { getLeadList, verifyLead, quickVerifyLead, rejectLead, goBackLead, undoLeadVerification, deleteLead, deleteAllPendingLeads, getSuspenseList, createSuspense, addSuspenseNote, assignSuspense, generateReceipt, getReceipt, getReceiptList, getAddressSuggestions, getPendingReceipts, markReceiptAsSent, patchLeadField, getDonorHistory, getDayEndReport, importReceipts, importReceiptNames, getReceiptByMobile, clearReceipts, getReceiptCount, getReceiptNumbers, getSuspenseByNgo, getDonorsList, exportDonors, getDonorDetail, updateDonor, getImportNgoOptions } from '../controllers/accountsController.js';

const router = Router();

router.use(authenticateRole('accounts', 'super_admin'));

router.get('/leads', getLeadList);
router.get('/leads/address-suggest', getAddressSuggestions);
router.post('/leads/:logId/verify', verifyLead);
router.post('/leads/:logId/quick-verify', quickVerifyLead);
router.post('/leads/:logId/reject', rejectLead);
router.post('/leads/:logId/go-back', goBackLead);
router.post('/leads/:logId/undo', undoLeadVerification);
router.delete('/leads', deleteAllPendingLeads);
router.delete('/leads/:logId', deleteLead);
router.patch('/leads/:logId/field', patchLeadField);

router.get('/suspense', getSuspenseList);
router.post('/suspense', createSuspense);
router.post('/suspense/:id/note', addSuspenseNote);
router.post('/suspense/:id/assign', assignSuspense);

router.post('/leads/:logId/receipt', generateReceipt);
router.get('/leads/:logId/receipt', getReceipt);
router.get('/receipts/count', getReceiptCount);
router.get('/receipts/numbers', getReceiptNumbers);
router.get('/receipts/suspense-by-ngo', getSuspenseByNgo);
router.get('/receipts', getReceiptList);
router.get('/receipts/pending', getPendingReceipts);
router.post('/receipts/mark-sent', markReceiptAsSent);
router.post('/receipts/import', importReceipts);
router.post('/receipts/names-import', importReceiptNames);
router.get('/receipts/by-mobile', getReceiptByMobile);
router.get('/ngos', getImportNgoOptions);
router.delete('/receipts', clearReceipts);
router.get('/donors', getDonorsList);
router.get('/donors/export', exportDonors);
router.get('/donors/:id', getDonorDetail);
router.patch('/donors/:id', updateDonor);
router.get('/donor/:donorId/history', getDonorHistory);

router.get('/day-end-report', getDayEndReport);

export default router;

import { Router } from 'express';
import multer from 'multer';
import { authenticate, authenticateRole } from '../middleware/authMiddleware.js';
import * as ctrl from '../controllers/eventHeadController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const eh = authenticateRole('super_admin', 'admin', 'hr', 'event_head');
// Events (static paths BEFORE :id)
router.get('/dashboard/stats', eh, ctrl.getEventHeadDashboardStats);
router.get('/events/dashboard', eh, ctrl.getEventHeadDashboard);
router.get('/events/calendar', eh, (req, res) => {
  const { month, year } = req.query;
  if (month && year) {
    req.params.month = month;
    req.params.year = year;
    return ctrl.getEventHeadEventsByMonth(req, res);
  }
  return ctrl.listEventHeadEvents(req, res);
});
// Event sheet import/export (static paths BEFORE /events/:id)
router.post('/events/import', eh, upload.single('file'), ctrl.importEvents);
router.get('/events/export', eh, ctrl.exportEvents);
router.get('/events/ngo/:ngoId', eh, ctrl.getEventHeadEventsByNgo);
router.get('/events/state/:state', eh, ctrl.getEventHeadEventsByState);
router.post('/events', eh, ctrl.createEventHandler);
router.get('/events', eh, ctrl.listEventHeadEvents);
router.get('/events/:id', eh, ctrl.getEventHeadEvent);
router.put('/events/:id', eh, ctrl.updateEventHeadEvent);
router.put('/events/:id/status', eh, ctrl.updateEventHeadStatus);
router.delete('/events/:id', eh, ctrl.deleteEventHeadEvent);

// Approval flow
router.post('/events/:id/submit', eh, ctrl.submitEventHeadApproval);
router.put('/events/:id/approve', eh, ctrl.approveEventHeadEvent);
router.put('/events/:id/reject', eh, ctrl.rejectEventHeadEvent);

// Assets
router.post('/assets', eh, ctrl.createAsset);
router.get('/assets', eh, ctrl.listAssets);
router.get('/assets/utilization', eh, ctrl.getAssetUtilization);
router.get('/assets/:id', eh, ctrl.getAsset);
router.put('/assets/:id', eh, ctrl.editAsset);
router.delete('/assets/:id', eh, ctrl.removeAsset);
router.post('/assets/issue', eh, ctrl.issueAssetItem);
router.put('/assets/return/:id', eh, ctrl.returnAssetItem);

// Materials
router.post('/materials', eh, ctrl.createMaterial);
router.get('/materials', eh, ctrl.listMaterials);
router.get('/materials/stock', eh, ctrl.getMaterialStock);
router.put('/materials/:id', eh, ctrl.editMaterial);
router.put('/materials/:id/stock', eh, ctrl.adjustMaterialStock);
router.delete('/materials/:id', eh, ctrl.removeMaterial);

// Distributions (scoped under event)
router.get('/events/:eventId/distributions', eh, ctrl.listDistributions);
router.post('/events/:eventId/distributions', eh, ctrl.createDistribution);

// Beneficiaries
router.get('/beneficiaries', eh, ctrl.listBeneficiaries);
router.post('/beneficiaries', eh, ctrl.createBeneficiary);

// Volunteers
router.post('/volunteers', eh, ctrl.createVolunteer);
router.get('/volunteers', eh, ctrl.listVolunteers);
router.put('/volunteers/:id', eh, ctrl.editVolunteer);

// Expenses (scoped under event)
router.get('/events/:eventId/expenses', eh, ctrl.listExpenses);
router.post('/events/:eventId/expenses', eh, ctrl.createExpense);
router.delete('/events/:eventId/expenses/:id', eh, ctrl.removeExpense);

// Vehicles
router.post('/vehicles', eh, ctrl.createVehicle);
router.get('/vehicles', eh, ctrl.listVehicles);
router.post('/vehicles/assign', eh, ctrl.assignVehicle);

// Media (scoped under event)
router.get('/events/:eventId/media', eh, ctrl.listMedia);
router.post('/events/:eventId/media', eh, ctrl.uploadMedia);
router.delete('/events/:eventId/media/:id', eh, ctrl.removeMedia);

// Attendance (scoped under event)
router.get('/events/:eventId/attendance', eh, ctrl.listAttendance);
router.post('/events/:eventId/attendance', eh, ctrl.createAttendance);

// Checklist (scoped under event)
router.get('/events/:eventId/checklist', eh, ctrl.getChecklist);
router.put('/events/:eventId/checklist/:itemId', eh, ctrl.updateChecklistItem);

// Reports
router.get('/reports/event/:eventId', eh, ctrl.generateEventReport);

// Approvals
router.get('/approvals', eh, ctrl.listApprovals);

// Partners & Donors
router.get('/csr-partners', eh, ctrl.listPartners);
router.get('/donors', eh, ctrl.listDonors);

// NGO context (read-only for the Event Head workspace)
router.get('/ngos', eh, ctrl.listEventHeadNgos);

// Sectors & Activities (NGO → Sector → Activity)
router.get('/sectors', eh, ctrl.listSectors);
router.get('/activities', eh, ctrl.listActivities);
router.post('/activities', eh, ctrl.createActivity);
// Sheet import/export (static paths BEFORE /activities/:id)
router.post('/activities/import', eh, upload.single('file'), ctrl.importActivities);
router.get('/activities/export', eh, ctrl.exportActivities);
router.get('/activities/:id', eh, ctrl.getActivity);
router.put('/activities/:id', eh, ctrl.updateActivity);
router.put('/activities/:id/status', eh, ctrl.setActivityStatus);

export default router;

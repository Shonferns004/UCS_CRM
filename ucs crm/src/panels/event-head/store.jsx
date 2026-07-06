import { api } from '../../api/auth'
export const apiGet = (path) => api(path, { _prefix: 'ucs' })
export const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body), _prefix: 'ucs' })
export const apiDelete = (path) => api(path, { method: 'DELETE', _prefix: 'ucs' })
export const apiPut = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body), _prefix: 'ucs' })

const PALETTE = ['#7B5EA7','#B5603A','#C08A2E','#4F6472','#5B6B4E','#88693D','#3485D4'];
export const avatarColor = (name) => {
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
};
export const initials = (n) => (n||'').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();

/* ── Events ── */
export const fetchEvents = () => apiGet('/events')
export const fetchEventById = (id) => apiGet('/events/' + id)
export const createEvent = (data) => apiPost('/events', data)
export const updateEvent = (id, data) => apiPut('/events/' + id, data)
export const deleteEvent = (id) => apiDelete('/events/' + id)
export const fetchEventDashboard = () => apiGet('/events/dashboard')
export const fetchEventsByMonth = (month, year) => apiGet('/events/calendar?month=' + month + '&year=' + year)
export const fetchEventsByNgo = (ngoId) => apiGet('/events/ngo/' + ngoId)
export const fetchEventsByState = (state) => apiGet('/events/state/' + state)
export const fetchEventPerformance = (id) => apiGet('/events/' + id + '/performance')
export const updateEventStatus = (id, status) => apiPut('/events/' + id + '/status', { status })

/* ── Event Checklist ── */
export const fetchChecklist = (eventId) => apiGet('/events/' + eventId + '/checklist')
export const updateChecklistItem = (eventId, itemId, data) => apiPut('/events/' + eventId + '/checklist/' + itemId, data)

/* ── Assets ── */
export const fetchAssets = () => apiGet('/assets')
export const fetchAssetById = (id) => apiGet('/assets/' + id)
export const createAsset = (data) => apiPost('/assets', data)
export const updateAsset = (id, data) => apiPut('/assets/' + id, data)
export const deleteAsset = (id) => apiDelete('/assets/' + id)
export const issueAsset = (data) => apiPost('/assets/issue', data)
export const returnAsset = (id, data) => apiPut('/assets/return/' + id, data)
export const fetchAssetUtilization = () => apiGet('/assets/utilization')

/* ── Distribution Material ── */
export const fetchMaterials = () => apiGet('/materials')
export const createMaterial = (data) => apiPost('/materials', data)
export const updateMaterial = (id, data) => apiPut('/materials/' + id, data)
export const deleteMaterial = (id) => apiDelete('/materials/' + id)
export const fetchMaterialStock = () => apiGet('/materials/stock')
export const adjustMaterialStock = (id, data) => apiPut('/materials/' + id + '/stock', data)

/* ── Beneficiary Distribution ── */
export const fetchDistributions = (eventId) => apiGet('/events/' + eventId + '/distributions')
export const createDistribution = (eventId, data) => apiPost('/events/' + eventId + '/distributions', data)
export const fetchBeneficiaries = () => apiGet('/beneficiaries')
export const createBeneficiary = (data) => apiPost('/beneficiaries', data)

/* ── Volunteers ── */
export const fetchVolunteers = () => apiGet('/volunteers')
export const createVolunteer = (data) => apiPost('/volunteers', data)
export const updateVolunteer = (id, data) => apiPut('/volunteers/' + id, data)
export const fetchVolunteerAttendance = (eventId) => apiGet('/events/' + eventId + '/volunteer-attendance')
export const markVolunteerAttendance = (eventId, data) => apiPost('/events/' + eventId + '/volunteer-attendance', data)

/* ── Expenses ── */
export const fetchExpenses = (eventId) => apiGet('/events/' + eventId + '/expenses')
export const createExpense = (eventId, data) => apiPost('/events/' + eventId + '/expenses', data)
export const deleteExpense = (eventId, id) => apiDelete('/events/' + eventId + '/expenses/' + id)

/* ── Vehicles ── */
export const fetchVehicles = () => apiGet('/vehicles')
export const createVehicle = (data) => apiPost('/vehicles', data)
export const assignVehicle = (data) => apiPost('/vehicles/assign', data)

/* ── Media ── */
export const fetchMedia = (eventId) => apiGet('/events/' + eventId + '/media')
export const uploadMedia = (eventId, formData) => api('/events/' + eventId + '/media', { method: 'POST', body: formData, _prefix: 'ucs' })
export const deleteMedia = (eventId, id) => apiDelete('/events/' + eventId + '/media/' + id)

/* ── Attendance ── */
export const fetchEventAttendance = (eventId) => apiGet('/events/' + eventId + '/attendance')
export const markAttendance = (eventId, data) => apiPost('/events/' + eventId + '/attendance', data)

/* ── Reports ── */
export const generateEventReport = (eventId, type) => apiGet('/reports/event/' + eventId + '?type=' + type)
export const generateEventPdf = (eventId) => api('/reports/event/' + eventId + '/pdf', { _prefix: 'ucs' })
export const generateEventExcel = (eventId) => api('/reports/event/' + eventId + '/excel', { _prefix: 'ucs' })

/* ── Approval ── */
export const fetchApprovals = () => apiGet('/approvals')
export const submitApproval = (eventId) => apiPost('/events/' + eventId + '/submit')
export const approveEvent = (eventId) => apiPut('/events/' + eventId + '/approve')
export const rejectEvent = (eventId, remark) => apiPut('/events/' + eventId + '/reject', { remark })

/* ── NGOs / CSR / Donors ── */
export const fetchNGOs = () => apiGet('/ngos')
export const fetchCSRPartners = () => apiGet('/csr-partners')
export const fetchDonors = () => apiGet('/donors')

/* ── Notifications ── */
export const fetchNotifs = (userId) => apiGet('/notifications/' + userId)

export const CATEGORIES = [
  'Education','Health','Food Distribution','Women Empowerment',
  'Animal Welfare','Disability Support','Environment','Medical Camp','Blood Donation'
]

export const PRIORITIES = ['Low','Medium','High','Urgent']
export const EVENT_STATUSES = ['Draft','Submitted','Approved','Rejected','Completed','Closed','Cancelled','Postponed']

export const CHECKLIST_ITEMS = [
  'Permission received','Material Ready','Volunteers Assigned','Vehicle Booked',
  'Photographer Assigned','Vendor Confirmed','Beneficiary List Ready','Donation Material Ready'
]

export const ASSET_TYPES = [
  'Tables','Chairs','Canopy','Stage','Sound System','Mic','Speakers','Projector',
  'Laptop','Printer','Banner','Standee','Backdrop','Generator','Extension Boards',
  'Lights','Camera','DSLR','Tripod','Wheelchairs','Sewing Machines','Tricycles',
  'Water Dispenser','Volunteer Jackets','ID Cards','Donation Boxes'
]

export const MATERIAL_TYPES = [
  'Food Kits','Grocery Kits','Education Kits','School Bags','Blankets',
  'Umbrellas','Sewing Machines','Flour Mills','Tricycles','Notebooks',
  'Stationery','Clothes','Sanitary Napkins','Water Bottles','Medical Kits'
]

export const EXPENSE_TYPES = [
  'Transport','Food','Fuel','Venue','Printing','Decoration',
  'Photography','Sound System','Honorarium','Miscellaneous'
]

import { api } from './auth'

export async function getTransferredLeads(ngoId) {
  const params = ngoId ? `?ngo_id=${ngoId}` : ''
  return api(`/fro/transferred-leads${params}`, { _prefix: 'ucs' })
}

export async function getMyDonors(status, statusGroup, options = {}) {
  const params = new URLSearchParams();
  if (statusGroup) params.set('status_group', statusGroup);
  else if (status) params.set('status', status);
  if (options.verifiedOnly) params.set('verified_only', 'true');
  if (options.period) params.set('period', options.period);
  if (options.activeOnly) params.set('active_only', 'true');
  if (options.inactiveOnly) params.set('inactive_only', 'true');
  if (options.newOnly) params.set('new_only', 'true');
  if (options.oldOnly) params.set('old_only', 'true');
  if (options.station) params.set('station', options.station);
  if (options.ngoId) params.set('ngo_id', options.ngoId);
  if (options.limit) params.set('limit', options.limit);
  if (options.offset != null) params.set('offset', options.offset);
  const qs = params.toString();
  return api(`/fro/donors${qs ? '?' + qs : ''}`, { _prefix: 'ucs' })
}

export async function getDonorDetail(donorId, ngoId) {
  const params = ngoId ? `?ngo_id=${ngoId}` : ''
  return api(`/fro/donors/${donorId}/logs${params}`, { _prefix: 'ucs' })
}

export async function updateDonorStatus(donorId, data) {
  return api(`/fro/donors/${donorId}/status`, { method: 'PUT', body: JSON.stringify(data), _prefix: 'ucs' })
}

export async function updateDonorType(donorId, donorType) {
  return api(`/fro/donors/${donorId}/donor-type`, { method: 'PUT', body: JSON.stringify({ donor_type: donorType }), _prefix: 'ucs' })
}

export async function addDonorLog(donorId, data) {
  return api(`/fro/donors/${donorId}/logs`, { method: 'POST', body: JSON.stringify(data), _prefix: 'ucs' })
}

export async function scheduleContact(donorId, data) {
  return api(`/fro/donors/${donorId}/schedule`, { method: 'POST', body: JSON.stringify(data), _prefix: 'ucs' })
}

export async function getDonorDonations(donorId, ngoId, period) {
  const params = new URLSearchParams();
  if (ngoId) params.set('ngo_id', ngoId);
  if (period) params.set('period', period);
  // The endpoint defaults to a short activity preview. The donation modal needs
  // the full history so its rows always match the donor's donation count.
  params.set('limit', '1000');
  params.set('page_size', '1000');
  return api(`/fro/donors/${donorId}/donations?${params}`, { _prefix: 'ucs' })
}

export async function uploadPaymentScreenshot(fileBase64, mimeType) {
  return api('/fro/upload-payment-screenshot', { method: 'POST', body: JSON.stringify({ file_base64: fileBase64, mime_type: mimeType }), _prefix: 'ucs' })
}

export async function getMyDashboard() {
  return api('/fro/dashboard', { _prefix: 'ucs' })
}

export async function getMyCollections() {
  return api('/fro/dashboard/collections', { _prefix: 'ucs' })
}

export async function getSuspenseReceipts() {
  return api('/fro/dashboard/suspense', { _prefix: 'ucs' })
}

export async function claimSuspenseReceipt(receiptId, data) {
  const body = data ? JSON.stringify(data) : '{}'
  return api(`/fro/dashboard/suspense/${receiptId}/claim`, { method: 'POST', body, _prefix: 'ucs' })
}

export async function getRejectedLeads() {
  return api('/fro/rejected-leads', { _prefix: 'ucs' })
}

export async function getMyHistory() {
  return api('/fro/history', { _prefix: 'ucs' })
}

export async function requestMoreData(message) {
  return api('/fro/request-data', { method: 'POST', body: JSON.stringify({ message }), _prefix: 'ucs' })
}

export async function getScheduled() {
  return api('/fro/scheduled', { _prefix: 'ucs' })
}

export async function getCallbacks() {
  return api('/fro/callbacks', { _prefix: 'ucs' })
}

export async function markDonorSeen(donorId, ngoId) {
  const body = ngoId ? JSON.stringify({ ngo_id: ngoId }) : '{}'
  return api(`/fro/donors/${donorId}/mark-seen`, { method: 'PUT', body, _prefix: 'ucs' })
}

export async function reportMissedSchedule(donorId, ngoId, scheduledAt) {
  return api('/fro/report-missed', { method: 'POST', body: JSON.stringify({ donor_id: donorId, ngo_id: ngoId, scheduled_at: scheduledAt }), _prefix: 'ucs' })
}

export async function getMyDataRequests() {
  return api('/fro/database-requests', { _prefix: 'ucs' })
}

export async function getFollowUps() {
  return api('/fro/follow-ups', { _prefix: 'ucs' })
}

export async function getLeadStats(month) {
  const params = month ? `?month=${month}` : ''
  return api(`/fro/lead-stats${params}`, { _prefix: 'ucs' })
}

export async function getMonthlyDonors(month) {
  const params = month ? `?month=${month}` : ''
  return api(`/fro/monthly-donors${params}`, { _prefix: 'ucs' })
}

export async function getDonorHistory(donorId, period) {
  const params = period ? `?period=${period}` : ''
  return api(`/fro/donors/${donorId}/history${params}`, { _prefix: 'ucs' })
}

export async function getMyStations() {
  return api('/fro/my-stations', { _prefix: 'ucs' })
}

export async function searchDonorsByMobile(q) {
  return api(`/fro/search-donors?q=${encodeURIComponent(q)}`, { _prefix: 'ucs' })
}

export async function searchSuspenseDonors(q) {
  return api(`/fro/suspense/donor-search?q=${encodeURIComponent(q)}`, { _prefix: 'ucs' })
}

export async function getFullDonorHistory(donorId, ngoId, unlockAll) {
  const params = new URLSearchParams();
  if (ngoId) params.set('ngo_id', ngoId);
  if (unlockAll) params.set('unlock_all', 'true');
  return api(`/fro/donors/${donorId}/full-history?${params}`, { _prefix: 'ucs' })
}

export async function getDonorReceipts(donorId, ngoId) {
  const params = ngoId ? `?ngo_id=${ngoId}` : ''
  return api(`/fro/donors/${donorId}/receipts${params}`, { _prefix: 'ucs' })
}

export async function getReactivatedDonors(period) {
  return api(`/fro/reactivated-donors?period=${period || 'today'}`, { _prefix: 'ucs' })
}

import { apiGet, apiPost } from './auth'

export function getReceipt(logId) {
  return apiGet(`/accounts/leads/${logId}/receipt`)
}

export function generateReceipt(logId, data = {}) {
  return apiPost(`/accounts/leads/${logId}/receipt`, data)
}

export function listReceipts() {
  return apiGet('/accounts/receipts')
}

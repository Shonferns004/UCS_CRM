import { api } from '../../../api/auth';

function call(path, method, body) {
  return api(path, {
    _prefix: 'ucs',
    ...(method ? { method } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function fetchSimCards() {
  return call('/sim-cards', 'GET');
}

export async function addSimCard(payload) {
  return call('/sim-cards', 'POST', payload);
}

export async function updateSimCard(id, payload) {
  return call(`/sim-cards/${id}`, 'PUT', payload);
}

export async function deleteSimCard(id) {
  return call(`/sim-cards/${id}`, 'DELETE');
}

export async function replaceSimCard(id, payload) {
  return call(`/sim-cards/${id}/replace`, 'POST', payload);
}

export async function fetchReplacements() {
  return call('/sim-cards/replacements', 'GET');
}

export async function fetchSimHistory(id) {
  return call(`/sim-cards/${id}/history`, 'GET');
}

export async function importSimCards(rows) {
  return call('/sim-cards/import', 'POST', { rows });
}

export async function bulkChangeStatus(ids, status) {
  return call('/sim-cards/replacements/bulk', 'POST', { ids, status });
}

export async function bulkDelete(ids) {
  return call('/sim-cards/replacements/bulk-delete', 'POST', { ids });
}

export async function fetchInventory() {
  return call('/sim-inventory', 'GET');
}

export async function addInventoryItem(payload) {
  return call('/sim-inventory', 'POST', payload);
}

export async function updateInventoryItem(id, payload) {
  return call(`/sim-inventory/${id}`, 'PUT', payload);
}

export async function assignInventoryItem(id, payload) {
  return call(`/sim-inventory/${id}/assign`, 'POST', payload);
}

export async function updateInventoryStatus(id, status) {
  return call(`/sim-inventory/${id}/status`, 'POST', { status });
}

export async function deleteInventoryItem(id) {
  return call(`/sim-inventory/${id}`, 'DELETE');
}

export async function importInventoryItems(rows) {
  return call('/sim-inventory/import', 'POST', { rows });
}

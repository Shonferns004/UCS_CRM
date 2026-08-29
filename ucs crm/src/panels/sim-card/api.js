import { api } from '../../api/auth';

export async function fetchSimCards() {
  return api('/sim-cards', { _prefix: 'ucs', method: 'GET' });
}

export async function addSimCard(payload) {
  return api('/sim-cards', { _prefix: 'ucs', method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSimCard(id, payload) {
  return api(`/sim-cards/${id}`, { _prefix: 'ucs', method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteSimCard(id) {
  return api(`/sim-cards/${id}`, { _prefix: 'ucs', method: 'DELETE' });
}

export async function replaceSimCard(id, payload) {
  return api(`/sim-cards/${id}/replace`, { _prefix: 'ucs', method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchReplacements() {
  return api('/sim-cards/replacements', { _prefix: 'ucs', method: 'GET' });
}

export async function importSimCards(rows) {
  return api('/sim-cards/import', { _prefix: 'ucs', method: 'POST', body: JSON.stringify({ rows }) });
}

export async function bulkChangeStatus(ids, status) {
  return api('/sim-cards/replacements/bulk', { _prefix: 'ucs', method: 'POST', body: JSON.stringify({ ids, status }) });
}

export async function bulkDelete(ids) {
  return api('/sim-cards/replacements/bulk-delete', { _prefix: 'ucs', method: 'POST', body: JSON.stringify({ ids }) });
}

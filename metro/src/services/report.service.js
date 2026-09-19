import api from './api'

export function getReport(type, params) {
  return api.get(`/reports/${type}`, { params }).then(r => r.data.data)
}

export function exportUrl(type, params, format = 'csv') {
  return `/api/reports/export/${type}?format=${format}&${new URLSearchParams(params)}`
}

function extractFilename(response, fallback) {
  if (!response?.headers) return fallback;
  const cd = response.headers['content-disposition'] || '';
  const m = /filename="?([^";]+)"?/.exec(cd);
  return m ? m[1] : fallback;
}

export async function downloadExport(type, params, format = 'pdf') {
  const response = await api.get(`/reports/export/${type}`, {
    params: { ...params, format },
    responseType: 'blob',
  });

  const ext = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
  const fallback = `report-${type}-${Date.now()}.${ext}`;
  const filename = extractFilename(response, fallback);

  if (response.data && response.data.type === 'application/json') {
    const text = await response.data.text();
    let message = 'Export failed';
    try {
      const parsed = JSON.parse(text);
      message = parsed?.message || message;
    } catch (e) { /* ignore */ }
    throw new Error(message);
  }

  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

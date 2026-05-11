const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function scanCard(cardNumber) {
  return request('/scan', {
    method: 'POST',
    body: JSON.stringify({ cardNumber }),
  });
}

export function getEmployees() {
  return request('/employees');
}

export function upsertEmployee(employee) {
  return request('/employees', {
    method: 'POST',
    body: JSON.stringify(employee),
  });
}

export function bulkImportEmployees(employees) {
  return request('/employees/bulk', {
    method: 'POST',
    body: JSON.stringify({ employees }),
  });
}

export function getTodayScans() {
  return request('/scans/today');
}

export function getRecentScans(limit = 20) {
  return request(`/scans/recent?limit=${limit}`);
}

export function clearCache() {
  return request('/cache/clear', { method: 'POST' });
}

export function getHealth() {
  return request('/health');
}

export function pdkSync() {
  return request('/pdk/sync', { method: 'POST' });
}

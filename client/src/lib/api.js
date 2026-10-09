const DEFAULT_TIMEOUT_MS = 10000;

export async function apiFetch(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `API ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet    = (path)                    => apiFetch(path);
export const apiPut    = (path, body, timeoutMs)   => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }, timeoutMs);
export const apiPost   = (path, body)              => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) });
export const apiPatch  = (path, body, timeoutMs)   => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(body) }, timeoutMs);
export const apiDelete = (path)                    => apiFetch(path, { method: 'DELETE' });

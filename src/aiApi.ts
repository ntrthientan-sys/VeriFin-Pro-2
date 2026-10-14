const PREFIX = 'verifin_gemini_key:';
function storageKey() {
  let id = 'guest';
  try { id = JSON.parse(localStorage.getItem('applet_auth_user') || '{}').id || id; } catch {}
  return PREFIX + id;
}
export function getPersonalApiKey(): string {
  try { return sessionStorage.getItem(storageKey()) || ''; } catch { return ''; }
}
export function savePersonalApiKey(key: string) {
  const value = key.trim();
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(value)) throw new Error('API key không đúng định dạng.');
  sessionStorage.setItem(storageKey(), value);
}
export function clearPersonalApiKey() { sessionStorage.removeItem(storageKey()); }
export function aiFetch(path: string, init: RequestInit = {}) {
  if (!['/api/ai/extract-batch', '/api/bank/cic-bctc-extract', '/api/bank/collateral-ltv', '/api/chat/message'].includes(path)) {
    throw new Error('Đường dẫn AI không được hỗ trợ.');
  }
  const headers = new Headers(init.headers);
  const key = getPersonalApiKey();
  if (key) headers.set('X-Gemini-API-Key', key);
  return fetch(path, { ...init, headers });
}

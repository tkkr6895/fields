/**
 * Runtime configuration stored on-device so the Android APK can be pointed
 * at live proxies/API keys without rebuilding.
 */

const KEYS = {
  corestackApiKey: 'fields_corestack_api_key',
  geeProxyUrl: 'fields_gee_proxy_url',
  tesseraProxyUrl: 'fields_tessera_proxy_url',
} as const;

function readLs(key: string): string {
  try {
    return (localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writeLs(key: string, value: string): void {
  try {
    const v = value.trim();
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

function abs(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url.replace(/\/$/, '');
  if (typeof window === 'undefined') return url;
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`.replace(/\/$/, '');
}

export function getCoreStackApiKey(): string {
  return readLs(KEYS.corestackApiKey) || (import.meta.env.VITE_CORESTACK_API_KEY || '').trim();
}

export function setCoreStackApiKey(value: string): void {
  writeLs(KEYS.corestackApiKey, value);
}

export function getGeeProxyUrl(): string | null {
  const stored = readLs(KEYS.geeProxyUrl);
  const env = (import.meta.env.VITE_DW_GEE_PROXY_URL || '').trim();
  const raw = stored || env || (import.meta.env.DEV ? '/api/dw' : '');
  return raw ? abs(raw) : null;
}

export function setGeeProxyUrl(value: string): void {
  writeLs(KEYS.geeProxyUrl, value);
}

export function getTesseraProxyUrl(): string | null {
  const stored = readLs(KEYS.tesseraProxyUrl);
  const env = (import.meta.env.VITE_TESSERA_PROXY_URL || '').trim();
  const raw = stored || env || (import.meta.env.DEV ? '/api/tessera' : '');
  return raw ? abs(raw) : null;
}

export function setTesseraProxyUrl(value: string): void {
  writeLs(KEYS.tesseraProxyUrl, value);
}

export function getCoreStackApiBase(): string {
  if (import.meta.env.DEV) return '/api/corestack';
  return 'https://api-doc.core-stack.org/api/v1';
}

// In-memory bearer token (never stored in localStorage/sessionStorage)
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  if (options.body && !headers.has('Content-Type') && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let errMessage = `Request failed (${res.status})`;
    if (contentType.includes('application/json')) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      if (errData.error) errMessage = errData.error;
    }
    throw new Error(errMessage);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function fetchAuthorizedBlobUrl(url: string): Promise<string> {
  const headers = new Headers();
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error('Failed to load protected media.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// Offline Emergency Vault (non-sensitive contact & helpline snapshot only)
const OFFLINE_VAULT_KEY = 'safeher_offline_emergency_cache_v1';

export interface OfflineVaultSnapshot {
  updatedAt: string;
  userName: string;
  emergencyMessage: string;
  contacts: Array<{ name: string; phone: string; relationship: string }>;
  lastLocation: { lat: number; lng: number; label: string } | null;
}

export function saveOfflineVault(snapshot: OfflineVaultSnapshot): void {
  try {
    localStorage.setItem(OFFLINE_VAULT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota limits
  }
}

export function loadOfflineVault(): OfflineVaultSnapshot | null {
  try {
    const raw = localStorage.getItem(OFFLINE_VAULT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OfflineVaultSnapshot;
  } catch {
    return null;
  }
}

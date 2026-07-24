const COSMO_USERNAME_STORAGE_KEYS = [
  "cosmousername",
  "cosmoUsername",
  "progress-last-nickname",
] as const;
const COSMO_ADDRESS_STORAGE_KEY = "progress-last-address";

export function readStoredCosmoUsername(): string | null {
  if (typeof window === "undefined") return null;

  for (const key of COSMO_USERNAME_STORAGE_KEYS) {
    const value = localStorage.getItem(key)?.trim();
    if (value) return value;
  }

  return null;
}

export function readStoredCosmoAddress(): string | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(COSMO_ADDRESS_STORAGE_KEY)?.trim();
  return value && /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
}

export function storeCosmoUsername(value: string, address?: string): void {
  if (typeof window === "undefined") return;

  const trimmed = value.trim();
  if (!trimmed) return;

  for (const key of COSMO_USERNAME_STORAGE_KEYS) {
    localStorage.setItem(key, trimmed);
  }
  if (address && /^0x[0-9a-f]{40}$/i.test(address)) {
    localStorage.setItem(COSMO_ADDRESS_STORAGE_KEY, address.toLowerCase());
  }
}

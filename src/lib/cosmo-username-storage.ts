const COSMO_USERNAME_STORAGE_KEYS = [
  "cosmousername",
  "cosmoUsername",
  "progress-last-nickname",
] as const;

export function readStoredCosmoUsername(): string | null {
  if (typeof window === "undefined") return null;

  for (const key of COSMO_USERNAME_STORAGE_KEYS) {
    const value = localStorage.getItem(key)?.trim();
    if (value) return value;
  }

  return null;
}

export function storeCosmoUsername(value: string): void {
  if (typeof window === "undefined") return;

  const trimmed = value.trim();
  if (!trimmed) return;

  for (const key of COSMO_USERNAME_STORAGE_KEYS) {
    localStorage.setItem(key, trimmed);
  }
}

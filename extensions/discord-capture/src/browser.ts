/** Firefox's browser namespace provides the Promise APIs used by both builds. */
export const extensionApi =
  (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ??
  chrome;

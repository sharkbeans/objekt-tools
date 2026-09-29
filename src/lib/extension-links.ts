/**
 * Store listings for the Objekt Match browser extension. `null` means the
 * listing isn't live yet — the /extension page renders a disabled
 * "Coming soon" button for it. Fill these in once each store approves.
 */
export const EXTENSION_STORE_URLS: {
  chrome: string | null;
  firefox: string | null;
} = {
  chrome:
    "https://chromewebstore.google.com/detail/objekt-match/mikcpcdfhmgfmhalkianjbbagbpjjfik",
  firefox: null,
};

export type ExtensionStore = keyof typeof EXTENSION_STORE_URLS;

/** How each store is named on a button. */
export const EXTENSION_STORE_NAMES: Record<ExtensionStore, string> = {
  chrome: "Chrome",
  firefox: "Firefox",
};

/**
 * The store this desktop browser installs extensions from, whether or not the
 * listing is live yet.
 *
 * Chromium desktop browsers (Chrome, Edge, Brave, Opera) all install from the
 * Chrome Web Store. Phones and other desktops (Safari) get nothing: Discord's
 * mobile app can't run extensions, so offering one there is noise.
 * Client-only — reads `navigator`.
 */
export function browserStore(): ExtensionStore | null {
  if (typeof navigator === "undefined" || isPhoneBrowser()) return null;
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  return null;
}

/**
 * Where the extension can be installed from in this browser right now, if
 * anywhere: `browserStore` narrowed to a listing that is live.
 */
export function extensionStoreForBrowser(): {
  store: ExtensionStore;
  url: string;
} | null {
  const store = browserStore();
  const url = store && EXTENSION_STORE_URLS[store];
  return store && url ? { store, url } : null;
}

/**
 * A phone or tablet browser: no extensions, and no practical way to copy a
 * whole Discord channel. Client-only — reads `navigator`.
 */
export function isPhoneBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

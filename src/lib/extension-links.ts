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

/**
 * Where the extension can be installed from in this browser, if anywhere.
 *
 * Chromium desktop browsers (Chrome, Edge, Brave, Opera) all install from the
 * Chrome Web Store. Firefox gets its own listing later. Phones get nothing:
 * Discord's mobile app can't run extensions, so offering one there is noise.
 * Client-only — reads `navigator`.
 */
export function extensionStoreForBrowser(): {
  store: "chrome" | "firefox";
  url: string;
} | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return null;
  if (/Firefox\//.test(ua))
    return EXTENSION_STORE_URLS.firefox
      ? { store: "firefox", url: EXTENSION_STORE_URLS.firefox }
      : null;
  if (/Chrome\//.test(ua) && EXTENSION_STORE_URLS.chrome)
    return { store: "chrome", url: EXTENSION_STORE_URLS.chrome };
  return null;
}

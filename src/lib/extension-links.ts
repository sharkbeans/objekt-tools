/**
 * Store listings for the Objekt Match browser extension. `null` means the
 * listing isn't live yet — the /extension page renders a disabled
 * "Coming soon" button for it. Fill these in once each store approves.
 */
export const EXTENSION_STORE_URLS: {
  chrome: string | null;
  firefox: string | null;
} = {
  chrome: null,
  firefox: null,
};

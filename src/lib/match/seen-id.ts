// Identifiers for triage state on the match desk: posts the user has already
// dealt with, and traders they have muted.
//
// Hashes only, never content. `/match` reads other people's messages out of the
// user's own clipboard; persisting those server-side would make objekt.my a
// mirror of a channel it has no business republishing (see
// docs/plans/035-discord-paste-match.md, "Hard constraints"). A digest is
// enough to recognise a post already seen, and does not reverse into it.
//
// SHA-256 rather than the in-browser `messageKey`: that one is a 32-bit FNV-1a
// whose own docstring says to swap for SHA-256 if the keys ever leave the
// browser. These leave the browser.

export type SeenKind = "post" | "author";

/** `${kind}:${hex sha256}` — one opaque id for the local and remote stores. */
export type SeenId = string;

const KINDS: readonly SeenKind[] = ["post", "author"];
const HEX_SHA256 = /^[0-9a-f]{64}$/;

// Matches `messageKey`'s normalisation exactly, so the two agree on what counts
// as the same post.
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

async function sha256Hex(input: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Id for one triaged post. Null where WebCrypto is unavailable. */
export async function postSeenId(
  author: string,
  body: string,
): Promise<SeenId | null> {
  const hash = await sha256Hex(`${normalise(author)} ${normalise(body)}`);
  return hash && `post:${hash}`;
}

/** Id for a muted trader. Null where WebCrypto is unavailable. */
export async function authorSeenId(author: string): Promise<SeenId | null> {
  const hash = await sha256Hex(normalise(author));
  return hash && `author:${hash}`;
}

/** Split an id back into its parts, rejecting anything we did not write. */
export function parseSeenId(
  id: unknown,
): { kind: SeenKind; hash: string } | null {
  if (typeof id !== "string") return null;
  const separator = id.indexOf(":");
  if (separator === -1) return null;
  const kind = id.slice(0, separator);
  const hash = id.slice(separator + 1);
  if (!KINDS.some((candidate) => candidate === kind)) return null;
  if (!HEX_SHA256.test(hash)) return null;
  return { kind: kind === "author" ? "author" : "post", hash };
}

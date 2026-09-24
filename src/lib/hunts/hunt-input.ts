// Validation for a saved hunt arriving at PUT /api/hunts. No Zod in this repo
// (see CLAUDE.md), so the shape is checked by hand here, kept pure so it can
// be tested without a request or a database.

import type { Edition } from "@/lib/edition";

/** A user keeps at most this many saved hunts. */
export const MAX_HUNTS_PER_USER = 20;
/** More ids than any season has FCOs; a bound, not a product limit. */
export const MAX_HUNT_IDS = 60;

export interface HuntInput {
  nickname: string;
  member: string;
  season: string;
  edition: Edition;
  mode: "wtb" | "wtt";
  skipped: string[];
  offers: string[];
}

const NICKNAME = /^\S{1,30}$/;
const MEMBER = /^[\p{L}\p{N} .'-]{1,32}$/u;
const SEASON = /^[A-Za-z]{1,16}\d{1,4}$/;
const COLLECTION_ID = /^[\w.:-]{1,128}$/;

function ids(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HUNT_IDS) return null;
  const out = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !COLLECTION_ID.test(id)) return null;
    out.add(id);
  }
  return [...out];
}

/** The hunt in `body`, or a message saying what is wrong with it. */
export function readHuntInput(body: unknown): HuntInput | string {
  if (typeof body !== "object" || body === null) return "Body must be a hunt";
  const b = body as Record<string, unknown>;
  const nickname = typeof b.nickname === "string" ? b.nickname.trim() : "";
  if (!NICKNAME.test(nickname)) return "nickname is required";
  if (typeof b.member !== "string" || !MEMBER.test(b.member))
    return "member is required";
  if (typeof b.season !== "string" || !SEASON.test(b.season))
    return "season is required";
  if (b.edition !== 1 && b.edition !== 2 && b.edition !== 3)
    return "edition must be 1, 2 or 3";
  if (b.mode !== "wtb" && b.mode !== "wtt")
    return 'mode must be "wtb" or "wtt"';
  const skipped = ids(b.skipped);
  const offers = ids(b.offers);
  if (!skipped || !offers)
    return `skipped and offers must be collection id lists of at most ${MAX_HUNT_IDS}`;
  return {
    nickname,
    member: b.member,
    season: b.season,
    edition: b.edition,
    mode: b.mode,
    skipped,
    // Buy never offers anything; don't keep offers it would ignore.
    offers: b.mode === "wtt" ? offers : [],
  };
}

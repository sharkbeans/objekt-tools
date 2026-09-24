import { formatShortLabel, type ObjektLabelItem } from "@/lib/objekt-label";

/**
 * The link contract between "what am I missing" (a grid) and "who on Discord
 * has it" (/match). A hunt is a one-shot search handed over in the URL: /match
 * applies it once, then strips it, so a reload never overwrites the user's own
 * edits. Kept pure so the grid dialog, /match and the extension handoff
 * (plan 038) can all build or read the same shape.
 */

export type HuntMode = "wtb" | "wtt";

export interface HuntParams {
  mode: HuntMode;
  /** "SeoYeon CC101"-style labels, one objekt each. */
  wants: string[];
  /** Same format as `wants`; always empty in wtb. */
  offers: string[];
  /** Cosmo nickname whose inventory /match should load; "" when unknown. */
  nickname: string;
}

/** Mirrors the capture extension's 40-codes-per-run cap. */
export const MAX_HUNT_ITEMS = 40;
export const MAX_HUNT_LABEL_CHARS = 64;
const MAX_NICKNAME_CHARS = 64;

export const HUNT_PARAM_KEYS = ["hunt", "mode", "want", "offer", "nick"];

/**
 * Label an objekt the way /match's search box parses it ("SeoYeon CC101").
 * Delegates to the shared short-label formatter so the grid, the desk cards
 * and this URL all spell an objekt the same way.
 */
export function huntLabel(item: ObjektLabelItem): string {
  return formatShortLabel(item);
}

function cleanList(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (out.length >= MAX_HUNT_ITEMS) break;
    const label = value.trim().replace(/\s+/g, " ");
    if (!label || label.length > MAX_HUNT_LABEL_CHARS) continue;
    out.push(label);
  }
  return out;
}

function cleanNickname(value: string | null | undefined): string {
  const nick = (value ?? "").trim();
  return nick.length > MAX_NICKNAME_CHARS ? "" : nick;
}

function readMode(value: string | null): HuntMode {
  return value === "wtt" ? "wtt" : "wtb";
}

export function buildHuntHref(p: HuntParams): string {
  const params = new URLSearchParams();
  params.set("hunt", "1");
  params.set("mode", p.mode);
  for (const want of cleanList(p.wants)) params.append("want", want);
  if (p.mode === "wtt")
    for (const offer of cleanList(p.offers)) params.append("offer", offer);
  const nick = cleanNickname(p.nickname);
  if (nick) params.set("nick", nick);
  return `/match?${params.toString()}`;
}

export function readHuntParams(search: URLSearchParams): HuntParams | null {
  if (search.get("hunt") !== "1") return null;
  const mode = readMode(search.get("mode"));
  return {
    mode,
    wants: cleanList(search.getAll("want")),
    offers: mode === "wtt" ? cleanList(search.getAll("offer")) : [],
    nickname: cleanNickname(search.get("nick")),
  };
}

/** The same URL minus the hunt params, for `history.replaceState`. */
export function stripHuntParams(href: string): string {
  const url = new URL(href);
  for (const key of HUNT_PARAM_KEYS) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

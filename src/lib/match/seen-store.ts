// Where triage ids live: `localStorage` always, and the app DB as well once the
// user is signed in.
//
// Local-always rather than local-when-anonymous, so signing in adds
// cross-device sync without discarding what the browser already knew, and a
// dropped request never loses a hide. Remote calls are best-effort: a 401 (not
// signed in) or a network failure leaves the local set authoritative.

import { parseSeenId, type SeenId } from "./seen-id";

const LOCAL_KEY = "match:seen:v1";
const HIDE_KEY = "match:hide-seen:v1";
const API = "/api/match/seen";
// Mirrors the route's own cap.
const MAX_IDS = 500;

export function loadLocalSeen(): Set<SeenId> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((id): id is SeenId => parseSeenId(id) !== null));
  } catch {
    return new Set();
  }
}

export function saveLocalSeen(ids: ReadonlySet<SeenId>): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...ids]));
  } catch {
    /* Full or disabled store — the in-memory set still hides for this session. */
  }
}

export function loadHideSeen(): boolean {
  try {
    // Hiding is the point of triaging, so default to on.
    return localStorage.getItem(HIDE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveHideSeen(value: boolean): void {
  try {
    localStorage.setItem(HIDE_KEY, value ? "1" : "0");
  } catch {
    /* Preference is not worth failing a render over. */
  }
}

/** Everything the signed-in user has stored. Empty when anonymous or offline. */
export async function fetchRemoteSeen(): Promise<Set<SeenId>> {
  try {
    const response = await fetch(API);
    if (!response.ok) return new Set();
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("seen" in body)) {
      return new Set();
    }
    if (!Array.isArray(body.seen)) return new Set();
    return new Set(
      body.seen.filter((id): id is SeenId => parseSeenId(id) !== null),
    );
  } catch {
    return new Set();
  }
}

async function send(method: "POST" | "DELETE", body: unknown): Promise<void> {
  try {
    await fetch(API, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* Local set already updated; the next sign-in sync will catch up. */
  }
}

export async function pushRemoteSeen(ids: readonly SeenId[]): Promise<void> {
  for (let i = 0; i < ids.length; i += MAX_IDS) {
    await send("POST", { ids: ids.slice(i, i + MAX_IDS) });
  }
}

export async function dropRemoteSeen(ids: readonly SeenId[]): Promise<void> {
  for (let i = 0; i < ids.length; i += MAX_IDS) {
    await send("DELETE", { ids: ids.slice(i, i + MAX_IDS) });
  }
}

export async function clearRemoteSeen(): Promise<void> {
  await send("DELETE", { all: true });
}

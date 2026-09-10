/**
 * Which Discord tab the UI is acting on.
 *
 * "The active tab" was fine while the UI was a toolbar popup, because opening
 * one meant the Discord tab was the active tab by definition. It stops being
 * true the moment the panel can live somewhere else: a pop-out window makes
 * *itself* the active tab of its own window, and an embedded panel keeps
 * running while the user reads something in another tab. Both cases used to
 * end in "Open the Discord tab with your trade channel first" while the tab
 * was open the whole time.
 */
import { isDiscordUrl } from "./settings";

export const DISCORD_MATCHES = [
  "https://discord.com/*",
  "https://canary.discord.com/*",
  "https://ptb.discord.com/*",
];

/** The little of `tabs.Tab` this needs, so tests can hand over plain objects. */
export interface TabLike {
  id?: number;
  url?: string;
  active?: boolean;
  windowId?: number;
  lastAccessed?: number;
}

export interface TabSource {
  /** The tab the panel is embedded in, when it is embedded in one. */
  get: (id: number) => Promise<TabLike | undefined>;
  /** Every Discord tab open in the browser. */
  query: () => Promise<TabLike[]>;
}

/**
 * Rank the candidates the way a person would point at one.
 *
 * Most recently touched first, because that is the tab they were just looking
 * at; `lastAccessed` is missing on older builds, where an active tab is the
 * best available stand-in.
 */
export function pickTab(tabs: readonly TabLike[]): TabLike | null {
  const usable = tabs.filter(
    (tab) => typeof tab.id === "number" && isDiscordUrl(tab.url),
  );
  if (!usable.length) return null;
  return [...usable].sort((a, b) => {
    const accessed = (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    if (accessed !== 0) return accessed;
    return Number(b.active ?? false) - Number(a.active ?? false);
  })[0];
}

export class NoDiscordTab extends Error {
  constructor() {
    super("Open Discord in a tab first, then try again.");
    this.name = "NoDiscordTab";
  }
}

/**
 * Resolve the tab to act on: the panel's own tab when it has one, otherwise
 * the Discord tab the user most recently used.
 *
 * A pinned tab that has been closed, or navigated off Discord, falls back to
 * the search rather than failing — the panel outlives the tab it was opened
 * against.
 */
export async function resolveTab(
  source: TabSource,
  pinned: number | null,
): Promise<{ id: number; url: string }> {
  if (pinned !== null) {
    const tab = await source.get(pinned).catch(() => undefined);
    if (tab && typeof tab.id === "number" && isDiscordUrl(tab.url))
      return { id: tab.id, url: tab.url as string };
  }
  const found = pickTab(await source.query());
  if (!found || typeof found.id !== "number") throw new NoDiscordTab();
  return { id: found.id, url: found.url as string };
}

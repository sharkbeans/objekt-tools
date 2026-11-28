/**
 * The cards the home page shows on its two feature panels: one real grid
 * (eight first-class objekts and the reward special-class objekt they make)
 * and two inventories for the trade animation. Pure, so the choice can be
 * tested without a database; showcase.server.ts loads the rows.
 */

/** The artists the home page deals cards from, as the indexer spells them. */
export const SHOWCASE_ARTISTS = ["triples", "artms", "idntt"] as const;
export type ShowcaseArtist = (typeof SHOWCASE_ARTISTS)[number];

export type ShowcaseCard = {
  id: string;
  artist: string;
  season: string;
  member: string;
  collectionNo: string;
  class: string;
  image: string;
};

export type Showcase = {
  grid: {
    season: string;
    member: string;
    /** The eight FCOs in grid-slot order (101Z first). */
    firsts: ShowcaseCard[];
    /** The edition's reward SCOs (201Z, 202Z); the board shows the first. */
    rewards: ShowcaseCard[];
  };
  /** The match panel's two sides, in table order (4 across, 3 down). */
  mine: ShowcaseCard[];
  theirs: ShowcaseCard[];
};

export type ShowcaseRow = {
  id: string;
  artist: string;
  season: string;
  member: string;
  collectionNo: string;
  class: string;
  thumbnailImage: string;
  createdAt: Date;
};

// Edition 1: FCOs 101-108 grid into one of the two 201/202 SCOs. Only the
// online (Z) prints grid.
export const SHOWCASE_FIRSTS = [
  "101Z",
  "102Z",
  "103Z",
  "104Z",
  "105Z",
  "106Z",
  "107Z",
  "108Z",
] as const;
export const SHOWCASE_REWARDS = ["201Z", "202Z"] as const;

/**
 * The classes whose art is always a photo of the member. Doubles and units
 * are left out: they are where the artwork-only cards are (tripleS's LOVE
 * POP and treble-clef doubles, ARTMS's item doubles, a cake on a unit).
 * idntt has no First class; Basic is its equivalent.
 */
export const PERSON_CLASSES: Record<ShowcaseArtist, readonly string[]> = {
  triples: ["First", "Special", "Premier"],
  artms: ["First", "Special", "Premier"],
  idntt: ["Basic", "Special"],
};

/** Every class the showcase loads, across artists. */
export const SHOWCASE_CLASSES = [
  ...new Set(Object.values(PERSON_CLASSES).flat()),
];

/**
 * One side of the trade, as the table shows it (four across, three down):
 * six tripleS cards, three ARTMS and three idntt, mixed so no artist or
 * class bunches up in a corner.
 */
export const HAND_LAYOUT: readonly [ShowcaseArtist, string][] = [
  ["triples", "First"],
  ["artms", "First"],
  ["idntt", "Basic"],
  ["triples", "Special"],
  ["artms", "Special"],
  ["triples", "First"],
  ["triples", "Premier"],
  ["idntt", "Basic"],
  ["triples", "First"],
  ["idntt", "Special"],
  ["artms", "First"],
  ["triples", "Special"],
];

function toCard(row: ShowcaseRow): ShowcaseCard {
  return {
    id: row.id,
    artist: row.artist,
    season: row.season,
    member: row.member,
    collectionNo: row.collectionNo,
    class: row.class,
    image: row.thumbnailImage,
  };
}

function bySeasonRecency(rows: readonly ShowcaseRow[]) {
  const seasons = new Map<string, { latest: number; rows: ShowcaseRow[] }>();
  for (const row of rows) {
    const entry = seasons.get(row.season) ?? { latest: 0, rows: [] };
    entry.latest = Math.max(entry.latest, row.createdAt.getTime());
    entry.rows.push(row);
    seasons.set(row.season, entry);
  }
  return [...seasons.entries()].sort((a, b) => b[1].latest - a[1].latest);
}

/**
 * Deals the two sides of the trade from each artist's newest few seasons:
 * each side follows HAND_LAYOUT, takes each artist's seasons in turn so
 * that artist's cards come from different seasons, and never repeats a
 * member. The grid's member is left out, so the two panels show different
 * people. A slot whose artist has nothing to deal falls back to that
 * artist's other person classes, then to tripleS, so a side stays whole.
 */
export function pickHands(
  rows: readonly ShowcaseRow[],
  exclude: string,
  day: number,
): { mine: ShowcaseCard[]; theirs: ShowcaseCard[] } {
  const seasons = new Map<string, string[]>();
  const pools = new Map<string, ShowcaseRow[]>();
  for (const artist of SHOWCASE_ARTISTS) {
    const own = rows.filter((row) => row.artist === artist);
    seasons.set(
      artist,
      bySeasonRecency(own).map(([season]) => season),
    );
    for (const row of own) {
      if (row.member === exclude) continue;
      if (!PERSON_CLASSES[artist].includes(row.class)) continue;
      const key = `${artist}|${row.season}|${row.class}`;
      const pool = pools.get(key) ?? [];
      pool.push(row);
      pools.set(key, pool);
    }
  }
  for (const pool of pools.values()) {
    pool.sort(
      (a, b) =>
        a.member.localeCompare(b.member) ||
        a.collectionNo.localeCompare(b.collectionNo) ||
        a.id.localeCompare(b.id),
    );
  }

  const taken = new Set<string>();
  const deal = (side: number) => {
    const members = new Set<string>();
    const hand: ShowcaseCard[] = [];
    // How many slots each artist has had so far on this side.
    const turns = new Map<ShowcaseArtist, number>();
    // One card of this artist and class, or null when none is left. `turn`
    // is how many of this slot's artist came before it on this side.
    const draw = (
      artist: ShowcaseArtist,
      cls: string,
      slot: number,
      turn: number,
    ) => {
      const own = seasons.get(artist) ?? [];
      for (let s = 0; s < own.length; s++) {
        // Seasons in turn, starting from a different one on each side.
        const season = own[(turn + side + s) % own.length];
        const pool = pools.get(`${artist}|${season}|${cls}`) ?? [];
        if (pool.length === 0) continue;
        // A stable spot in the pool that moves each day.
        const start = Math.abs(day * 31 + side * 17 + slot * 7) % pool.length;
        for (let k = 0; k < pool.length; k++) {
          const row = pool[(start + k) % pool.length];
          if (taken.has(row.id) || members.has(row.member)) continue;
          return row;
        }
      }
      return null;
    };
    HAND_LAYOUT.forEach(([artist, cls], slot) => {
      const turn = turns.get(artist) ?? 0;
      turns.set(artist, turn + 1);
      const tries: [ShowcaseArtist, string][] = [
        [artist, cls],
        ...PERSON_CLASSES[artist]
          .filter((c) => c !== cls)
          .map((c): [ShowcaseArtist, string] => [artist, c]),
        ...PERSON_CLASSES.triples.map((c): [ShowcaseArtist, string] => [
          "triples",
          c,
        ]),
      ];
      for (const [a, c] of tries) {
        const row = draw(a, c, slot, turn);
        if (!row) continue;
        taken.add(row.id);
        members.add(row.member);
        hand.push(toCard(row));
        return;
      }
    });
    return hand;
  };
  return { mine: deal(0), theirs: deal(1) };
}

/** The member whose grid the home page shows when she has a whole one. */
export const SHOWCASE_MEMBER = "SeoYeon";

/**
 * Picks the grid to show: `preferred`'s from the newest season where she
 * has a whole edition-1 grid. Failing that, the newest season with at least
 * `minComplete` whole grids, and one of those members by `day`, so it
 * changes daily but not within a day.
 */
export function pickShowcase(
  rows: readonly ShowcaseRow[],
  day: number,
  minComplete = 4,
  preferred: string | null = SHOWCASE_MEMBER,
): Showcase | null {
  // The grid is always a tripleS one; the hands mix every artist.
  const seasons = bySeasonRecency(rows.filter((r) => r.artist === "triples"));
  if (preferred) {
    for (const [season, { rows: seasonRows }] of seasons) {
      const pick = pickGrid(seasonRows, season, day, 1, preferred);
      if (pick) return pick(rows);
    }
  }
  for (const [season, { rows: seasonRows }] of seasons) {
    const pick = pickGrid(seasonRows, season, day, minComplete, null);
    if (pick) return pick(rows);
  }
  return null;
}

/**
 * One season's grid, if it has at least `minComplete` whole grids (and
 * `only`'s is one of them, when given). Returns a function that builds the
 * showcase, dealing the trade's hands from all of `rows`.
 */
function pickGrid(
  seasonRows: readonly ShowcaseRow[],
  season: string,
  day: number,
  minComplete: number,
  only: string | null,
): ((rows: readonly ShowcaseRow[]) => Showcase) | null {
  const byMember = new Map<string, Map<string, ShowcaseRow>>();
  for (const row of seasonRows) {
    const wanted =
      (row.class === "First" &&
        (SHOWCASE_FIRSTS as readonly string[]).includes(row.collectionNo)) ||
      (row.class === "Special" &&
        (SHOWCASE_REWARDS as readonly string[]).includes(row.collectionNo));
    if (!wanted) continue;
    const slots = byMember.get(row.member) ?? new Map<string, ShowcaseRow>();
    if (!slots.has(row.collectionNo)) slots.set(row.collectionNo, row);
    byMember.set(row.member, slots);
  }

  const complete = [...byMember.entries()]
    .filter(([, slots]) =>
      [...SHOWCASE_FIRSTS, ...SHOWCASE_REWARDS].every((no) => slots.has(no)),
    )
    .map(([member]) => member)
    .sort((a, b) => a.localeCompare(b));
  if (complete.length < minComplete) return null;
  if (only && !complete.includes(only)) return null;

  const member = only ?? complete[Math.abs(day) % complete.length];
  const slots = byMember.get(member);
  if (!slots) return null;
  const pick = (no: string) => {
    const row = slots.get(no);
    if (!row) throw new Error(`missing ${member} ${no}`);
    return toCard(row);
  };

  const grid = {
    season,
    member,
    firsts: SHOWCASE_FIRSTS.map(pick),
    rewards: SHOWCASE_REWARDS.map(pick),
  };
  return (rows) => ({ grid, ...pickHands(rows, member, day) });
}

/** Whole days since the epoch, in Seoul time, where Cosmo's days turn over. */
export function showcaseDay(now = Date.now()): number {
  return Math.floor((now + 9 * 3_600_000) / 86_400_000);
}

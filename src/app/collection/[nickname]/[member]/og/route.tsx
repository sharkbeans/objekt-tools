import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { resolveMemberCasing, seasonArtistMap } from "@/lib/filters";
import {
  CosmoUnavailableError,
  loadMemberProgress,
} from "@/lib/progress/member-progress";

// ARTMS/tripleS-style seasons repeat a family name across numbered
// generations (Atom01, Atom02, ...). The wall lays these out as a grid —
// family across columns, generation down rows — instead of a single
// chronological run, so e.g. Atom01..Ever01 (the "01" wave) and
// Atom02..Ever02 (the "02" wave) each read as their own row. Fixed at 5
// columns / 2 rows for now, matching the five known ARTMS/tripleS families
// and the two generations released so far; idntt-style seasons (no
// family+number pattern) just fall into their own single-column family.
const SEASON_COLS = 5;
const SEASON_ROWS = 2;

export const runtime = "nodejs";

// Flat white in place of a per-collection accent color — the accent used to
// come from whichever owned collection happened to be picked first, which
// just meant "always this member's earliest season color" and didn't carry
// any real meaning.
const ACCENT = "#ffffff";

const DARK = {
  bg: "#0f0f14",
  fg: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  sectionBg: "#18181b",
};

function readFont(filename: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", filename));
}

/**
 * Fetch, decode, and re-encode a thumbnail as a PNG data URI at card size.
 * Satori can't decode webp (some cosmo.fans thumbnails are served that way,
 * mislabeled as application/octet-stream), so every image is normalized
 * through sharp before being handed to ImageResponse. Failures resolve to
 * null so a single bad thumbnail can't break the whole embed.
 */
async function loadThumbnail(
  url: string,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buf)
      .resize(width, height, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

// "Atom01" -> { family: "Atom", gen: 1 }. Seasons that don't match the
// family+number pattern (idntt's "Spring25" etc.) become their own
// single-generation family so they still place somewhere in the grid.
function parseSeasonFamilyGen(season: string): { family: string; gen: number } {
  const match = season.match(/^([A-Za-z]+?)(\d+)$/);
  if (!match) return { family: season, gen: 1 };
  return { family: match[1], gen: Number.parseInt(match[2], 10) };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ nickname: string; member: string }> },
) {
  const { nickname, member: rawMember } = await params;
  const member = resolveMemberCasing(rawMember);

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  let progress: Awaited<ReturnType<typeof loadMemberProgress>>;
  try {
    progress = await loadMemberProgress(nickname, member);
  } catch (error) {
    if (error instanceof CosmoUnavailableError) {
      return NextResponse.json(
        { error: "Cosmo is temporarily unavailable" },
        { status: 503 },
      );
    }
    throw error;
  }
  if (!progress) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pal = DARK;
  const totalCards = progress.collections.length;
  const owned = progress.collections.filter((c) => c.ownedCount > 0);
  const ownedUnique = owned.length;
  const percent =
    totalCards > 0 ? Math.round((ownedUnique / totalCards) * 100) : 0;
  const totalOwned = owned.reduce((sum, c) => sum + c.ownedCount, 0);
  const duplicates = owned.reduce(
    (sum, c) => sum + Math.max(0, c.ownedCount - 1),
    0,
  );
  const seasonsOwned = new Set(owned.map((c) => c.season)).size;

  // One tile per season, keyed to the season's first owned card (lowest
  // collection number) — a representative look rather than another near-
  // duplicate of whichever card happens to sort first overall. `owned` is
  // already sorted chronologically by season then number (loadMemberProgress
  // sorts via compareSeasons), so grouping by first-seen season here already
  // comes out in chronological order without a second sort.
  type SeasonSummary = {
    season: string;
    owned: number;
    total: number;
    representative: (typeof owned)[number];
  };
  const seasonTotals = new Map<string, number>();
  for (const c of progress.collections) {
    seasonTotals.set(c.season, (seasonTotals.get(c.season) ?? 0) + 1);
  }
  const seasonGroups = new Map<string, typeof owned>();
  for (const c of owned) {
    const existing = seasonGroups.get(c.season);
    if (existing) existing.push(c);
    else seasonGroups.set(c.season, [c]);
  }
  const seasonSummaries: SeasonSummary[] = [...seasonGroups.entries()].map(
    ([season, items]) => {
      // Explicitly re-sort ascending by collection number so the
      // representative is always the earliest-numbered card the collector
      // owns in this season (e.g. owns 106A but not 101-105 -> show 106A),
      // rather than relying on upstream ordering to already be correct.
      const sorted = [...items].sort((a, b) =>
        a.collectionNo.localeCompare(b.collectionNo, undefined, {
          numeric: true,
        }),
      );
      return {
        season,
        owned: items.length,
        total: seasonTotals.get(season) ?? items.length,
        representative: sorted[0],
      };
    },
  );

  // Family order comes from the artist's full static season catalog
  // (seasonArtistMap covers every member, not just this one) — deriving it
  // from this member's own catalog would break when a member has zero cards
  // in a season (or the season doesn't exist for them at all, e.g. a member
  // added after a wave's debut): that family would get reordered to
  // wherever its next generation happened to appear for this member,
  // instead of staying in its true debut column.
  const artistSeasons =
    seasonArtistMap.find((entry) => entry.artistId === progress.artist)
      ?.seasons ?? [];
  const catalogFamilyOrder: string[] = [];
  const seenFamilies = new Set<string>();
  for (const season of artistSeasons) {
    const { family } = parseSeasonFamilyGen(season);
    if (!seenFamilies.has(family)) {
      seenFamilies.add(family);
      catalogFamilyOrder.push(family);
    }
  }

  const familyGenMap = new Map<string, Map<number, SeasonSummary>>();
  for (const summary of seasonSummaries) {
    const { family, gen } = parseSeasonFamilyGen(summary.season);
    let gens = familyGenMap.get(family);
    if (!gens) {
      gens = new Map();
      familyGenMap.set(family, gens);
    }
    gens.set(gen, summary);
  }

  // Each generation row is packed independently: families the collector
  // owns nothing of in that particular generation are dropped entirely
  // rather than reserved as a blank column, so row 1 and row 2 don't
  // necessarily share the same family-to-column mapping (e.g. row 1 might
  // be Atom/Cream while row 2 is Binary/Cream) — matches how an actual
  // collection wall would read for a partial collector.
  const genRows = Array.from({ length: SEASON_ROWS }, (_, i) => i + 1);
  const grid: SeasonSummary[][] = genRows.map((gen) =>
    catalogFamilyOrder
      .map((family) => familyGenMap.get(family)?.get(gen))
      .filter((summary): summary is SeasonSummary => summary !== undefined)
      .slice(0, SEASON_COLS),
  );
  const hasAnyTile = grid.some((row) => row.length > 0);

  const CARD_W = 112;
  const OBJEKT_ASPECT = 486 / 314;
  const CARD_IMG_H = Math.round(CARD_W * OBJEKT_ASPECT);
  const GAP = 16;
  const LABEL_GAP = 4;
  const LABEL_H = 18;
  const CELL_H = CARD_IMG_H + LABEL_GAP + LABEL_H;

  const OUTER_PADDING = 32;
  const OUTER_GAP = 12;
  const INNER_W = 1200 - OUTER_PADDING * 2;

  const thumbnailUrls = new Set<string>();
  for (const row of grid) {
    for (const cell of row) {
      if (cell.representative.thumbnailImage) {
        thumbnailUrls.add(cell.representative.thumbnailImage);
      }
    }
  }
  const thumbnailEntries = await Promise.all(
    [...thumbnailUrls].map(
      async (url) =>
        [url, await loadThumbnail(url, CARD_W, CARD_IMG_H)] as const,
    ),
  );
  const thumbnailMap = new Map(thumbnailEntries);

  let regularFont: Buffer;
  let boldFont: Buffer;
  let memberFont: Buffer;
  try {
    regularFont = readFont("og-regular.ttf");
    boldFont = readFont("og-bold.ttf");
    // Nimbus Sans — an open, metric-compatible Helvetica clone standing in
    // for "Helvetica Neue", which is what objekt-maker uses for the member
    // name text by default and isn't a redistributable/embeddable font file.
    memberFont = readFont("og-member.otf");
  } catch {
    return NextResponse.json({ error: "Font files missing" }, { status: 500 });
  }

  const html = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1200,
        height: 630,
        background: pal.bg,
        padding: OUTER_PADDING,
        gap: OUTER_GAP,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: INNER_W,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontFamily: "Bold",
              color: pal.fg,
            }}
          >
            @{progress.nickname}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: pal.border,
            }}
          >
            |
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              fontFamily: "Member",
              color: ACCENT,
              letterSpacing: 1.5,
            }}
          >
            {member}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 14,
            color: pal.muted,
            fontFamily: "Regular",
          }}
        >
          objekt.my
        </div>
      </div>

      {/* Progress bar + count */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: INNER_W,
        }}
      >
        <div
          style={{
            display: "flex",
            height: 16,
            width: INNER_W,
            borderRadius: 8,
            background: pal.sectionBg,
            border: `1px solid ${pal.border}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              height: "100%",
              width: `${Math.max(percent, percent > 0 ? 3 : 0)}%`,
              background: ACCENT,
              borderRadius: 8,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: INNER_W,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 15,
              fontFamily: "Regular",
              color: pal.fg,
            }}
          >
            {ownedUnique} / {totalCards} collected
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 15,
              fontFamily: "Bold",
              color: ACCENT,
            }}
          >
            {percent}%
          </div>
        </div>
      </div>

      {/* Season wall — family (column) x generation (row) grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
        {!hasAnyTile ? (
          <div
            style={{
              display: "flex",
              fontSize: 15,
              color: pal.muted,
              fontFamily: "Regular",
            }}
          >
            No {member} objekts collected yet.
          </div>
        ) : (
          grid.map((row, ri) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static OG layout
              key={ri}
              style={{ display: "flex", flexDirection: "row", gap: GAP }}
            >
              {row.map((cell, ci) => {
                const imageDataUri = cell.representative.thumbnailImage
                  ? thumbnailMap.get(cell.representative.thumbnailImage)
                  : null;
                const seasonPercent =
                  cell.total > 0
                    ? Math.round((cell.owned / cell.total) * 100)
                    : 0;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static layout for OG image
                    key={ci}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: CARD_W,
                      height: CELL_H,
                      gap: LABEL_GAP,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        width: CARD_W,
                        height: CARD_IMG_H,
                        borderRadius: 8,
                        overflow: "hidden",
                        background: pal.sectionBg,
                        border: `1px solid ${pal.border}`,
                        position: "relative",
                      }}
                    >
                      {imageDataUri ? (
                        // biome-ignore lint/performance/noImgElement: Satori requires plain <img>
                        <img
                          src={imageDataUri}
                          width={CARD_W}
                          height={CARD_IMG_H}
                          style={{ objectFit: "cover", borderRadius: 8 }}
                          alt=""
                        />
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            width: CARD_W,
                            height: CARD_IMG_H,
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            color: pal.muted,
                            fontFamily: "Regular",
                          }}
                        >
                          {cell.season}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          justifyContent: "space-between",
                          background: "rgba(0,0,0,0.6)",
                          padding: "4px 6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            fontSize: 11,
                            color: "#ffffff",
                            fontFamily: "Regular",
                          }}
                        >
                          {cell.season}
                        </div>
                        {/* Raw fractions (e.g. "12/86") are unreadable once
                      Discord shrinks the embed thumbnail — a filled bar still
                      reads as "mostly done" vs "barely started" at a glance
                      even at a fraction of this size. */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            width: 34,
                            height: 8,
                            borderRadius: 4,
                            background: "rgba(255,255,255,0.25)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              height: "100%",
                              width: `${Math.max(seasonPercent, seasonPercent > 0 ? 8 : 0)}%`,
                              background: "#ffffff",
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "baseline",
                        gap: 4,
                        height: LABEL_H,
                        fontFamily: "Regular",
                        color: pal.fg,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          fontSize: 13,
                          fontFamily: "Bold",
                          color: ACCENT,
                        }}
                      >
                        {seasonPercent}%
                      </div>
                      <div
                        style={{
                          display: "flex",
                          fontSize: 12,
                          color: pal.muted,
                        }}
                      >
                        ({cell.owned}/{cell.total})
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: 13,
          color: pal.muted,
          fontFamily: "Regular",
          width: INNER_W,
          gap: 10,
        }}
      >
        <div style={{ display: "flex" }}>{totalOwned} owned</div>
        <div style={{ display: "flex" }}>·</div>
        <div style={{ display: "flex" }}>{ownedUnique} unique</div>
        <div style={{ display: "flex" }}>·</div>
        <div style={{ display: "flex" }}>{duplicates} dupes</div>
        <div style={{ display: "flex" }}>·</div>
        <div style={{ display: "flex" }}>{seasonsOwned} seasons</div>
      </div>
    </div>
  );

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Regular", data: regularFont, weight: 400 },
      { name: "Member", data: memberFont, weight: 600 },
      { name: "Bold", data: boldFont, weight: 700 },
    ],
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}

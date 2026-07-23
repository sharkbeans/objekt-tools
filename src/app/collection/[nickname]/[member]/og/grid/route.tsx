import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  EDITION_LABELS,
  type Edition,
  getCollectionEdition,
} from "@/lib/edition";
import { compareSeasons } from "@/lib/filter-options";
import { resolveMemberCasing } from "@/lib/filters";
import { getGridSlots } from "@/lib/grid-progress";
import {
  CosmoUnavailableError,
  loadMemberProgress,
  type MemberProgressCollection,
} from "@/lib/progress/member-progress";

export const runtime = "nodejs";

const ACCENT = "#ffffff";
// Same 71.5% black overlay grid-board.tsx/dex-card.tsx use to tint unowned
// cards — kept in sync here so the OG image reads the same as the live UI.
const UNOWNED_TINT = "rgba(0,0,0,0.715)";

const DARK = {
  bg: "#0f0f14",
  fg: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  sectionBg: "#18181b",
};

const EDITIONS: Edition[] = [1, 2, 3];

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

type BoardCell =
  | { kind: "first"; collection: MemberProgressCollection }
  | { kind: "special"; collection: MemberProgressCollection }
  | null;

type Board = {
  edition: Edition;
  owned: number;
  total: number;
  // 3x3, row-major, [0][0] is top-left — mirrors grid-board.tsx's CSS grid
  // (1-indexed gridRow/gridColumn there, 0-indexed here).
  cells: BoardCell[][];
};

export async function GET(
  request: NextRequest,
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

  // `progress.collections` is already sorted (season, then collectionNo) by
  // loadMemberProgress, so seasons appear in chronological order here too —
  // the last one is the latest.
  const seasons = [...new Set(progress.collections.map((c) => c.season))].sort(
    compareSeasons,
  );
  const latestSeason = seasons[seasons.length - 1];
  // ?season=Binary01 etc. picks a specific season's grid instead of the
  // latest — case-insensitive, and falls back to latest if the requested
  // season doesn't exist for this member (typo, or a season this member
  // has no cards in at all) rather than 404ing.
  const requestedSeason = request.nextUrl.searchParams.get("season");
  const season = requestedSeason
    ? (seasons.find((s) => s.toLowerCase() === requestedSeason.toLowerCase()) ??
      latestSeason)
    : latestSeason;
  const seasonCollections = season
    ? progress.collections.filter((c) => c.season === season)
    : [];

  // Group into per-edition First/Special pools. Since seasonCollections is
  // already collectionNo-ascending (inherited from the sort above), firsts
  // and specials come out ascending too without a second sort.
  const byEdition = new Map<
    Edition,
    { firsts: MemberProgressCollection[]; specials: MemberProgressCollection[] }
  >();
  for (const c of seasonCollections) {
    const edition = getCollectionEdition({
      artist: progress.artist,
      class: c.class,
      onOffline: c.onOffline,
      collectionNo: c.collectionNo,
      season: c.season,
    });
    if (!edition) continue;
    const entry = byEdition.get(edition) ?? { firsts: [], specials: [] };
    if (c.class === "First") entry.firsts.push(c);
    else if (c.class === "Special") entry.specials.push(c);
    byEdition.set(edition, entry);
  }

  const editionsWithData = EDITIONS.filter(
    (e) => (byEdition.get(e)?.firsts.length ?? 0) > 0,
  );

  // Each edition's Special has a 2-variant reward pool (e.g. 201/202) that
  // the live grid board cycles between — a static image can't cycle, so we
  // pick one: whichever variant the collector owns, or the lower-numbered
  // (first in catalog order) variant if they own neither.
  const boards: Board[] = editionsWithData.map((edition) => {
    const entry = byEdition.get(edition);
    const firsts = entry?.firsts ?? [];
    const specials = entry?.specials ?? [];
    const special =
      specials.find((s) => s.ownedCount > 0) ?? specials[0] ?? null;
    const owned = firsts.filter((c) => c.ownedCount > 0).length;

    const slots = getGridSlots(edition);
    const cells: BoardCell[][] = Array.from({ length: 3 }, () =>
      Array<BoardCell>(3).fill(null),
    );
    firsts.slice(0, slots.length).forEach((c, i) => {
      const [row, col] = slots[i];
      cells[row - 1][col - 1] = { kind: "first", collection: c };
    });
    cells[1][1] = special ? { kind: "special", collection: special } : null;

    return { edition, owned, total: firsts.length, cells };
  });

  const totalOwned = boards.reduce((sum, b) => sum + b.owned, 0);
  const totalFirsts = boards.reduce((sum, b) => sum + b.total, 0);

  const CARD_W = 92;
  const OBJEKT_ASPECT = 17 / 11; // grid-board.tsx's aspect-11/17
  const CARD_H = Math.round(CARD_W * OBJEKT_ASPECT);
  const CELL_GAP = 8;
  const BOARD_GAP = 24;
  const OUTER_PADDING = 32;
  const INNER_W = 1200 - OUTER_PADDING * 2;

  const thumbnailUrls = new Set<string>();
  for (const board of boards) {
    for (const row of board.cells) {
      for (const cell of row) {
        if (cell) thumbnailUrls.add(cell.collection.thumbnailImage);
      }
    }
  }
  const thumbnailEntries = await Promise.all(
    [...thumbnailUrls].map(
      async (url) => [url, await loadThumbnail(url, CARD_W, CARD_H)] as const,
    ),
  );
  const thumbnailMap = new Map(thumbnailEntries);

  let regularFont: Buffer;
  let boldFont: Buffer;
  let memberFont: Buffer;
  try {
    regularFont = readFont("og-regular.ttf");
    boldFont = readFont("og-bold.ttf");
    memberFont = readFont("og-member.otf");
  } catch {
    return NextResponse.json({ error: "Font files missing" }, { status: 500 });
  }

  function BoardPanel({ board }: { board: Board }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div
            style={{
              display: "flex",
              fontSize: 15,
              fontFamily: "Bold",
              color: DARK.fg,
            }}
          >
            {EDITION_LABELS[board.edition]}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 13,
              color: DARK.muted,
              fontFamily: "Regular",
            }}
          >
            {board.owned}/{board.total}
          </div>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: CELL_GAP }}
        >
          {board.cells.map((row, ri) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static OG layout
              key={ri}
              style={{ display: "flex", flexDirection: "row", gap: CELL_GAP }}
            >
              {row.map((cell, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static OG layout
                <Cell key={ci} cell={cell} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Cell({ cell }: { cell: BoardCell }) {
    if (!cell) {
      return <div style={{ display: "flex", width: CARD_W, height: CARD_H }} />;
    }
    const owned = cell.collection.ownedCount > 0;
    const imageDataUri = thumbnailMap.get(cell.collection.thumbnailImage);
    return (
      <div
        style={{
          display: "flex",
          width: CARD_W,
          height: CARD_H,
          borderRadius: 6,
          overflow: "hidden",
          background: DARK.sectionBg,
          position: "relative",
        }}
      >
        {imageDataUri ? (
          // biome-ignore lint/performance/noImgElement: Satori requires plain <img>
          <img
            src={imageDataUri}
            width={CARD_W}
            height={CARD_H}
            style={{ objectFit: "cover" }}
            alt=""
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: CARD_W,
              height: CARD_H,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: DARK.muted,
              fontFamily: "Regular",
            }}
          >
            {cell.collection.collectionNo}
          </div>
        )}
        {!owned && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: UNOWNED_TINT,
            }}
          />
        )}
        {owned && cell.collection.ownedCount > 1 && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              bottom: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#000000",
              color: "#ffffff",
              fontSize: 10,
              fontFamily: "Bold",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid rgba(255,255,255,0.3)",
            }}
          >
            {cell.collection.ownedCount}
          </div>
        )}
      </div>
    );
  }

  const html = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1200,
        height: 630,
        background: DARK.bg,
        padding: OUTER_PADDING,
        gap: 10,
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontFamily: "Bold",
              color: DARK.fg,
            }}
          >
            @{progress.nickname}
          </div>
          <div style={{ display: "flex", fontSize: 20, color: DARK.border }}>
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
            color: DARK.muted,
            fontFamily: "Regular",
          }}
        >
          objekt.my
        </div>
      </div>

      {/* Subheader: season + aggregate FCO total */}
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
            fontSize: 16,
            fontFamily: "Bold",
            color: DARK.fg,
          }}
        >
          {season ? `${season} Grid` : "Grid"}
        </div>
        {totalFirsts > 0 && (
          <div
            style={{
              display: "flex",
              fontSize: 14,
              color: DARK.muted,
              fontFamily: "Regular",
            }}
          >
            {totalOwned} / {totalFirsts} FCOs
          </div>
        )}
      </div>

      {/* Boards */}
      {boards.length === 0 ? (
        <div
          style={{
            display: "flex",
            fontSize: 15,
            color: DARK.muted,
            fontFamily: "Regular",
            marginTop: 8,
          }}
        >
          No grid data for {member} yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "row", gap: BOARD_GAP }}>
          {boards.flatMap((board, bi) => [
            ...(bi > 0
              ? [
                  <div
                    key={`div-${board.edition}`}
                    style={{
                      display: "flex",
                      width: 1,
                      background: DARK.border,
                    }}
                  />,
                ]
              : []),
            <BoardPanel key={board.edition} board={board} />,
          ])}
        </div>
      )}
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

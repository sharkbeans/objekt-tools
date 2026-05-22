"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./spin.module.css";

type SpinClass = "First" | "Basic" | "Special" | "Premier" | "Unit";
type PageState = "spin" | "select" | "run";
type RunStage = "loading" | "carousel" | "grid" | "reveal" | "done";

interface SpinCollection {
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  frontImage: string;
  backImage: string;
  thumbnailImage: string;
}

interface SpinResult {
  kind: "objekt" | "fail";
  className?: SpinClass;
  objekt?: SpinCollection;
}

interface SpinRewardStat {
  artist: string;
  className: SpinClass;
  recipients: number;
}

const seasonOrder = [
  "Atom",
  "Binary",
  "Cream",
  "Divine",
  "Ever",
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
];
const carouselCards = Array.from(
  { length: 8 },
  (_, index) => `carousel-${index}`,
);
const idleCards = Array.from({ length: 14 }, (_, index) => `idle-${index}`);
const idleTrackCards = [...idleCards, ...idleCards.map((card) => `${card}-b`)];
const mysteryCards = Array.from(
  { length: 16 },
  (_, index) => `mystery-${index}`,
);
const shardPieces = Array.from({ length: 18 }, (_, index) => `shard-${index}`);
const fallbackRewardStats: SpinRewardStat[] = [
  { artist: "tripleS", className: "First", recipients: 0 },
  { artist: "tripleS", className: "Special", recipients: 0 },
  { artist: "tripleS", className: "Premier", recipients: 0 },
];

const artistDisplayNames: Record<string, string> = {
  triples: "tripleS",
  artms: "ARTMS",
  idntt: "idntt",
};

const artistTabs = ["triples", "artms", "idntt"] as const;
type ArtistTab = (typeof artistTabs)[number];

const classMap: Record<string, SpinClass | undefined> = {
  First: "First",
  "First Class": "First",
  Basic: "Basic",
  "Basic Class": "Basic",
  Special: "Special",
  "Special Class": "Special",
  Premier: "Premier",
  "Premier Class": "Premier",
  Unit: "Unit",
  "Unit Class": "Unit",
};

function artistLabel(artist: string) {
  return artistDisplayNames[artist.toLowerCase()] ?? artist;
}

function isIdntt(artist: string) {
  return artist.toLowerCase() === "idntt";
}

function isPrimarySpinClass(artist: string, className: SpinClass) {
  return isIdntt(artist) ? className === "Basic" : className === "First";
}

function parseSeason(season: string) {
  const match = season.match(/^([A-Za-z]+?)(\d+)$/);
  if (!match) return { name: season, cycle: 999, rank: 999 };
  const [, name, number] = match;
  const rank = seasonOrder.indexOf(name);
  return {
    name,
    cycle: Number.parseInt(number, 10),
    rank: rank === -1 ? 500 : rank,
  };
}

function compareSeason(a: string, b: string) {
  const left = parseSeason(a);
  const right = parseSeason(b);
  if (left.rank !== right.rank) return left.rank - right.rank;
  return left.cycle - right.cycle;
}

// Returns the member assigned to a season given 0-based season index and member list.
function assignedMember(seasonIndex: number, members: string[]): string {
  return members[seasonIndex] ?? "";
}


function spinKey(collection: Pick<SpinCollection, "artist" | "season">) {
  return `${collection.artist}::${collection.season}`;
}

function rollWeighted(
  weights: Array<{ outcome: SpinClass | "Fail"; chance: number }>,
) {
  const total = weights.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * total;

  for (const item of weights) {
    roll -= item.chance;
    if (roll <= 0) return item.outcome;
  }

  return weights.at(-1)?.outcome ?? "Fail";
}

// Spin class probabilities per artist (all seasons):
// - tripleS: First 87.5% / Special 3.13% / Premier 0.63% / Fail 8.74%
// - ARTMS:   First 87.5% / Special 3.13% / Premier 0.63% / Fail 8.74%
// - idntt:   Basic 87.5% / Special 3.13% / Unit 0.63%    / Fail 8.74%
function rollClass(artist: string, _season: string): SpinClass | "Fail" {
  const normalizedArtist = artist.toLowerCase();

  if (normalizedArtist === "idntt") {
    return rollWeighted([
      { outcome: "Basic", chance: 87.5 },
      { outcome: "Special", chance: 3.13 },
      { outcome: "Unit", chance: 0.63 },
      { outcome: "Fail", chance: 8.74 },
    ]);
  }

  return rollWeighted([
    { outcome: "First", chance: 87.5 },
    { outcome: "Special", chance: 3.13 },
    { outcome: "Premier", chance: 0.63 },
    { outcome: "Fail", chance: 8.74 },
  ]);
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function preloadImage(url: string | null) {
  if (!url || typeof window === "undefined") return;

  const image = new Image();
  image.decoding = "async";
  image.src = url;
}

function buildResult(
  selected: SpinCollection,
  poolsByArtistSeason: Map<string, Record<SpinClass, SpinCollection[]>>,
): SpinResult {
  const rolled = rollClass(selected.artist, selected.season);
  if (rolled === "Fail") return { kind: "fail" };

  const pool = poolsByArtistSeason.get(spinKey(selected))?.[rolled] ?? [];
  const objekt = pickRandom(pool);

  if (!objekt) return { kind: "fail" };
  return { kind: "objekt", className: rolled, objekt };
}

function ObjektCard({
  objekt,
  className,
  muted,
}: {
  objekt: SpinCollection;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(styles.objektCard, muted && styles.objektMuted, className)}
    >
      {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
      <img src={objekt.frontImage || objekt.thumbnailImage} alt="" />
    </div>
  );
}

function getObjektBackImage(objekt: SpinCollection) {
  if (objekt.backImage) return objekt.backImage;

  const imageUrl = objekt.frontImage || objekt.thumbnailImage;
  const replacements: Array<[RegExp, string]> = [
    [/\/front\//i, "/back/"],
    [/([_-])front(\.[a-z0-9]+(?:\?.*)?)$/i, "$1back$2"],
    [/\/front(\.[a-z0-9]+(?:\?.*)?)$/i, "/back$1"],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(imageUrl)) return imageUrl.replace(pattern, replacement);
  }

  return null;
}

function EmptyObjekt({ className }: { className?: string }) {
  return (
    <div className={cn(styles.emptyObjekt, className)}>
      <XIcon className="size-16" />
    </div>
  );
}

function PurpleCard({
  className,
  style,
  onClick,
  disabled,
  ariaPressed,
}: {
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  ariaPressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(styles.cardBack, className)}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
      aria-label="Pick card"
    >
      <span className={styles.cardLogo} />
    </button>
  );
}

function ObjektMark() {
  return (
    <div className={styles.objektMark} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function ResultTile({
  result,
  selected,
  index,
}: {
  result: SpinResult;
  selected: boolean;
  index: number;
}) {
  const style = { "--delay": `${index * 42}ms` } as CSSProperties;

  return (
    <div
      className={cn(
        styles.resultTile,
        selected && styles.resultTileSelected,
        result.className === "Premier" && styles.resultTilePremier,
      )}
      style={style}
    >
      {result.kind === "objekt" && result.objekt ? (
        <>
          {selected && <span className={styles.resultGetBadge}>Get</span>}
          <ObjektCard objekt={result.objekt} />
        </>
      ) : (
        <EmptyObjekt />
      )}
    </div>
  );
}

export function SpinClient() {
  const [collections, setCollections] = useState<SpinCollection[]>([]);
  const [rewardStats, setRewardStats] =
    useState<SpinRewardStat[]>(fallbackRewardStats);
  const [rewardStatIndex, setRewardStatIndex] = useState(0);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState<PageState>("spin");
  const [stage, setStage] = useState<RunStage>("loading");
  const [selected, setSelected] = useState<SpinCollection | null>(null);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [gridResults, setGridResults] = useState<SpinResult[]>([]);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [pendingPickIndex, setPendingPickIndex] = useState<number | null>(null);
  const [revealedGridOpen, setRevealedGridOpen] = useState(false);
  const [selectTab, setSelectTab] = useState<ArtistTab>("triples");
  const [memberOrder, setMemberOrder] = useState<Record<string, string[]>>({});

  useEffect(() => {
    document.body.dataset.page = "spin";
    return () => { delete document.body.dataset.page; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/spin/members")
      .then((r) => r.json())
      .then((data: { results: { artist: string; members: string[] }[] }) => {
        if (cancelled) return;
        const map: Record<string, string[]> = {};
        for (const { artist, members } of data.results) map[artist] = members;
        setMemberOrder(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCollections() {
      try {
        const response = await fetch("/api/spin/collections");
        if (!response.ok) throw new Error("Failed to load collections");
        const data = (await response.json()) as { results: SpinCollection[] };
        if (!cancelled) setCollections(data.results);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoadingCollections(false);
      }
    }

    loadCollections();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRewardStats() {
      try {
        const response = await fetch("/api/spin/stats");
        if (!response.ok) throw new Error("Failed to load spin stats");
        const data = (await response.json()) as { results: SpinRewardStat[] };
        if (!cancelled && data.results.length > 0) {
          setRewardStats(data.results);
          setRewardStatIndex(0);
        }
      } catch {
        // Keep the fallback copy if the live indexer query is unavailable.
      }
    }

    loadRewardStats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rewardStats.length <= 1) return;

    const interval = window.setInterval(() => {
      setRewardStatIndex((index) => (index + 1) % rewardStats.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [rewardStats.length]);

  const { poolsByArtistSeason, primaryByArtistSeason } = useMemo(() => {
    const pools = new Map<string, Record<SpinClass, SpinCollection[]>>();
    // All primary-class cards grouped by artist::season, preserving all members
    const primary = new Map<string, SpinCollection[]>();

    for (const collection of collections) {
      const normalizedClass = classMap[collection.class];
      if (!normalizedClass) continue;
      const key = spinKey(collection);

      if (!pools.has(key)) {
        pools.set(key, { First: [], Basic: [], Special: [], Premier: [], Unit: [] });
      }
      pools.get(key)?.[normalizedClass].push(collection);

      if (isPrimarySpinClass(collection.artist, normalizedClass)) {
        if (!primary.has(key)) primary.set(key, []);
        primary.get(key)!.push(collection);
      }
    }

    return { poolsByArtistSeason: pools, primaryByArtistSeason: primary };
  }, [collections]);

  const sortedSpinChoices = useMemo(() => {
    if (primaryByArtistSeason.size === 0) return [];

    // Group by artist, sort seasons chronologically, assign member by index
    const byArtist = new Map<string, string[]>();
    for (const key of primaryByArtistSeason.keys()) {
      const [artist] = key.split("::");
      if (!byArtist.has(artist)) byArtist.set(artist, []);
      byArtist.get(artist)!.push(key);
    }

    const result: SpinCollection[] = [];
    for (const [artistKey, seasonKeys] of byArtist) {
      const members = memberOrder[artistKey] ?? [];
      const sorted = seasonKeys.sort((a, b) =>
        compareSeason(a.split("::")[1], b.split("::")[1]),
      );
      for (let i = 0; i < sorted.length; i++) {
        const candidates = primaryByArtistSeason.get(sorted[i]) ?? [];
        const expectedName = assignedMember(i, members);
        const pick =
          candidates.find(
            (c) => c.member.toLowerCase() === expectedName.toLowerCase(),
          ) ?? candidates[0];
        if (pick) result.push(pick);
      }
    }
    return result;
  }, [primaryByArtistSeason, memberOrder]);

  function startSpin() {
    if (!selected) return;
    setPage("run");
    setStage("loading");
    setResult(null);
    setGridResults([]);
    setPickedIndex(null);
    setPendingPickIndex(null);
    setRevealedGridOpen(false);

    window.setTimeout(() => setStage("carousel"), 200);
    window.setTimeout(() => setStage("grid"), 1900);
  }

  function pickMysteryCard(index: number) {
    if (!selected) return;
    setStage("loading");
    setPickedIndex(index);
    setPendingPickIndex(null);
    setRevealedGridOpen(false);

    window.setTimeout(() => {
      const chosenResult = buildResult(selected, poolsByArtistSeason);
      if (chosenResult.kind === "objekt" && chosenResult.objekt) {
        preloadImage(getObjektBackImage(chosenResult.objekt));
      }

      const allResults = mysteryCards.map((_, cardIndex) =>
        cardIndex === index
          ? chosenResult
          : buildResult(selected, poolsByArtistSeason),
      );

      setResult(chosenResult);
      setGridResults(allResults);

      setStage("reveal");
      window.setTimeout(() => setStage("done"), 5000);
    }, 200);
  }

  function resetSpin() {
    setPage("spin");
    setStage("loading");
    setResult(null);
    setGridResults([]);
    setPickedIndex(null);
    setPendingPickIndex(null);
    setRevealedGridOpen(false);
  }

  const resultCard =
    result?.kind === "objekt" && result.objekt ? (
      <ObjektCard objekt={result.objekt} className={styles.revealedCard} />
    ) : (
      <EmptyObjekt className={cn(styles.revealedCard, styles.revealedBroken)} />
    );
  const rewardStat = rewardStats[rewardStatIndex] ?? fallbackRewardStats[0];
  const loadingCard = selected ? (
    <ObjektCard objekt={selected} className={styles.loadingObjekt} muted />
  ) : null;
  const successBackImage =
    result?.kind === "objekt" && result.objekt
      ? getObjektBackImage(result.objekt)
      : null;
  const successRevealCard =
    result?.kind === "objekt" && result.objekt ? (
      <div className={styles.objektInspect}>
        {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
        <img
          className={cn(styles.inspectFace, styles.inspectFront)}
          src={result.objekt.frontImage || result.objekt.thumbnailImage}
          alt=""
        />
        {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
        <img
          className={cn(styles.inspectFace, styles.inspectBack)}
          src={successBackImage ?? result.objekt.backImage}
          alt=""
        />
      </div>
    ) : null;

  return (
    <div className={styles.shell}>
      <div className={styles.phone}>
        {page === "spin" && (
          <section className={styles.spinPage}>
            <header className={cn(styles.header, styles.ghostHeader)}>
              <Link href="/" className={styles.backButton} aria-label="Back to home">
                <ChevronLeftIcon className="size-5" />
              </Link>
            </header>

            <div className={styles.centerStack}>
              <div className={styles.sideCards} aria-hidden="true">
                {idleTrackCards.map((card) => (
                  <PurpleCard key={card} className={styles.sideCard} disabled />
                ))}
              </div>

              <button
                type="button"
                className={styles.centerSlot}
                onClick={() => {
                  if (selected) {
                    setSelectTab(selected.artist.toLowerCase() as ArtistTab);
                  }
                  setPage("select");
                }}
                aria-label="Select objekt"
              >
                {selected ? (
                  <ObjektCard objekt={selected} />
                ) : (
                  <div className={styles.placeholder}>
                    <PlusIcon className="size-8" />
                  </div>
                )}
              </button>
            </div>

            {selected && (
              <div className={styles.selectedCaption}>
                <span>
                  {artistLabel(selected.artist)} {selected.season}
                </span>
                <p>
                  Spin with the {artistLabel(selected.artist)} {selected.season}{" "}
                  season Objekt
                </p>
              </div>
            )}

            {!selected && (
              <div className={styles.selectedCaption}>
                <p>Choose a season Objekt to Spin</p>
              </div>
            )}

            <footer className={styles.footer}>
              <p>
                Today,{" "}
                <span className={styles.statAccent}>
                  {rewardStat.recipients.toLocaleString()}
                </span>{" "}
                people received{" "}
                <span className={styles.statAccent}>
                  {rewardStat.className} Objekt
                </span>
                !
              </p>
              <Button
                type="button"
                className={styles.primaryButton}
                onClick={startSpin}
                disabled={!selected}
              >
                Spin
              </Button>
            </footer>
          </section>
        )}

        {page === "select" && (
          <section className={styles.selectPage}>
            <header className={styles.selectHeader}>
              <button
                type="button"
                onClick={() => setPage("spin")}
                aria-label="Back"
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <h1>Choose a season</h1>
              <span />
            </header>

            <div className={styles.artistTabs}>
              {artistTabs.map((tab) => (
                <button
                  type="button"
                  key={tab}
                  className={cn(
                    styles.artistTab,
                    selectTab === tab && styles.artistTabActive,
                  )}
                  onClick={() => setSelectTab(tab)}
                >
                  {artistDisplayNames[tab]}
                </button>
              ))}
            </div>

            {loadingCollections && (
              <div className={styles.selectMessage}>Loading objekts</div>
            )}

            {loadError && (
              <div className={styles.selectMessage}>
                Could not load indexer objekts.
              </div>
            )}

            {!loadingCollections && !loadError && sortedSpinChoices.length === 0 && (
              <div className={styles.selectMessage}>
                Spin objekts are unavailable right now.
              </div>
            )}

            {!loadingCollections && !loadError && sortedSpinChoices.length > 0 && (
              <div className={styles.seasonGrid}>
                {sortedSpinChoices
                  .filter((o) => o.artist.toLowerCase() === selectTab)
                  .map((objekt) => (
                    <button
                      type="button"
                      key={spinKey(objekt)}
                      className={cn(
                        styles.seasonChoice,
                        selected &&
                          spinKey(selected) === spinKey(objekt) &&
                          styles.seasonChoiceSelected,
                      )}
                      onClick={() => {
                        setSelected(objekt);
                        setPage("spin");
                      }}
                    >
                      <ObjektCard objekt={objekt} />
                      <span>{objekt.season}</span>
                      <small>{objekt.member}</small>
                    </button>
                  ))}
              </div>
            )}
          </section>
        )}

        {page === "run" && (
          <section className={styles.runStage}>
            {stage === "loading" && (
              <div className={styles.stageLoader}>
                <div className={styles.loadingFan} aria-hidden="true">
                  {carouselCards.map((card, index) => (
                    <PurpleCard
                      key={card}
                      className={styles.loadingFanCard}
                      style={
                        {
                          "--i": index,
                          "--mid": (carouselCards.length - 1) / 2,
                        } as CSSProperties
                      }
                      disabled
                    />
                  ))}
                </div>
                {loadingCard}
                <ObjektMark />
              </div>
            )}

            {stage === "carousel" && (
              <div className={styles.carouselTrack}>
                {carouselCards.map((card, index) => (
                  <PurpleCard
                    key={card}
                    className={styles.carouselCard}
                    style={
                      {
                        "--i": index,
                        "--mid": (carouselCards.length - 1) / 2,
                      } as CSSProperties
                    }
                    disabled
                  />
                ))}
              </div>
            )}

            {stage === "grid" && (
              <div className={styles.mysteryGridWrap}>
                <p>Select an Objekt</p>
                <div className={styles.mysteryGrid}>
                  {mysteryCards.map((card, index) => (
                    <PurpleCard
                      key={card}
                      className={cn(
                        styles.mysteryCard,
                        pendingPickIndex === index &&
                          styles.mysteryCardSelected,
                      )}
                      style={{ "--i": index } as CSSProperties}
                      onClick={() => setPendingPickIndex(index)}
                      ariaPressed={pendingPickIndex === index}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  className={cn(styles.primaryButton, styles.pickButton)}
                  onClick={() => {
                    if (pendingPickIndex !== null) {
                      pickMysteryCard(pendingPickIndex);
                    }
                  }}
                  disabled={pendingPickIndex === null}
                >
                  Select
                </Button>
              </div>
            )}

            {stage === "reveal" && result && (
              <div
                className={cn(
                  styles.revealStage,
                  result.kind === "fail" && styles.revealStageBroken,
                )}
              >
                <div className={styles.flare} />
                <div className={styles.shards} aria-hidden="true">
                  {shardPieces.map((shard) => (
                    <span key={shard} />
                  ))}
                </div>
                <div
                  className={cn(
                    styles.revealFlip,
                    result.kind === "fail" && styles.revealFlipBroken,
                  )}
                >
                  <div className={styles.revealInner}>
                    <PurpleCard className={styles.revealBack} disabled />
                    {result.kind === "fail" && resultCard}
                  </div>
                </div>
                {successRevealCard}
              </div>
            )}

            {stage === "done" &&
              result &&
              gridResults.length === 16 &&
              !revealedGridOpen && (
                <div className={cn(styles.doneStage, styles.resultDoneStage)}>
                  <div className={styles.successTitle}>
                    {result.kind === "fail" ? (
                      <>
                        <CircleHelpIcon className="size-4" />
                        <span>Spin was broken</span>
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="size-4" />
                        <span>Spin was successful!</span>
                      </>
                    )}
                  </div>
                  <p className={styles.resultSummary}>
                    {result.kind === "objekt" && result.objekt ? (
                      <>
                        Received the{" "}
                        <span className={styles.statAccent}>
                          {result.objekt.season} {result.objekt.member}{" "}
                          {result.objekt.collectionNo}
                        </span>{" "}
                        Objekt.
                      </>
                    ) : (
                      "The selected card was Broken"
                    )}
                  </p>
                  <div className={styles.doneCard}>{resultCard}</div>
                  <button
                    type="button"
                    className={styles.revealAllButton}
                    onClick={() => setRevealedGridOpen(true)}
                  >
                    Reveal unchosen Objekts
                    <ChevronRightIcon className="size-5" />
                  </button>
                  <Button
                    type="button"
                    className={cn(styles.primaryButton, styles.doneButton)}
                    onClick={resetSpin}
                  >
                    Done
                  </Button>
                </div>
              )}

            {stage === "done" &&
              result &&
              gridResults.length === 16 &&
              revealedGridOpen && (
                <div className={cn(styles.doneStage, styles.revealGridStage)}>
                  <div className={styles.gridHeader}>
                    <button
                      type="button"
                      onClick={() => setRevealedGridOpen(false)}
                      aria-label="Back to result"
                    >
                      <ChevronLeftIcon className="size-5" />
                    </button>
                    <span>Spin Result</span>
                    <span />
                  </div>
                  <div className={styles.revealedGrid}>
                    {gridResults.map((gridResult, index) => (
                      <ResultTile
                        key={`${mysteryCards[index]}-${gridResult.kind}-${gridResult.objekt?.collectionId ?? "broken"}`}
                        result={gridResult}
                        selected={index === pickedIndex}
                        index={index}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    className={cn(styles.primaryButton, styles.gridRetryButton)}
                    onClick={resetSpin}
                  >
                    <RotateCcwIcon className="size-4" />
                    Try again
                  </Button>
                </div>
              )}
          </section>
        )}
        <p className={styles.disclaimer}>
          Fan-made simulator · not affiliated with or endorsed by modhaus or
          COSMO · no real objekts are distributed · for entertainment only
        </p>
      </div>
    </div>
  );
}
